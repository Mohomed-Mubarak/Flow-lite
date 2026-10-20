import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { executeAndStore } from '@/lib/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  let wf: any;
  if (Array.isArray(b.nodes)) {
    // Run the editor's unsaved graph.
    wf = { id, name: b.name || 'Workflow', nodes: b.nodes, edges: b.edges || [] };
  } else {
    wf = (await db().from('workflows').select('*').eq('id', id).single()).data;
  }
  if (!wf) return Response.json({ error: 'Workflow not found' }, { status: 404 });
  return Response.json(await executeAndStore(wf, { startNodeId: b.startNodeId, mode: 'manual' }));
}

export const POST = guard(_POST);
