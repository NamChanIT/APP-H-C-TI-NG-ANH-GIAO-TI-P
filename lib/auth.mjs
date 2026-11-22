import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const cookieName = 'speakmate_session';
const lifetime = 7 * 24 * 60 * 60;
const secret = value => createHash('sha256').update(value).digest('hex');
const tokenFrom = request => request.headers.get('cookie')?.match(/(?:^|;\s*)speakmate_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const response = (body, status = 200, sessionCookie) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...(sessionCookie && { 'Set-Cookie': sessionCookie }) }
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const message = (error, status) => response({ error }, status);

export function createAuth(db) {
  const lookup = db.prepare('SELECT user_id, email, password_hash FROM accounts WHERE email=?');
  const session = db.prepare(`SELECT a.user_id AS id, a.email FROM login_sessions t
    JOIN accounts a ON a.user_id=t.user_id WHERE t.token_hash=? AND t.expires_at>?`);
  const insertSession = db.prepare('INSERT INTO login_sessions VALUES (?, ?, ?)');
  const deleteSession = db.prepare('DELETE FROM login_sessions WHERE token_hash=?');
  const cleanSessions = db.prepare('DELETE FROM login_sessions WHERE expires_at<=?');
  const addUser = db.prepare('INSERT INTO users(id) VALUES (?)');
  const addAccount = db.prepare('INSERT INTO accounts VALUES (?, ?, ?)');
  const dummySalt = randomBytes(16).toString('hex');
  let pending = 0;
  let attempts = 0;
  let windowUntil = 0;

  function current(request) {
    const token = tokenFrom(request);
    return token ? session.get(secret(token), Date.now()) || null : null;
  }

  function signedIn(request, account) {
    const previous = tokenFrom(request);
    if (previous) deleteSession.run(secret(previous));
    cleanSessions.run(Date.now());
    const token = randomBytes(32).toString('hex');
    insertSession.run(secret(token), account.id, Date.now() + lifetime * 1000);
    return response({ user: account }, 200, cookie(token, lifetime));
  }

  async function handle(request, action, input) {
    if (action === 'me' && request.method === 'GET') return response({ user: current(request) });
    if (request.method !== 'POST') return message('Unknown account action.', 404);
    if (action === 'logout') {
      const token = tokenFrom(request);
      if (token) deleteSession.run(secret(token));
      return response({ user: null }, 200, cookie('', 0));
    }
    if (!['register', 'login'].includes(action)) return message('Unknown account action.', 404);
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = typeof input?.password === 'string' ? input.password : '';
    if (email.length > 254 || !emailPattern.test(email) || password.length < 8 || password.length > 128) {
      return message('Enter a valid email and a password of 8–128 characters.', 400);
    }
    if (Date.now() >= windowUntil) {
      attempts = 0;
      windowUntil = Date.now() + 60000;
    }
    if (pending >= 2 || attempts >= 20) return message('Too many attempts. Try again shortly.', 429);
    pending++;
    attempts++;
    try {
      const existing = lookup.get(email);
      if (action === 'login') {
        const [salt, hash] = existing?.password_hash.split(':') || [dummySalt, '00'.repeat(64)];
        const candidate = await derive(password, salt, 64);
        if (!timingSafeEqual(candidate, Buffer.from(hash, 'hex')) || !existing) {
          return message('Email or password is incorrect.', 401);
        }
        return signedIn(request, { id: existing.user_id, email: existing.email });
      }
      const salt = randomBytes(16).toString('hex');
      const hash = (await derive(password, salt, 64)).toString('hex');
      const id = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (lookup.get(email)) {
          db.exec('ROLLBACK');
          return message('This email already has an account. Sign in instead.', 409);
        }
        addUser.run(id);
        addAccount.run(id, email, `${salt}:${hash}`);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return signedIn(request, { id, email });
    } finally {
      pending--;
    }
  }
  return { current, handle };
}
