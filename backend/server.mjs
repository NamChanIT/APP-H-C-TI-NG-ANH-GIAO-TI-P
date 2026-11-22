import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

for (const file of ['.env.local', '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const { handleApi } = await import('../lib/http.mjs');
const host = '127.0.0.1';
const port = Number(process.env.SPEAKMATE_BACKEND_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SPEAKMATE_BACKEND_PORT.');
const address = `http://${host}:${port}`;

const server = createServer(async (incoming, outgoing) => {
  const cancellation = new AbortController();
  outgoing.once('close', () => {
    if (!outgoing.writableFinished) cancellation.abort();
  });
  try {
    const url = new URL(incoming.url, address);
    const path = url.pathname.startsWith('/api/') ? url.pathname.slice(5).split('/').map(decodeURIComponent) : [];
    const method = incoming.method;
    let response;
    if (method !== 'GET' && method !== 'POST') {
      response = Response.json({ error: 'Method unavailable.' }, { status: 405, headers: { Allow: 'GET, POST' } });
    } else if (!path.length) {
      response = Response.json({ error: 'Route unavailable.' }, { status: 404 });
    } else {
      const request = new Request(new URL(url.pathname + url.search, address), {
        method, headers: incoming.headers, signal: cancellation.signal,
        ...(method === 'POST' && { body: Readable.toWeb(incoming), duplex: 'half' })
      });
      response = await handleApi(request, path);
    }
    if (cancellation.signal.aborted) return;
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing, { signal: cancellation.signal });
    else outgoing.end();
  } catch (error) {
    if (cancellation.signal.aborted || outgoing.destroyed) return;
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    const status = error instanceof URIError ? 400 : 500;
    outgoing.writeHead(status, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ error: status === 400 ? 'Invalid request URL.' : 'Backend request failed.' }));
  }
});

server.listen(port, host, () => console.log(`SpeakMate backend listening at ${address}`));
