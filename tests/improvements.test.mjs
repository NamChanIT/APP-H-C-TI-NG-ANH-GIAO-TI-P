import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { conversationContext } from '../lib/conversation-context.mjs';
import { comparePractice } from '../lib/practice.mjs';
import { openPersistentStore } from '../lib/persistence.mjs';
import { createService } from '../lib/service.mjs';
import { createStore } from '../lib/db.mjs';

test('spoken retry checks recognized words and respects repetitions', () => {
  assert.deepEqual(comparePractice("I didn't miss the meeting.", "I didn’t miss the meeting"), { exact: true, missing: [] });
  assert.deepEqual(comparePractice('That was very, very useful.', 'That was very useful'), { exact: false, missing: ['very'] });
});

test('older statements survive compaction without expanding the recent window', () => {
  const messages = [{ role: 'user', content: 'My name is Avery, and I work in marketing.' },
    ...Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Ordinary turn ${index}` }))];
  const context = conversationContext(messages);
  assert.match(context.summary, /Avery/);
  assert.equal(context.recent.length, 14);
  assert.equal(context.recent.at(-1).content, 'Ordinary turn 29');
  assert.ok(context.summary.length < 700);
});

test('encrypted persistence restores practice, rejects a wrong key and protects against stale writers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'speakmate-persist-test-'));
  let stored;
  let writes = 0;
  const remote = {
    get: async () => stored,
    put: async (bytes, previous) => {
      if (stored?.etag !== previous) throw new Error('conflict');
      const etag = String(++writes);
      stored = { bytes, etag };
      return etag;
    }
  };
  const key = randomBytes(32);
  const opened = [];
  async function open(file) {
    const result = await openPersistentStore({ path: join(dir, file), remote, key });
    opened.push(result.db);
    return result;
  }
  try {
    const first = await open('first.sqlite');
    first.db.prepare('INSERT INTO users VALUES (?)').run('sensitive-example');
    await Promise.all([first.persist(), first.persist()]);
    assert.equal(writes, 1);
    assert.equal(stored.bytes.includes('sensitive-example'), false);
    const second = await open('second.sqlite');
    assert.equal(second.db.prepare('SELECT id FROM users WHERE id=?').get('sensitive-example').id, 'sensitive-example');
    await assert.rejects(openPersistentStore({ path: join(dir, 'wrong.sqlite'), remote, key: randomBytes(32) }));
    second.db.prepare('INSERT INTO users VALUES (?)').run('newer');
    await second.persist();
    first.db.prepare('INSERT INTO users VALUES (?)').run('stale');
    await assert.rejects(first.persist(), /conflict/);
    assert.equal(writes, 2);
  } finally {
    for (const db of opened) db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('free talk revisits an owned due expression and exports only personal data', async () => {
  const db = createStore(':memory:');
  try {
    db.prepare('INSERT INTO users VALUES (?)').run('other');
    let prompt;
    const service = createService(db, async messages => { prompt = messages[0].content; return 'Let’s talk.'; });
    const save = { kind: 'vocabulary', topicId: 'free', index: 0 };
    await service('POST', ['review', 'save'], save, { userId: 'other' });
    const input = { character:'emma', topic:'free', mode:'free' };
    const { body } = await service('POST', ['sessions'], input);
    const path = ['sessions', body.session.id, 'turn'];
    await service('POST', path, { turn:'opening', source:'opening' });
    assert.doesNotMatch(prompt, /saved expression/);
    const review = await service('POST', ['review', 'save'], save);
    const next = await service('POST', ['sessions'], input);
    await service('POST', ['sessions', next.body.session.id, 'turn'], { turn:'opening', source:'opening' });
    assert.ok(prompt.includes(review.body.cards[0].speech));
    const exported = await service('GET', ['export']);
    assert.equal(exported.body.sessions.length, 2);
    assert.equal(exported.body.cards.length, 1);
    assert.equal((await service('GET', ['export'], {}, { userId:'other' })).body.sessions.length, 0);
  } finally {
    db.close();
  }
});
