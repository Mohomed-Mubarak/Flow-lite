import vm from 'node:vm';
import type { Item } from '../types';
import { nodeProxy, type Scope } from '../expr';
import { CREDENTIAL_TYPES } from './catalog';
import { agentRun } from './agent';
import { telegramAction } from './telegramOps';
import { compare } from './util';
import { extraRunners } from './extra';

/** A sub-node plugged into an agent socket. */
export type Sub = { type: string; name: string; params: Record<string, any>; cred: Record<string, any> | null };
export type Subs = { model?: Sub; memory?: Sub; tools: Sub[] };

export type Ctx = {
  items: Item[];
  workflowId?: string;
  /** Sub-nodes plugged into this node (agents only). */
  subs: Subs;
  /** Expression scope for item i. */
  scope: (i: number) => Scope;
  /** Raw param (no expression resolution). */
  raw: (name: string) => any;
  /** Param with {{ }} resolved for item i. */
  param: (name: string, i?: number) => any;
  /** JSON param parsed, then resolved for item i. */
  json: (name: string, i?: number) => any;
  cred: Record<string, any> | null;
};
export type Runner = (c: Ctx) => Promise<Item[][]>;

const pass: Runner = async (c) => [c.items];

function getPath(obj: any, path: string): any {
  return path.split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
const toItem = (v: any): Item => ({ json: v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v } });

async function request(url: string, init: RequestInit, label: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const postJson = (url: string, headers: Record<string, string>, body: unknown, label: string) =>
  request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }, label);

function need(c: Ctx, key: string, what: string): string {
  const v = c.cred?.[key];
  if (!v) throw new Error(`Select a ${what} credential on this node`);
  return v;
}

export const runners: Record<string, Runner> = {
  manual: pass,
  webhook: pass,
  schedule: pass,
  merge: pass,
  interval: pass,
  form: pass,
  telegramTrigger: pass,
  github: pass,
  stripeTrigger: pass,
  chatTrigger: pass,

  async http(c) {
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const method = String(c.param('method', i) || 'GET');
      let url = String(c.param('url', i) || '');
      if (!/^https?:\/\//.test(url)) throw new Error('URL must start with http:// or https://');
      const headers: Record<string, string> = { ...(c.json('headers', i) || {}) };
      const query = c.json('query', i) || {};
      if (Object.keys(query).length) {
        const u = new URL(url);
        for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
        url = u.toString();
      }
      const cr = c.cred;
      if (cr?.type === 'httpBearer') headers.Authorization = `Bearer ${cr.token}`;
      if (cr?.type === 'httpBasic') headers.Authorization = 'Basic ' + Buffer.from(`${cr.user}:${cr.password}`).toString('base64');
      if (cr?.type === 'httpHeader') headers[cr.name] = cr.value;
      const b = c.json('body', i);
      const hasBody = b !== undefined && !['GET', 'HEAD'].includes(method);
      if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
      const res = await fetch(url, {
        method, headers,
        body: hasBody ? (typeof b === 'string' ? b : JSON.stringify(b)) : undefined,
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      let data: any = text;
      try { data = JSON.parse(text); } catch {}
      if (!res.ok && c.raw('failOnError') !== false) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      out.push({ json: { status: res.status, ok: res.ok, data } });
    }
    return [out];
  },

  async set(c) {
    const keep = c.raw('keepOnlySet') === true;
    return [c.items.map((it, i) => {
      const vals = c.json('values', i);
      if (vals === undefined || typeof vals !== 'object' || Array.isArray(vals)) throw new Error('Fields must be a JSON object');
      return { json: keep ? vals : { ...it.json, ...vals } };
    })];
  },

  async code(c) {
    const code = String(c.raw('code') || '');
    const each = String(c.raw('mode') || '').includes('each');
    const run = async (i: number): Promise<any> => {
      const sc = c.scope(i);
      const all = c.items;
      const sandbox = {
        items: all.map((x) => x.json), // kept for older workflows
        $input: { all: () => all.map((x) => ({ json: x.json })), first: () => all[0] && { json: all[0].json }, last: () => all.at(-1) && { json: all.at(-1)!.json }, item: { json: all[i]?.json ?? {} } },
        $json: all[i]?.json ?? {},
        $node: nodeProxy(sc.nodes),
        $index: i,
        $now: new Date().toISOString(),
        console: { log() {} }, JSON, Math, Date, fetch,
      };
      try {
        const p = vm.runInNewContext(`(async () => {\n${code}\n})()`, sandbox, { timeout: 5000 });
        const r = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Code timed out after 25s')), 25000))]);
        return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
      } catch (e: any) {
        throw new Error(`Code error${each ? ` (item ${i})` : ''}: ${e.message}`);
      }
    };
    // Accepts {a:1} or {json:{a:1}} (the n8n shape).
    const unwrap = (v: any): Item => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && v.json && typeof v.json === 'object' ? { json: v.json } : toItem(v));

    if (each) {
      const out: Item[] = [];
      for (let i = 0; i < c.items.length; i++) {
        const r = await run(i);
        if (r == null) continue;
        if (typeof r !== 'object' || Array.isArray(r)) throw new Error(`Code error (item ${i}): return one object, or null to drop the item`);
        out.push(unwrap(r));
      }
      return [out];
    }
    const r = await run(0);
    return [r === undefined || r === null ? [] : (Array.isArray(r) ? r : [r]).map(unwrap)];
  },

  async split(c) {
    const field = String(c.raw('field') || '');
    const out: Item[] = [];
    for (const it of c.items) {
      const arr = getPath(it.json, field);
      if (!Array.isArray(arr)) throw new Error(`"${field}" is not an array`);
      out.push(...arr.map(toItem));
    }
    return [out];
  },

  async aggregate(c) {
    return [[{ json: { [String(c.raw('field') || 'data')]: c.items.map((i) => i.json) } }]];
  },

  async limit(c) {
    return [c.items.slice(0, Math.max(0, Number(c.raw('max')) || 0))];
  },

  async if(c) {
    const t: Item[] = [];
    const f: Item[] = [];
    c.items.forEach((it, i) => {
      (compare(c.param('value1', i), String(c.raw('operation')), c.param('value2', i)) ? t : f).push(it);
    });
    return [t, f];
  },

  async filter(c) {
    return [c.items.filter((_, i) => compare(c.param('value1', i), String(c.raw('operation')), c.param('value2', i)))];
  },

  async wait(c) {
    const s = Math.min(20, Math.max(0, Number(c.raw('seconds')) || 0));
    await new Promise((r) => setTimeout(r, s * 1000));
    return [c.items];
  },

  async slack(c) {
    const url = need(c, 'webhookUrl', 'Slack');
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      await postJson(url, {}, { text: String(c.param('text', i)) }, 'Slack');
      out.push({ json: { ok: true } });
    }
    return [out];
  },

  async discord(c) {
    const url = need(c, 'webhookUrl', 'Discord');
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      await postJson(url, {}, { content: String(c.param('content', i)).slice(0, 2000) }, 'Discord');
      out.push({ json: { ok: true } });
    }
    return [out];
  },

  async telegram(c) {
    const token = need(c, 'botToken', 'Telegram').trim();
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      try {
        out.push({ json: await telegramAction(c, token, i) });
      } catch (e: any) {
        const m = String(e.message);
        const chatId = c.param('chatId', i);
        if (m.includes(' 401')) throw new Error(`${m}. The bot token is wrong. Copy it again from @BotFather.`);
        if (m.includes('chat not found')) throw new Error(`${m}. Chat ID ${chatId} is not a real chat with your bot.${String(chatId) === '12345' ? ' 12345 is the editor test value. Send your bot a real message and use that chat ID.' : ' Open your bot in Telegram and press Start first.'}`);
        if (m.includes(' 403')) throw new Error(`${m}. The user blocked the bot or never pressed Start.`);
        throw e;
      }
    }
    return [out];
  },

  async email(c) {
    const key = need(c, 'apiKey', 'Resend');
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const r = await postJson('https://api.resend.com/emails', { Authorization: `Bearer ${key}` }, {
        from: c.param('from', i), to: String(c.param('to', i)).split(',').map((s) => s.trim()),
        subject: c.param('subject', i), html: c.param('html', i),
      }, 'Resend');
      out.push({ json: { id: r?.id } });
    }
    return [out];
  },

  agent: agentRun,
  aichat: async (c) => aiRun(c, false),
  aiextract: async (c) => aiRun(c, true),
  openai: async (c) => aiRun(c, false),
  anthropic: async (c) => aiRun(c, false),
  ...extraRunners,
};

