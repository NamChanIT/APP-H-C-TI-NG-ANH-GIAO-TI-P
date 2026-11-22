export function publicOrigin(env = process.env) {
  const configured = env.SPEAKMATE_PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  if (!configured) return null;
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.origin !== configured.replace(/\/$/, '')) {
    throw new Error('Provide a valid HTTPS public origin for SpeakMate.');
  }
  return url;
}

export function allowAppRequest(request, hosted = publicOrigin()) {
  const host = request.headers.get('host') || '';
  const origin = request.headers.get('origin');
  if (hosted) return host.toLowerCase() === hosted.host && (!origin || origin === hosted.origin);
  return /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host) && (!origin || origin === `http://${host}`);
}
