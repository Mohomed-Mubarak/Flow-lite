import { v1, preflight } from '@/lib/v1';
import { listExecutions } from '@/lib/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/executions?workflowId=&status=success|error|running&limit=20
export const GET = v1('read', async ({ url }) => listExecutions({
  workflowId: url.searchParams.get('workflowId') || undefined,
  status: url.searchParams.get('status') || undefined,
  limit: Number(url.searchParams.get('limit')) || undefined,
}));
export const OPTIONS = preflight;
