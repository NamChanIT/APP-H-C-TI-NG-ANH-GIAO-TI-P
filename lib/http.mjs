import { createStore } from './db.mjs';
import { createOllama } from './ai.mjs';
import { createAuth } from './auth.mjs';
import { createService } from './service.mjs';
import { MAX_WAV_BYTES } from './audio.mjs';
import { transcribe, validWav, whisperReady } from './transcribe.mjs';

let service;
let chat;
let db;
let auth;

export function allowLocalRequest(request) {
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');
  return /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host) &&
    (!origin || origin === `http://${host}`);
}

export async function handleApi(request, path) {
  if (!allowLocalRequest(request)) {
    return Response.json({ error: 'Use the app’s localhost address for this request.' }, { status: 403 });
  }
  if (request.method === 'GET' && path.length === 1 && path[0] === 'health') {
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    db ??= createStore();
    auth ??= createAuth(db);
    const isAuth = path.length === 2 && path[0] === 'auth';
    const user = auth.current(request);
    if (!user && !isAuth) {
      return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'POST' && path.length === 1 && path[0] === 'transcribe') {
      return transcribeRequest(request);
    }
    let input;
    if (request.method === 'POST') {
      try {
        const text = await readBody(request, 8000);
        if (!text) return Response.json({ error: 'Request is too large or empty.' }, { status: 413 });
        input = JSON.parse(text.toString('utf8'));
      } catch {
        return Response.json({ error: 'Invalid JSON.' }, { status: 400 });
      }
    }
    if (isAuth) return await auth.handle(request, path[1], input);
    chat ??= createOllama();
    if (request.method === 'POST' && path.length === 1 && path[0] === 'warm') {
      try {
        await chat.warm();
        return new Response(null, { status: 204 });
      } catch {
        return new Response(null, { status: 503 });
      }
    }
    service ??= createService(db, chat);
    if (request.method === 'POST' && path[2] === 'turn' &&
        request.headers.get('accept') === 'application/x-ndjson') {
      return streamTurn(request, path, input, user.id);
    }
    const { body, status } = await service(request.method, path, input, { userId: user.id });
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('SpeakMate request failed', err.name, err.code);
    return Response.json({ error: 'The local server could not complete this request.' }, { status: 500 });
  }
}

let recognitionRunning = false;

async function transcribeRequest(request) {
  const problem = (message, status) => Response.json({ error: message }, { status });
  if (request.headers.get('content-type') !== 'audio/wav' || !request.body) {
    return problem('Expected a WAV microphone recording.', 415);
  }
  if (recognitionRunning) return problem('Local recognition is busy. Try again in a moment.', 429);
  recognitionRunning = true;
  try {
    await whisperReady();
    const audio = await readBody(request, MAX_WAV_BYTES);
    if (!audio) return problem('The recording is too long. Try a shorter turn.', 413);
    if (!validWav(audio)) return problem('Invalid or too short microphone recording.', 400);
    return Response.json({ text: await transcribe(audio, request.signal) });
  } catch (error) {
    if (request.signal.aborted) return problem('Recognition was cancelled.', 408);
    if (error.code === 'ENOENT') return problem('Local speech recognition is missing. Check the Whisper setup in the README.', 503);
    console.error('SpeakMate transcription failed', error.name, error.code);
    return problem('Local speech recognition could not process this turn. Try again.', 503);
  } finally {
    recognitionRunning = false;
  }
}

async function readBody(request, limit) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        // Leave the socket open long enough to send the 413 response.
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    reader.releaseLock();
  }
}

function streamTurn(request, path, input, userId) {
  const encoder = new TextEncoder();
  const disconnected = new AbortController();
  const signal = AbortSignal.any([request.signal, disconnected.signal]);
  const stream = new ReadableStream({
    async start(controller) {
      const send = event => {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      try {
        const { body, status } = await service('POST', path, input, {
          userId, signal, onReady: () => send({ type: 'ready' }), onDelta: text => send({ type: 'delta', text })
        });
        send(status === 200 ? { type: 'done', data: body } : { type: 'error', error: body.error });
      } catch (error) {
        console.error('SpeakMate stream failed', error.name, error.code);
        send({ type: 'error', error: 'The server could not complete the turn.' });
      } finally {
        if (!disconnected.signal.aborted) controller.close();
      }
    },
    cancel() { disconnected.abort(); }
  });
  return new Response(stream, { headers: {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no'
  } });
}
