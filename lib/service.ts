// Server-only. Everything an external agent can do, in one place. The REST API (/api/v1) and the MCP server
// (/api/mcp) are thin wrappers around these functions, so both behave the same.
import { after } from 'next/server';
import { db } from './supabase';
import { executeAndStore } from './run';
import { syncTelegram } from './telegram';
import { HOOK_TYPES, cleanPath, hookMethod, telegramItem } from './triggers';
import { validateGraph } from './validate';
import { ApiError, bad, notFound } from './apiError';
import { NODES, CREDENTIAL_TYPES, defaultParams, getDef } from './nodes/catalog';
import type { ExecResult, Item, WFEdge, WFNode } from './types';

export type Ctx = { req: Request; source: 'api' | 'mcp' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (id: unknown, what = 'id') => { if (typeof id !== 'string' || !UUID.test(id)) throw bad(`"${what}" must be a workflow/execution id (UUID).`); return id; };

export function baseUrl(req: Request): string {
  const env = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (env) return env;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** How each trigger of a workflow is started: the URL for hooks, the schedule for cron. */
export function triggerInfo(nodes: WFNode[], base: string) {
  return nodes.filter((n) => getDef(n.type)?.group === 'trigger').map((n) => {
    const t: Record<string, any> = { nodeId: n.id, type: n.type, name: n.name };
    if (n.type === 'form') t.url = `${base}/form/${cleanPath(n.params.path)}`;
    else if (n.type === 'chatTrigger') { if (n.params.public === true) t.url = `${base}/chat/${cleanPath(n.params.path || 'chat')}`; }
    else if (HOOK_TYPES.includes(n.type)) { t.url = `${base}/api/webhook/${cleanPath(n.params.path)}`; t.method = hookMethod(n); }
    else if (n.type === 'schedule') t.cron = String(n.params.cron || '*/15 * * * *');
    else if (n.type === 'interval') t.everyMinutes = Number(n.params.minutes) || 5;
    return t;
  });
}

const shape = (w: any, base: string) => ({ id: w.id, name: w.name, active: w.active, updated_at: w.updated_at, nodes: w.nodes, edges: w.edges, triggers: triggerInfo(w.nodes as WFNode[], base) });

async function load(id: string) {
  const { data } = await db().from('workflows').select('*').eq('id', uuid(id)).maybeSingle();
  if (!data) throw notFound('Workflow not found.');
  return data;
}

// ---------- workflows ----------

export async function listWorkflows(c: Ctx, o: { active?: boolean } = {}) {
  let q = db().from('workflows').select('id,name,active,updated_at,nodes').order('updated_at', { ascending: false });
  if (typeof o.active === 'boolean') q = q.eq('active', o.active);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const base = baseUrl(c.req);
  return (data || []).map((w) => ({ id: w.id, name: w.name, active: w.active, updated_at: w.updated_at, nodeCount: (w.nodes as WFNode[]).length, triggers: triggerInfo(w.nodes as WFNode[], base) }));
}

export async function getWorkflow(c: Ctx, id: string) {
  return shape(await load(id), baseUrl(c.req));
}

export async function createWorkflow(c: Ctx, b: { name?: string; nodes?: unknown; edges?: unknown; active?: boolean }) {
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 200) : 'Untitled workflow';
  const given = b.nodes !== undefined;
  const g = validateGraph(given ? b.nodes : [{ id: 'trigger', type: 'manual', name: 'Manual Trigger', position: { x: 80, y: 140 }, params: {} }], b.edges ?? []);
  const { data, error } = await db().from('workflows').insert({ name, nodes: g.nodes, edges: g.edges }).select('*').single();
  if (error) throw new Error(error.message);
  let telegram: any[] | undefined;
  if (b.active === true) {
    const r = await setActive(c, data.id, true);
    telegram = r.telegram; data.active = true;
  }
  return { ...shape(data, baseUrl(c.req)), warnings: g.warnings, telegram };
}

export async function updateWorkflow(c: Ctx, id: string, b: { name?: string; nodes?: unknown; edges?: unknown }) {
  const cur = await load(id);
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 200);
  let warnings: string[] = [];
  if (b.nodes !== undefined || b.edges !== undefined) {
    const g = validateGraph(b.nodes !== undefined ? b.nodes : cur.nodes, b.edges !== undefined ? b.edges : cur.edges);
    patch.nodes = g.nodes; patch.edges = g.edges; warnings = g.warnings;
  }
  if (Object.keys(patch).length === 1) throw bad('Nothing to update. Send name, nodes and/or edges.');
  const { data, error } = await db().from('workflows').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return { ...shape(data, baseUrl(c.req)), warnings };
}

