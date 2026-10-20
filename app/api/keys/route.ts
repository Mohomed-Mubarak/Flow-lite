import { guard } from '@/lib/api';
import { SCOPES, createApiKey, listApiKeys, type Scope } from '@/lib/apiKeys';

export const dynamic = 'force-dynamic';

// Behind the admin login (the proxy checks the session cookie). The full key is returned once, on create.
async function _GET() {
  return Response.json(await listApiKeys());
}

async function _POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return Response.json({ error: 'Give the key a name, for example "n8n".' }, { status: 400 });
  if (!SCOPES.includes(b.scope)) return Response.json({ error: 'scope must be read, run or full' }, { status: 400 });
  const days = Number(b.expiresInDays);
  return Response.json(await createApiKey(name, b.scope as Scope, Number.isFinite(days) && days > 0 ? days : undefined));
}

export const GET = guard(_GET);
export const POST = guard(_POST);
