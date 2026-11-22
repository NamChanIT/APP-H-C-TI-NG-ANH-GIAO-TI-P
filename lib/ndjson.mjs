export async function* readNdjson(body) {
  if (!body) throw new Error('Response stream is missing.');
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) if (line.trim()) yield JSON.parse(line);
    }
    if (pending.trim()) yield JSON.parse(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function takeSentence(text) {
  for (const match of text.matchAll(/[.!?]+["”’)]*(?=\s|$)/g)) {
    const end = match.index + match[0].length;
    if (/\b(?:Mr|Mrs|Ms|Dr|Prof|vs|e\.g|i\.e|[A-Z])\.$/.test(text.slice(0, end))) continue;
    // A following chunk can disambiguate a decimal or an abbreviation.
    if (end === text.length && match[0] === '.') continue;
    const sentence = text.slice(0, end).trim();
    if (sentence) return { sentence, rest: text.slice(end).trimStart() };
  }
  return null;
}
