import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { publicBase, registerTelegram, removeTelegram, telegramStatus } from '@/lib/telegram';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Body: { nodeId, action: 'register' | 'status' | 'remove' | 'listen' | 'poll' }. Uses the SAVED workflow.
// listen: wait up to 5 minutes for the next real Telegram message. poll: fetch it once it arrives.
async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const { data } = await db().from('workflows').select('nodes').eq('id', id).single();
  const node = (data?.nodes as WFNode[] | undefined)?.find((n) => n.id === b.nodeId && n.type === 'telegramTrigger');
  if (!node) return Response.json({ error: 'Save the workflow first, then try again.' }, { status: 404 });
  if (b.action === 'status') return Response.json(await telegramStatus(node));
  if (b.action === 'poll') {
    const { data: row } = await db().from('executions').select('id,status,data').eq('workflow_id', id).eq('mode', 'listen')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (row?.status === 'success') {
      await db().from('executions').delete().eq('id', row.id);
      return Response.json({ status: 'success', item: row.data?.item });
    }
    return Response.json({ status: row ? 'waiting' : 'none' });
  }
  if (b.action === 'listen') {
    const { base, error } = publicBase(req);
    if (error) return Response.json({ error }, { status: 400 });
    const reg = await registerTelegram(node, base!);
    await db().from('executions').delete().eq('workflow_id', id).eq('mode', 'listen');
    const { data: wf } = await db().from('workflows').select('name').eq('id', id).single();
    const { error: e } = await db().from('executions').insert({ workflow_id: id, workflow_name: wf?.name || 'Workflow', status: 'waiting', mode: 'listen' });
    if (e) return Response.json({ error: e.message }, { status: 500 });
    return Response.json({ ok: true, ...reg });
  }
  if (b.action === 'remove') { await removeTelegram(node); return Response.json({ ok: true }); }
  const { base, error } = publicBase(req);
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json({ ok: true, ...(await registerTelegram(node, base!)) });
}
export const POST = guard(_POST);
