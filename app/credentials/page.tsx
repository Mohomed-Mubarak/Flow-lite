'use client';
import { useEffect, useState } from 'react';
import { CREDENTIAL_TYPES } from '@/lib/nodes/catalog';

export default function Credentials() {
  const [list, setList] = useState<any[]>([]);
  const [type, setType] = useState('groq');
  const [name, setName] = useState('');
  const [data, setData] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const def = CREDENTIAL_TYPES.find((t) => t.type === type)!;
  const load = () => fetch('/api/credentials').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setList(d); else setErr(d.error || 'Could not load credentials'); });
  useEffect(() => { load(); }, []);

  async function save() {
    setErr('');
    const r = await fetch('/api/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name || def.label, type, data }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || 'Could not save');
    setName(''); setData({}); load();
  }
  async function remove(id: string) {
    if (!confirm('Delete this credential? Nodes using it will fail.')) return;
    await fetch(`/api/credentials/${id}`, { method: 'DELETE' });
    load();
  }
  const ai = CREDENTIAL_TYPES.filter((t) => t.ai);
  const other = CREDENTIAL_TYPES.filter((t) => !t.ai);

  return (
    <main className="page">
      <div className="bar"><div><h1>Credentials</h1><p className="sub" style={{ margin: 0 }}>Keys are encrypted and never shown again.</p></div></div>
      <div className="card">
        <label className="l" style={{ marginTop: 0 }}>Type</label>
        <select value={type} onChange={(e) => { setType(e.target.value); setData({}); }}>
          <optgroup label="AI models">{ai.map((t) => <option key={t.type} value={t.type}>{t.label}{t.free ? ' (free tier)' : ''}</option>)}</optgroup>
          <optgroup label="Apps and auth">{other.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</optgroup>
        </select>
        {(def.keyUrl || def.note || def.free) && (
          <div className="note">
            {def.free && <span className="badge free" style={{ marginRight: 8 }}>Free tier</span>}
            {def.keyUrl && <a href={def.keyUrl} target="_blank" rel="noreferrer">Get an API key</a>}
            {def.note && <div className="mute" style={{ marginTop: 4 }}>{def.note}</div>}
          </div>
        )}
        <label className="l">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={def.label} />
        {def.fields.map((f) => (
          <div key={f.name}>
            <label className="l">{f.label}{f.optional ? ' (optional)' : ''}</label>
            <input type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={data[f.name] || ''} onChange={(e) => setData({ ...data, [f.name]: e.target.value })} />
          </div>
        ))}
        {err && <p className="err-text">{err}</p>}
        <p style={{ marginBottom: 0 }}><button className="btn pri" onClick={save}>Save credential</button></p>
      </div>
      <div className="list">
        {list.map((c) => {
          const d = CREDENTIAL_TYPES.find((t) => t.type === c.type);
          return (
            <div className="row" key={c.id}>
              <div className="grow"><b>{c.name}</b><div className="mute">{d?.label || c.type}</div></div>
              {d?.free && <span className="badge free">Free tier</span>}
              <button className="btn sm del" onClick={() => remove(c.id)}>Delete</button>
            </div>
          );
        })}
        {!list.length && <div className="empty">No credentials saved.</div>}
      </div>
    </main>
  );
}
