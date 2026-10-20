import { v1, preflight } from '@/lib/v1';
import { describeNodeType } from '@/lib/service';

export const dynamic = 'force-dynamic';
export const GET = v1('read', async ({ params }) => describeNodeType(decodeURIComponent(params.type)));
export const OPTIONS = preflight;
