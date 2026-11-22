import { readNdjson } from './ndjson.mjs';

export function createOllama({
  host = process.env.OLLAMA_HOST_URL || 'http://127.0.0.1:11434',
  model = process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  reportModel = process.env.OLLAMA_REPORT_MODEL || model,
  transport = fetch
} = {}) {
  const endpoint = new URL('/api/chat', host);
  const chat = async (messages, structured = false, { onDelta, signal } = {}) => {
    const streaming = !structured && !!onDelta;
    const timeout = AbortSignal.timeout(structured ? 90000 : 45000);
    const response = await transport(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: structured ? reportModel : model, messages, stream: streaming, keep_alive: '10m',
        options: { num_ctx: 8192, num_predict: structured ? 1800 : 160 },
        ...(structured && { format: structured === true ? 'json' : structured })
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    if (streaming) {
      let content = '';
      let complete = false;
      for await (const chunk of readNdjson(response.body)) {
        if (chunk.error) throw new Error(chunk.error);
        const delta = chunk.message?.content;
        if (delta) {
          content += delta;
          onDelta(delta);
        }
        if (chunk.done) {
          complete = true;
          break;
        }
      }
      if (!complete || !content.trim()) throw new Error('Ollama returned an incomplete answer');
      return content.trim();
    }
    const result = await response.json();
    const content = result.message?.content?.trim();
    if (!content) throw new Error('Ollama returned an empty answer');
    return structured ? JSON.parse(content) : content;
  };
  let warming;
  let warmedUntil = 0;
  chat.warm = function warm() {
    if (warming) return warming;
    if (Date.now() < warmedUntil) return Promise.resolve();
    warming = (async () => {
      const response = await transport(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [], stream: false, keep_alive: '10m', options: { num_ctx: 8192 } }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Ollama warm-up failed (${response.status})`);
      await response.json();
      warmedUntil = Date.now() + 5 * 60 * 1000;
    })().finally(() => { warming = undefined; });
    return warming;
  };
  return chat;
}

export const reportDimensions = ['grammar', 'vocabulary', 'coherence', 'interaction'];

const stringSchema = { type: 'string' };
const stringsSchema = { type: 'array', items: stringSchema, maxItems: 5 };
const dimensionSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 5 },
    comment: stringSchema,
    evidence: stringSchema
  },
  required: ['score', 'comment', 'evidence']
};
export const reportSchema = {
  type: 'object',
  properties: {
    dimensions: {
      type: 'object',
      properties: Object.fromEntries(reportDimensions.map(key => [key, dimensionSchema])),
      required: reportDimensions
    },
    corrections: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object',
        properties: { original: stringSchema, corrected: stringSchema, explanation: stringSchema },
        required: ['original', 'corrected', 'explanation']
      }
    },
    strengths: stringsSchema,
    vocabulary: stringsSchema,
    structures: stringsSchema,
    exercise: stringSchema,
    nextTopic: stringSchema
  },
  required: ['dimensions', 'corrections', 'strengths', 'vocabulary', 'structures', 'exercise', 'nextTopic']
};

export function curateReport(raw, messages) {
  const learner = messages.filter(message => message.role === 'user').map(message => message.content);
  const hasQuote = quote => typeof quote === 'string' && quote.trim() && learner.some(line => line.includes(quote));
  const dimensions = {};
  for (const dimension of reportDimensions) {
    const entry = raw?.dimensions?.[dimension];
    if (Number.isInteger(entry?.score) && entry.score >= 1 && entry.score <= 5 &&
        hasQuote(entry.evidence) && typeof entry.comment === 'string' && entry.comment.trim()) {
      dimensions[dimension] = { score: entry.score, evidence: entry.evidence, comment: entry.comment };
    }
  }
  const strings = list => Array.isArray(list) ? list.filter(item => typeof item === 'string' && item.trim()).slice(0, 5) : [];
  const corrections = Array.isArray(raw?.corrections) ? raw.corrections.filter(entry =>
    hasQuote(entry?.original) && typeof entry.corrected === 'string' && typeof entry.explanation === 'string'
  ).slice(0, 5) : [];
  return {
    dimensions, corrections, strengths: strings(raw?.strengths).filter(hasQuote),
    vocabulary: strings(raw?.vocabulary), structures: strings(raw?.structures),
    exercise: typeof raw?.exercise === 'string' ? raw.exercise : '',
    nextTopic: typeof raw?.nextTopic === 'string' ? raw.nextTopic : ''
  };
}
