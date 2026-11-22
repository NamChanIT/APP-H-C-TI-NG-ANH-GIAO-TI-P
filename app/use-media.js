'use client';

import { useEffect, useRef, useState } from 'react';
import { useMicrophone } from './use-microphone';

export function useMedia({ onTranscript, onError, locale, rate, phase }) {
  const [camera, setCamera] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState('');
  const stream = useRef(null);
  const cameraRequest = useRef(0);
  const utterance = useRef(null);
  const speechQueue = useRef([]);
  const speechMotion = useRef(null);
  const video = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onError };
  const microphone = useMicrophone({ onTranscript, onError, phase, speaking });

  useEffect(() => {
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth?.getVoices() || []);
    update();
    synth?.addEventListener('voiceschanged', update);
    return () => {
      synth?.removeEventListener('voiceschanged', update);
      cameraRequest.current++;
      stream.current?.getTracks().forEach(track => track.stop());
      synth?.cancel();
    };
  }, []);

  function silence() {
    utterance.current = null;
    speechMotion.current = null;
    speechQueue.current = [];
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function playNext() {
    const sentence = speechQueue.current.shift();
    utterance.current = sentence || null;
    speechMotion.current = null;
    if (!sentence) {
      setSpeaking(false);
      return;
    }
    sentence.onend = sentence.onerror = event => {
      if (utterance.current !== sentence) return;
      if (event.type === 'error') {
        silence();
        callbacks.current.onError('Voice playback was interrupted. Use Replay to try again.');
      } else {
        playNext();
      }
    };
    setSpeaking(true);
    window.speechSynthesis.speak(sentence);
  }

  function speak(text, { append = false, onStart, accent = locale } = {}) {
    if (!append) silence();
    microphone.suspendRecognition();
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      onError('Voice playback is unavailable in this browser.');
      return;
    }
    const sentence = new SpeechSynthesisUtterance(text);
    const choices = voices.filter(voice => voice.lang.startsWith('en'));
    sentence.voice = choices.find(voice => voice.name === voiceName) || choices.find(voice => voice.lang === accent) || null;
    sentence.lang = sentence.voice?.lang || accent;
    sentence.rate = Number(rate);
    function moveMouth(index, length) {
      if (utterance.current !== sentence) return;
      const word = (length > 0 ? text.slice(index, index + length) : text.slice(index).match(/^\p{L}+/u)?.[0]) || '';
      speechMotion.current = { active: true, at: performance.now(), word, rate: sentence.rate };
    }
    sentence.onstart = () => {
      if (utterance.current !== sentence) return;
      moveMouth(0);
      onStart?.();
    };
    sentence.onboundary = event => {
      if (event.name === 'word') moveMouth(event.charIndex, event.charLength);
    };
    speechQueue.current.push(sentence);
    if (!utterance.current) playNext();
  }

  function stopCamera() {
    cameraRequest.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  }

  async function toggleCamera() {
    if (stream.current) return stopCamera();
    const request = ++cameraRequest.current;
    try {
      const result = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (request !== cameraRequest.current) {
        result.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = result;
      if (video.current) video.current.srcObject = result;
      result.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (stream.current === result) stopCamera();
      }));
      setCamera(true);
    } catch {
      if (request === cameraRequest.current) onError('Camera unavailable. Check browser permission or continue without video.');
    }
  }

  return { ...microphone, camera, speaking, speechMotion, voices, voiceName, setVoiceName, video,
    toggleCamera, stopCamera, silence, speak };
}
