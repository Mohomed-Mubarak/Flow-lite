import { v1, preflight } from '@/lib/v1';

export const dynamic = 'force-dynamic';

// Check that a key works and see what it may do.
export const GET = v1('read', async ({ key }) => ({ ok: true, key: { name: key.name, scope: key.scope } }));
export const OPTIONS = preflight;
