import { guard } from '@/lib/api';
import { loadCredential } from '@/lib/credentials';
import { CREDENTIAL_TYPES } from '@/lib/nodes/catalog';

export const dynamic = 'force-dynamic';

// Lists the models a provider offers, so you always see current (and free) ones.
async function _GET(req: Request) {
  const id = new URL(req.url).searchParams.get('credential');
  if (!id) return Response.json({ error: 'credential is required' }, { status: 400 });
  const cred = await loadCredential(id);
  const def = CREDENTIAL_TYPES.find((t) => t.type === cred.type);
  let url: string;
  const headers: Record<string, string> = {};
  if (cred.type === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models?limit=100';
    headers['x-api-key'] = cred.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    const base = String(cred.baseUrl || def?.baseUrl || '').replace(/\/+$/, '');
    if (!base) return Response.json({ error: 'This credential has no base URL' }, { status: 400 });
    url = `${base}/models`;
    if (cred.apiKey) headers.Authorization = `Bearer ${cred.apiKey}`;
  }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!r.ok) return Response.json({ error: `${def?.label || 'Provider'} ${r.status}: ${text.slice(0, 200)}` }, { status: 502 });
  const json = JSON.parse(text);
  const list: any[] = json.data || json.models || [];
  const ids = list.map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean).sort();
  const free = cred.type === 'openrouter'
    ? list.filter((m) => m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0).map((m) => String(m.id)).sort()
    : [];
  return Response.json({ models: ids, free });
}
export const GET = guard(_GET);
