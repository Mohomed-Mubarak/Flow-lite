import { openapi } from '@/lib/openapi';
import { baseUrl } from '@/lib/service';
import { CORS, preflight } from '@/lib/v1';

export const dynamic = 'force-dynamic';

// Public on purpose: it only describes the API. Every call still needs a key.
export const GET = (req: Request) => Response.json(openapi(baseUrl(req)), { headers: CORS });
export const OPTIONS = preflight;
