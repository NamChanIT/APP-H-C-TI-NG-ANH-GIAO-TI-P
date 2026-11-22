import test from 'node:test';
import assert from 'node:assert/strict';
import { createOllama, curateReport } from '../lib/ai.mjs';
import { lessonFor } from '../lib/curriculum.mjs';
import { topics } from '../lib/catalog.mjs';

test('every topic has learning objectives, prompts, vocabulary and assessment criteria', () => {
  assert.equal(topics.length, 51);
  assert.equal(new Set(topics.map(topic => topic.id)).size, topics.length);
  for (const topic of topics) {
    const lesson = lessonFor(topic);
    assert.equal(lesson.questions.length, 10);
    for (const key of ['goal', 'vocabulary', 'criteria', 'scenario', 'debate']) assert.ok(lesson[key].length);
  }
});

test('transcript assessment drops unsupported learner quotes and acoustic grades', () => {
  const evidence = 'I enjoy working with my team';
  const entry = { score: 4, evidence, comment: 'Clear statement' };
  const report = curateReport({
    dimensions: { grammar: entry, vocabulary: { ...entry, score: 9 }, coherence: { ...entry, evidence: 'made up' }, pronunciation: entry },
    corrections: [{ original: 'invented', corrected: 'fixed', explanation: '' }],
    strengths: [evidence, 'invented']
  }, [{ role: 'user', content: evidence }]);
  assert.deepEqual(report.dimensions, { grammar: entry });
  assert.deepEqual(report.corrections, []);
  assert.deepEqual(report.strengths, [evidence]);
});

test('Ollama adapter sends the specified model and context', async () => {
  const messages = [{ role: 'user', content: 'Hi' }];
  const chat = createOllama({ model: 'test-model', transport: async (url, options) => {
    assert.equal(url.pathname, '/api/chat');
    assert.deepEqual(JSON.parse(options.body).messages, messages);
    assert.equal(JSON.parse(options.body).format, 'json');
    return Response.json({ message: { content: '{"exercise":"Practise"}' } });
  } });
  assert.deepEqual(await chat(messages, true), { exercise: 'Practise' });
});

test('Ollama publishes fragmented streaming deltas and rejects a truncated response', async () => {
  const records = [
    '{"message":{"content":"Nice"}}\n{"message":{"content":" work.',
    '"}}\n{"done":true}\n'
  ];
  const transport = async (_, options) => {
    assert.equal(JSON.parse(options.body).stream, true);
    return new Response(new ReadableStream({
      start(controller) {
        for (const record of records) controller.enqueue(new TextEncoder().encode(record));
        controller.close();
      }
    }));
  };
  const chat = createOllama({ transport });
  const deltas = [];
  assert.equal(await chat([], false, { onDelta: text => deltas.push(text) }), 'Nice work.');
  assert.deepEqual(deltas, ['Nice', ' work.']);
  records[1] = '"}}\n';
  await assert.rejects(chat([], false, { onDelta: () => {} }), /incomplete answer/);
});

test('sentence chunks wait through abbreviations and split complete sentences', async () => {
  const { takeSentence } = await import('../lib/ndjson.mjs');
  assert.equal(takeSentence('Ask Dr.'), null);
  assert.deepEqual(takeSentence('Ask Dr. Smith. What'), { sentence: 'Ask Dr. Smith.', rest: 'What' });
  assert.equal(takeSentence('It was 2.'), null);
  assert.deepEqual(takeSentence('It was 2.5 seconds. Good'), { sentence: 'It was 2.5 seconds.', rest: 'Good' });
});

test('warm-up shares an in-flight load and sends no transcript', async () => {
  let calls = 0;
  const chat = createOllama({ model: 'dialogue', reportModel: 'assessor', transport: async (_, { body }) => {
    calls++;
    const request = JSON.parse(body);
    assert.equal(request.model, 'dialogue');
    assert.deepEqual(request.messages, []);
    assert.equal(request.keep_alive, '10m');
    return Response.json({ done: true });
  } });
  await Promise.all([chat.warm(), chat.warm()]);
  await chat.warm();
  assert.equal(calls, 1);
});
