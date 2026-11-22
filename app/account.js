'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

async function account(action, body) {
  const response = await fetch(`/api/auth/${action}`, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Account service is unavailable.');
  return result;
}

export default function Account({ renderStudio }) {
  const [user, setUser] = useState(undefined);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [cloudSpeech, setCloudSpeech] = useState(false);

  async function restore() {
    setUser(undefined);
    setNotice('');
    try {
      const me = await account('me');
      setInviteRequired(me.inviteRequired);
      setCloudSpeech(me.cloudSpeech);
      setUser(me.user);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => { restore(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = data.get('email');
    const password = data.get('password');
    if (mode === 'register' && password !== data.get('confirmation')) {
      setNotice('Passwords do not match.');
      return;
    }
    setNotice('');
    setBusy(true);
    try {
      const result = await account(mode, { email, password, ...(mode === 'register' && { invite: data.get('invite') }) });
      setUser(result.user);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await account('logout', {});
      setUser(null);
      setMode('login');
      setNotice('');
    } finally {
      setBusy(false);
    }
  }

  if (user) return renderStudio(user, logout, busy, cloudSpeech);
  const registering = mode === 'register';
  return <main className="account-page">
    <section className="account-card panel">
      <div className="brand"><span className="brand-mark"><Icon name="wave" size={24} /></span><div>SpeakMate<span className="brand-ai"> AI</span></div></div>
      <h1>{registering ? 'Create an account' : 'Sign in'}</h1>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {user === undefined ? (notice ? <button className="primary" onClick={restore}>Retry</button> :
        <p className="muted" role="status">Checking your session…</p>) : <>
        <form key={mode} onSubmit={submit}>
          <label>Email<input type="email" name="email" autoComplete="username" required maxLength={254} /></label>
          <label>Password<input type="password" name="password" autoComplete={registering ? 'new-password' : 'current-password'}
            required minLength={8} maxLength={128} /></label>
          {registering && <label>Confirm password<input type="password" name="confirmation" autoComplete="new-password" required
            minLength={8} maxLength={128} /></label>}
          {registering && inviteRequired && <label>Invite code<input name="invite" required maxLength={256} autoComplete="off" /></label>}
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
        </form>
        <div className="account-switch"><span>{registering ? 'Already have an account?' : 'New to SpeakMate?'}</span>
          <button type="button" disabled={busy} onClick={() => { setMode(registering ? 'login' : 'register'); setNotice(''); }}>
            {registering ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </>}
    </section>
  </main>;
}
