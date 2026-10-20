import { v1, preflight } from '@/lib/v1';
import { listCredentials } from '@/lib/service';

export const dynamic = 'force-dynamic';

// Names, types and ids only. Secrets never leave the server. Use an id as a node's params.credential.
export const GET = v1('read', async () => listCredentials());
export const OPTIONS = preflight;
