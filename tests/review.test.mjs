import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/db.mjs';
import { createReviewService } from '../lib/review.mjs';

test('saved topic cards are idempotent and return after their scheduled interval', () => {
  const db = createStore(':memory:');
  try {
    let now = 100000;
    const review = createReviewService(db, () => now);
    const save = { kind: 'vocabulary', topicId: 'free', index: 0, characterId: 'emma' };
    const card = review('POST', ['review', 'save'], save).body.cards[0];
    assert.equal(card.locale, 'en-GB');
    assert.ok(card.front && card.back);
    assert.equal(review('POST', ['review', 'save'], save).body.cards.length, 1);
    const again = review('POST', ['review', 'rate'], { id: card.id, dueAt: card.due_at, rating: 'again' }).body.cards[0];
    assert.equal(again.due_at, now + 600000);
    assert.equal(review('POST', ['review', 'rate'], { id: card.id, dueAt: card.due_at, rating: 'again' }).status, 409);
    now = again.due_at;
    const known = review('POST', ['review', 'rate'], { id: card.id, dueAt: now, rating: 'known' }).body.cards[0];
    assert.equal(known.successes, 1);
    assert.equal(known.due_at, now + 86400000);
    assert.equal(review('POST', ['review', 'remove'], { id: card.id }).body.cards.length, 0);
  } finally {
    db.close();
  }
});

test('correction cards are sourced from stored assessment text', () => {
  const db = createStore(':memory:');
  try {
    db.prepare('INSERT INTO conversation_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('test', 'local', 'olivia', 'free', 'free', 1, 2, 1);
    const correction = { original: 'I very like my job.', corrected: 'I really enjoy my job.', explanation: 'Use really to modify enjoy.' };
    db.prepare('INSERT INTO speaking_assessments VALUES (?, ?)').run('test', JSON.stringify({ corrections: [correction] }));
    const review = createReviewService(db);
    const { body } = review('POST', ['review', 'save'], { kind: 'correction', sessionId: 'test', index: 0, corrected: 'Untrusted override' });
    assert.equal(body.cards[0].front, correction.original);
    assert.equal(body.cards[0].speech, correction.corrected);
    assert.equal(body.cards[0].back, correction.explanation);
    assert.equal(body.cards[0].locale, 'en-AU');
  } finally {
    db.close();
  }
});
