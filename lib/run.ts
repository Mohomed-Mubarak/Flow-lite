import { db } from './supabase';
import { runWorkflow } from './engine';
import { getDef } from './nodes/catalog';
import type { ExecResult, Item, WFEdge, WFNode } from './types';

type Wf = { id: string; name: string; nodes: WFNode[]; edges: WFEdge[] };

function trim(res: ExecResult) {
  const results = Object.fromEntries(
    Object.entries(res.results).map(([id, r]) => [id, { ...r, outputs: r.outputs.map((o) => o.slice(0, 20)) }])
  );
  return { results, order: res.order };
}

/** Runs a workflow and records the execution. Never throws. */
export async function executeAndStore(wf: Wf, o: { startNodeId?: string; triggerItems?: Item[]; mode: string; /** Finish a row that was inserted earlier as "running" instead of adding a new one. */ executionId?: string }) {
  const started = new Date().toISOString();
  const start = wf.nodes.find((n) => n.id === o.startNodeId) ?? wf.nodes.find((n) => getDef(n.type)?.group === 'trigger');
  let triggerItems = o.triggerItems;
  if (!triggerItems && o.mode === 'manual' && start && getDef(start.type)?.hook) {
    try { triggerItems = [{ json: JSON.parse(String(start.params.sample || '')) }]; } catch {}
  }
  let res: ExecResult;
  try {
    res = await runWorkflow({ nodes: wf.nodes, edges: wf.edges, startNodeId: start?.id, triggerItems, workflowId: wf.id });
  } catch (e: any) {
    res = { status: 'error', error: e.message, results: {}, order: [] };
  }
  const row = {
    workflow_id: wf.id, workflow_name: wf.name, status: res.status, mode: o.mode,
    error: res.error ?? null, data: trim(res), started_at: started, finished_at: new Date().toISOString(),
  };
  if (o.executionId) {
    const { started_at: _keep, ...patch } = row;
    await db().from('executions').update(patch).eq('id', o.executionId);
    return { ...res, executionId: o.executionId };
  }
  const { data } = await db().from('executions').insert(row).select('id').single();
  return { ...res, executionId: data?.id as string | undefined };
}
