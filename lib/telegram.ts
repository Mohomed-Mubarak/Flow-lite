import { createHash } from 'node:crypto';
import { loadCredential } from './credentials';
import type { WFNode } from './types';

const API = 'https://api.telegram.org';

/** Secret Telegram echoes back on every update. Derived from the bot token, so you never type one. */
export function telegramSecret(botToken: string): string {
  const key = process.env.ENCRYPTION_KEY || '';
  return createHash('sha256').update(`flowlite-tg:${botToken}:${key}`).digest('hex');
}

const PRIVATE = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

/** Public https base URL Telegram can reach. */
export function publicBase(req: Request): { base?: string; error?: string } {
  const env = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '');
  let base = env;
  if (!base) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const proto = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    base = host ? `${proto}://${host}` : '';
  }
  let u: URL;
  try { u = new URL(base); } catch { return { error: 'Could not work out your public URL. Set PUBLIC_URL in .env.local.' }; }
  if (u.protocol !== 'https:' || PRIVATE.test(u.hostname)) {
    return {
      error:
        'Telegram can only call a public https address, and this one is ' + u.origin + '. ' +
        'On your laptop, start a tunnel (ngrok http 3000, or cloudflared tunnel --url http://localhost:3000), ' +
        'put the https address in PUBLIC_URL in .env.local, restart, then turn the workflow Active again. ' +
        'Or deploy to Vercel.',
    };
  }
  return { base: u.origin };
}

async function tg(token: string, method: string, body?: unknown) {
  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(15000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    if (r.status === 401) throw new Error('Telegram rejected the bot token (401). Copy it again from @BotFather.');
    throw new Error(`Telegram ${r.status}: ${j.description || 'request failed'}`);
  }
  return j.result;
}

async function botToken(node: WFNode): Promise<string> {
  if (!node.params.credential) throw new Error('Pick a Telegram bot credential on the Telegram Trigger.');
  const c = await loadCredential(node.params.credential);
  if (c.type !== 'telegram' || !c.botToken) throw new Error('Pick a "Telegram bot" credential (not a signing secret) on the Telegram Trigger.');
  return String(c.botToken).trim();
}

export async function registerTelegram(node: WFNode, base: string) {
  const token = await botToken(node);
  const url = `${base}/api/webhook/${String(node.params.path || 'telegram').replace(/^\/+|\/+$/g, '')}`;
  const allowed = String(node.params.updates || '').split(',').map((s) => s.trim()).filter(Boolean);
  const me = await tg(token, 'getMe');
  await tg(token, 'setWebhook', {
    url, secret_token: telegramSecret(token), max_connections: 10,
    ...(allowed.length ? { allowed_updates: allowed } : { allowed_updates: [] }),
  });
  return { bot: me?.username as string | undefined, url };
}

export async function removeTelegram(node: WFNode) {
  await tg(await botToken(node), 'deleteWebhook');
}

export async function telegramStatus(node: WFNode) {
  const token = await botToken(node);
  const i = await tg(token, 'getWebhookInfo');
  return {
    url: i.url as string, pending: i.pending_update_count as number,
    lastError: (i.last_error_message as string) || '', lastErrorAt: i.last_error_date ? new Date(i.last_error_date * 1000).toISOString() : '',
  };
}

/** Runs register/remove for every Telegram Trigger in a workflow. Never throws. */
export async function syncTelegram(nodes: WFNode[], active: boolean, req: Request) {
  const out: { node: string; ok: boolean; message: string }[] = [];
  for (const n of nodes.filter((x) => x.type === 'telegramTrigger')) {
    try {
      if (active) {
        const { base, error } = publicBase(req);
        if (error) { out.push({ node: n.name, ok: false, message: error }); continue; }
        const r = await registerTelegram(n, base!);
        out.push({ node: n.name, ok: true, message: `Webhook registered for @${r.bot || 'your bot'}` });
      } else {
        await removeTelegram(n);
        out.push({ node: n.name, ok: true, message: 'Telegram webhook removed' });
      }
    } catch (e: any) {
      out.push({ node: n.name, ok: false, message: e.message });
    }
  }
  return out;
}
