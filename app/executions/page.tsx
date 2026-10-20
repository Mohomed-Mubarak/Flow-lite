'use client';
import { useEffect, useState } from 'react';

export default function Executions() {
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/executions').then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setList(d); else { setList([]); setErr(d.error || 'Could not load executions'); } });
  }, []);

  return (
    <main className="page">
      <div className="bar"><div><h1>Executions</h1><p className="sub" style={{ margin: 0 }}>The last 30 runs.</p></div></div>
      {err && <p className="err-text"><b>Error:</b> {err}</p>}
      {list === null && <p className="mute">Loading…</p>}
      {list && !list.length && !err && <div className="list"><div className="empty">No runs yet. Run a workflow from the editor.</div></div>}
      {!!list?.length && (
        <div className="list">
          {list.map((x) => (
            <div key={x.id}>
              <div className="row click" onClick={() => setOpen(open === x.id ? null : x.id)}>
                <span className={`badge ${x.status}`}>{x.status}</span>
                <div className="grow"><b>{x.workflow_name}</b><div className="mute">{x.mode} · {new Date(x.started_at).toLocaleString()}</div></div>
                {x.error && <span className="err-text mute">{String(x.error).slice(0, 70)}</span>}
              </div>
              {open === x.id && <div style={{ padding: '0 16px 14px' }}><pre>{JSON.stringify(x.data?.results ?? {}, null, 2)}</pre></div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
