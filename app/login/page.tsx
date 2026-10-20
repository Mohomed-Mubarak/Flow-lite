'use client';
import { useState } from 'react';

/** Only allow redirects to a path on this site. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/');

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Could not sign in'); setBusy(false); return; }
      window.location.href = safeNext(new URLSearchParams(window.location.search).get('next'));
    } catch {
      setErr('Could not reach the server'); setBusy(false);
    }
  }

  return (
    <main className="loginpage">
      <form className="card login" onSubmit={submit}>
        <div className="brand login-brand"><i /> Flowlite</div>
        <h1>Sign in</h1>
        <p className="mute" style={{ marginTop: 0 }}>Use the ADMIN_USER and ADMIN_PASSWORD from your .env file.</p>
        <label className="l" htmlFor="u">Username</label>
        <input id="u" type="text" autoComplete="username" autoFocus suppressHydrationWarning value={username} onChange={(e) => setUsername(e.target.value)} />
        <label className="l" htmlFor="p">Password</label>
        <input id="p" type="password" autoComplete="current-password" suppressHydrationWarning value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="err-text" role="alert" style={{ marginBottom: 0 }}>{err}</p>}
        <button className="btn pri login-btn" type="submit" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
