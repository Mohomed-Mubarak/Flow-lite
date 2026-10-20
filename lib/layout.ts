import { getDef, SLOT_IDS } from './nodes/catalog';

export type LNode = { id: string; type: string; x: number; y: number; w: number; h: number };
export type LEdge = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
export type Pos = Record<string, { x: number; y: number }>;

const GAP_X = 90;
const GAP_Y = 40;
const SUB_DROP = 70; // space between an agent and its sub-nodes
const isSlot = (e: LEdge) => !!e.targetHandle && (SLOT_IDS as string[]).includes(e.targetHandle);
const outIdx = (h?: string | null) => { const m = /^out(\d+)$/.exec(h || ''); return m ? Number(m[1]) : 0; };

/**
 * Tidy layout: columns left to right by flow depth, branches stacked in output order,
 * children centred on their parents, and agent sub-nodes placed under their sockets.
 */
export function tidyLayout(nodes: LNode[], edges: LEdge[]): Pos {
  const subs = nodes.filter((n) => getDef(n.type)?.slot);
  const main = nodes.filter((n) => !getDef(n.type)?.slot);
  const ids = new Set(main.map((n) => n.id));
  const flow = edges.filter((e) => !isSlot(e) && ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const byId = new Map(main.map((n) => [n.id, n]));

  // Sub-nodes grouped by the agent socket they plug into.
  const attached = new Map<string, Map<string, LNode[]>>();
  const placedSub = new Set<string>();
  for (const e of edges) {
    if (!isSlot(e) || !ids.has(e.target)) continue;
    const sub = subs.find((s) => s.id === e.source);
    if (!sub || placedSub.has(sub.id)) continue;
    placedSub.add(sub.id);
    const slots = attached.get(e.target) ?? new Map<string, LNode[]>();
    slots.set(e.targetHandle!, [...(slots.get(e.targetHandle!) ?? []), sub]);
    attached.set(e.target, slots);
  }
  const subRowH = (agent: string) => {
    const all = [...(attached.get(agent)?.values() ?? [])].flat();
    return all.length ? SUB_DROP + Math.max(...all.map((s) => s.h)) : 0;
  };

  // Layer = longest path from a start node. Nodes stuck in a loop go after their placed parents.
  const parents = new Map<string, LEdge[]>(main.map((n) => [n.id, []]));
  const children = new Map<string, LEdge[]>(main.map((n) => [n.id, []]));
  for (const e of flow) { parents.get(e.target)!.push(e); children.get(e.source)!.push(e); }
  const layer = new Map<string, number>();
  const indeg = new Map(main.map((n) => [n.id, parents.get(n.id)!.length]));
  const queue = main.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (const id of queue) layer.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of children.get(id)!) {
      layer.set(e.target, Math.max(layer.get(e.target) ?? 0, layer.get(id)! + 1));
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target) === 0) queue.push(e.target);
    }
  }
  for (const n of main) {
    if (layer.has(n.id)) continue;
    const ps = parents.get(n.id)!.map((e) => layer.get(e.source)).filter((v): v is number => v !== undefined);
    layer.set(n.id, ps.length ? Math.max(...ps) + 1 : 0);
  }

  const cols: LNode[][] = [];
  for (const n of [...main].sort((a, b) => a.y - b.y || a.x - b.x)) (cols[layer.get(n.id)!] ??= []).push(n);
  const order = new Map<string, number>();
  const reindex = () => cols.forEach((c) => c?.forEach((n, i) => order.set(n.id, i)));
  reindex();

  // Reduce crossings: sort each column by the average position of its neighbours.
  const sweep = (list: LNode[], link: (id: string) => number[]) => {
    const key = new Map(list.map((n) => { const k = link(n.id); return [n.id, k.length ? k.reduce((a, b) => a + b, 0) / k.length : order.get(n.id)!] as const; }));
    list.sort((a, b) => key.get(a.id)! - key.get(b.id)!);
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 1; c < cols.length; c++) if (cols[c]) { sweep(cols[c], (id) => parents.get(id)!.map((e) => order.get(e.source)! + outIdx(e.sourceHandle) * 0.01)); reindex(); }
    for (let c = cols.length - 2; c >= 0; c--) if (cols[c]) { sweep(cols[c], (id) => children.get(id)!.map((e) => order.get(e.target)!)); reindex(); }
  }

  // Coordinates.
  const out: Pos = {};
  const center = new Map<string, number>();
  let x = 0;
  for (const col of cols) {
    if (!col) continue;
    const width = Math.max(...col.map((n) => n.w));
    let bottom = -Infinity;
    for (const n of col) {
      const ps = parents.get(n.id)!;
      let want = bottom === -Infinity ? 0 : bottom + GAP_Y;
      if (ps.length) {
        const mid = ps.map((e) => {
          const p = byId.get(e.source)!;
          const outs = Math.max(getDef(p.type)?.outputs ?? 1, 1);
          return center.get(e.source)! + (outIdx(e.sourceHandle) - (outs - 1) / 2) * (n.h + GAP_Y);
        });
        want = Math.max(want, mid.reduce((a, b) => a + b, 0) / mid.length - n.h / 2);
      }
      const top = Math.max(want, bottom === -Infinity ? -Infinity : bottom + GAP_Y);
      out[n.id] = { x, y: top };
      center.set(n.id, top + n.h / 2);
      bottom = top + n.h + subRowH(n.id);
    }
    x += width + GAP_X;
  }
  const minY = Math.min(0, ...Object.values(out).map((p) => p.y));
  for (const p of Object.values(out)) { p.y = Math.round(p.y - minY + 60); p.x = Math.round(p.x + 60); }

  // Sub-nodes under their agent's sockets, like the editor places them when added.
  for (const [agentId, slotMap] of attached) {
    const agent = byId.get(agentId)!;
    const slots = getDef(agent.type)?.slots ?? [];
    for (const [slotId, list] of slotMap) {
      const k = Math.max(slots.findIndex((s) => s.id === slotId), 0);
      const mid = out[agentId].x + ((k + 0.5) / Math.max(slots.length, 1)) * agent.w;
      const total = list.reduce((a, s) => a + s.w, 0) + (list.length - 1) * 15;
      let sx = mid - total / 2;
      for (const s of list) { out[s.id] = { x: Math.round(sx), y: Math.round(out[agentId].y + agent.h + SUB_DROP) }; sx += s.w + 15; }
    }
  }
  // Sub-nodes plugged into nothing: one row at the bottom.
  const loose = subs.filter((s) => !placedSub.has(s.id));
  if (loose.length) {
    const lowest = Math.max(0, ...nodes.filter((n) => out[n.id]).map((n) => out[n.id].y + n.h));
    let lx = 60;
    for (const s of loose) { out[s.id] = { x: lx, y: Math.round(lowest + 100) }; lx += s.w + 15; }
  }
  return out;
}
