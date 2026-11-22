import { allowLocalRequest, handleApi } from '../../../lib/http.mjs';

export const dynamic = 'force-dynamic';

async function handle(request, { params }) {
  const backend = process.env.SPEAKMATE_BACKEND_URL;
  if (!backend) return handleApi(request, params.path);
  if (!allowLocalRequest(request)) {
    return Response.json({ error: 'Use the app’s localhost address for this request.' }, { status: 403 });
  }
  const path = params.path.map(encodeURIComponent).join('/');
  const headers = new Headers();
  for (const key of ['accept', 'content-type', 'cookie']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const upstream = await fetch(new URL(`/api/${path}`, backend), {
      method: request.method, headers, signal: request.signal, cache: 'no-store', redirect: 'error',
      ...(request.body && { body: request.body, duplex: 'half' })
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['content-type', 'cache-control', 'x-accel-buffering']) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'SpeakMate backend is unavailable. Start it and try again.' }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
