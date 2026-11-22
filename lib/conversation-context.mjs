const windowSize = 14;
const recallCue = /\b(my (?:name|favorite|favourite|team|goal)|i (?:live|work|study|love|prefer|want|plan|used to|am from)|next week|yesterday)\b/i;
const clip = (text, limit) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : clean.slice(0, limit - 1).replace(/\s+\S*$/, '') + '…';
};

export function conversationContext(messages) {
  const recent = messages.slice(-windowSize).map(({ role, content }) => ({ role, content }));
  const earlier = messages.slice(0, -windowSize);
  if (!earlier.length) return { recent, summary: '' };
  const remembered = earlier
    .map(({ role, content }, index) => ({
      index, role, content, priority: (role === 'user' ? 10 : 0) + (recallCue.test(content) ? 25 : 0) + index / earlier.length * 12
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .sort((a, b) => a.index - b.index)
    .map(({ role, content }) => (role === 'user' ? 'Learner: ' : 'Partner: ') + clip(content, 124));
  return { recent, summary: remembered.join('\n') };
}
