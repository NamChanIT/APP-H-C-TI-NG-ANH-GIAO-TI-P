import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { MAX_WAV_BYTES, SAMPLE_RATE } from './audio.mjs';

const run = promisify(execFile);
const model = resolve(/* turbopackIgnore: true */ process.env.WHISPER_MODEL || 'data/models/ggml-base.en.bin');
const binary = process.env.WHISPER_BIN || (process.platform === 'darwin' && process.arch === 'arm64'
  ? '/opt/homebrew/bin/whisper-cli' : 'whisper-cli');

export async function whisperReady() {
  await access(model);
  if (binary.includes('/')) await access(binary);
}

export function validWav(audio) {
  return audio.length >= 44 + SAMPLE_RATE / 5 * 2 && audio.length <= MAX_WAV_BYTES &&
    audio.toString('ascii', 0, 4) === 'RIFF' && audio.readUInt32LE(4) === audio.length - 8 &&
    audio.toString('ascii', 8, 16) === 'WAVEfmt ' && audio.readUInt32LE(16) === 16 &&
    audio.readUInt16LE(20) === 1 && audio.readUInt16LE(22) === 1 &&
    audio.readUInt32LE(24) === SAMPLE_RATE && audio.readUInt32LE(28) === SAMPLE_RATE * 2 &&
    audio.readUInt16LE(32) === 2 && audio.readUInt16LE(34) === 16 &&
    audio.toString('ascii', 36, 40) === 'data' && audio.readUInt32LE(40) === audio.length - 44 &&
    audio.length % 2 === 0;
}

export async function transcribe(audio, signal) {
  const folder = await mkdtemp(join(tmpdir(), 'speakmate-voice-'));
  try {
    const input = join(folder, 'turn.wav');
    await writeFile(input, audio, { mode: 0o600, signal });
    const { stdout } = await run(binary, [
      '-m', model, '-f', input, '-l', 'en', '-nt', '-np', '-bs', '1', '-bo', '1', '-nf'
    ], { timeout: 25000, maxBuffer: 256 * 1024, signal, encoding: 'utf8' });
    return stdout.replace(/\[[^\]\n]*\]|\([^()\n]*(?:music|silence|noise)[^()\n]*\)/gi, '')
      .replace(/\s+/g, ' ').trim();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
