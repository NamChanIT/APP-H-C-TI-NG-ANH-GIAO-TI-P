import { openConfiguredStore } from './persistence.mjs';
import { createOllama } from './ai.mjs';
import { createGroq, transcribeWithGroq } from './groq.mjs';
import { allowAppRequest, publicOrigin } from './origin.mjs';
import { createAuth } from './auth.mjs';
import { createService } from './service.mjs';
import { MAX_WAV_BYTES } from './audio.mjs';
import { transcribe, validWav, whisperReady } from './transcribe.mjs';

let service;
let chat;
let store;
let auth;

function getStore() {
  store ??= openConfiguredStore().catch(error => {
    store = undefined;
    throw error;
  });
  return store;
}

async function saveBackup(persist) {
  try {
    await persist();
    return true;
  } catch (error) {
    console.error('SpeakMate backup failed', error.name, error.$metadata?.httpStatusCode);
    return false;
  }
}

const backupError = 'Saved on this instance, but the online backup failed. Try again before closing the app.';

export async function handleApi(request, path) {
  if (request.method === 'GET' && path.length === 1 && path[0] === 'health') {
    let configured = !process.env.RENDER_EXTERNAL_URL ||
      (!!process.env.GROQ_API_KEY && !!process.env.SPEAKMATE_SIGNUP_CODE?.trim() && !!process.env.SPEAKMATE_DB);
    if (configured && process.env.SPEAKMATE_R2_BUCKET) {
      try { await getStore(); } catch { configured = false; }
    }
    return Response.json({ status: configured ? 'ok' : 'configuration_missing' }, {
      status: configured ? 200 : 503, headers: { 'Cache-Control': 'no-store' }
    });
  }
  if (!allowAppRequest(request)) {
    return Response.json({ error: 'Open SpeakMate at its configured address.' }, { status: 403 });
  }
  try {
    const { db, persist } = await getStore();
    auth ??= createAuth(db, { secure: !!publicOrigin(), inviteCode: process.env.SPEAKMATE_SIGNUP_CODE?.trim(), cloudSpeech: !!process.env.GROQ_API_KEY });
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
    if (isAuth) {
      const response = await auth.handle(request, path[1], input);
      if (request.method !== 'POST' || !response.ok || await saveBackup(persist)) return response;
      if (path[1] === 'logout') {
        return Response.json({ error: backupError }, { status: 503, headers: response.headers });
      }
      const message = path[1] === 'register' ? backupError + ' Use Sign in with the same account.' : backupError;
      return Response.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    chat ??= process.env.GROQ_API_KEY ? createGroq() : createOllama();
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
      return streamTurn(request, path, input, user.id, persist);
    }
    const { body, status } = await service(request.method, path, input, { userId: user.id });
    if (request.method === 'POST' && !await saveBackup(persist)) {
      return Response.json({ error: backupError }, { status: 503 });
    }
    return Response.json(body, { status, headers: {
      'Cache-Control': 'no-store',
      ...(status === 200 && path[0] === 'export' && { 'Content-Disposition': 'attachment; filename="speakmate-export.json"' })
    } });
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
  if (recognitionRunning) return problem('Speech recognition is busy. Try again in a moment.', 429);
  recognitionRunning = true;
  try {
    const hostedSpeech = !!process.env.GROQ_API_KEY;
    if (!hostedSpeech) await whisperReady();
    const audio = await readBody(request, MAX_WAV_BYTES);
    if (!audio) return problem('The recording is too long. Try a shorter turn.', 413);
    if (!validWav(audio)) return problem('Invalid or too short microphone recording.', 400);
    return Response.json({ text: await (hostedSpeech ? transcribeWithGroq(audio, request.signal) : transcribe(audio, request.signal)) });
  } catch (error) {
    if (request.signal.aborted) return problem('Recognition was cancelled.', 408);
    if (error.code === 'ENOENT') return problem('Local speech recognition is missing. Check the Whisper setup in the README.', 503);
    console.error('SpeakMate transcription failed', error.name, error.code);
    return problem('Speech recognition could not process this turn. Try again.', 503);
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

function streamTurn(request, path, input, userId, persist) {
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
        if (!await saveBackup(persist)) send({ type: 'error', error: backupError });
        else send(status === 200 ? { type: 'done', data: body } : { type: 'error', error: body.error });
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
