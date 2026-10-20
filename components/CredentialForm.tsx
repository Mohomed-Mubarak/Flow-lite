'use client';
import { useEffect, useState } from 'react';
import { CREDENTIAL_TYPES } from '@/lib/nodes/catalog';

export type NewCredential = { id: string; name: string; type: string };

/** Pop-up to create a credential without leaving the node screen. `types` limits it to what the node accepts. */
export default function CredentialForm({ types, onClose, onCreated }: { types: string[]; onClose: () => void; onCreated: (c: NewCredential) => void }) {
  const allowed = CREDENTIAL_TYPES.filter((t) => types.includes(t.type));
  const [type, setType] = useState(allowed[0]?.type ?? '');
  const [name, setName] = useState('');
  const [data, setData] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const def = allowed.find((t) => t.type === type);

  // Escape closes only this pop-up, not the node screen behind it.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);

  if (!def) return null;

  async function save() {
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() || def!.label, type, data }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error || 'Could not save');
      onCreated(j);
    } finally { setBusy(false); }
  }

  return (
    <div className="nd-back" style={{ zIndex: 120 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" role="dialog" aria-modal="true" aria-label="New credential" style={{ width: 'min(460px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <b style={{ fontSize: 16 }}>New credential</b>
          <button className="nd-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {allowed.length > 1 && (
          <>
            <label className="l">Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setData({}); }}>
              {allowed.map((t) => <option key={t.type} value={t.type}>{t.label}{t.free ? ' (free tier)' : ''}</option>)}
            </select>
          </>
        )}
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
            <input type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={data[f.name] || ''}
              onChange={(e) => setData({ ...data, [f.name]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          </div>
        ))}
        {err && <p className="err-text">{err}</p>}
        <p style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 0 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save and use'}</button>
        </p>
      </div>
    </div>
  );
}
