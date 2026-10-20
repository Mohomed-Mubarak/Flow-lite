import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';

async function _DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await db().from('credentials').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export const DELETE = guard(_DELETE);
