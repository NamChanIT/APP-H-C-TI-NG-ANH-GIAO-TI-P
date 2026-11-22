export function vocabularyCard(value) {
  const separator = /\s+[–—-]\s+|:\s+/;
  const split = separator.exec(value);
  const front = split ? value.slice(0, split.index).trim() : value.trim();
  const back = split ? value.slice(split.index + split[0].length).trim() : '';
  return { front, back, speech: front };
}

export function correctionCard(item) {
  return { front: item.original, back: item.explanation, speech: item.corrected };
}
