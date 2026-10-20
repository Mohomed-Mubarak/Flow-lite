import { v1, preflight } from '@/lib/v1';
import { createWorkflow, listWorkflows } from '@/lib/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/workflows?active=true|false
export const GET = v1('read', async ({ c, url }) => {
  const a = url.searchParams.get('active');
  return listWorkflows(c, { active: a === 'true' ? true : a === 'false' ? false : undefined });
});

// POST /api/v1/workflows  { name?, nodes?, edges?, active? }
export const POST = v1('full', async ({ c, body }) => Response.json(await createWorkflow(c, await body()), { status: 201 }));
export const OPTIONS = preflight;
