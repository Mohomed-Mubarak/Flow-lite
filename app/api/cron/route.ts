import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { executeAndStore } from '@/lib/run';
import { cronMatches } from '@/lib/cron';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Call every minute (Vercel Cron on Pro, or an external pinger) with: Authorization: Bearer $CRON_SECRET
async function _GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });

  const now = new Date();
  const { data } = await db().from('workflows').select('*').eq('active', true);
  const jobs: Promise<unknown>[] = [];
  for (const w of data || []) {
    for (const n of w.nodes as WFNode[]) {
      if (n.type === 'schedule' && cronMatches(String(n.params.cron || '* * * * *'), now)) {
        jobs.push(executeAndStore(w, { startNodeId: n.id, mode: 'schedule' }));
      }
      if (n.type === 'interval') {
        const ms = Math.max(1, Number(n.params.minutes) || 5) * 60000;
        const { data: last } = await db().from('executions').select('started_at')
          .eq('workflow_id', w.id).eq('mode', 'interval').order('started_at', { ascending: false }).limit(1);
        // 30s slack so pinger jitter does not skip a run.
        if (!last?.length || now.getTime() - new Date(last[0].started_at).getTime() >= ms - 30000) {
          jobs.push(executeAndStore(w, { startNodeId: n.id, mode: 'interval' }));
        }
      }
    }
  }
  await Promise.allSettled(jobs);
  return Response.json({ ran: jobs.length, at: now.toISOString() });
}
export const GET = guard(_GET);
