'use client';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'bot' | 'error'; text: string };
type Props = {
  title?: string;
  /** First bot message. */
  welcome?: string;
  /** POST target. Receives { message, sessionId, ...extra() }. */
  endpoint: string;
  extra?: () => Record<string, unknown>;
  /** Called with every JSON reply (the editor uses it to color nodes). */
  onReply?: (json: any) => void;
  onClose?: () => void;
};

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export default function ChatPanel({ title = 'Chat', welcome, endpoint, extra, onReply, onClose }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(welcome ? [{ role: 'bot', text: welcome }] : []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState('');
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => { setSid(newId()); }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, busy]);

  async function send() {
    const message = text.trim();
    if (!message || busy || !sid) return;
    setText('');
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(extra?.() ?? {}), message, sessionId: sid }),
      });
      const j = await r.json().catch(() => ({}));
      onReply?.(j);
      if (!r.ok || j.error) setMsgs((m) => [...m, { role: 'error', text: j.error || 'Request failed' }]);
      else setMsgs((m) => [...m, { role: 'bot', text: j.reply || '(empty reply)' }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'error', text: e.message || 'Network error' }]);
    }
    setBusy(false);
  }

  function reset() {
    setMsgs(welcome ? [{ role: 'bot', text: welcome }] : []);
    setSid(newId());
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <b>{title}</b>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={reset} disabled={busy}>New chat</button>
        {onClose && <button className="btn sm" onClick={onClose} aria-label="Close chat">Close</button>}
      </div>
      <div className="chat-log" ref={log} aria-live="polite">
        {!msgs.length && <p className="mute" style={{ textAlign: 'center' }}>Send a message to start the workflow.</p>}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
        {busy && <div className="msg bot mute">Thinking…</div>}
      </div>
      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          rows={1} value={text} placeholder="Type a message" aria-label="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="btn pri" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
