import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { cleanPath } from '@/lib/triggers';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Public: returns only the form's display settings.
async function _GET(_: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const { data } = await db().from('workflows').select('nodes').eq('active', true);
  for (const w of data || []) {
    const n = (w.nodes as WFNode[]).find((x) => x.type === 'form' && cleanPath(x.params.path) === path);
    if (!n) continue;
    let fields: any[] = [];
    try { fields = JSON.parse(String(n.params.fields || '[]')); } catch {}
    const p = n.params;
    return Response.json({ title: p.title || 'Form', description: p.description || '', fields, button: p.button || 'Submit', thanks: p.thanks || 'Thanks!' });
  }
  return Response.json({ error: 'This form is not available' }, { status: 404 });
}
export const GET = guard(_GET);
