import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceDetector, encodeWav } from '../lib/audio.mjs';
import { validWav } from '../lib/transcribe.mjs';

test('microphone audio is resampled to validated mono PCM', () => {
  const audio = new Float32Array(24000).fill(0.25);
  const wav = Buffer.from(encodeWav([audio], 48000));
  assert.equal(wav.length, 44 + 8000 * 2);
  assert.equal(wav.readInt16LE(44), 8192);
  assert.ok(validWav(wav));
  wav.writeUInt16LE(2, 22);
  assert.equal(validWav(wav), false);
});

test('voice detector keeps pre-roll, ignores quiet rooms and submits once after a pause', () => {
  const results = [];
  const detector = createVoiceDetector(16000, {
    onLevel() {},
    onSpeech() {},
    onTurn: (chunks, quietMs) => results.push({ chunks, quietMs })
  });
  const quiet = new Float32Array(1600);
  const voice = new Float32Array(1600).fill(0.09);
  for (let i = 0; i < 20; i++) detector.push(quiet);
  assert.equal(results.length, 0);
  for (let i = 0; i < 5; i++) detector.push(voice);
  for (let i = 0; i < 15; i++) detector.push(quiet);
  assert.equal(results.length, 1);
  assert.equal(results[0].chunks[0], quiet);
  assert.ok(results[0].quietMs >= 820);
  for (let i = 0; i < 4; i++) detector.push(voice);
  detector.finish();
  assert.equal(results.length, 2);
  assert.equal(results[1].quietMs, 0);
});
