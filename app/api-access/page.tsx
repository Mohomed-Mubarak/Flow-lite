'use client';
import { useEffect, useState } from 'react';

type Key = { id: string; name: string; scope: 'read' | 'run' | 'full'; prefix: string; created_at: string; last_used_at: string | null; expires_at: string | null };
const SCOPE_TEXT: Record<string, string> = {
  read: 'Read: list workflows and runs',
  run: 'Run: read + start workflows',
  full: 'Full: also create, edit, activate, delete',
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : 'never');

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}>
      {done ? 'Copied' : label}
    </button>
  );
}

export default function ApiAccess() {
  const [origin, setOrigin] = useState('https://your-flowlite.example.com');
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'run' | 'full'>('run');
  const [days, setDays] = useState('0');
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'n8n-mcp' | 'n8n-http' | 'claude' | 'curl'>('n8n-mcp');

  const load = () => fetch('/api/keys').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setKeys(d); else { setKeys([]); setErr(d.error || 'Could not load keys. Run supabase/schema.sql again to add the api_keys table.'); } });
  useEffect(() => { setOrigin(window.location.origin); load(); }, []);

  async function create() {
    setErr('');
    const r = await fetch('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, scope, expiresInDays: Number(days) || undefined }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error || 'Could not create the key');
    setFresh({ name: j.name, key: j.key }); setName(''); load();
  }
  async function revoke(k: Key) {
    if (!confirm(`Delete the key "${k.name}"? Anything using it stops working at once.`)) return;
    await fetch(`/api/keys/${k.id}`, { method: 'DELETE' });
    load();
  }

  const mcp = `${origin}/api/mcp`;
  const KEY = fresh?.key || 'fl_YOUR_KEY';
  const snippets: Record<typeof tab, { title: string; steps: string; code: string }> = {
    'n8n-mcp': {
      title: 'n8n: let an AI Agent use Flowlite',
      steps: 'Add an "MCP Client Tool" node to your n8n AI Agent. Set Endpoint to the MCP URL, Server Transport to HTTP Streamable, Authentication to Bearer, and paste the key into the credential. All Flowlite tools then show up for the agent.',
      code: `Endpoint:   ${mcp}\nTransport:  HTTP Streamable\nAuth:       Bearer\nToken:      ${KEY}`,
    },
    'n8n-http': {
      title: 'n8n: run a Flowlite workflow from a node',
      steps: 'Add an "HTTP Request" node. Method POST, the URL below (replace <workflow-id>), Authentication "Generic Credential Type" with a Header Auth credential, and a JSON body. The reply has the final output in "output".',
      code: `URL:     ${origin}/api/v1/workflows/<workflow-id>/run\nMethod:  POST\nHeader:  Authorization: Bearer ${KEY}\nBody:    { "input": { "name": "Ada", "email": "ada@example.com" } }\n\nNeed more than 60 seconds? Add "wait": false, then call\nGET ${origin}/api/v1/executions/<executionId> until status is not "running".`,
    },
    claude: {
      title: 'Claude Desktop, Claude Code, Cursor and other MCP clients',
      steps: 'Claude Code can connect directly. Claude Desktop and other stdio-only clients use the mcp-remote bridge. Clients that accept a remote URL with custom headers can use the MCP URL and the Authorization header directly.',
      code: `# Claude Code\nclaude mcp add --transport http flowlite ${mcp} --header "Authorization: Bearer ${KEY}"\n\n# Claude Desktop (claude_desktop_config.json)\n{\n  "mcpServers": {\n    "flowlite": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "${mcp}", "--header", "Authorization:\${AUTH}"],\n      "env": { "AUTH": "Bearer ${KEY}" }\n    }\n  }\n}`,
    },
    curl: {
      title: 'curl',
      steps: 'Any HTTP client works. The OpenAPI file describes every endpoint, and n8n, Postman and most agent frameworks can import it.',
      code: `curl ${origin}/api/v1/workflows \\\n  -H "Authorization: Bearer ${KEY}"\n\ncurl -X POST ${origin}/api/v1/workflows/<workflow-id>/run \\\n  -H "Authorization: Bearer ${KEY}" -H "content-type: application/json" \\\n  -d '{"input":{"message":"hello"}}'\n\nOpenAPI: ${origin}/api/v1/openapi.json`,
    },
  };
  const s = snippets[tab];
  const local = /localhost|127\.0\.0\.1/.test(origin);

  return (
    <main className="page">
      <div className="bar"><div><h1>API &amp; MCP</h1><p className="sub" style={{ margin: 0 }}>Let n8n, AI agents and scripts use Flowlite.</p></div></div>

      <div className="card">
        <b>Endpoints</b>
        {[['MCP server (Streamable HTTP)', mcp], ['REST API', `${origin}/api/v1`], ['OpenAPI spec', `${origin}/api/v1/openapi.json`]].map(([l, u]) => (
          <div className="row" key={l} style={{ padding: '10px 0', borderBottom: 0 }}>
            <div className="grow"><div className="mute">{l}</div><div className="mono">{u}</div></div>
            <Copy text={u} />
          </div>
        ))}
        {local && <div className="note">You are on localhost. n8n in the cloud or in Docker cannot reach it. Use a tunnel (ngrok or cloudflared) or deploy first, then open this page from the public address so the snippets show the right URL.</div>}
      </div>

      <div className="card">
        <b>Create an API key</b>
        <label className="l">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="n8n" />
        <label className="l">Access</label>
        <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
          {Object.entries(SCOPE_TEXT).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <label className="l">Expires</label>
        <select value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="0">Never</option><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option>
        </select>
        {scope === 'full' && <div className="note">A Full key can edit and delete workflows and switch them on. Workflows can send email and call APIs with your saved credentials. Give Full access only to agents you trust.</div>}
        {err && <p className="err-text">{err}</p>}
        <p style={{ marginBottom: 0 }}><button className="btn pri" onClick={create} disabled={!name.trim()}>Create key</button></p>
        {fresh && (
          <div className="note" style={{ borderColor: 'var(--ok)' }}>
            <b>Copy it now. It is shown only once.</b>
            <div className="row" style={{ padding: '8px 0 0', borderBottom: 0 }}>
              <div className="grow mono" style={{ wordBreak: 'break-all' }}>{fresh.key}</div>
              <Copy text={fresh.key} />
              <button className="btn sm" onClick={() => setFresh(null)}>Hide</button>
            </div>
          </div>
        )}
      </div>

      <div className="list" style={{ marginBottom: 20 }}>
        {keys === null && <div className="empty">Loading…</div>}
        {keys?.map((k) => (
          <div className="row" key={k.id}>
            <div className="grow">
              <b>{k.name}</b> <span className="mono mute">{k.prefix}…</span>
              <div className="mute">Created {when(k.created_at)} · last used {when(k.last_used_at)}{k.expires_at ? ` · expires ${when(k.expires_at)}` : ''}</div>
            </div>
            <span className={`badge ${k.scope === 'full' ? 'error' : k.scope === 'run' ? 'free' : ''}`}>{k.scope}</span>
            <button className="btn sm del" onClick={() => revoke(k)}>Delete</button>
          </div>
        ))}
        {keys && !keys.length && <div className="empty">No keys yet.</div>}
      </div>

      <div className="card">
        <b>Connect</b>
        <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
          {([['n8n-mcp', 'n8n · MCP'], ['n8n-http', 'n8n · HTTP'], ['claude', 'Claude / Cursor'], ['curl', 'curl']] as const).map(([t, l]) => (
            <button key={t} className={`btn sm ${tab === t ? 'pri' : ''}`} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>
        <div style={{ fontWeight: 600 }}>{s.title}</div>
        <p className="mute" style={{ margin: '4px 0' }}>{s.steps}</p>
        <pre>{s.code}</pre>
        <p style={{ marginBottom: 0 }}><Copy text={s.code} label="Copy snippet" /></p>
      </div>
    </main>
  );
}
