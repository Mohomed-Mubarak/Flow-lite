// Checks and normalises a workflow graph that arrives from outside the editor (REST API, MCP).
// Errors stop the save. Warnings are returned to the caller.
import { SLOT_IDS, getDef } from './nodes/catalog';
import { ApiError } from './apiError';
import type { WFEdge, WFNode } from './types';

const rid = () => Math.random().toString(36).slice(2, 10);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validateGraph(nodesIn: unknown, edgesIn: unknown): { nodes: WFNode[]; edges: WFEdge[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(nodesIn)) throw new ApiError(400, '"nodes" must be an array.', 'invalid_workflow');
  if (edgesIn != null && !Array.isArray(edgesIn)) throw new ApiError(400, '"edges" must be an array.', 'invalid_workflow');

  const nodes: WFNode[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  nodesIn.forEach((raw, i) => {
    const at = `nodes[${i}]`;
    if (!isObj(raw)) return errors.push(`${at} must be an object.`);
    const def = typeof raw.type === 'string' ? getDef(raw.type) : undefined;
    if (!def) return errors.push(`${at}: unknown node type "${raw.type}". Use list_node_types / GET /api/v1/node-types for valid types.`);
    let id = typeof raw.id === 'string' && raw.id ? raw.id : '';
    if (!id) { do id = `n_${rid()}`; while (ids.has(id)); }
    if (ids.has(id)) return errors.push(`${at}: duplicate node id "${id}".`);
    ids.add(id);
    let name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : def.label;
    if (names.has(name)) {
      const base = name; let k = 2;
      while (names.has(`${base} ${k}`)) k++;
      name = `${base} ${k}`;
      warnings.push(`${at}: name "${base}" was already used, renamed to "${name}". Expressions use node names.`);
    }
    names.add(name);
    const params = isObj(raw.params) ? raw.params : {};
    if (raw.params != null && !isObj(raw.params)) errors.push(`${at}: "params" must be an object.`);
    const known = new Set(def.params.map((p) => p.name));
    for (const [k, v] of Object.entries(params)) {
      if (k === 'credential') continue;
      const p = def.params.find((x) => x.name === k);
      if (!p) { warnings.push(`${name}: "${k}" is not a parameter of ${def.type}. Known: ${[...known].join(', ') || 'none'}.`); continue; }
      if (p.type === 'select' && p.options && typeof v === 'string' && v !== '' && !p.options.includes(v)) {
        warnings.push(`${name}: "${k}" is "${v}". Expected one of: ${p.options.join(', ')}.`);
      }
    }
    const pos = isObj(raw.position) && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y)
      ? { x: Number(raw.position.x), y: Number(raw.position.y) }
      : { x: 80 + (def.slot ? 0 : nodes.filter((n) => !getDef(n.type)?.slot).length * 280), y: def.slot ? 360 : 140 };
    nodes.push({ id, type: def.type, name, position: pos, params });
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: WFEdge[] = [];
  const seen = new Set<string>();
  ((edgesIn as any[]) || []).forEach((raw, i) => {
    const at = `edges[${i}]`;
    if (!isObj(raw)) return errors.push(`${at} must be an object.`);
    const src = byId.get(String(raw.source)), dst = byId.get(String(raw.target));
    if (!src) return errors.push(`${at}: source "${raw.source}" is not a node id.`);
    if (!dst) return errors.push(`${at}: target "${raw.target}" is not a node id.`);
    if (src.id === dst.id) return errors.push(`${at}: a node cannot connect to itself.`);
    const sd = getDef(src.type)!, dd = getDef(dst.type)!;
    const th = raw.targetHandle ? String(raw.targetHandle) : null;
    let sh = raw.sourceHandle ? String(raw.sourceHandle) : null;

    if (th && (SLOT_IDS as string[]).includes(th)) {
      // Sub-node plugged into an agent socket.
      if (!sd.slot) return errors.push(`${at}: "${src.name}" is not a sub-node, so it cannot plug into "${th}". Only Chat Model, Memory and Tool nodes can.`);
      if (sd.slot !== th) return errors.push(`${at}: "${src.name}" is a ${sd.slot} sub-node, but targetHandle is "${th}".`);
      const slot = dd.slots?.find((s) => s.id === th);
      if (!slot) return errors.push(`${at}: "${dst.name}" has no "${th}" socket. Only AI Agent nodes do.`);
      sh = 'sub';
      if (!slot.multiple && edges.some((e) => e.target === dst.id && e.targetHandle === th)) {
        return errors.push(`${at}: "${dst.name}" accepts only one "${th}" sub-node.`);
      }
    } else {
      if (th) return errors.push(`${at}: unknown targetHandle "${th}". Leave it empty, or use model, memory or tool for agent sockets.`);
      if (sd.slot) return errors.push(`${at}: "${src.name}" is a sub-node. Connect it to an AI Agent with targetHandle "${sd.slot}".`);
      if (dd.inputs === 0) return errors.push(`${at}: "${dst.name}" is a trigger and has no input.`);
      if (dd.slot) return errors.push(`${at}: "${dst.name}" is a sub-node and takes no main input.`);
      const idx = sh && /^out(\d+)$/.exec(sh) ? Number(sh.slice(3)) : sh ? -1 : 0;
      if (idx < 0 || idx >= sd.outputs) return errors.push(`${at}: "${src.name}" has ${sd.outputs} output(s): use sourceHandle ${Array.from({ length: sd.outputs }, (_, k) => `"out${k}"`).join(', ')}.`);
      sh = `out${idx}`;
    }
    const key = `${src.id}|${sh}|${dst.id}|${th}`;
    if (seen.has(key)) { warnings.push(`${at}: duplicate connection ignored.`); return; }
    seen.add(key);
    edges.push({ id: typeof raw.id === 'string' && raw.id ? raw.id : th ? `sub-${src.id}` : `e_${src.id}_${sh}_${dst.id}`, source: src.id, target: dst.id, sourceHandle: sh, targetHandle: th });
  });

  // The engine rejects loops, so reject them here too (Kahn on main-flow edges).
  const main = edges.filter((e) => !e.targetHandle);
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  main.forEach((e) => indeg.set(e.target, (indeg.get(e.target) || 0) + 1));
  const q = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let done = 0;
  while (q.length) {
    const id = q.shift()!; done++;
    for (const e of main) if (e.source === id) { indeg.set(e.target, indeg.get(e.target)! - 1); if (indeg.get(e.target) === 0) q.push(e.target); }
  }
  if (done !== nodes.length) errors.push('The connections form a loop. Loops are not supported.');

  // Agents need a model.
  for (const n of nodes) {
    if (n.type === 'agent' && !edges.some((e) => e.target === n.id && e.targetHandle === 'model')) {
      warnings.push(`"${n.name}" has no Chat Model sub-node yet. Add an lmchat node and connect it with targetHandle "model".`);
    }
  }
  if (!nodes.some((n) => getDef(n.type)?.group === 'trigger')) warnings.push('There is no trigger node yet. Add one (for example "manual" or "webhook") before running.');

  if (errors.length) throw new ApiError(400, `Invalid workflow:\n- ${errors.slice(0, 15).join('\n- ')}${errors.length > 15 ? `\n- …and ${errors.length - 15} more` : ''}`, 'invalid_workflow');
  return { nodes, edges, warnings };
}
