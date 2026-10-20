import { v1, preflight } from '@/lib/v1';
import { getExecution } from '@/lib/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/executions/{id}?full=true  (full adds every node's input and output)
export const GET = v1('read', async ({ params, url }) => getExecution(params.id, { full: url.searchParams.get('full') === 'true' }));
export const OPTIONS = preflight;