export async function setActive(c: Ctx, id: string, active: boolean) {
  if (typeof active !== 'boolean') throw bad('"active" must be true or false.');
  const cur = await load(id);
  const { data, error } = await db().from('workflows').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  // Activating registers Telegram webhooks. Deactivating removes them (same as the editor).
  const telegram = active !== cur.active || active ? await syncTelegram(data.nodes as WFNode[], active, c.req) : [];
  return { id: data.id, name: data.name, active: data.active, telegram, triggers: triggerInfo(data.nodes as WFNode[], baseUrl(c.req)) };
}

export async function deleteWorkflow(c: Ctx, id: string) {
  const cur = await load(id);
  if (cur.active) await syncTelegram(cur.nodes as WFNode[], false, c.req);
  const { error } = await db().from('workflows').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true, id };
}

// ---------- running ----------

/** Turns the caller's input into the item the chosen trigger would normally produce. */
function triggerItem(node: WFNode | undefined, input: any): Item {
  const o = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  switch (node?.type) {
    case 'chatTrigger': {
      const msg = typeof input === 'string' ? input : String(o?.chatInput ?? o?.message ?? o?.text ?? '');
      return { json: { sessionId: String(o?.sessionId || 'api'), action: 'sendMessage', chatInput: msg } };
    }
    case 'webhook': return { json: { body: input ?? {}, query: {}, headers: {}, method: String(node.params.method || 'POST') } };
    case 'form': return { json: { fields: o?.fields ?? o ?? {} } };
    case 'telegramTrigger': return o && (o.update_id != null || o.message || o.callback_query) ? telegramItem(o) : { json: o ?? {} };
    case 'github': return { json: { event: String(o?.event ?? ''), delivery: 'api', body: o?.body ?? o ?? {} } };
    case 'stripeTrigger': return { json: { type: String(o?.type ?? ''), id: o?.id, body: o ?? {} } };
    default: return { json: o ?? (input === undefined ? {} : { value: input }) };
  }
}

function summarize(res: ExecResult & { executionId?: string }, nodes: WFNode[]) {
  const name = new Map(nodes.map((n) => [n.id, n.name]));
  return {
    executionId: res.executionId, status: res.status, error: res.error,
    output: (res.last || []).slice(0, 100).map((i) => i.json),
    nodes: res.order.map((id) => ({ id, name: name.get(id), status: res.results[id]?.status, ms: res.results[id]?.ms, error: res.results[id]?.error })),
  };
}

/**
 * Starts a workflow. wait=true (default) returns the result. wait=false returns an executionId at once
 * and finishes in the background: poll getExecution until status is not "running".
 */
export async function runWorkflowNow(c: Ctx, id: string, o: { input?: unknown; wait?: boolean; startNodeId?: string }) {
  const wf = await load(id);
  const nodes = wf.nodes as WFNode[];
  const triggers = nodes.filter((n) => getDef(n.type)?.group === 'trigger');
  if (!triggers.length) throw bad('This workflow has no trigger node.');
  const start = o.startNodeId ? triggers.find((n) => n.id === o.startNodeId) : triggers[0];
  if (!start) throw bad(`startNodeId must be one of the trigger node ids: ${triggers.map((t) => t.id).join(', ')}.`);
  const item = triggerItem(start, o.input);
  const run = { startNodeId: start.id, triggerItems: [item], mode: c.source };
  const w = { id: wf.id, name: wf.name, nodes, edges: wf.edges as WFEdge[] };

  if (o.wait === false) {
    const { data, error } = await db().from('executions').insert({ workflow_id: wf.id, workflow_name: wf.name, status: 'running', mode: c.source }).select('id').single();
    if (error) throw new Error(error.message);
    const executionId = data.id as string;
    after(async () => { try { await executeAndStore(w, { ...run, executionId }); } catch (e: any) {
      await db().from('executions').update({ status: 'error', error: e?.message || 'Run failed', finished_at: new Date().toISOString() }).eq('id', executionId);
    } });
    return { executionId, status: 'running', hint: 'Poll GET /api/v1/executions/{executionId} (or get_execution) until status is success or error.' };
  }
  return summarize(await executeAndStore(w, run), nodes);
}

