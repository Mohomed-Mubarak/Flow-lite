'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const router = useRouter();
  const load = () =>
    fetch('/api/workflows').then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) { setList(d); setErr(''); } else { setList([]); setErr(d.error || 'Could not load workflows'); } })
      .catch((e) => { setList([]); setErr(e.message); });
  useEffect(() => { load(); }, []);

  async function create() {
    setErr('');
    try {
      const r = await fetch('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const w = await r.json();
      if (w.id) router.push(`/workflows/${w.id}`); else setErr(w.error || 'Could not create workflow');
    } catch (e: any) { setErr(e.message); }
  }
  async function toggle(w: any) {
    await fetch(`/api/workflows/${w.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !w.active }) });
    load();
  }
  async function remove(w: any) {
    if (!confirm(`Delete "${w.name}"?`)) return;
    await fetch(`/api/workflows/${w.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <main className="page">
      <div className="bar">
        <div><h1>Workflows</h1><p className="sub" style={{ margin: 0 }}>Build, run and schedule automations.</p></div>
        <button className="btn pri" onClick={create}>New workflow</button>
      </div>
      {err && <p className="err-text"><b>Error:</b> {err}</p>}
      {list === null && <p className="mute">Loading…</p>}
      {list && list.length === 0 && !err && <div className="list"><div className="empty">No workflows yet. Create one to get started.</div></div>}
      {!!list?.length && (
        <div className="list">
          {list.map((w) => (
            <div className="row" key={w.id}>
              <Link href={`/workflows/${w.id}`} className="grow"><b>{w.name}</b>
                <div className="mute">Updated {new Date(w.updated_at).toLocaleString()}</div></Link>
              <span className={`badge ${w.active ? 'success' : ''}`}>{w.active ? 'Active' : 'Inactive'}</span>
              <button className="btn sm" onClick={() => toggle(w)}>{w.active ? 'Deactivate' : 'Activate'}</button>
              <button className="btn sm del" onClick={() => remove(w)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
