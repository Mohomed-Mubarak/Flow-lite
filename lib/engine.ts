import type { ExecResult, Item, NodeResult, WFEdge, WFNode } from './types';
import { SLOT_IDS, getDef } from './nodes/catalog';
import { runners, type Ctx, type Sub, type Subs } from './nodes/runners';
import { resolve, type Scope } from './expr';
import { loadCredential } from './credentials';

const outIndex = (h?: string | null) => (h && /^out(\d+)$/.test(h) ? Number(h.slice(3)) : 0);
/** An edge into an agent socket (model, memory, tool). It is not part of the main data flow. */
export const isSubEdge = (e: WFEdge) => !!e.targetHandle && (SLOT_IDS as string[]).includes(e.targetHandle);

export async function runWorkflow(opts: {
  nodes: WFNode[];
  edges: WFEdge[];
  startNodeId?: string;
  triggerItems?: Item[];
  workflowId?: string;
}): Promise<ExecResult> {
  const { nodes } = opts;
  // Sub-nodes feed agents. They never run on their own, so keep them out of the flow.
  const subEdges = opts.edges.filter(isSubEdge);
  const edges = opts.edges.filter((e) => !isSubEdge(e));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = (opts.startNodeId && byId.get(opts.startNodeId)) || nodes.find((n) => getDef(n.type)?.group === 'trigger');
  if (!start) throw new Error('Add a trigger node first');

  // Reachable subgraph from the start node.
  const reach = new Set([start.id]);
  const q = [start.id];
  while (q.length) {
    const id = q.shift()!;
    for (const e of edges) {
      if (e.source === id && byId.has(e.target) && !reach.has(e.target)) { reach.add(e.target); q.push(e.target); }
    }
  }

  // Topological order (Kahn).
  const indeg = new Map([...reach].map((id) => [id, 0]));
  for (const e of edges) if (reach.has(e.source) && reach.has(e.target)) indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  const ready = [...reach].filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const e of edges) {
      if (e.source === id && reach.has(e.target)) {
        indeg.set(e.target, indeg.get(e.target)! - 1);
        if (indeg.get(e.target) === 0) ready.push(e.target);
      }
    }
  }
  if (order.length !== reach.size) throw new Error('Workflow has a loop; loops are not supported');

  const results: Record<string, NodeResult> = {};
  const outputs = new Map<string, Item[][]>();
  const byName: Record<string, Item[]> = {};
  const credCache = new Map<string, Record<string, any>>();
  let last: Item[] | undefined;
  let error: string | undefined;

  const loadCred = async (credId?: string) => {
    if (!credId) return null;
    if (!credCache.has(credId)) credCache.set(credId, await loadCredential(credId));
    return credCache.get(credId)!;
  };
  const subsFor = async (agentId: string): Promise<Subs> => {
    const attached = async (slot: string): Promise<Sub[]> => {
      const out: Sub[] = [];
      for (const e of subEdges) {
        if (e.target !== agentId || e.targetHandle !== slot) continue;
        const n = byId.get(e.source);
        if (n) out.push({ type: n.type, name: n.name, params: n.params, cred: await loadCred(n.params.credential) });
      }
      return out;
    };
    return { model: (await attached('model'))[0], memory: (await attached('memory'))[0], tools: await attached('tool') };
  };

  for (const id of order) {
    const node = byId.get(id)!;
    const def = getDef(node.type);
    if (!def) { error = `Unknown node type "${node.type}"`; results[id] = { status: 'error', inputs: [], outputs: [], error, ms: 0 }; break; }

    let items: Item[];
    if (id === start.id) items = opts.triggerItems?.length ? opts.triggerItems : [{ json: {} }];
    else {
      items = [];
      for (const e of edges) {
        if (e.target === id && outputs.has(e.source)) items.push(...(outputs.get(e.source)![outIndex(e.sourceHandle)] || []));
      }
    }
    if (!items.length) {
      results[id] = { status: 'skipped', inputs: items, outputs: [], ms: 0 };
      outputs.set(id, Array.from({ length: def.outputs }, () => []));
      continue;
    }

    const t0 = Date.now();
    try {
      const cred = await loadCred(node.params.credential);
      const subs = def.slots ? await subsFor(id) : { tools: [] };
      const raw = (n: string) => node.params[n] ?? def.params.find((p) => p.name === n)?.default;
      const scope = (i: number): Scope => ({ json: items[i]?.json ?? {}, nodes: byName, index: i, items });
      const ctx: Ctx = {
        items, raw, cred, subs, workflowId: opts.workflowId,
        scope,
        param: (n, i = 0) => resolve(raw(n), scope(i)),
        json: (n, i = 0) => {
          let v = raw(n);
          if (v === '' || v == null) return undefined;
          if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch {
              const r = resolve(v, scope(i));
              if (typeof r === 'string') { try { return JSON.parse(r); } catch { return r; } }
              return r;
            }
          }
          return resolve(v, scope(i));
        },
      };
      const out = await runners[node.type](ctx);
      outputs.set(id, out);
      byName[node.name] = out.flat();
      last = out.flat();
      results[id] = { status: 'success', inputs: items, outputs: out, ms: Date.now() - t0 };
    } catch (e: any) {
      error = `${node.name}: ${e.message}`;
      results[id] = { status: 'error', inputs: items, outputs: [], error: e.message, ms: Date.now() - t0 };
      break;
    }
  }

  return { status: error ? 'error' : 'success', results, order, error, last };
}
