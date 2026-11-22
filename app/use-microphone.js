'use client';

import { useEffect, useRef, useState } from 'react';
import { createVoiceDetector, encodeWav } from '../lib/audio.mjs';

export function useMicrophone({ phase, speaking, onTranscript, onError, pauseMs }) {
  const [mic, setMic] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const wanted = useRef(false);
  const capture = useRef(null);
  const upload = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { phase, speaking, onTranscript, onError };

  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices?.enumerateDevices();
      setDevices((list || []).filter(device => device.kind === 'audioinput' && device.deviceId !== 'default'));
    } catch {
      setDevices([]);
    }
  }

  useEffect(() => {
    const media = navigator.mediaDevices;
    refreshDevices();
    media?.addEventListener('devicechange', refreshDevices);
    return () => media?.removeEventListener('devicechange', refreshDevices);
  }, []);

  function release(current) {
    if (current.node) {
      current.node.port.onmessage = null;
      current.node.port.close();
      current.node.disconnect();
      current.source.disconnect();
    }
    current.stream?.getTracks().forEach(track => track.stop());
    if (current.context.state !== 'closed') current.context.close().catch(() => {});
  }

  useEffect(() => () => {
    wanted.current = false;
    upload.current?.abort();
    const current = capture.current;
    capture.current = null;
    if (current) release(current);
  }, []);

  function syncCapture() {
    const current = capture.current;
    if (!current?.track) return;
    const { phase: stage, speaking: isSpeaking } = callbacks.current;
    current.track.enabled = wanted.current && ['live', 'mic-test'].includes(stage) && !isSpeaking && !upload.current;
    if (!current.track.enabled) current.detector?.reset();
  }

  function suspendRecognition() {
    upload.current?.abort();
    upload.current = null;
    const current = capture.current;
    if (current?.track) current.track.enabled = false;
    current?.detector?.reset();
    setHearing(false);
    setTranscribing(false);
    setLevel(0);
  }

  useEffect(() => {
    if (['live', 'mic-test'].includes(phase) && !speaking) syncCapture();
    else suspendRecognition();
  }, [phase, speaking]);

  function mute() {
    wanted.current = false;
    suspendRecognition();
    const current = capture.current;
    capture.current = null;
    if (current) release(current);
    setMic(false);
    setConnecting(false);
  }

  async function recognize(current, chunks, quietMs) {
    if (capture.current !== current || !current.track.enabled || upload.current) return;
    const speechEndedAt = performance.now() - quietMs;
    const controller = new AbortController();
    upload.current = controller;
    syncCapture();
    setHearing(false);
    setLevel(0);
    setTranscribing(true);
    let submitted = false;
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'audio/wav' },
        body: encodeWav(chunks, current.context.sampleRate), signal: controller.signal
      });
      const result = await response.json();
      if (controller.signal.aborted || capture.current !== current) return;
      if (!response.ok) throw new Error(result.error);
      if (!result.text) {
        callbacks.current.onError('Audio was detected, but no English words were recognized. Try a short sentence.');
        return;
      }
      submitted = true;
      callbacks.current.onTranscript(result.text, speechEndedAt);
    } catch (error) {
      if (!controller.signal.aborted) callbacks.current.onError(error.message || 'Local transcription failed.');
    } finally {
      if (upload.current === controller) {
        upload.current = null;
        setTranscribing(false);
        if (!submitted) syncCapture();
      }
    }
  }

  async function toggleMic() {
    if (wanted.current) {
      mute();
      return;
    }
    wanted.current = true;
    setConnecting(true);
    let current;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
        throw new Error('This browser cannot capture microphone audio. Open SpeakMate in Chrome on localhost.');
      }
      const context = new AudioContextClass();
      current = { context };
      capture.current = current;
      const resume = context.resume();
      resume.catch(() => {});
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(deviceId && { deviceId: { exact: deviceId } })
        },
        video: false
      });
      current.stream = media;
      if (capture.current !== current) {
        release(current);
        return;
      }
      refreshDevices();
      current.track = media.getAudioTracks()[0];
      current.track.enabled = false;
      await resume;
      await context.audioWorklet.addModule('/mic-worklet.js');
      if (capture.current !== current) return;
      current.detector = createVoiceDetector(context.sampleRate, {
        pauseMs,
        onLevel: setLevel,
        onSpeech: setHearing,
        onTurn: (chunks, quietMs) => recognize(current, chunks, quietMs)
      });
      current.source = context.createMediaStreamSource(media);
      current.node = new AudioWorkletNode(context, 'speakmate-mic', { numberOfOutputs: 0 });
      current.node.port.onmessage = ({ data }) => {
        if (capture.current !== current || !current.track.enabled) return;
        if (callbacks.current.phase === 'mic-test') {
          let squares = 0;
          for (const value of data) squares += value * value;
          setLevel(Math.min(1, Math.sqrt(squares / data.length) * 16));
        } else {
          current.detector.push(data);
        }
      };
      current.source.connect(current.node);
      current.track.addEventListener('ended', () => {
        if (capture.current !== current) return;
        mute();
        callbacks.current.onError('The microphone disconnected. Turn Mic back on to reconnect.');
      });
      syncCapture();
      setMic(true);
      setConnecting(false);
    } catch (error) {
      if (capture.current !== (current || null)) return;
      mute();
      const message = error.name === 'NotAllowedError'
        ? 'Microphone blocked. Check Chrome site permissions and macOS Privacy & Security → Microphone.'
        : error.name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone and turn Mic back on.'
          : error.message || 'The microphone could not start.';
      callbacks.current.onError(message);
    }
  }

  function selectDevice(value) {
    mute();
    setDeviceId(value);
  }

  return { mic, devices, deviceId, selectDevice, connecting, hearing, transcribing, level, toggleMic, mute, suspendRecognition,
    finishSpeaking: () => capture.current?.detector?.finish() };
}
