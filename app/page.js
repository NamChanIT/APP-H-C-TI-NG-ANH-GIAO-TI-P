'use client';

import { useEffect, useRef, useState } from 'react';
import { characters, modes, topics } from '../lib/catalog.mjs';
import { readNdjson, takeSentence } from '../lib/ndjson.mjs';
import { lessonFor } from '../lib/curriculum.mjs';
import { correctionCard, vocabularyCard } from '../lib/review-cards.mjs';
import Review, { PracticeActions, reviewApi } from './review';
import Account from './account';
import Avatar from './avatar';
import { Icon } from './icons';
import { useMedia } from './use-media';

const OPENING = { turn: 'opening', source: 'opening' };
const CLOCK = seconds => [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
const groups = [...new Set(topics.map(topic => topic.group))];
const localDay = value => new Date(value).toLocaleDateString('en-CA');
const dimensions = ['grammar', 'vocabulary', 'coherence', 'interaction', 'fluency', 'pronunciation'];

async function api(path = '', body) {
  const response = await fetch(`/api/sessions${path}`, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function Control({ icon, children, active, ...props }) {
  return <button className={`control ${active ? 'selected' : ''}`} {...props}>
    <Icon name={icon} size={19} /><span>{children}</span>
  </button>;
}

function Transcript({ messages, character }) {
  return messages.length ? <ol className="transcript">{messages.map((message, index) =>
    <li key={index}><strong>{message.role === 'user' ? 'You' : character.name}</strong><p>{message.content}</p></li>
  )}</ol> : <p className="muted empty">Your conversation will appear here.</p>;
}

function Report({ data, character, retry, busy, back, onSpeak, saveCard, isSaved }) {
  const report = data.report;
  return <section className="report panel">
    <div className="section-title"><div><h2>Session summary</h2>
      <p className="muted">{topics.find(topic => topic.id === data.session.topic_id)?.title} · {CLOCK(data.session.active_seconds || 0)} with {character.name}</p></div>
      <button className="primary" onClick={back}>Back to studio</button></div>
    {data.reportError && <div className="notice" role="status">{data.reportError} <button onClick={retry} disabled={busy}>Retry assessment</button></div>}
    {busy && <p className="muted" role="status">Preparing your assessment… Your transcript is ready below.</p>}
    {!busy && !report && !data.reportError && <p className="muted">Feedback requires at least one learner turn and a completed assessment.</p>}
    {!busy && <div className="score-grid">{dimensions.map(key => {
      const entry = report?.dimensions[key];
      return <article key={key} className="score"><h3>{key}</h3>
        {entry ? <><b>{entry.score}<small> / 5</small></b><p>{entry.comment}</p><q>{entry.evidence}</q></>
          : <p className="muted">{['fluency', 'pronunciation'].includes(key) ? 'Requires acoustic assessment' : 'Insufficient transcript evidence'}</p>}</article>;
    })}</div>}
    {report && <>
      {!!report.strengths.length && <><h3>What went well</h3><ul>{report.strengths.map((value, index) => <li key={index}><q>{value}</q></li>)}</ul></>}
      {!!report.corrections.length && <><h3>Say it more naturally</h3><ul>{report.corrections.map((item, index) =>
        <li key={index}><q>{item.original}</q><p><strong>{item.corrected}</strong></p><p>{item.explanation}</p>
          <PracticeActions text={item.corrected} onSpeak={onSpeak} saved={isSaved('correction', correctionCard(item))}
            onSave={() => saveCard('correction', index)} /></li>)}</ul></>}
      {!!report.vocabulary.length && <><h3>Vocabulary to practise</h3><ul>{report.vocabulary.map((item, index) => {
        const card = vocabularyCard(item);
        return <li key={index}>{item}<PracticeActions text={card.speech} onSpeak={onSpeak}
          saved={isSaved('vocabulary', card)} onSave={card.back ? () => saveCard('vocabulary', index) : undefined} /></li>;
      })}</ul></>}
      {!!report.structures.length && <><h3>B2 structures</h3><ul>{report.structures.map((item, index) =>
        <li key={index}>{item}<PracticeActions text={item} onSpeak={onSpeak} /></li>)}</ul></>}
      {report.exercise && <><h3>Practice exercise</h3><p>{report.exercise}</p></>}
      {report.nextTopic && <><h3>Next topic</h3><p>{report.nextTopic}</p></>}
    </>}
    <details><summary>Session transcript</summary><Transcript messages={data.messages} character={character} /></details>
  </section>;
}

export default function Page() {
  return <Account renderStudio={(user, logout, signingOut) =>
    <Studio key={user.id} user={user} logout={logout} signingOut={signingOut} />} />;
}

function Studio({ user, logout, signingOut }) {
  const [selected, setSelected] = useState('emma');
  const [topic, setTopic] = useState('free');
  const [mode, setMode] = useState('free');
  const [rate, setRate] = useState('0.9');
  const [view, setView] = useState('studio');
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [cards, setCards] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const reviewQueue = useRef(Promise.resolve());
  const [phase, setPhase] = useState('ready');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [tab, setTab] = useState('setup');
  const [retry, setRetry] = useState(null);
  const [partial, setPartial] = useState('');
  const [pendingLearner, setPendingLearner] = useState('');
  const [canInterrupt, setCanInterrupt] = useState(false);
  const [assessing, setAssessing] = useState(new Set());
  const assessments = useRef(new Set());
  const currentTurn = useRef(null);
  const busy = useRef(false);
  const elapsed = useRef(0);
  const activeSince = useRef(null);
  const captionRef = useRef(null);
  const character = characters.find(item => item.id === selected);
  const active = ['starting', 'live', 'thinking', 'paused', 'ending'].includes(phase);
  const waiting = ['starting', 'thinking', 'ending'].includes(phase);
  const messages = data?.messages || [];
  const lastAssistant = messages.findLast(message => message.role === 'assistant');
  const lastLearner = messages.findLast(message => message.role === 'user');
  const media = useMedia({
    onTranscript: (text, speechEndedAt) => sendText(text, 'voice', speechEndedAt),
    onError: setNotice, locale: character.locale, rate, phase
  });
  const status = media.speaking ? 'Speaking' : media.transcribing ? 'Transcribing' :
    media.connecting ? 'Connecting microphone' : phase === 'thinking' || phase === 'starting' ? 'Thinking'
    : phase === 'paused' ? 'Paused' : phase === 'ending' ? 'Ending call'
    : phase === 'live' ? (media.mic ? 'Listening' : 'In session') : 'Ready to talk';

  useEffect(() => {
    if (view !== 'studio' || phase !== 'ready') return;
    function warm() {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/warm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }).catch(() => {});
    }
    const timer = setTimeout(warm, 250);
    document.addEventListener('visibilitychange', warm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', warm);
    };
  }, [view, phase]);
  useEffect(() => { refreshReview(); }, []);
  useEffect(() => () => currentTurn.current?.controller.abort(), []);
  useEffect(() => { api().then(setHistory).catch(error => setNotice(error.message)); }, []);
  useEffect(() => {
    if (!['live', 'thinking'].includes(phase)) return;
    const timer = setInterval(() => setSeconds(currentSeconds()), 250);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (captionRef.current) captionRef.current.scrollTop = captionRef.current.scrollHeight;
  }, [messages.length, tab]);

  function currentSeconds() {
    return Math.floor((elapsed.current + (activeSince.current === null ? 0 : Date.now() - activeSince.current)) / 1000);
  }

  function stopClock() {
    if (activeSince.current !== null) elapsed.current += Date.now() - activeSince.current;
    activeSince.current = null;
    setSeconds(currentSeconds());
  }

  async function interrupt() {
    media.silence();
    const turn = currentTurn.current;
    if (!turn || !canInterrupt || turn.interrupted) return;
    turn.interrupted = true;
    setCanInterrupt(false);
    try {
      await api(`/${turn.id}/interrupt`, { turn: turn.key });
    } catch {
      if (currentTurn.current === turn) turn.controller.abort();
    }
  }

  async function runTurn(id, turn, speechEndedAt) {
    const startedAt = performance.now();
    const activeTurn = { id, key: turn.turn, controller: new AbortController(), interrupted: false };
    currentTurn.current = activeTurn;
    let text = '';
    let buffer = '';
    let firstAudio = true;
    let finished = false;
    const measure = (stage, start, end) => performance.measure(`speakmate:${stage}`, { start, end });
    if (speechEndedAt !== undefined) measure('speech-end-to-transcript', speechEndedAt, startedAt);
    function enqueue(sentence) {
      if (!sentence || activeTurn.interrupted) return;
      const trackStart = firstAudio;
      firstAudio = false;
      if (trackStart) measure('request-to-first-sentence', startedAt, performance.now());
      media.speak(sentence, { append: true, onStart: trackStart ? () => {
        const now = performance.now();
        measure('request-to-audio', startedAt, now);
        if (speechEndedAt !== undefined) measure('speech-end-to-audio', speechEndedAt, now);
      } : undefined });
    }
    setPhase('thinking');
    setPartial('');
    setPendingLearner(turn.text || '');
    media.suspendRecognition();
    media.silence();
    try {
      const response = await fetch(`/api/sessions/${id}/turn`, {
        method: 'POST', signal: activeTurn.controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify(turn)
      });
      if (!response.ok) throw new Error((await response.json()).error);
      for await (const event of readNdjson(response.body)) {
        if (event.type === 'ready') setCanInterrupt(true);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'delta' && !activeTurn.interrupted) {
          if (!text) measure('request-to-first-text', startedAt, performance.now());
          text += event.text;
          buffer += event.text;
          setPartial(text);
          let sentence;
          while ((sentence = takeSentence(buffer))) {
            enqueue(sentence.sentence);
            buffer = sentence.rest;
          }
        }
        if (event.type === 'done') {
          finished = true;
          measure('request-to-complete', startedAt, performance.now());
          setData(event.data);
          setRetry(null);
          const reply = event.data.messages.at(-1);
          if (!event.data.interrupted && reply?.role === 'assistant') enqueue(text ? buffer.trim() : reply.content);
        }
      }
      if (!finished) throw new Error('The response was cut off. Retry this turn to continue.');
    } catch (error) {
      media.silence();
      setRetry(turn);
      setNotice(error.name === 'AbortError' ? 'Connection interrupted. Retry this turn to continue.' : error.message);
      media.mute();
    } finally {
      currentTurn.current = null;
      setPartial('');
      setPendingLearner('');
      setCanInterrupt(false);
      setPhase('live');
    }
  }

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setNotice('');
    setPhase('starting');
    setSeconds(0);
    elapsed.current = 0;
    setRetry(null);
    setDraft('');
    try {
      const next = await api('', { character: selected, topic, mode });
      setData(next);
      activeSince.current = Date.now();
      await runTurn(next.session.id, OPENING);
    } catch (error) {
      setNotice(error.message);
      setPhase('ready');
    } finally {
      busy.current = false;
    }
  }

  async function submitTurn(turn, speechEndedAt) {
    if (busy.current || phase !== 'live' || !data) return;
    busy.current = true;
    setNotice('');
    try {
      await runTurn(data.session.id, turn, speechEndedAt);
    } finally {
      busy.current = false;
    }
  }

  function sendText(text, source, speechEndedAt) {
    if (!text.trim() || retry || busy.current || phase !== 'live') return;
    if (text.trim().length > 1200) {
      setNotice('Please keep your turn under 1,200 characters.');
      return;
    }
    setDraft('');
    submitTurn({ turn: crypto.randomUUID(), source, text: text.trim() }, speechEndedAt);
  }

  function pause() {
    if (phase === 'paused') {
      activeSince.current = Date.now();
      setPhase('live');
      return;
    }
    media.suspendRecognition();
    media.silence();
    stopClock();
    setPhase('paused');
  }

  async function assess(id) {
    if (assessments.current.has(id)) return;
    assessments.current.add(id);
    setAssessing(new Set(assessments.current));
    try {
      const result = await api(`/${id}/assessment`, {});
      setData(previous => previous?.session.id === id ? result : previous);
      setHistory(previous => previous.map(session => session.id === id ? { ...session, report: result.report } : session));
    } catch (error) {
      setData(previous => previous?.session.id === id ? { ...previous, reportError: error.message } : previous);
    } finally {
      assessments.current.delete(id);
      setAssessing(new Set(assessments.current));
    }
  }

  async function finish() {
    if (!data || busy.current) return;
    busy.current = true;
    stopClock();
    media.mute();
    media.silence();
    media.stopCamera();
    setPhase('ending');
    setNotice('');
    try {
      const id = data.session.id;
      const result = await api(`/${id}/finish`, { seconds: currentSeconds() });
      setData(result);
      setView('report');
      setPhase('done');
      api().then(setHistory).catch(error => setNotice(error.message));
      if (result.messages.some(message => message.role === 'user')) assess(id);
    } catch (error) {
      setNotice(error.message);
      setPhase('paused');
    } finally {
      busy.current = false;
    }
  }

  function queueReview(operation) {
    const next = reviewQueue.current.then(operation, operation);
    reviewQueue.current = next.catch(() => {});
    return next;
  }

  function refreshReview() {
    setReviewLoading(true);
    setReviewError('');
    return queueReview(async () => {
      try {
        setCards((await reviewApi()).cards);
      } catch (error) {
        setReviewError(error.message);
      } finally {
        setReviewLoading(false);
      }
    });
  }

  function saveCard(kind, index, source) {
    setNotice('');
    return queueReview(async () => {
      try {
        setCards((await reviewApi('save', { kind, index, ...source })).cards);
      } catch (error) {
        setNotice(error.message);
      }
    });
  }

  function isSaved(kind, card) {
    const clean = text => text.trim().toLowerCase().replace(/\s+/g, ' ');
    return cards.some(item => item.kind === kind && clean(item.front) === clean(card.front) &&
      (kind === 'vocabulary' || clean(item.speech) === clean(card.speech)));
  }

  function openReview() {
    media.stopCamera();
    media.silence();
    setNotice('');
    setView('review');
    refreshReview();
  }

  function openStudio() {
    media.silence();
    setPhase('ready');
    setData(null);
    setView('studio');
    setTab('setup');
    setSeconds(0);
    setNotice('');
  }

  async function openSession(session) {
    try {
      const result = await api(`/${session.id}`);
      if (!result.report && result.messages.some(message => message.role === 'user')) result.reportError = 'Assessment is available to retry.';
      setData(result);
      setView('report');
      setPhase('done');
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    }
  }

  const lesson = lessonFor(topics.find(item => item.id === topic));
  const today = history.filter(session => localDay(session.ended_at) === localDay(Date.now()));
  const todaySeconds = today.reduce((sum, session) => sum + session.active_seconds, 0);
  const challengeClock = mode === 'challenge' && active ? CLOCK(Math.max(0, 120 - seconds)) : null;

  return <div className="app">
    <aside className="rail">
      <div className="brand"><span className="brand-mark"><Icon name="wave" size={24} /></span><div>SpeakMate<span className="brand-ai"> AI</span><small>ENGLISH STUDIO</small></div></div>
      <nav aria-label="Workspace">
        <button className={view === 'studio' ? 'nav-current' : ''} disabled={view !== 'studio' && waiting} onClick={() => view !== 'studio' && openStudio()}><Icon name="studio" />Studio</button>
        <button className={view === 'history' ? 'nav-current' : ''} disabled={active} onClick={() => { media.stopCamera(); media.silence(); setView('history'); setNotice(''); }}><Icon name="history" />History</button>
        <button className={view === 'review' ? 'nav-current' : ''} disabled={active} onClick={openReview}><Icon name="book" />Review</button>
      </nav>
      <div className="rail-bottom account-menu">
        <span title={user.email}>{user.email}</span>
        <button type="button" disabled={active || signingOut} onClick={() => logout().catch(error => setNotice(error.message))}>Sign out</button>
      </div>
    </aside>
    <main>
      <header className="header"><div><p className="eyebrow"><span className="accent-dot" /> ENGLISH PRACTICE</p>
        <h1>{view === 'history' ? 'Practice history' : view === 'report' ? 'Your feedback' : view === 'review' ? 'Review notebook' : 'Speaking studio'}</h1>
        <p className="intro">{view === 'studio' ? 'Real conversations. More confident English.' : view === 'review' ? 'Revisit useful phrases and practise your corrections.' : 'Review your conversations and see how your practice adds up.'}</p></div>
        <span className="level">CEFR <strong>B2</strong></span>
      </header>
      {notice && <div className="notice" role="status">{notice}
        {retry && view === 'studio' && <button disabled={phase !== 'live'} onClick={() => submitTurn(retry)}>Retry turn</button>}</div>}
      {view === 'report' && data && <Report data={data} character={characters.find(item => item.id === data.session.character_id)} retry={() => assess(data.session.id)} busy={assessing.has(data.session.id)} back={openStudio}
        onSpeak={text => media.speak(text, { accent: characters.find(item => item.id === data.session.character_id).locale })}
        saveCard={(kind, index) => saveCard(kind, index, { sessionId: data.session.id })} isSaved={isSaved} />}
      {view === 'review' && <Review cards={cards} loading={reviewLoading} error={reviewError} onRefresh={refreshReview}
        onChange={setCards} onSpeak={(text, accent) => media.speak(text, { accent })} />}
      {view === 'history' && <div className="panel history">
        <div className="stats"><article><small>Practice time</small><strong>{Math.floor(history.reduce((sum, session) => sum + session.active_seconds, 0) / 60)} min</strong></article>
          <article><small>Completed sessions</small><strong>{history.length}</strong></article>
          <article><small>Microphone turns</small><strong>{history.reduce((sum, session) => sum + session.voice_turns, 0)}</strong></article></div>
        <h2>Recent sessions</h2>
        {history.length ? <ul>{history.map(session => <li key={session.id}><button onClick={() => openSession(session)}>
          <span>{topics.find(item => item.id === session.topic_id)?.title}<small>{new Date(session.ended_at).toLocaleString()} · {modes[session.mode]}</small></span>
          <strong>{CLOCK(session.active_seconds)}</strong></button></li>)}</ul> : <p className="muted">Complete a conversation to see it here.</p>}
      </div>}
      {view === 'studio' && <div className="workspace">
        <section className="call" aria-label="Conversation">
          <div className="stage">
            <Avatar character={character} speaking={media.speaking} speechMotion={media.speechMotion} />
            <div className="stage-top"><span className="status"><i />{status}</span><span className="time"><Icon name="clock" size={14} /> {challengeClock ?? CLOCK(seconds)}</span></div>
            <div className={`self-view ${media.camera ? 'camera-on' : ''}`}>
              <video ref={media.video} autoPlay muted playsInline aria-label="Your local camera preview" />
              {!media.camera && <><Icon name="camera" size={21} /><span>Camera off</span></>}
              {media.camera && <span className="self-label">You</span>}
            </div>
            <div className="stage-bottom"><div className="companion-name"><span>{character.name}</span><small>AI speaking partner</small></div>
              {captions && (partial || pendingLearner || lastAssistant || lastLearner) && <div className="caption" aria-live="polite">
                {(pendingLearner || lastLearner) && <p><b>You</b> {pendingLearner || lastLearner.content}</p>}
                {(partial || (!pendingLearner && lastAssistant)) && <p><b>{character.name}</b> {partial || lastAssistant.content}</p>}
              </div>}
            </div>
          </div>
          <div className="controls">
            <div className="control-group">
              <Control icon="mic" disabled={!active || waiting || phase === 'paused' || !!retry} active={media.mic} aria-pressed={media.mic || media.connecting} onClick={() => { setNotice(''); media.toggleMic(); }}>Mic</Control>
              <Control icon="camera" disabled={phase === 'ending'} active={media.camera} aria-pressed={media.camera} onClick={media.toggleCamera}>Camera</Control>
              <Control icon="cc" active={captions} aria-pressed={captions} onClick={() => setCaptions(!captions)}>Captions</Control>
              {active && <Control icon={phase === 'paused' ? 'play' : 'pause'} disabled={waiting} onClick={pause}>{phase === 'paused' ? 'Resume' : 'Pause'}</Control>}
            </div>
            {active ? <button className="end" disabled={waiting} onClick={finish}><Icon name="phone" />End call</button> :
              <button className="primary start" onClick={start}><Icon name="studio" />Start conversation</button>}
          </div>
          {active && <div className="chat-controls">
            <form onSubmit={event => { event.preventDefault(); sendText(draft, 'typed'); }}>
              <input aria-label="Type an English reply" value={draft} maxLength={1200} onChange={event => setDraft(event.target.value)} placeholder="Type an English reply…" />
              <button disabled={phase !== 'live' || !!retry || !draft.trim()}>Send</button>
            </form>
            {(canInterrupt || media.speaking) ? <button onClick={interrupt}>Interrupt</button> :
              media.hearing ? <button onClick={media.finishSpeaking}>Done speaking</button> :
              <button disabled={phase !== 'live' || !lastAssistant || !!retry} onClick={() => media.speak(lastAssistant.content)}><Icon name="volume" size={16} /> Replay</button>}
          </div>}
          {media.mic && !media.speaking && phase === 'live' && <div className="mic-input">
            <span>Mic input</span><meter aria-label="Microphone input level" min="0" max="1" value={media.level} />
          </div>}
          <p className="privacy"><Icon name="lock" size={14} /> Camera and speech recognition run on this device. Audio is discarded after transcription.</p>
        </section>
        <aside className="panel setup">
          <div className="tabs" aria-label="Session panel">
            <button className={tab === 'setup' ? 'tab-current' : ''} onClick={() => setTab('setup')}><Icon name="book" size={17} /> Setup</button>
            <button className={tab === 'transcript' ? 'tab-current' : ''} onClick={() => setTab('transcript')}><Icon name="chat" size={17} /> Transcript</button>
          </div>
          {tab === 'setup' ? <div className="setup-body">
            <h2>Speaking partner</h2>
            <div className="partner-list">{characters.map(item => <button key={item.id} disabled={active} title={item.name} aria-label={item.name} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); media.setVoiceName(''); }}>
              <Avatar miniature character={item} /><span>{item.name}</span>
            </button>)}</div>
            <div className="partner-detail"><strong>{character.name}</strong><span>{({ 'en-GB': 'British', 'en-US': 'American', 'en-AU': 'Australian' })[character.locale]} English · {character.style}</span></div>
            <label>Conversation topic<select disabled={active} value={topic} onChange={event => setTopic(event.target.value)}>
              {groups.map(group => <optgroup key={group} label={group}>{topics.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>)}
            </select></label>
            <label>Practice mode<select disabled={active} value={mode} onChange={event => setMode(event.target.value)}>
              {Object.entries(modes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <div className="voice-fields">
              <label>Voice<select value={media.voiceName} onChange={event => media.setVoiceName(event.target.value)}><option value="">Accent default</option>
                {media.voices.filter(voice => voice.lang.startsWith('en')).map(voice => <option key={voice.voiceURI} value={voice.name}>{voice.name}</option>)}
              </select></label>
              <label>Speed<select value={rate} onChange={event => setRate(event.target.value)}><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1">1×</option><option value="1.15">1.15×</option></select></label>
            </div>
            <details className="lesson"><summary>Topic guide</summary><p>{lesson.goal}</p>
              <h3>Conversation prompts</h3><ol>{lesson.questions.map(question => <li key={question}>{question}</li>)}</ol>
              <h3>Vocabulary</h3><ul>{lesson.vocabulary.map((item, index) => {
                const card = vocabularyCard(item);
                return <li key={item}>{item}{!active && <PracticeActions text={card.speech}
                  onSpeak={text => media.speak(text)} saved={isSaved('vocabulary', card)}
                  onSave={() => saveCard('vocabulary', index, { topicId: topic, characterId: selected })} />}</li>;
              })}</ul>
              {[
                ['Useful expressions', lesson.collocations],
                ['Follow-up questions', lesson.followUps], ['Opinion starters', lesson.frames],
                ['Practice criteria', lesson.criteria]
              ].map(([heading, items]) => <div key={heading}><h3>{heading}</h3><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></div>)}
              <h3>Scenario</h3><p>{lesson.scenario}</p><h3>Debate motion</h3><p>{lesson.debate}</p>
            </details>
          </div> : <div className="transcript-pane" ref={captionRef}><Transcript messages={messages} character={character} /></div>}
          <div className="today"><span className="today-icon"><Icon name="clock" size={19} /></span><div><strong>Today’s practice</strong><small>{Math.floor(todaySeconds / 60)} of 15 min</small></div>
            <progress value={Math.min(todaySeconds, 900)} max="900" aria-label="Daily practice goal" /></div>
        </aside>
      </div>}
    </main>
  </div>;
}
