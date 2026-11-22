import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { characters, topics } from './catalog.mjs';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

export function createStore(path = resolve(process.env.SPEAKMATE_DB || 'data/speakmate.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const { user_version: schemaVersion } = db.prepare('PRAGMA user_version').get();
  if (schemaVersion < 1) db.exec(readFileSync(resolve('lib/001-schema.sql'), 'utf8'));
  if (schemaVersion < 2) db.exec(readFileSync(resolve('lib/002-review.sql'), 'utf8'));
  if (schemaVersion < 3) db.exec(readFileSync(resolve('lib/003-auth.sql'), 'utf8'));
  for (const [table, entries] of [['ai_characters', characters], ['learning_topics', topics]]) {
    const insert = db.prepare(`INSERT INTO ${table}(id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`);
    for (const entry of entries) insert.run(entry.id, JSON.stringify(entry));
  }
  return db;
}
