import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../lib/auth.mjs';
import { createStore } from '../lib/db.mjs';
import { createService } from '../lib/service.mjs';

test('account sessions authenticate and revoke without exposing another user’s practice', async () => {
  const db = createStore(':memory:');
  try {
    const auth = createAuth(db);
    const makeRequest = (cookie = '') => new Request('http://127.0.0.1:3001/api/auth/me', {
      method: 'POST', headers: { cookie }
    });
    const password = 'sample-password';
    const register = async email => {
      const result = await auth.handle(makeRequest(), 'register', { email, password });
      assert.equal(result.status, 200);
      assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
      const token = result.headers.get('set-cookie').split(';')[0];
      return { id: (await result.json()).user.id, token };
    };
    const first = await register('First@example.com');
    const second = await register('second@example.com');
    assert.equal(auth.current(makeRequest(first.token)).email, 'first@example.com');
    assert.equal((await auth.handle(makeRequest(), 'login', { email: 'first@example.com', password: 'wrong-pass' })).status, 401);
    const stored = db.prepare('SELECT password_hash FROM accounts WHERE user_id=?').get(first.id);
    assert.ok(!stored.password_hash.includes(password));

    const dispatch = createService(db, async () => 'Hello.');
    const asFirst = { userId: first.id };
    const asSecond = { userId: second.id };
    const { body } = await dispatch('POST', ['sessions'], { character:'emma', topic:'free', mode:'free' }, asFirst);
    const id = body.session.id;
    assert.equal((await dispatch('GET', ['sessions', id], {}, asSecond)).status, 404);
    assert.equal((await dispatch('POST', ['sessions', id, 'finish'], { seconds: 1 }, asSecond)).status, 404);
    await dispatch('POST', ['sessions', id, 'finish'], { seconds: 1 }, asFirst);
    assert.equal((await dispatch('GET', ['sessions'], {}, asFirst)).body.length, 1);
    assert.equal((await dispatch('GET', ['sessions'], {}, asSecond)).body.length, 0);
    const saved = await dispatch('POST', ['review', 'save'], { kind:'vocabulary', index:0, topicId:'free' }, asFirst);
    await dispatch('POST', ['review', 'remove'], { id: saved.body.cards[0].id }, asSecond);
    assert.equal((await dispatch('GET', ['review'], {}, asFirst)).body.cards.length, 1);
    assert.equal((await dispatch('GET', ['review'], {}, asSecond)).body.cards.length, 0);
    await auth.handle(makeRequest(first.token), 'logout', {});
    assert.equal(auth.current(makeRequest(first.token)), null);
    assert.equal(auth.current(makeRequest(second.token)).id, second.id);
  } finally {
    db.close();
  }
});
