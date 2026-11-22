import { randomUUID } from 'node:crypto';
import { characters, topics } from './catalog.mjs';
import { lessonFor } from './curriculum.mjs';
import { correctionCard, vocabularyCard } from './review-cards.mjs';

const intervals = [1, 3, 7, 14, 30];
const day = 24 * 60 * 60 * 1000;
const ok = body => ({ status: 200, body });
const error = (status, message) => ({ status, body: { error: message } });
const normalized = text => text.toLowerCase().trim().replace(/\s+/g, ' ');

export function createReviewService(db, clock = Date.now) {
  const findReport = db.prepare(`SELECT a.payload, s.character_id FROM speaking_assessments a
    JOIN conversation_sessions s ON s.id=a.session_id WHERE s.user_id=? AND s.id=?`);
  const save = db.prepare(`INSERT INTO review_cards (id, user_id, kind, front, back, speech, locale, card_key, due_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, card_key) DO NOTHING`);
  const list = db.prepare(`SELECT id, kind, front, back, speech, locale, due_at, successes
    FROM review_cards WHERE user_id=? ORDER BY due_at, rowid`);
  const get = db.prepare("SELECT id, due_at, successes FROM review_cards WHERE user_id=? AND id=?");
  const update = db.prepare(`UPDATE review_cards SET due_at=?, successes=? WHERE user_id=? AND id=? AND due_at=?`);
  const remove = db.prepare("DELETE FROM review_cards WHERE user_id=? AND id=?");

  return function review(method, parts, input, userId = 'local') {
    const state = () => ok({ cards: list.all(userId), now: clock() });
    const [, action] = parts;
    if (parts.length === 1 && method === 'GET') return state();
    if (parts.length !== 2 || method !== 'POST') return error(404, 'Review action unavailable.');

    if (action === 'save') {
      const { kind, index, sessionId, topicId, characterId } = input || {};
      if (!Number.isInteger(index) || index < 0 || !['vocabulary', 'correction'].includes(kind)) {
        return error(400, 'Choose an item to save.');
      }
      let card;
      let character;
      if (typeof sessionId === 'string') {
        const stored = findReport.get(userId, sessionId);
        if (!stored) return error(404, 'Session feedback is unavailable.');
        const report = JSON.parse(stored.payload);
        const item = (kind === 'correction' ? report.corrections : report.vocabulary)?.[index];
        if (item) card = kind === 'correction' ? correctionCard(item) : vocabularyCard(item);
        character = characters.find(value => value.id === stored.character_id);
      } else if (kind === 'vocabulary') {
        const topic = topics.find(value => value.id === topicId);
        const item = topic && lessonFor(topic).vocabulary[index];
        if (item) card = vocabularyCard(item);
        character = characters.find(value => value.id === characterId);
      }
      if (!card?.front || !card?.speech || (kind === 'vocabulary' && !card.back)) {
        return error(400, 'This item has no definition or correction to review.');
      }
      const key = normalized(kind === 'correction' ? JSON.stringify([card.front, card.speech]) : card.front);
      save.run(randomUUID(), userId, kind, card.front, card.back, card.speech, character?.locale || 'en-US', key, clock());
      return state();
    }

    if (typeof input?.id !== 'string') return error(400, 'Choose a card.');
    if (action === 'remove') {
      remove.run(userId, input.id);
      return state();
    }
    if (action === 'rate' && ['again', 'known'].includes(input.rating)) {
      const now = clock();
      const card = get.get(userId, input.id);
      if (!card || card.due_at > now || input.dueAt !== card.due_at) {
        return error(409, 'This card is no longer due. Refresh your review.');
      }
      const known = input.rating === 'known';
      const due = now + (known ? intervals[Math.min(card.successes, intervals.length - 1)] * day : 10 * 60 * 1000);
      const result = update.run(due, known ? Math.min(card.successes + 1, intervals.length) : 0, userId, card.id, card.due_at);
      if (!result.changes) return error(409, 'This card is no longer due. Refresh your review.');
      return state();
    }
    return error(400, 'Choose a review rating.');
  };
}
