import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { norm } from '@/lib/service';

export const dynamic = 'force-dynamic';

async function _GET(req: Request) {
  const wf = new URL(req.url).searchParams.get('workflow');
  let q = db().from('executions').select('*').neq('mode', 'listen').order('started_at', { ascending: false }).limit(30);
  if (wf) q = q.eq('workflow_id', wf);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data || []).map(norm));
}

export const GET = guard(_GET);