// ---- AI ----
type AiOpts = { model: string; system: string; prompt: string; temperature?: number; maxTokens?: number };

async function aiComplete(cred: Record<string, any> | null, o: AiOpts): Promise<string> {
  if (!cred) throw new Error('Select an AI credential on this node');
  const def = CREDENTIAL_TYPES.find((t) => t.type === cred.type);
  const model = o.model || def?.models?.[0];
  if (!model) throw new Error('Enter a model name');
  const label = def?.label || 'AI';
  if (cred.type === 'anthropic') {
    const r = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': cred.apiKey, 'anthropic-version': '2023-06-01' }, {
      model, max_tokens: o.maxTokens || 1024,
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      ...(o.system ? { system: o.system } : {}),
      messages: [{ role: 'user', content: o.prompt }],
    }, label);
    return (r?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }
  // Everything else speaks the OpenAI chat-completions format.
  const base = String(cred.baseUrl || def?.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('This credential has no base URL');
  const r = await postJson(`${base}/chat/completions`, cred.apiKey ? { Authorization: `Bearer ${cred.apiKey}` } : {}, {
    model,
    messages: [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content: o.prompt }],
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
    ...(o.maxTokens && cred.type !== 'openai' ? { max_tokens: o.maxTokens } : {}),
  }, label);
  return r?.choices?.[0]?.message?.content ?? '';
}

const optNum = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? undefined : Number(v));

function parseJsonLoose(text: string): any {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  try { return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t); } catch {
    throw new Error('Model did not return valid JSON: ' + text.slice(0, 200));
  }
}

async function aiRun(c: Ctx, extract: boolean): Promise<Item[][]> {
  const out: Item[] = [];
  for (let i = 0; i < c.items.length; i++) {
    const model = String(c.param('model', i) || '');
    if (extract) {
      const shape = JSON.stringify(c.json('schema', i) ?? {});
      const system = `${c.param('instructions', i)}\nReturn ONLY one JSON object shaped like this, with no other text: ${shape}`;
      const text = await aiComplete(c.cred, { model, system, prompt: String(c.param('text', i)), temperature: 0 });
      out.push({ json: parseJsonLoose(text) });
    } else {
      const text = await aiComplete(c.cred, {
        model, system: String(c.param('system', i) || ''), prompt: String(c.param('prompt', i)),
        temperature: optNum(c.raw('temperature')), maxTokens: optNum(c.raw('maxTokens')),
      });
      out.push({ json: { text, model: model || c.cred?.type } });
    }
  }
  return [out];
}
