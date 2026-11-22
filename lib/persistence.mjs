import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createStore } from './db.mjs';

const { backup } = process.getBuiltinModule('node:sqlite');
const maxBytes = 24 * 1024 * 1024;
const format = Buffer.from('SMDB1');

function seal(data, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(format);
  const encoded = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([format, nonce, cipher.getAuthTag(), encoded]);
}

function unseal(data, key) {
  if (data.length < 33 || !data.subarray(0, 5).equals(format)) throw new Error('Invalid SpeakMate backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(5, 17));
  decipher.setAAD(format);
  decipher.setAuthTag(data.subarray(17, 33));
  return Buffer.concat([decipher.update(data.subarray(33)), decipher.final()]);
}

export async function openPersistentStore({ path, remote, key }) {
  if (!remote) return { db: createStore(path), persist: async () => {} };
  if (!Buffer.isBuffer(key) || key.length !== 32 || !path || path === ':memory:') throw new Error('Invalid backup configuration.');

  const existing = await remote.get();
  let etag = existing?.etag;
  if (existing) {
    if (!etag || existing.bytes.length > maxBytes + 33) throw new Error('Invalid backup object.');
    const bytes = unseal(Buffer.from(existing.bytes), key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = await mkdtemp(join(dirname(path), '.speakmate-restore-'));
    const restored = join(temporary, 'restore.sqlite');
    try {
      await writeFile(restored, bytes, { mode: 0o600 });
      // Publish only after authentication and decryption succeed.
      await rename(restored, path);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  const db = createStore(path);
  const changes = db.prepare('SELECT total_changes() AS count');
  let saved = changes.get().count;
  let tail = Promise.resolve();
  function persist() {
    const next = tail.catch(() => {}).then(async () => {
      const target = changes.get().count;
      if (target === saved) return;
      const temporary = await mkdtemp(join(tmpdir(), 'speakmate-snapshot-'));
      const snapshot = join(temporary, 'backup.sqlite');
      try {
        await backup(db, snapshot);
        const bytes = await readFile(snapshot);
        if (bytes.length > maxBytes) throw new Error('SpeakMate backup exceeds the size limit.');
        const tag = await remote.put(seal(bytes, key), etag);
        if (!tag) throw new Error('Backup provider did not return an object version.');
        etag = tag;
        saved = target;
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    });
    tail = next;
    return next;
  }
  return { db, persist };
}

export async function openConfiguredStore(env = process.env) {
  const path = resolve(/* turbopackIgnore: true */ env.SPEAKMATE_DB || 'data/speakmate.sqlite');
  if (!env.SPEAKMATE_R2_BUCKET) return openPersistentStore({ path });
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { SPEAKMATE_R2_ENDPOINT, SPEAKMATE_R2_ACCESS_KEY_ID, SPEAKMATE_R2_SECRET_ACCESS_KEY, SPEAKMATE_BACKUP_KEY } = env;
  const endpoint = SPEAKMATE_R2_ENDPOINT && new URL(SPEAKMATE_R2_ENDPOINT);
  if (!endpoint || endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') ||
      !SPEAKMATE_R2_ACCESS_KEY_ID || !SPEAKMATE_R2_SECRET_ACCESS_KEY || !/^[a-f0-9]{64}$/i.test(SPEAKMATE_BACKUP_KEY || '')) {
    throw new Error('Incomplete Cloudflare R2 backup settings.');
  }
  const client = new S3Client({
    endpoint: endpoint.origin, region: 'auto', forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
    credentials: { accessKeyId: SPEAKMATE_R2_ACCESS_KEY_ID, secretAccessKey: SPEAKMATE_R2_SECRET_ACCESS_KEY }
  });
  const object = { Bucket: env.SPEAKMATE_R2_BUCKET, Key: env.SPEAKMATE_R2_OBJECT || 'speakmate.sqlite.enc' };
  const remote = {
    async get() {
      try {
        const result = await client.send(new GetObjectCommand(object), { abortSignal: AbortSignal.timeout(12000) });
        if (!result.Body || result.ContentLength > maxBytes + 33) throw new Error('Invalid backup size.');
        return { bytes: await result.Body.transformToByteArray(), etag: result.ETag };
      } catch (error) {
        if (error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async put(bytes, etag) {
      const result = await client.send(new PutObjectCommand({
        ...object, Body: bytes, ContentType: 'application/octet-stream',
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' })
      }), { abortSignal: AbortSignal.timeout(12000) });
      return result.ETag;
    }
  };
  return openPersistentStore({ path, remote, key: Buffer.from(SPEAKMATE_BACKUP_KEY, 'hex') });
}
