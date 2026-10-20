import { v1, preflight } from '@/lib/v1';
import { setActive } from '@/lib/service';

export const dynamic = 'force-dynamic';
export const POST = v1('full', async ({ c, params }) => setActive(c, params.id, true));
export const OPTIONS = preflight;
