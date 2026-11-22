import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/db.mjs';
import { createService } from '../lib/service.mjs';

test('session retries, persists history, carries context and closes with evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'speakmate-test-'));
  const path = join(directory, 'session.sqlite');
  let db = createStore(path);
  try {
    let fail = true;
    const userText = 'I work in a small team.';
    const chat = async (messages, structured) => {
      if (structured) return { dimensions: { grammar: { score: 4, comment: 'Clear', evidence: userText } } };
      if (messages.at(-1).content.startsWith('Start our')) return 'What is your team like?';
      assert.deepEqual(messages.slice(-2).map(item => item.content), ['What is your team like?', userText]);
      if (fail) throw new Error('provider offline');
      return 'What do you enjoy about working in a small team?';
    };
    let dispatch = createService(db, chat);
    assert.equal((await dispatch('POST', ['sessions'], { character: 'invalid' })).status, 400);
    const created = await dispatch('POST', ['sessions'], { character: 'emma', topic: 'team-meetings', mode: 'free' });
    const id = created.body.session.id;
    const turnPath = ['sessions', id, 'turn'];
    await dispatch('POST', turnPath, { turn: 'opening', source: 'opening' });
    const turn = { turn: 'one', source: 'voice', text: userText };
    assert.equal((await dispatch('POST', turnPath, turn)).status, 503);
    assert.equal((await dispatch('GET', ['sessions', id])).body.messages.length, 2);
    assert.equal((await dispatch('POST', turnPath, { ...turn, turn: 'two' })).status, 409);
    fail = false;
    assert.equal((await dispatch('POST', turnPath, turn)).body.messages.length, 3);
    assert.equal((await dispatch('POST', turnPath, turn)).body.messages.length, 3);
    assert.equal((await dispatch('POST', ['sessions', id, 'finish'], { seconds: 1 })).body.report, null);
    assert.equal((await dispatch('POST', ['sessions', id, 'assessment'])).body.report.dimensions.grammar.evidence, userText);
    assert.equal((await dispatch('POST', turnPath, turn)).status, 409);
    db.close();
    db = createStore(path);
    dispatch = createService(db, chat);
    const history = (await dispatch('GET', ['sessions'])).body;
    assert.equal(history.length, 1);
    assert.equal(history[0].voice_turns, 1);
    assert.equal(history[0].report.dimensions.grammar.score, 4);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('streaming interruption frees the turn and saves only generated text', async () => {
  const db = createStore(':memory:');
  try {
    let block = true;
    const dispatch = createService(db, async (_messages, _format, { onDelta, signal }) => {
      if (!block) return 'What happened next?';
      onDelta?.('Nice work.');
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    });
    const { body } = await dispatch('POST', ['sessions'], { character: 'emma', topic: 'free', mode: 'free' });
    const id = body.session.id;
    const turn = { turn: 'one', source: 'voice', text: 'I led the meeting.' };
    const received = [];
    const answer = dispatch('POST', ['sessions', id, 'turn'], turn, { onDelta: text => received.push(text) });
    assert.deepEqual(received, ['Nice work.']);
    assert.equal((await dispatch('POST', ['sessions', id, 'interrupt'], { turn: 'other' })).body.interrupted, false);
    assert.equal((await dispatch('POST', ['sessions', id, 'interrupt'], { turn: 'one' })).body.interrupted, true);
    const interrupted = (await answer).body;
    assert.equal(interrupted.interrupted, true);
    assert.equal(interrupted.messages.at(-1).content, 'Nice work.');
    block = false;
    assert.equal((await dispatch('POST', ['sessions', id, 'turn'], { ...turn, turn: 'two' })).status, 200);
  } finally {
    db.close();
  }
});

test('free talk permits natural reactions and tangents while guided practice keeps its objective', async () => {
  const db = createStore(':memory:');
  try {
    const prompts = [];
    const dispatch = createService(db, async messages => {
      prompts.push(messages);
      return 'Coffee before a team meeting feels like a reasonable survival strategy.';
    });
    for (const mode of ['free', 'debate']) {
      const { body } = await dispatch('POST', ['sessions'], { character: 'emma', topic: 'team-meetings', mode });
      const result = await dispatch('POST', ['sessions', body.session.id, 'turn'], { turn: 'opening', source: 'opening' });
      assert.equal(result.status, 200);
    }
    assert.match(prompts[0][0].content, /optional icebreaker/);
    assert.match(prompts[0][0].content, /take a short tangent/);
    assert.match(prompts[0][0].content, /A warm comment can be a whole turn/);
    assert.doesNotMatch(prompts[0][1].content, /and a question/);
    assert.match(prompts[1][0].content, /respectful opposing view/);
    assert.match(prompts[1][0].content, /Practice objective:/);
  } finally {
    db.close();
  }
});
