'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

export async function reviewApi(action, body) {
  const response = await fetch(action ? `/api/review/${action}` : '/api/review', body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export function PracticeActions({ text, onSpeak, onSave, saved }) {
  return <div className="practice-actions">
    <button type="button" onClick={() => onSpeak(text)}><Icon name="volume" size={16} /> Listen</button>
    {onSave && <button type="button" disabled={saved} onClick={onSave}>{saved ? 'Saved' : 'Save to review'}</button>}
  </div>;
}

export default function Review({ cards, loading, error, onRefresh, onChange, onSpeak }) {
  const [revealed, setRevealed] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const due = cards.filter(card => card.due_at <= now);
  const card = due[0];
  const showing = !!card && card.id === revealed;
  const formatDate = timestamp => new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(timestamp);

  async function change(action, body) {
    if (busy) return;
    setBusy(true);
    setFeedback('');
    try {
      const result = await reviewApi(action, body);
      onChange(result.cards);
      setNow(result.now);
      setRevealed(null);
      if (action === 'rate') setFeedback(body.rating === 'again' ? 'This card will be due again in 10 minutes.' : 'Review saved.');
    } catch (err) {
      setFeedback(err.message);
      if (action === 'rate') onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return <div className="review-layout">
    <section className="panel review-card">
      <div className="section-title"><h2>Review session</h2><span className="muted">{due.length} due · {cards.length} saved</span></div>
      {loading ? <p role="status">Loading saved cards…</p> : error ? <div className="notice" role="status">{error}
        <button type="button" onClick={onRefresh}>Retry</button></div> : card ? <>
        <p className="muted">{card.kind === 'correction' ? 'Say this sentence more naturally.' : 'Recall the meaning of this expression.'}</p>
        <blockquote>{card.front}</blockquote>
        {showing ? <div className="review-answer">
          {card.kind === 'correction' && <strong>{card.speech}</strong>}
          {card.back && <p>{card.back}</p>}
          <PracticeActions text={card.speech} onSpeak={text => onSpeak(text, card.locale)} />
          <div className="practice-actions">
            <button type="button" disabled={busy} onClick={() => change('rate', { id: card.id, rating: 'again', dueAt: card.due_at })}>Again</button>
            <button type="button" className="primary" disabled={busy} onClick={() => change('rate', { id: card.id, rating: 'known', dueAt: card.due_at })}>Got it</button>
          </div>
        </div> : <button type="button" className="primary" onClick={() => setRevealed(card.id)}>Show answer</button>}
      </> : <p>{cards.length
        ? `You’re caught up. Next review ${formatDate(cards[0].due_at)}.`
        : 'Save a phrase from a topic guide or save a correction from your session feedback.'}</p>}
      {feedback && <p className="muted" role="status">{feedback}</p>}
    </section>
    {!!cards.length && <section className="panel review-card">
      <h2>Saved cards</h2>
      <ul className="saved-cards">{cards.map(item => <li key={item.id}>
        <div><strong>{item.kind === 'correction' ? item.speech : item.front}</strong>
          <small className="muted">{item.due_at <= now ? 'Due now' : formatDate(item.due_at)}</small></div>
        <button type="button" disabled={busy} onClick={() => change('remove', { id: item.id })} aria-label={`Remove ${item.front}`}>Remove</button>
      </li>)}</ul>
    </section>}
  </div>;
}
