import { v1, preflight } from '@/lib/v1';
import { listNodeTypes } from '@/lib/service';

export const dynamic = 'force-dynamic';

// GET /api/v1/node-types?group=trigger|logic|data|app|ai|sub&search=text
export const GET = v1('read', async ({ url }) => listNodeTypes({ group: url.searchParams.get('group') || undefined, search: url.searchParams.get('search') || undefined }));
export const OPTIONS = preflight;
