// Server-only. API keys for external agents. The key is shown once; only its SHA-256 hash is stored.
import { createHash, randomBytes } from 'node:crypto';
import { db } from './supabase';
import { ApiError } from './apiError';

/** read: list and inspect. run: read + start workflows. full: also create, edit, activate and delete workflows. */
export type Scope = 'read' | 'run' | 'full';
export const SCOPES: Scope[] = ['read', 'run', 'full'];
const RANK: Record<Scope, number> = { read: 1, run: 2, full: 3 };
export const hasScope = (have: Scope, need: Scope) => RANK[have] >= RANK[need];

export type KeyInfo = { id: string; name: string; scope: Scope };

const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');

export async function createApiKey(name: string, scope: Scope, expiresInDays?: number) {
  const raw = `fl_${randomBytes(32).toString('base64url')}`;
  const expires_at = expiresInDays && expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null;
  const { data, error } = await db().from('api_keys')
    .insert({ name, scope, key_hash: hashKey(raw), prefix: raw.slice(0, 10), expires_at })
    .select('id,name,scope,prefix,created_at,expires_at').single();
  if (error) throw new Error(error.message);
  return { ...data, key: raw };
}

export async function listApiKeys() {
  const { data, error } = await db().from('api_keys').select('id,name,scope,prefix,created_at,last_used_at,expires_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteApiKey(id: string) {
  const { error } = await db().from('api_keys').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Reads "Authorization: Bearer fl_..." or "X-API-Key: fl_...". Throws ApiError(401) when missing, wrong or expired. */
export async function authenticate(req: Request): Promise<KeyInfo> {
  const auth = req.headers.get('authorization') || '';
  const token = (/^Bearer\s+(.+)$/i.exec(auth)?.[1] || req.headers.get('x-api-key') || '').trim();
  if (!token) throw new ApiError(401, 'Missing API key. Send "Authorization: Bearer <key>" or "X-API-Key: <key>".', 'unauthorized');
  if (!token.startsWith('fl_')) throw new ApiError(401, 'Invalid API key.', 'unauthorized');
  const { data } = await db().from('api_keys').select('id,name,scope,last_used_at,expires_at').eq('key_hash', hashKey(token)).maybeSingle();
  if (!data) throw new ApiError(401, 'Invalid API key.', 'unauthorized');
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new ApiError(401, 'This API key has expired.', 'unauthorized');
  // Record use at most once a minute, without slowing the request down.
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    void db().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {});
  }
  return { id: data.id, name: data.name, scope: data.scope as Scope };
}

export function requireScope(key: KeyInfo, need: Scope) {
  if (!hasScope(key.scope, need)) throw new ApiError(403, `This API key has "${key.scope}" access. "${need}" access is needed for this.`, 'forbidden');
}
