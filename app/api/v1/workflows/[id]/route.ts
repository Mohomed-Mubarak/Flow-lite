import { v1, preflight } from '@/lib/v1';
import { deleteWorkflow, getWorkflow, updateWorkflow } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = v1('read', async ({ c, params }) => getWorkflow(c, params.id));
// PUT or PATCH { name?, nodes?, edges? }. Send only what changes. Use /activate to switch it on.
const update = v1('full', async ({ c, params, body }) => updateWorkflow(c, params.id, await body()));
export const PUT = update;
export const PATCH = update;
export const DELETE = v1('full', async ({ c, params }) => deleteWorkflow(c, params.id));
export const OPTIONS = preflight;
