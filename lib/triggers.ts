import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadCredential } from './credentials';
import { telegramSecret } from './telegram';
import type { Item, WFNode } from './types';

export const HOOK_TYPES = ['webhook', 'form', 'telegramTrigger', 'github', 'stripeTrigger'];
export const hookMethod = (n: WFNode) => (n.type === 'webhook' ? String(n.params.method || 'POST') : 'POST');
export const cleanPath = (p: unknown) => String(p || '').replace(/^\/+|\/+$/g, '');

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');
const allowed = (list: unknown, v: string) => {
  const l = String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !l.length || l.includes(v);
};

const TG_UPDATES = ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query', 'inline_query', 'poll', 'pre_checkout_query', 'shipping_query'];

/** Turns a Telegram update into one flat item: updateType, text, chatId, from, plus the raw update. */
export function telegramItem(body: any): Item {
  const type = TG_UPDATES.find((k) => body?.[k] != null) ?? Object.keys(body ?? {}).find((k) => k !== 'update_id') ?? 'unknown';
  const u = body?.[type];
  const from = u?.from ?? null;
  const text =
    type === 'callback_query' ? u?.data
    : type === 'inline_query' ? u?.query
    : type === 'poll' ? u?.question
    : type === 'shipping_query' || type === 'pre_checkout_query' ? u?.invoice_payload
    : u?.text ?? u?.caption;
  const chatId = (type === 'callback_query' ? u?.message?.chat?.id : u?.chat?.id) ?? from?.id;
  const json: Record<string, any> = { updateType: type, update: body, text: text ?? '', chatId, from };
  const messageId = type === 'callback_query' ? u?.message?.message_id : u?.message_id;
  if (messageId != null) json.messageId = messageId;
  if (type === 'callback_query') { json.callbackQueryId = u?.id; json.data = u?.data; }
  if (type === 'inline_query' || type === 'shipping_query' || type === 'pre_checkout_query') json.queryId = u?.id;
  return { json };
}

export type Shaped = { item: Item } | { skip: true } | { status: number; error: string };

/** Verifies the request signature (when a secret is set) and shapes the trigger item. */
export async function shapeHook(node: WFNode, req: Request, raw: string, body: any): Promise<Shaped> {
  const h = (k: string) => req.headers.get(k) || '';
  const cred = node.params.credential ? await loadCredential(node.params.credential) : null;
  // Telegram bot credentials sign with a secret derived from the bot token. Others use the stored secret.
  const secret = cred ? String(cred.type === 'telegram' ? telegramSecret(String(cred.botToken || '').trim()) : cred.secret || '') : '';
  switch (node.type) {
    case 'github': {
      if (secret && !same(h('x-hub-signature-256'), 'sha256=' + hmac(secret, raw))) return { status: 401, error: 'Bad signature' };
      const event = h('x-github-event');
      if (!allowed(node.params.events, event)) return { skip: true };
      return { item: { json: { event, delivery: h('x-github-delivery'), body } } };
    }
    case 'stripeTrigger': {
      if (secret) {
        const parts = h('stripe-signature').split(',').map((s) => s.split('='));
        const t = parts.find((p) => p[0] === 't')?.[1] || '';
        const ok = parts.some((p) => p[0] === 'v1' && same(p[1] || '', hmac(secret, `${t}.${raw}`)));
        if (!ok || Math.abs(Date.now() / 1000 - Number(t)) > 300) return { status: 401, error: 'Bad signature' };
      }
      const type = String(body?.type || '');
      if (!allowed(node.params.events, type)) return { skip: true };
      return { item: { json: { type, id: body?.id, body } } };
    }
    case 'telegramTrigger': {
      if (secret && !same(h('x-telegram-bot-api-secret-token'), secret)) {
        return { status: 401, error: 'Bad secret token. Turn the workflow Inactive, then Active, to register the webhook again.' };
      }
      const item = telegramItem(body);
      // Older nodes have no "updates" setting: they accept everything. Empty list also means everything.
      if (!allowed(node.params.updates, String(item.json.updateType))) return { skip: true };
      return { item };
    }
    case 'form':
      return { item: { json: { fields: body?.fields ?? body ?? {} } } };
    default:
      return { item: { json: { body, query: Object.fromEntries(new URL(req.url).searchParams), headers: Object.fromEntries(req.headers), method: req.method } } };
  }
}
