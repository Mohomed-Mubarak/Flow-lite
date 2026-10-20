'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel, SelectionMode, addEdge,
  useNodesState, useEdgesState, useReactFlow, type Node, type Edge, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CREDENTIAL_TYPES, defaultParams, getDef, groupedNodes, type ParamDef, type SlotId } from '@/lib/nodes/catalog';
import { useTheme } from '@/lib/theme';
import { EditorCtx, decorate, isSlotEdge, nodeTypes, type EditorActions } from '@/components/FlowNode';
import ChatPanel from '@/components/ChatPanel';
import ExecutionsView from '@/components/ExecutionsView';
import OutputView from '@/components/OutputView';
import NodeModal, { Empty } from '@/components/NodeModal';
import CredentialForm from '@/components/CredentialForm';
import { preview as previewExpr, type Preview } from '@/lib/preview';
import { tidyLayout, type Pos } from '@/lib/layout';


function Field({ p, value, onChange, pv }: { p: ParamDef; value: any; onChange: (v: any) => void; pv?: Preview | null }) {
  const [over, setOver] = useState(false);
  const v = value ?? p.default ?? '';
  if (p.type === 'boolean') return <input type="checkbox" checked={v === true} onChange={(e) => onChange(e.target.checked)} />;
  if (p.type === 'select') return <select value={v} onChange={(e) => onChange(e.target.value)}>{p.options!.map((o) => <option key={o}>{o}</option>)}</select>;
  if (p.type === 'multiselect') {
    const on = new Set(String(v).split(',').map((x) => x.trim()).filter(Boolean));
    const toggle = (o: string) => { const n = new Set(on); if (n.has(o)) n.delete(o); else n.add(o); onChange(p.options!.filter((x) => n.has(x)).join(',')); };
    return <div className="ms">{p.options!.map((o) => <label key={o} className="ms-i"><input type="checkbox" checked={on.has(o)} onChange={() => toggle(o)} /> {p.labels?.[o] ?? o}</label>)}</div>;
  }
  if (p.type === 'number') return <input type="number" value={v} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  // Text fields accept dropped fields from the Input panel (the browser inserts the {{ expression }} where you drop it).
  const dnd = { onDragEnter: () => setOver(true), onDragLeave: () => setOver(false), onDrop: () => setOver(false) };
  const isExpr = typeof v === 'string' && v.includes('{{');
  const multi = p.type === 'text' || p.type === 'json' || p.type === 'code';
  return (
    <div className={`pf${isExpr ? ' isx' : ''}`}>
      {isExpr && <span className="fx">fx</span>}
      {multi
        ? <textarea className={`${p.type === 'text' ? '' : 'mono'}${over ? ' drop' : ''}`} rows={p.type === 'code' ? 9 : 4} value={v} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...dnd} />
        : <input type="text" className={over ? 'drop' : ''} value={v} placeholder={p.placeholder} list={p.model ? 'model-list' : undefined} onChange={(e) => onChange(e.target.value)} {...dnd} />}
      {pv && <div className={`pv${pv.ok ? '' : ' bad'}`}>{pv.ok ? <>Result: <b>{pv.text || '(empty)'}</b></> : pv.text}</div>}
    </div>
  );
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const theme = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'params' | 'settings'>('params');
  const [open, setOpen] = useState(false);
  const [pIdx, setPIdx] = useState(0);
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [creds, setCreds] = useState<any[]>([]);
  const [addCred, setAddCred] = useState(false);
  const [ready, setReady] = useState(false);
  const [auto, setAuto] = useState(true);
  const [saveState, setSaveState] = useState<{ s: 'idle' | 'saving' | 'saved' | 'error'; at?: string }>({ s: 'idle' });
  const [undoPos, setUndoPos] = useState<Pos | null>(null);
  // Drag on empty canvas draws a selection box (Select). Hand mode pans instead. Touch screens start in Hand mode.
  const [mode, setMode] = useState<'select' | 'pan'>('select');
  useEffect(() => { if (window.matchMedia?.('(pointer: coarse)').matches) setMode('pan'); }, []);
  const clip = useRef<{ nodes: Node[]; edges: Edge[]; bump: number } | null>(null);
  const selected = nodes.filter((n) => n.selected);
  const { fitView } = useReactFlow();
  const [results, setResults] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [live, setLive] = useState<{ models: string[]; free: string[]; err?: string } | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [view, setView] = useState<'editor' | 'executions'>('editor');
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/workflows/${id}`).then((r) => r.json()).then((w) => {
      if (w.error) return setMsg(w.error);
      setName(w.name); setActive(w.active);
      setNodes(w.nodes.map((n: any) => ({ id: n.id, type: 'flow', position: n.position, data: { type: n.type, name: n.name, params: n.params } })));
      setEdges(w.edges.map((e: any) => decorate({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })));
      setReady(true);
    });
    fetch('/api/credentials').then((r) => r.json()).then((d) => setCreds(Array.isArray(d) ? d : []));
  }, [id, setNodes, setEdges]);

  useEffect(() => { setLive(null); setPIdx(0); setAddCred(false); }, [sel]);
  useEffect(() => { try { if (localStorage.getItem('flowlite-autosave') === 'off') setAuto(false); } catch { /* storage blocked */ } }, []);
  const toggleAuto = (v: boolean) => { setAuto(v); try { localStorage.setItem('flowlite-autosave', v ? 'on' : 'off'); } catch { /* storage blocked */ } };

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es).map(decorate)), [setEdges]);

  // Sub-nodes only plug into the matching socket of an agent. Everything else uses the main flow.
  const isValidConnection = useCallback((c: Connection | Edge) => {
    const from = nodes.find((n) => n.id === c.source);
    const fromDef = from ? getDef((from.data as any).type) : undefined;
    if (!fromDef || c.source === c.target) return false;
    const slot = c.targetHandle as SlotId | null | undefined;
    if (fromDef.slot) return slot === fromDef.slot;
    return !slot;
  }, [nodes]);

  const graph = () => ({
    nodes: nodes.map((n) => ({ id: n.id, type: (n.data as any).type, name: (n.data as any).name, position: n.position, params: (n.data as any).params })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  });
  async function put(body: any) {
    const r = await fetch(`/api/workflows/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, telegram: Array.isArray(j.telegram) ? j.telegram : [] };
  }
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function tgAction(nodeId: string, action: 'register' | 'status' | 'remove') {
    setTgMsg({ ok: true, text: 'Working…' });
    await put({ name, ...graph() }); // the server reads the saved workflow
    const r = await fetch(`/api/workflows/${id}/telegram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId, action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setTgMsg({ ok: false, text: j.error || 'Telegram request failed' });
    if (action === 'status') {
      const hint = !j.lastError ? '' : /404/.test(j.lastError) && !active
        ? ' A 404 means the workflow was not Active when Telegram called. Turn Active on, then send a new message.'
        : ' Old errors stay here until a new message succeeds.';
      const bad = j.lastError ? ` Last error${j.lastErrorAt ? ` (${new Date(j.lastErrorAt).toLocaleTimeString()})` : ''}: ${j.lastError}.${hint}` : '';
      return setTgMsg({ ok: !j.lastError, text: j.url ? `Registered at ${j.url}. Waiting updates: ${j.pending}.${bad}` : 'No webhook is registered yet. Turn the workflow Active, or press Register.' });
    }
    setTgMsg({ ok: true, text: action === 'register' ? `Registered${j.bot ? ` for @${j.bot}` : ''}. ${active ? 'Send your bot a message.' : 'Now turn Active on so messages run the workflow, or press Listen for message to test.'}` : 'Webhook removed.' });
  }
  // Live test: wait for one real Telegram message and show it as this node's output.
  const [listenNode, setListenNode] = useState<string | null>(null);
  async function tgListen(nodeId: string) {
    setTgMsg({ ok: true, text: 'Starting…' });
    await put({ name, ...graph() });
    const r = await fetch(`/api/workflows/${id}/telegram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId, action: 'listen' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setTgMsg({ ok: false, text: j.error || 'Could not start listening' });
    setTgMsg({ ok: true, text: `Listening. Send ${j.bot ? '@' + j.bot : 'your bot'} a message in Telegram now. Waits up to 5 minutes.` });
    setListenNode(nodeId);
  }
  useEffect(() => {
    if (!listenNode) return;
    let stop = false;
    const t0 = Date.now();
    const tick = async () => {
      if (stop) return;
      if (Date.now() - t0 > 5 * 60_000) { setListenNode(null); return setTgMsg({ ok: false, text: 'Timed out. Press Listen for message again.' }); }
      const r = await fetch(`/api/workflows/${id}/telegram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId: listenNode, action: 'poll' }) });
      const j = await r.json().catch(() => ({}));
      if (stop) return;
      if (j.status === 'success' && j.item) {
        const item = j.item;
        setResults((prev: any) => ({ ...prev, [listenNode]: { status: 'success', inputs: [], outputs: [[item]], ms: 0 } }));
        // Keep the real message as the test payload, so Execute step uses your real chat ID.
        setNodes((ns) => ns.map((n) => n.id === listenNode ? { ...n, data: { ...n.data, status: 'success', params: { ...(n.data as any).params, sample: JSON.stringify(item.json, null, 2) } } } : n));
        setTgMsg({ ok: true, text: `Got it: "${String(item.json?.text ?? '').slice(0, 60)}" from chat ${item.json?.chatId}. See Output. Execute step now uses this real message.` });
        setListenNode(null);
        return;
      }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [listenNode, id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true);
    const ok = (await put({ name, active, ...graph() })).ok;
    if (ok) { lastSig.current = sig; pending.current = null; setSaveState({ s: 'saved', at: new Date().toLocaleTimeString() }); }
    setMsg(ok ? 'Saved' : 'Save failed');
    setBusy(false);
  }
  // Auto-save: the graph (not run status or selection) is saved 1.2s after the last change.
  const sig = useMemo(() => JSON.stringify({ name, ...graph() }), [name, nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSig = useRef<string | null>(null);
  const pending = useRef<{ sig: string; body: string } | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!ready) return;
    if (lastSig.current === null) { lastSig.current = sig; return; }
    if (!auto || sig === lastSig.current) { pending.current = null; return; }
    const body = JSON.stringify({ name, ...graph() });
    pending.current = { sig, body };
    const t = setTimeout(() => {
      lastSig.current = sig;
      setSaveState({ s: 'saving' });
      chain.current = chain.current.then(async () => {
        const ok = await fetch(`/api/workflows/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body }).then((r) => r.ok).catch(() => false);
        if (ok) { if (pending.current?.sig === sig) pending.current = null; setSaveState({ s: 'saved', at: new Date().toLocaleTimeString() }); }
        else { if (lastSig.current === sig) lastSig.current = ''; setSaveState({ s: 'error' }); }
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [sig, ready, auto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page (Back, closing the tab) sends any change that is still waiting.
  useEffect(() => {
    const flushNow = () => {
      const p = pending.current;
      if (!p || p.sig === lastSig.current) return;
      lastSig.current = p.sig; pending.current = null;
      fetch(`/api/workflows/${id}`, { method: 'PUT', keepalive: true, headers: { 'content-type': 'application/json' }, body: p.body }).catch(() => {});
    };
    window.addEventListener('pagehide', flushNow);
    return () => { window.removeEventListener('pagehide', flushNow); flushNow(); };
  }, [id]);

  function copySelected() {
    if (!selected.length) return false;
    const ids = new Set(selected.map((n) => n.id));
    clip.current = { nodes: selected.map((n) => ({ ...n, data: structuredClone(n.data) as any })), edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)), bump: 0 };
    return true;
  }
  function pasteCopied() {
    const c = clip.current;
    if (!c) return;
    c.bump += 1;
    const map = new Map<string, string>();
    const taken = new Set(nodes.map((n) => String((n.data as any).name)));
    const fresh = c.nodes.map((n) => {
      const nid = rid(); map.set(n.id, nid);
      const base = String((n.data as any).name);
      let name = `${base} copy`, k = 2;
      while (taken.has(name)) name = `${base} copy ${k++}`;
      taken.add(name);
      return { ...n, id: nid, selected: true, position: { x: n.position.x + 40 * c.bump, y: n.position.y + 40 * c.bump }, data: { ...(n.data as any), name, status: undefined } } as Node;
    });
    const wires = c.edges.map((e) => decorate({ id: rid(), source: map.get(e.source)!, target: map.get(e.target)!, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }));
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...fresh]);
    setEdges((es) => [...es, ...wires]);
  }
  function deleteSelected() {
    const ids = new Set(selected.map((n) => n.id));
    if (!ids.size) return;
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
    setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setSel(null); setOpen(false);
  }
  // Keyboard: Ctrl/Cmd + A select all, C copy, V paste, D duplicate. Ignored while typing or when a node screen is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (open || t?.closest('input, textarea, select, [contenteditable="true"], .chatdock')) return;
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); }
      else if (k === 'c') { if (copySelected()) e.preventDefault(); }
      else if (k === 'v') { if (clip.current) { e.preventDefault(); pasteCopied(); } }
      else if (k === 'd') { if (copySelected()) { e.preventDefault(); pasteCopied(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function tidyUp() {
    const size = (n: Node) => {
      const agent = !!getDef((n.data as any).type)?.slots;
      return { w: n.measured?.width ?? n.width ?? (agent ? 280 : 170), h: n.measured?.height ?? n.height ?? (agent ? 110 : 64) };
    };
    const part = selected.length > 1 ? selected : nodes;
    const pos = tidyLayout(part.map((n) => ({ id: n.id, type: (n.data as any).type, x: n.position.x, y: n.position.y, ...size(n) })), edges);
    if (part !== nodes) {
      // Keep the tidied group where it was on the canvas.
      const ox = Math.min(...part.map((n) => n.position.x)) - Math.min(...Object.values(pos).map((p) => p.x));
      const oy = Math.min(...part.map((n) => n.position.y)) - Math.min(...Object.values(pos).map((p) => p.y));
      for (const p of Object.values(pos)) { p.x += ox; p.y += oy; }
    }
    setUndoPos(Object.fromEntries(nodes.map((n) => [n.id, n.position])));
    setNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
    setMsg('Tidied up');
    setTimeout(() => fitView({ duration: 350, maxZoom: 1, padding: 0.15 }), 60);
  }
  function undoTidy() {
    if (!undoPos) return;
    setNodes((ns) => ns.map((n) => (undoPos[n.id] ? { ...n, position: undoPos[n.id] } : n)));
    setUndoPos(null); setMsg('Layout restored');
    setTimeout(() => fitView({ duration: 350, maxZoom: 1, padding: 0.15 }), 60);
  }

  async function run() {
    setBusy(true); setMsg('Running…');
    const selDef = sel ? getDef((nodes.find((n) => n.id === sel)?.data as any)?.type) : undefined;
    const r = await fetch(`/api/workflows/${id}/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ...graph(), startNodeId: selDef?.group === 'trigger' ? sel : undefined }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error || 'Run failed');
    setResults(j.results || {});
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, status: j.results?.[n.id]?.status } })));
    setMsg(j.status === 'success' ? 'Run finished' : `Failed: ${j.error}`);
  }
  async function toggleActive(v: boolean) {
    setActive(v);
    const r = await put({ active: v, name, ...graph() });
    const bad = r.telegram.find((t: any) => !t.ok);
    if (!r.ok) setMsg('Could not change Active');
    else if (bad) setMsg(`Telegram: ${bad.message}`);
    else setMsg(v ? (r.telegram.length ? r.telegram[0].message : 'Active: triggers are live') : 'Deactivated');
  }

  const rid = () => Math.random().toString(36).slice(2, 10);
  const nameFor = (type: string) => {
    const def = getDef(type)!;
    const count = nodes.filter((n) => (n.data as any).type === type).length;
    return count ? `${def.label} ${count + 1}` : def.label;
  };

  // How many sub-nodes sit in each agent socket.
  const plugged = useMemo(() => {
    const out: EditorActions['plugged'] = {};
    for (const e of edges) {
      if (!isSlotEdge(e)) continue;
      const slot = e.targetHandle as SlotId;
      out[e.target] = { ...out[e.target], [slot]: (out[e.target]?.[slot] || 0) + 1 };
    }
    return out;
  }, [edges]);

  /** Adds a sub-node under an agent and plugs it into the socket. */
  function addSub(agentId: string, slot: SlotId, type: string) {
    const agent = nodes.find((n) => n.id === agentId);
    const slots = agent && getDef((agent.data as any).type)?.slots;
    const def = getDef(type);
    if (!agent || !slots || !def) return;
    const k = slots.findIndex((s) => s.id === slot);
    const taken = plugged[agentId]?.[slot] || 0;
    const nid = rid();
    // Agent is 280px wide, sub-nodes 150px. Centre under the socket, then step right for more.
    const x = agent.position.x + ((k + 0.5) / slots.length) * 280 - 75 + taken * 165;
    const y = agent.position.y + 160;
    setNodes((ns) => [...ns, { id: nid, type: 'flow', position: { x, y }, data: { type, name: nameFor(type), params: defaultParams(def) } }]);
    setEdges((es) => [...es, decorate({ id: `sub-${nid}`, source: nid, sourceHandle: 'sub', target: agentId, targetHandle: slot })]);
    setSel(nid); setTab('params');
  }

  function addNode(type: string) {
    const def = getDef(type)!;
    // A sub-node added while an agent is selected plugs straight into it.
    const picked = sel ? nodes.find((n) => n.id === sel) : undefined;
    const pickedDef = picked ? getDef((picked.data as any).type) : undefined;
    if (def.slot && pickedDef?.slots) {
      const s = pickedDef.slots.find((x) => x.id === def.slot);
      if (s && (s.multiple || !plugged[picked!.id]?.[s.id])) return addSub(picked!.id, s.id, type);
    }
    const x = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) + 250 : 80;
    const nid = rid();
    setNodes((ns) => [...ns, { id: nid, type: 'flow', position: { x, y: 140 }, data: { type, name: nameFor(type), params: defaultParams(def) } }]);
    setSel(nid); setTab('params');
  }
  const patch = (nid: string, fn: (d: any) => any) => setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: fn(n.data) } : n)));
  function removeNode(nid: string) {
    setNodes((ns) => ns.filter((n) => n.id !== nid));
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
    setSel(null); setOpen(false);
  }

  const hasChat = nodes.some((n) => (n.data as any).type === 'chatTrigger');
  const actions = useMemo<EditorActions>(() => ({ addSub, openChat: () => setChatOpen(true), plugged }), [nodes, plugged]); // eslint-disable-line react-hooks/exhaustive-deps
  const chatStart = (nodes.find((n) => n.id === sel && (n.data as any).type === 'chatTrigger') ?? nodes.find((n) => (n.data as any).type === 'chatTrigger'))?.id;
  const chatNode = nodes.find((n) => n.id === chatStart);

  function onChatReply(j: any) {
    if (!j?.results) return;
    setResults(j.results);
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, status: j.results[n.id]?.status } })));
  }

  const node = nodes.find((n) => n.id === sel);
  const d: any = node?.data;
  const def = d ? getDef(d.type) : undefined;
  const res = sel ? results[sel] : undefined;
  const cred = creds.find((c) => c.id === d?.params?.credential);
  const credDef = CREDENTIAL_TYPES.find((t) => t.type === cred?.type);
  const modelOptions = useMemo(() => {
    const free = live?.free || [];
    const all = [...free, ...(credDef?.models || []), ...(live?.models || [])];
    return Array.from(new Set(all));
  }, [live, credDef]);

  async function loadModels() {
    if (!cred) return;
    setLoadingModels(true);
    const r = await fetch(`/api/models?credential=${cred.id}`);
    const j = await r.json();
    setLive(r.ok ? j : { models: [], free: [], err: j.error || 'Could not load models' });
    setLoadingModels(false);
  }

  // Everything upstream of the open node (trigger first, nearest parent last), so the Input panel can show every earlier output.
  const mainEdges = useMemo(() => edges.filter((e) => !isSlotEdge(e)), [edges]);
  const parentEdges = mainEdges.filter((e) => e.target === sel);
  const upstream = useMemo(() => {
    if (!sel) return [] as string[];
    const seen = new Set<string>([sel]);
    const out: string[] = [];
    const visit = (nid: string) => {
      for (const e of mainEdges) {
        if (e.target !== nid || seen.has(e.source)) continue;
        seen.add(e.source);
        visit(e.source); // parents first
        out.push(e.source);
      }
    };
    visit(sel);
    return out;
  }, [sel, mainEdges]);
  const nameOf = (nid: string) => String((nodes.find((n) => n.id === nid)?.data as any)?.name ?? '');
  const upNodes = upstream.map((nid) => ({ id: nid, name: nameOf(nid) }));
  const choices = upNodes.length > 1 ? [{ id: '__all', name: `All previous nodes (${upNodes.length})` }, ...upNodes] : upNodes;
  const pickIdx = Math.min(pIdx, Math.max(choices.length - 1, 0));
  const allMode = upNodes.length > 1 && pickIdx === 0;
  const inputNodes = allMode ? upNodes : choices[pickIdx] ? [choices[pickIdx]] : [];
  const handleIdx = (e?: Edge) => (/^out(\d+)$/.test(e?.sourceHandle || '') ? Number((e!.sourceHandle as string).slice(3)) : 0);
  // Output of one upstream node. A direct parent only contributes the output port wired to this node.
  const outOf = (nid: string): any[][] | undefined => {
    const r = results[nid];
    if (!r) return undefined;
    const e = parentEdges.find((x) => x.source === nid);
    return e ? [r.outputs?.[handleIdx(e)] ?? []] : r.outputs;
  };
  const soleParent = parentEdges.length === 1 ? parentEdges[0].source : null;
  const prefixOf = (nid: string) => (nid === soleParent ? '$json' : `$node[${JSON.stringify(nameOf(nid))}].json`);
  const hasInputData = inputNodes.some((x) => (outOf(x.id) ?? []).flat().length > 0);
  const byName = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const n of nodes) { const r = results[n.id]; if (r?.outputs) m[(n.data as any).name] = r.outputs.flat(); }
    return m;
  }, [nodes, results]);
  // $json always means this node's own direct input, whichever upstream node is shown.
  const directItems: any[] | undefined = res?.inputs?.length ? res.inputs : parentEdges[0] ? results[parentEdges[0].source]?.outputs?.[handleIdx(parentEdges[0])] : undefined;
  const firstJson = directItems?.[0]?.json;
  const pvOf = (v: any) => (firstJson ? previewExpr(v, firstJson, byName) : null);

  const palette = useMemo(() => groupedNodes(q), [q]);

  return (
    <div className="ed-wrap">
      <div className="ed-bar">
        <Link href="/" className="btn">Back</Link>
        <div className="vtabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'editor'} className={view === 'editor' ? 'on' : ''} onClick={() => setView('editor')}>Editor</button>
          <button role="tab" aria-selected={view === 'executions'} className={view === 'executions' ? 'on' : ''} onClick={() => setView('executions')}>Executions</button>
        </div>
        <input className="nm" type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="Workflow name" />
        {selected.length > 1 && (
          <>
            <span className="mute">{selected.length} selected</span>
            <button className="btn" onClick={() => { if (copySelected()) pasteCopied(); }} title="Duplicate the selected nodes (Ctrl+D)">Duplicate</button>
            <button className="btn" onClick={deleteSelected} title="Delete the selected nodes (Delete)">Delete</button>
          </>
        )}
        <button className="btn" onClick={tidyUp} disabled={!nodes.length} title={selected.length > 1 ? 'Arrange only the selected nodes' : 'Arrange the nodes in a clean left-to-right order'}>{selected.length > 1 ? 'Tidy selection' : 'Tidy up'}</button>
        {undoPos && <button className="btn" onClick={undoTidy} title="Put the nodes back where they were">Undo tidy</button>}
        <button className="btn" onClick={save} disabled={busy}>Save</button>
        <button className="btn pri" onClick={run} disabled={busy}>Run</button>
        <label className="mute" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={active} onChange={(e) => toggleActive(e.target.checked)} /> Active
        </label>
        <label className="mute" style={{ display: 'flex', gap: 6, alignItems: 'center' }} title="Saves the nodes and connections a moment after every change">
          <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} /> Auto-save
        </label>
        <span className={saveState.s === 'error' ? 'err-text' : 'mute'} aria-live="polite">
          {saveState.s === 'saving' ? 'Saving…' : saveState.s === 'saved' ? `Saved ${saveState.at}` : saveState.s === 'error' ? 'Auto-save failed. Press Save.' : ''}
        </span>
        <span className="mute">{msg}</span>
      </div>
      {view === 'executions' ? (
        <EditorCtx.Provider value={{ ...actions, readonly: true }}>
          <ExecutionsView workflowId={id} nodes={nodes} edges={edges} theme={theme} />
        </EditorCtx.Provider>
      ) : (
      <EditorCtx.Provider value={actions}>
      <div className="ed-body">
        <aside className="pal">
          <input type="text" placeholder="Search nodes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search nodes" />
          {palette.map(({ group, label, items }) => (
            <div key={group}>
              <h4>{label}</h4>
              {items.map((n) => (
                <button key={n.type} title={n.description} onClick={() => addNode(n.type)}><i className={`dot ${group}`} />{n.label}</button>
              ))}
            </div>
          ))}
        </aside>
        <div className="canvas">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme} attributionPosition="top-right"
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
            onNodeClick={(e, n) => {
              if (e.shiftKey || e.ctrlKey || e.metaKey) return; // building a selection, not opening a node
              if (selected.length > 1 && n.selected) return;
              setSel(n.id); setOpen(true);
            }}
            onNodeDoubleClick={(_, n) => { setSel(n.id); setOpen(true); }} onPaneClick={() => setSel(null)}
            fitView fitViewOptions={{ maxZoom: 1 }} deleteKeyCode={['Backspace', 'Delete']}
            selectionOnDrag={mode === 'select'} panOnDrag={mode === 'select' ? [1, 2] : true} selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode={['Meta', 'Control']} selectNodesOnDrag={false}
          >
            <Panel position="top-left">
              <div className="modebar" role="group" aria-label="Canvas mode">
                <button className={mode === 'select' ? 'on' : ''} onClick={() => setMode('select')} title="Drag on empty canvas to select several nodes. Pan with the middle or right mouse button, or Space + drag.">Select</button>
                <button className={mode === 'pan' ? 'on' : ''} onClick={() => setMode('pan')} title="Drag on empty canvas to move around. Hold Shift and drag to select.">Pan</button>
              </div>
            </Panel>
            <Background gap={22} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
            {hasChat && !chatOpen && (
              <Panel position="bottom-center">
                <button className="btn pri openchat-btm" onClick={() => setChatOpen(true)}>Open chat</button>
              </Panel>
            )}
          </ReactFlow>
          {chatOpen && chatNode && (
            <div className="chatdock">
              <ChatPanel
                title="Test chat" welcome={String((chatNode.data as any).params?.initialMessage ?? '') || undefined}
                endpoint={`/api/workflows/${id}/chat`}
                extra={() => ({ name, ...graph(), startNodeId: chatStart })}
                onReply={onChatReply} onClose={() => setChatOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
      {open && node && def && (
        <NodeModal
          name={d.name} onName={(v) => patch(node.id, (x) => ({ ...x, name: v }))}
          typeLabel={def.label} group={def.group}
          onClose={() => setOpen(false)} onExecute={run} busy={busy}
          tab={tab} onTab={setTab}
          parents={choices} parentIdx={pickIdx} onParent={setPIdx}
          status={res?.status} ms={res?.ms}
          input={
            def.group === 'trigger' ? <Empty title="This is a trigger" hint="Triggers start the workflow, so they have no input. Their output is on the right." />
            : def.slot ? <Empty title="No input" hint="This sub-node plugs into an agent, so it has no input of its own." />
            : inputNodes.length && hasInputData ? (
              <>
                {inputNodes.map((x) => {
                  const data = outOf(x.id);
                  return (
                    <div key={x.id} className="nd-sec">
                      {data?.flat().length
                        ? <OutputView data={data} title={allMode || inputNodes.length > 1 ? x.name : 'Input'} draggable prefix={prefixOf(x.id)} />
                        : <><div className="nd-sech">{x.name}</div><p className="mute">No data yet. Execute this node.</p></>}
                    </div>
                  );
                })}
              </>
            )
            : <Empty title="No input data" action="Execute previous nodes" onAction={run} busy={busy} hint="to view input data, then drag fields into the parameters" />
          }
          output={
            def.slot ? <Empty title="No output" hint="Sub-nodes run when the agent calls them." />
            : res ? (
              <>
                {res.error && <div className="err-text" style={{ marginBottom: 8 }}>{res.error}</div>}
                <OutputView data={res.outputs} title="Output" />
              </>
            ) : <Empty title="No output data" action="Execute step" onAction={run} busy={busy} hint="runs the workflow up to this node" />
          }
          params={
            <>
              <div className="mute">{def.description}</div>
              {def.credentialTypes && (
                <>
                  <label className="l">Credential</label>
                  <select value={d.params.credential || ''} onChange={(e) => (e.target.value === '__new__' ? setAddCred(true) : patch(node.id, (x) => ({ ...x, params: { ...x.params, credential: e.target.value } })))}>
                    <option value="">{def.group === 'trigger' ? 'None (no signature check)' : 'Select…'}</option>
                    {creds.filter((c) => def.credentialTypes!.includes(c.type)).map((c) => {
                      const t = CREDENTIAL_TYPES.find((x) => x.type === c.type);
                      return <option key={c.id} value={c.id}>{c.name}{t?.free ? ' (free)' : ''}</option>;
                    })}
                    <option value="__new__">+ Add new credential…</option>
                  </select>
                  <div className="hint"><button className="btn sm" onClick={() => setAddCred(true)}>+ Add new credential</button> <Link href="/credentials" target="_blank">Manage credentials</Link></div>
                </>
              )}
              {def.type === 'telegramTrigger' && (
                <div className="note">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn sm pri" onClick={() => (listenNode ? setListenNode(null) : tgListen(node.id))} disabled={!d.params.credential}>{listenNode === node.id ? 'Stop listening' : 'Listen for message'}</button>
                    <button className="btn sm" onClick={() => tgAction(node.id, 'register')} disabled={!d.params.credential}>Register webhook</button>
                    <button className="btn sm" onClick={() => tgAction(node.id, 'status')} disabled={!d.params.credential}>Check status</button>
                  </div>
                  {!d.params.credential && <div className="hint">Pick a Telegram bot credential first.</div>}
                  {tgMsg && <div className={tgMsg.ok ? 'mute' : 'err-text'} style={{ marginTop: 6 }}>{tgMsg.text}</div>}
                </div>
              )}
              {def.type === 'chatTrigger' && <p><button className="btn pri" onClick={() => { setOpen(false); setChatOpen(true); }}>Open chat</button></p>}
              {def.params.filter((p) => {
                if (!p.showIf) return true;
                const cur = d.params[p.showIf.param] ?? def.params.find((x) => x.name === p.showIf!.param)?.default;
                return p.showIf.oneOf ? p.showIf.oneOf.includes(cur) : cur === p.showIf.equals;
              }).map((p) => (
                <div key={p.name}>
                  <label className="l">{p.label}</label>
                  <Field p={p} value={d.params[p.name]} pv={pvOf(d.params[p.name] ?? p.default)} onChange={(v) => patch(node.id, (x) => ({ ...x, params: { ...x.params, [p.name]: v } }))} />
                  {p.model && cred && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn sm" onClick={loadModels} disabled={loadingModels}>{loadingModels ? 'Loading…' : 'Load models'}</button>
                      {modelOptions.length > 0 && (
                        <select value="" onChange={(e) => e.target.value && patch(node.id, (x) => ({ ...x, params: { ...x.params, [p.name]: e.target.value } }))}>
                          <option value="">Pick a model…</option>
                          {modelOptions.map((m) => <option key={m} value={m}>{live?.free.includes(m) ? `★ ${m}` : m}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  {p.model && live?.err && <div className="err-text hint">{live.err}</div>}
                  {p.model && !cred && def.credentialTypes && <div className="hint">Pick a credential to see model suggestions.</div>}
                  {p.hint && <div className="hint">{p.hint}</div>}
                </div>
              ))}
              <datalist id="model-list">{modelOptions.map((m) => <option key={m} value={m} />)}</datalist>
              {def.urlPrefix && typeof window !== 'undefined' && (
                <div className="note">Live URL:<br /><span className="mono">{window.location.origin}{def.urlPrefix}{d.params.path || ''}</span>
                  <div className="mute">Works after you turn the workflow Active.</div></div>
              )}
              {def.type === 'chatTrigger' && d.params.public === true && typeof window !== 'undefined' && (
                <div className="note">Public chat:<br /><span className="mono">{window.location.origin}/chat/{d.params.path || 'chat'}</span>
                  <div className="mute">Works after you turn the workflow Active. Anyone with the link can use your AI credits.</div></div>
              )}
              <p className="hint">Drag a field from the Input panel into a text parameter, or type {'{{ $json.field }}'} or {'{{ $node["Name"].json.field }}'}.</p>
            </>
          }
          settings={
            <>
              <label className="l" style={{ marginTop: 0 }}>Node type</label>
              <div>{def.label}</div>
              <div className="mute">{def.description}</div>
              <p><button className="btn sm del" onClick={() => removeNode(node.id)}>Delete node</button></p>
            </>
          }
        />
      )}
      {addCred && open && node && def?.credentialTypes && (
        <CredentialForm
          types={def.credentialTypes}
          onClose={() => setAddCred(false)}
          onCreated={(c) => {
            setCreds((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
            patch(node.id, (x) => ({ ...x, params: { ...x.params, credential: c.id } }));
            setAddCred(false);
          }}
        />
      )}
      </EditorCtx.Provider>
      )}
    </div>
  );
}

export default function Page() {
  return <ReactFlowProvider><Editor /></ReactFlowProvider>;
}
