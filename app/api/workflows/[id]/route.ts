import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { syncTelegram } from '@/lib/telegram';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }> };

async function _GET(_: Request, ctx: P) {
  const { id } = await ctx.params;
  const { data, error } = await db().from('workflows').select('*').eq('id', id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

async function _PUT(req: Request, ctx: P) {
  const { id } = await ctx.params;
  const b = await req.json();
  const before = 'active' in b ? (await db().from('workflows').select('active').eq('id', id).single()).data?.active : undefined;
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['name', 'active', 'nodes', 'edges']) if (k in b) patch[k] = b[k];
  const { data, error } = await db().from('workflows').update(patch).eq('id', id).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Activating registers Telegram webhooks. Deactivating removes them.
  let telegram: any[] | undefined;
  if ('active' in b && (b.active !== before || b.active === true)) telegram = await syncTelegram(data.nodes as WFNode[], !!b.active, req);
  return Response.json({ ...data, telegram });
}

async function _DELETE(req: Request, ctx: P) {
  const { id } = await ctx.params;
  const { data: wf } = await db().from('workflows').select('nodes,active').eq('id', id).single();
  if (wf?.active) await syncTelegram(wf.nodes as WFNode[], false, req);
  const { error } = await db().from('workflows').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export const GET = guard(_GET);
export const PUT = guard(_PUT);
export const DELETE = guard(_DELETE);
