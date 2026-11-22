import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../lib/auth.mjs';
import { createStore } from '../lib/db.mjs';
import { createGroq, transcribeWithGroq } from '../lib/groq.mjs';
import { allowAppRequest, publicOrigin } from '../lib/origin.mjs';

test('hosted origin accepts its HTTPS app and rejects a different origin', () => {
  const hosted = publicOrigin({ RENDER_EXTERNAL_URL: 'https://speakmate.onrender.com' });
  function request(host, origin) {
    return new Request(hosted, { headers: { host, origin } });
  }
  assert.equal(allowAppRequest(request(hosted.host, hosted.origin), hosted), true);
  assert.equal(allowAppRequest(request(hosted.host, 'https://other.example'), hosted), false);
  assert.equal(allowAppRequest(request('other.example', hosted.origin), hosted), false);
  assert.throws(() => publicOrigin({ RENDER_EXTERNAL_URL: 'http://insecure.example' }));
});

test('hosted registration requires its invite and sends a Secure cookie', async () => {
  const db = createStore(':memory:');
  try {
    const auth = createAuth(db, { secure: true, inviteCode: 'test-invite' });
    const request = new Request('https://speakmate.example/api/auth/register', { method: 'POST' });
    const input = { email: 'test@example.com', password: 'test-password' };
    assert.equal((await auth.handle(request, 'register', input)).status, 403);
    const result = await auth.handle(request, 'register', { ...input, invite: 'test-invite' });
    assert.equal(result.status, 200);
    assert.match(result.headers.get('set-cookie'), /; Secure$/);
  } finally {
    db.close();
  }
});

test('Groq adapter streams answer text, sends assessment schema and accepts WAV', async () => {
  const chat = createGroq({ key: 'test-key', transport: async (url, init) => {
    assert.equal(new URL(url).pathname, '/openai/v1/chat/completions');
    const payload = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    if (payload.stream) {
      return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
    }
    assert.equal(payload.response_format.type, 'json_schema');
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  } });
  const chunks = [];
  assert.equal(await chat([], false, { onDelta: value => chunks.push(value) }), 'Hello');
  assert.deepEqual(chunks, ['Hello']);
  assert.deepEqual(await chat([], { type: 'object' }), { ok: true });
  const text = await transcribeWithGroq(Buffer.from('audio'), undefined, { key: 'test-key', transport: async (url, init) => {
    assert.equal(new URL(url).pathname, '/openai/v1/audio/transcriptions');
    assert.equal(init.body.get('file').type, 'audio/wav');
    assert.equal(init.body.get('language'), 'en');
    return Response.json({ text: 'Practice.' });
  } });
  assert.equal(text, 'Practice.');
});
