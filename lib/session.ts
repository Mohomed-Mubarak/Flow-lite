// Signed session cookie. Uses Web Crypto so it works in the proxy and in route handlers.
export const SESSION_COOKIE = 'flowlite_session';
export const SESSION_TTL = 7 * 24 * 60 * 60; // seconds

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (!s) throw new Error('Set SESSION_SECRET (or ENCRYPTION_KEY) to sign login sessions');
  return `flowlite-session:${s}`;
}

async function sign(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** "<expiry unix seconds>.<signature>" */
export async function createSession(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL);
  return `${exp}.${await sign(exp)}`;
}

export async function verifySession(token?: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !(Number(exp) > Date.now() / 1000)) return false;
    const want = await sign(exp);
    if (want.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
