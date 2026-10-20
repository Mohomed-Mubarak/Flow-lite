import { v1, preflight } from '@/lib/v1';
import { runWorkflowNow } from '@/lib/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/v1/workflows/{id}/run  { input?, wait?: true, startNodeId? }
// wait=true (default): returns { executionId, status, output, nodes }.
// wait=false: returns { executionId, status: "running" } at once. Poll GET /api/v1/executions/{executionId}.
export const POST = v1('run', async ({ c, params, body }) => {
  const b = await body();
  return runWorkflowNow(c, params.id, { input: b.input, wait: b.wait !== false, startNodeId: b.startNodeId });
});
export const OPTIONS = preflight;