// ---------- executions ----------

const STALE_MS = 5 * 60_000;
export const norm = (x: any) => x.status === 'running' && Date.now() - new Date(x.started_at).getTime() > STALE_MS
  ? { ...x, status: 'error', error: 'The run never finished (the server stopped it, usually the 60 second limit).' } : x;
const head = (x: any) => ({
  id: x.id, workflowId: x.workflow_id, workflowName: x.workflow_name, status: x.status, mode: x.mode, error: x.error,
  startedAt: x.started_at, finishedAt: x.finished_at, durationMs: x.finished_at ? new Date(x.finished_at).getTime() - new Date(x.started_at).getTime() : null,
});

export async function listExecutions(o: { workflowId?: string; status?: string; limit?: number }) {
  let q = db().from('executions').select('id,workflow_id,workflow_name,status,mode,error,started_at,finished_at').neq('mode', 'listen').order('started_at', { ascending: false }).limit(Math.min(Math.max(Number(o.limit) || 20, 1), 100));
  if (o.workflowId) q = q.eq('workflow_id', uuid(o.workflowId, 'workflowId'));
  if (o.status) q = q.eq('status', o.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((x) => head(norm(x)));
}

/** full=true adds every node's output. Otherwise only the final output and a per-node status list. */
export async function getExecution(id: string, o: { full?: boolean } = {}) {
  const { data } = await db().from('executions').select('*').eq('id', uuid(id)).maybeSingle();
  if (!data) throw notFound('Execution not found.');
  const x = norm(data);
  const results: Record<string, any> = x.data?.results ?? {};
  const order: string[] = x.data?.order ?? [];
  let names = new Map<string, string>();
  if (x.workflow_id) {
    const { data: w } = await db().from('workflows').select('nodes').eq('id', x.workflow_id).maybeSingle();
    names = new Map(((w?.nodes as WFNode[]) || []).map((n) => [n.id, n.name]));
  }
  const lastId = [...order].reverse().find((nid) => results[nid]?.status === 'success' && results[nid]?.outputs?.flat().length);
  return {
    ...head(x),
    output: lastId ? (results[lastId].outputs as Item[][]).flat().slice(0, 100).map((i) => i.json) : [],
    nodes: order.map((nid) => ({
      id: nid, name: names.get(nid), status: results[nid]?.status, ms: results[nid]?.ms, error: results[nid]?.error,
      ...(o.full ? { input: results[nid]?.inputs, outputs: results[nid]?.outputs } : {}),
    })),
  };
}

// ---------- catalog ----------

const nodeHead = (d: (typeof NODES)[number]) => ({
  type: d.type, label: d.label, group: d.group, description: d.description,
  ...(d.slot ? { subNodeFor: d.slot } : {}), ...(d.slots ? { sockets: d.slots.map((s) => s.id) } : {}),
  inputs: d.inputs, outputs: d.outputs, ...(d.credentialTypes ? { credentialTypes: d.credentialTypes } : {}),
});

export function listNodeTypes(o: { group?: string; search?: string } = {}) {
  const s = (o.search || '').toLowerCase().trim();
  return NODES.filter((d) => !d.hidden && (!o.group || d.group === o.group)
    && (!s || `${d.type} ${d.label} ${d.description}`.toLowerCase().includes(s))).map(nodeHead);
}

export function describeNodeType(type: string) {
  const d = getDef(String(type));
  if (!d) throw notFound(`Unknown node type "${type}". Use list_node_types to see them.`);
  return {
    ...nodeHead(d),
    params: d.params.map((p) => ({ name: p.name, label: p.label, type: p.type, default: p.default, options: p.options, hint: p.hint, placeholder: p.placeholder, showIf: p.showIf })),
    defaults: defaultParams(d),
    credentialNote: d.credentialTypes ? 'Set params.credential to the id of a credential of one of credentialTypes (see list_credentials).' : undefined,
    expressions: 'Params accept {{ $json.field }}, {{ $node["Node Name"].json.field }}, $items, $index, $now.',
  };
}

export async function listCredentials() {
  const { data, error } = await db().from('credentials').select('id,name,type,created_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const label = new Map(CREDENTIAL_TYPES.map((t) => [t.type, t.label]));
  return (data || []).map((c) => ({ ...c, typeLabel: label.get(c.type) || c.type }));
}
