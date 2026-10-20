import { after } from 'next/server';
import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { executeAndStore } from '@/lib/run';
import { HOOK_TYPES, cleanPath, hookMethod, shapeHook } from '@/lib/triggers';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Telegram retries slow or failing webhooks, which sends the same message twice. Remember recent update ids.
const seen = new Map<string, number>();
function firstTime(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 10 * 60_000) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

async function handle(req: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const { data } = await db().from('workflows').select('*');
  const matches: { w: any; n: WFNode }[] = [];
  for (const w of data || []) {
    const n = (w.nodes as WFNode[]).find((x) => HOOK_TYPES.includes(x.type) && cleanPath(x.params.path) === path && hookMethod(x) === req.method);
    if (n) matches.push({ w, n });
  }
  const hit = matches.find((m) => m.w.active) ?? matches[0];
  if (!hit) return Response.json({ error: 'No workflow uses this path' }, { status: 404 });
  const wf = hit.w;
  const node: WFNode = hit.n;

  // "Listen for message" in the editor: capture one real event for the node's Output, even if inactive.
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: wait } = await db().from('executions').select('id').eq('workflow_id', wf.id).eq('mode', 'listen')
    .eq('status', 'waiting').gte('started_at', since).limit(1);
  const listenId: string | undefined = wait?.[0]?.id;
  if (!wf.active && !listenId) {
    return Response.json({ error: 'This workflow is not Active. Turn Active on in the editor.' }, { status: 404 });
  }

  const raw = req.method === 'GET' ? '' : await req.text();
  let body: any = raw || null;
  if (raw && (node.type !== 'webhook' || (req.headers.get('content-type') || '').includes('json'))) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }

  const shaped = await shapeHook(node, req, raw, body);
  if ('error' in shaped) return Response.json({ error: shaped.error }, { status: shaped.status });
  if ('skip' in shaped) return Response.json({ ok: true, skipped: true });
  if (listenId) {
    await db().from('executions').update({ status: 'success', data: { item: shaped.item, nodeId: node.id }, finished_at: new Date().toISOString() }).eq('id', listenId);
    return Response.json({ ok: true, captured: true });
  }

  if (node.type === 'telegramTrigger') {
    // Answer Telegram at once and run the workflow afterwards. Slow replies make Telegram retry.
    const uid = (body as any)?.update_id;
    if (uid != null && !firstTime(`${path}:${uid}`)) return Response.json({ ok: true, duplicate: true });
    const item = shaped.item;
    after(async () => {
      try { await executeAndStore(wf, { startNodeId: node!.id, triggerItems: [item], mode: 'webhook' }); }
      catch (e) { console.error('[telegram] workflow failed:', e); }
    });
    return Response.json({ ok: true });
  }

  const res = await executeAndStore(wf, { startNodeId: node.id, triggerItems: [shaped.item], mode: 'webhook' });
  if (res.status === 'error') return Response.json({ error: res.error, executionId: res.executionId }, { status: 500 });
  if (node.type === 'webhook' && node.params.response === 'lastNode') return Response.json(res.last?.[0]?.json ?? {});
  return Response.json({ ok: true, executionId: res.executionId });
}

const h = guard(handle);
export { h as GET, h as POST, h as PUT, h as PATCH, h as DELETE };
