import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function _GET() {
  const { data, error } = await db().from('workflows').select('id,name,active,updated_at').order('updated_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

async function _POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const nodes = [{ id: 'trigger', type: 'manual', name: 'Manual Trigger', position: { x: 80, y: 140 }, params: {} }];
  const { data, error } = await db().from('workflows').insert({ name: b.name || 'Untitled workflow', nodes, edges: [] }).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export const GET = guard(_GET);
export const POST = guard(_POST);
