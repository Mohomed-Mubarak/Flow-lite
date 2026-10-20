// Server-only: Google OAuth with a refresh token (used by Gmail and Blogger).
import { api } from './extra';

const cache = new Map<string, { token: string; exp: number }>();

export async function googleOAuthToken(cred: Record<string, any> | null): Promise<string> {
  const id = String(cred?.clientId ?? '').trim(), secret = String(cred?.clientSecret ?? '').trim(), refresh = String(cred?.refreshToken ?? '').trim();
  if (!id || !secret || !refresh) throw new Error('Select a Google OAuth credential on this node (client ID, client secret and refresh token).');
  const key = `${id}|${refresh}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  try {
    const r = await api('Google', 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: refresh }),
    });
    cache.set(key, { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
    return r.access_token;
  } catch (e: any) {
    if (/invalid_grant/.test(e.message)) throw new Error('Google rejected the refresh token. It was revoked or expired. If your OAuth app is in "Testing" mode tokens last only 7 days: set Publishing status to "In production", then create a new refresh token.');
    if (/invalid_client|unauthorized_client/.test(e.message)) throw new Error('Google rejected the client ID or secret. Copy them again from Google Cloud, APIs & Services, Credentials.');
    throw e;
  }
}

/** Calls a Google API with the OAuth token. Explains a missing scope in plain words. */
export function oauthCall(label: string, cred: Record<string, any> | null, scopeHint: string) {
  return async (method: string, url: string, body?: unknown) => {
    const token = await googleOAuthToken(cred);
    try {
      return await api(label, url, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
    } catch (e: any) {
      if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT|PERMISSION_DENIED/i.test(e.message)) throw new Error(`${e.message}. The refresh token does not include the ${scopeHint} permission. Create a new one with that scope selected, and turn the API on in Google Cloud.`);
      throw e;
    }
  };
}
