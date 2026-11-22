export const SAMPLE_RATE = 16000;
export const MAX_AUDIO_SECONDS = 26;
export const MAX_WAV_BYTES = 44 + SAMPLE_RATE * MAX_AUDIO_SECONDS * 2;

export function encodeWav(chunks, inputRate) {
  const input = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let position = 0;
  for (const chunk of chunks) {
    input.set(chunk, position);
    position += chunk.length;
  }
  const ratio = inputRate / SAMPLE_RATE;
  const count = Math.floor(input.length / ratio);
  const header = new DataView(new ArrayBuffer(44 + count * 2));
  const tag = (offset, text) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  header.setUint32(4, 36 + count * 2, true);
  tag(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  tag(36, 'data');
  header.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const first = Math.floor(i * ratio);
    const end = Math.max(first + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = first; j < end; j++) sum += input[j];
    const value = Math.max(-1, Math.min(1, sum / (end - first)));
    header.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return header.buffer;
}

export function createVoiceDetector(sampleRate, { onLevel, onSpeech, onTurn, pauseMs = 820 }) {
  const leadIn = Math.round(sampleRate * 0.30);
  const silenceLimit = sampleRate * pauseMs / 1000;
  const maxLength = sampleRate * 24;
  const minVoice = sampleRate * 0.16;
  let recent = [];
  let recentSamples = 0;
  let chunks = null;
  let length = 0;
  let voicedSamples = 0;
  let silentSamples = 0;
  let noise = 0.002;

  function reset() {
    recent = [];
    recentSamples = 0;
    chunks = null;
    length = 0;
    voicedSamples = 0;
    silentSamples = 0;
    noise = 0.002;
  }

  function finish() {
    const audio = chunks;
    const quietMs = silentSamples / sampleRate * 1000;
    const valid = audio && voicedSamples >= minVoice;
    reset();
    if (valid) onTurn(audio, quietMs);
    else if (audio) onSpeech(false);
  }

  function push(samples) {
    let squares = 0;
    for (const sample of samples) squares += sample * sample;
    const rms = Math.sqrt(squares / samples.length);
    onLevel(Math.min(1, rms * 16));
    const voiced = rms >= Math.max(0.007, noise * 2.4);
    if (!chunks) {
      if (!voiced) noise = Math.max(0.001, Math.min(0.012, noise * 0.97 + rms * 0.03));
      recent.push(samples);
      recentSamples += samples.length;
      while (recent.length > 1 && recentSamples - recent[0].length >= leadIn) recentSamples -= recent.shift().length;
      if (!voiced) return;
      chunks = recent;
      length = recentSamples;
      onSpeech(true);
    } else {
      chunks.push(samples);
      length += samples.length;
    }
    if (voiced) {
      voicedSamples += samples.length;
      silentSamples = 0;
    } else {
      silentSamples += samples.length;
    }
    if (silentSamples >= silenceLimit || length >= maxLength) finish();
  }
  return { push, finish, reset };
}
