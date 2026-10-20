import { guard } from '@/lib/api';
import { deleteApiKey } from '@/lib/apiKeys';

export const dynamic = 'force-dynamic';

async function _DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await deleteApiKey((await ctx.params).id);
  return Response.json({ ok: true });
}
export const DELETE = guard(_DELETE);
