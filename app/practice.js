'use client';

import { useState } from 'react';
import { comparePractice } from '../lib/practice.mjs';
import { useMicrophone } from './use-microphone';
import { Icon } from './icons';

export default function RepeatPractice({ correction, onSpeak, speaking, onSave, saved }) {
  const [words, setWords] = useState('');
  const [error, setError] = useState('');
  const media = useMicrophone({
    phase: 'live', speaking, pauseMs: 1500,
    onTranscript: transcript => {
      setWords(transcript);
      media.mute();
    },
    onError: setError
  });
  const result = words && comparePractice(correction.corrected, words);

  function start() {
    setError('');
    if (!media.mic && !media.connecting) setWords('');
    media.toggleMic();
  }

  return <section className="repeat-practice" aria-label="Try the correction aloud">
    <h3>Try it again</h3>
    <p className="muted">Focus on this correction. Listen, then say the sentence aloud.</p>
    <p><q>{correction.original}</q></p>
    <p><strong>{correction.corrected}</strong></p>
    <p>{correction.explanation}</p>
    <div className="practice-actions">
      <button type="button" onClick={() => onSpeak(correction.corrected)}><Icon name="volume" size={16} />Listen to the example</button>
      <button className="primary" type="button" disabled={speaking || media.transcribing} onClick={start}>
        {media.mic || media.connecting ? 'Stop microphone' : 'Say it aloud'}
      </button>
      <button type="button" disabled={saved} onClick={onSave}>{saved ? 'Saved for review' : 'Save for a future chat'}</button>
      {media.hearing && <button type="button" onClick={media.finishSpeaking}>Done speaking</button>}
    </div>
    {media.mic && <p role="status">{media.transcribing ? 'Checking what we heard…' : 'Listening. Say the sentence.'}</p>}
    {error && <p role="status">{error}</p>}
    {result && <div className="repeat-result" role="status">
      <p><strong>What we heard:</strong> {words}</p>
      <p>{result.exact ? 'The recognized words match the example.'
        : result.missing.length ? `These words were not recognized: ${result.missing.join(', ')}. Try again at a steady pace.`
          : 'The same words were recognized, with a different order or additional words.'}</p>
    </div>}
  </section>;
}
