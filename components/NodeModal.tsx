'use client';
import { useEffect, type ReactNode } from 'react';

export function Empty({ title, hint, action, onAction, busy }: { title: string; hint?: string; action?: string; onAction?: () => void; busy?: boolean }) {
  return (
    <div className="nd-empty">
      <b>{title}</b>
      {action && <button className="btn" onClick={onAction} disabled={busy}>{busy ? 'Running…' : action}</button>}
      {hint && <span>{hint}</span>}
    </div>
  );
}

type Props = {
  name: string; onName: (v: string) => void;
  typeLabel: string; group: string;
  onClose: () => void;
  onExecute: () => void; busy: boolean;
  tab: 'params' | 'settings'; onTab: (t: 'params' | 'settings') => void;
  parents: { id: string; name: string }[]; parentIdx: number; onParent: (i: number) => void;
  status?: string; ms?: number;
  input: ReactNode; output: ReactNode; params: ReactNode; settings: ReactNode;
};

/** n8n-style node screen: Input on the left, Parameters in the middle, Output on the right. */
export default function NodeModal(p: Props) {
  const { onClose } = p;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="nd-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nd" role="dialog" aria-modal="true" aria-label={p.name}>
        <header className="nd-head">
          <i className={`dot ${p.group}`} />
          <input className="nd-name" type="text" value={p.name} onChange={(e) => p.onName(e.target.value)} aria-label="Node name" />
          <span className="mute">{p.typeLabel}</span>
          <button className="nd-x" onClick={onClose} aria-label="Close node">×</button>
        </header>
        <div className="nd-grid">
          <section className="nd-col" aria-label="Input">
            {p.parents.length === 1 && <div className="nd-from">{p.parents[0].name}</div>}
            {p.parents.length > 1 && (
              <select className="nd-from" value={p.parentIdx} onChange={(e) => p.onParent(Number(e.target.value))} aria-label="Input from node">
                {p.parents.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}
              </select>
            )}
            {p.input}
          </section>

          <section className="nd-col nd-mid" aria-label="Parameters">
            <div className="nd-midtabs">
              <button className={p.tab === 'params' ? 'on' : ''} onClick={() => p.onTab('params')}>Parameters</button>
              <button className={p.tab === 'settings' ? 'on' : ''} onClick={() => p.onTab('settings')}>Settings</button>
              <button className="btn pri sm nd-exec" onClick={p.onExecute} disabled={p.busy}>{p.busy ? 'Running…' : 'Execute step'}</button>
            </div>
            <div className="nd-midbody">{p.tab === 'params' ? p.params : p.settings}</div>
          </section>

          <section className="nd-col" aria-label="Output">
            {p.status && (
              <div className="nd-status">
                <span className={`badge ${p.status}`}>{p.status}</span>
                {p.ms != null && <span className="mute">{p.ms} ms</span>}
              </div>
            )}
            {p.output}
          </section>
        </div>
      </div>
    </div>
  );
}
