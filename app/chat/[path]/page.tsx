'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ChatPanel from '@/components/ChatPanel';

export default function PublicChat() {
  const { path } = useParams<{ path: string }>();
  const [def, setDef] = useState<{ title: string; initialMessage: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/chat/${path}`).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setDef(d))).catch((e) => setErr(e.message));
  }, [path]);

  if (err) return <main className="formpage"><p className="err-text">{err}</p></main>;
  if (!def) return <main className="formpage"><p className="mute">Loading…</p></main>;
  return (
    <main className="chatpage">
      <ChatPanel title={def.title} welcome={def.initialMessage} endpoint={`/api/chat/${path}`} />
    </main>
  );
}
