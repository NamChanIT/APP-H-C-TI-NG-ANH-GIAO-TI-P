const words = value => value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
const normalize = value => value.replace(/’/g, "'");

export function comparePractice(target, spoken) {
  const expected = words(normalize(target));
  const actual = words(normalize(spoken));
  // A word can be recognized only once, even if it repeats in the model sentence.
  const counts = new Map();
  for (const word of actual) counts.set(word, (counts.get(word) || 0) + 1);
  return {
    exact: expected.join(' ') === actual.join(' '),
    missing: expected.filter(word => {
      const remaining = counts.get(word) || 0;
      if (!remaining) return true;
      counts.set(word, remaining - 1);
      return false;
    })
  };
}
