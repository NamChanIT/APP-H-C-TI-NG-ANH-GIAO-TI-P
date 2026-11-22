const groqApi = 'https://api.groq.com/openai/v1';

export function createGroq({
  key = process.env.GROQ_API_KEY,
  model = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b',
  transport = fetch
} = {}) {
  const chat = async (messages, structured = false, { onDelta, signal } = {}) => {
    const streaming = !structured && !!onDelta;
    const timeout = AbortSignal.timeout(structured ? 80000 : 45000);
    const response = await transport(`${groqApi}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: streaming, max_completion_tokens: structured ? 2500 : 512,
        ...(model.startsWith('openai/gpt-oss-') && { reasoning_effort: 'low' }),
        ...(structured && { response_format: structured === true ? { type: 'json_object' } : {
          type: 'json_schema', json_schema: { name: 'speaking_report', schema: structured, strict: false }
        } })
      }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout
    });
    if (!response.ok) throw new Error(`Groq chat returned HTTP ${response.status}`);
    if (streaming) return streamChat(response.body, onDelta);
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Groq returned an empty reply');
    return structured ? JSON.parse(content) : content;
  };
  chat.warm = async () => {};
  return chat;
}

async function streamChat(body, onDelta) {
  if (!body) throw new Error('Groq returned no stream');
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          if (!text.trim()) throw new Error('Groq returned an empty reply');
          return text.trim();
        }
        if (!data) continue;
        const chunk = JSON.parse(data);
        if (chunk.error) throw new Error('Groq interrupted generation');
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
      }
    }
    throw new Error('Groq returned an incomplete reply');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function transcribeWithGroq(audio, signal, {
  key = process.env.GROQ_API_KEY, transport = fetch
} = {}) {
  const form = new FormData();
  form.set('file', new Blob([audio], { type: 'audio/wav' }), 'utterance.wav');
  form.set('model', process.env.GROQ_SPEECH_MODEL || 'whisper-large-v3-turbo');
  form.set('language', 'en');
  form.set('response_format', 'json');
  const timeout = AbortSignal.timeout(25000);
  const response = await transport(`${groqApi}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  });
  if (!response.ok) throw new Error(`Groq transcription returned HTTP ${response.status}`);
  const result = await response.json();
  return typeof result.text === 'string' ? result.text.trim() : '';
}
