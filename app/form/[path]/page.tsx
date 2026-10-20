'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function PublicForm() {
  const { path } = useParams<{ path: string }>();
  const [def, setDef] = useState<any>(null);
  const [err, setErr] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/form/${path}`).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setDef(d))).catch((e) => setErr(e.message));
  }, [path]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch(`/api/webhook/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: vals }) });
    setBusy(false);
    if (r.ok) setDone(true); else setErr((await r.json().catch(() => ({}))).error || 'Could not send the form');
  }

  if (err && !def) return <main className="formpage"><p className="err-text">{err}</p></main>;
  if (!def) return <main className="formpage"><p className="mute">Loading…</p></main>;
  if (done) return <main className="formpage"><div className="card"><h1>{def.thanks}</h1></div></main>;
  return (
    <main className="formpage">
      <form className="card" onSubmit={submit}>
        <h1>{def.title}</h1>
        {def.description && <p className="mute">{def.description}</p>}
        {def.fields.map((f: any) => (
          <div key={f.name}>
            <label className="l" htmlFor={f.name}>{f.label || f.name}{f.required ? ' *' : ''}</label>
            {f.type === 'textarea'
              ? <textarea id={f.name} rows={4} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
              : <input id={f.name} type={f.type || 'text'} required={!!f.required} value={vals[f.name] || ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />}
          </div>
        ))}
        {err && <p className="err-text">{err}</p>}
        <p><button className="btn pri" disabled={busy}>{busy ? 'Sending…' : def.button}</button></p>
      </form>
    </main>
  );
}
