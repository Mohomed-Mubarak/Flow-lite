// Server-only runners for the extra core and app nodes.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Item } from '../types';
import type { Ctx, Runner } from './runners';
import { compare } from './util';

export const getPath = (obj: any, path: string): any => path.split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
export const str = (c: Ctx, n: string, i: number) => { const v = c.param(n, i); return v == null ? '' : String(v).trim(); };
export const need = (c: Ctx, key: string, what: string): string => {
  const v = c.cred?.[key];
  if (!v) throw new Error(`Select a ${what} credential on this node`);
  return String(v);
};
const SAFE = /^[A-Za-z0-9_.-]+$/;
export const requireSafe = (v: string, what: string) => { if (!SAFE.test(v)) throw new Error(`${what} is empty or has characters that are not allowed: "${v}"`); return v; };

export async function api(label: string, url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) }); }
  catch (e: any) { throw new Error(e?.name === 'TimeoutError' ? `${label} did not answer in time` : `${label}: ${e.message}`); }
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? (data.message || data.error?.message || data.error || JSON.stringify(data)) : text;
    throw new Error(`${label} ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return data;
}

/** Runs fn for each item and collects one output list. Arrays returned become several items. */
export const each = (fn: (c: Ctx, i: number) => Promise<any>): Runner => async (c) => {
  const out: Item[] = [];
  for (let i = 0; i < c.items.length; i++) {
    const r = await fn(c, i);
    for (const v of Array.isArray(r) ? r : [r]) out.push({ json: v && typeof v === 'object' ? v : { value: v } });
  }
  return [out];
};

// ---------- Dates ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UNIT_MS: Record<string, number> = { seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5, weeks: 6048e5 };

export function toDate(v: any): Date {
  if (v === '' || v == null) return new Date();
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return new Date(s.length <= 10 ? Number(s) * 1000 : Number(s));
  const d = new Date(s);
  if (isNaN(+d)) throw new Error(`"${s}" is not a date. Use a format like 2026-03-01 or 2026-03-01T10:30:00Z.`);
  return d;
}
function addUnit(d: Date, n: number, unit: string): Date {
  const r = new Date(d);
  if (unit === 'months' || unit === 'years') {
    // Jan 31 + 1 month is Feb 28 (not Mar 3): keep the day inside the target month.
    const day = r.getUTCDate();
    r.setUTCDate(1);
    r.setUTCMonth(r.getUTCMonth() + (unit === 'years' ? n * 12 : n));
    r.setUTCDate(Math.min(day, new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (UNIT_MS[unit]) r.setTime(r.getTime() + n * UNIT_MS[unit]);
  else throw new Error(`Unknown unit "${unit}"`);
  return r;
}
function formatDate(d: Date, f: string, tz: string): string {
  if (!f || f === 'ISO') return d.toISOString();
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d);
  } catch { throw new Error(`Unknown time zone "${tz}". Use a name like UTC or Europe/London.`); }
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const Y = g('year'), M = g('month'), D = g('day'), H = g('hour') % 24, m = g('minute'), s = g('second');
  const wd = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const tok: Record<string, string> = {
    yyyy: String(Y), yy: p2(Y % 100), MMMM: MONTHS[M - 1], MMM: MONTHS[M - 1].slice(0, 3), MM: p2(M), M: String(M),
    dd: p2(D), d: String(D), EEEE: DAYS[wd], EEE: DAYS[wd].slice(0, 3),
    HH: p2(H), H: String(H), hh: p2(H % 12 || 12), h: String(H % 12 || 12), mm: p2(m), ss: p2(s), SSS: String(d.getUTCMilliseconds()).padStart(3, '0'), a: H < 12 ? 'AM' : 'PM',
  };
  return f.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|SSS|a/g, (m, lit) => (lit !== undefined ? lit : tok[m]));
}
function diffUnits(a: Date, b: Date, unit: string): number {
  if (unit === 'months' || unit === 'years') {
    let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (months > 0 && b.getUTCDate() < a.getUTCDate()) months--; // not a full month yet
    if (months < 0 && b.getUTCDate() > a.getUTCDate()) months++;
    return Math.trunc(unit === 'years' ? months / 12 : months);
  }
  return Math.trunc((b.getTime() - a.getTime()) / UNIT_MS[unit]);
}

// ---------- RSS ----------
const unesc = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (x: string, name: string) => { const m = x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? unesc(m[1]) : undefined; };
const plain = (s?: string) => (s ? unesc(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined);

// ---------- Helpers for Summarize ----------
const num = (v: any) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')));

export const extraRunners: Record<string, Runner> = {
  noop: async (c) => [c.items],

  async stop(c) {
    throw new Error(String(c.param('message', 0) || 'Stopped by a Stop and Error node'));
  },

  async switch(c) {
    const outs: Item[][] = [[], [], [], [], []];
    const all = c.raw('allMatches') === true;
    c.items.forEach((it, i) => {
      let hit = false;
      for (let k = 1; k <= 4; k++) {
        const op = String(c.raw(`op${k}`) || 'equals');
        const val = c.param(`val${k}`, i);
        const blank = val == null || String(val) === '';
        if (blank && op !== 'isEmpty' && op !== 'isNotEmpty') continue; // rule not filled in
        if (compare(c.param('value1', i), op, val)) { outs[k - 1].push(it); hit = true; if (!all) break; }
      }
      if (!hit) outs[4].push(it);
    });
    return outs;
  },

  async sort(c) {
    const field = String(c.raw('field') || '');
    const desc = c.raw('order') === 'Descending';
    const kind = String(c.raw('type') || 'Auto');
    const val = (it: Item) => getPath(it.json, field);
    const cmp = (a: any, b: any): number => {
      if (a == null && b == null) return 0;
      if (a == null) return 1; // empty values always last
      if (b == null) return -1;
      if (kind === 'Number' || (kind === 'Auto' && !isNaN(num(a)) && !isNaN(num(b)) && a !== '' && b !== '')) return num(a) - num(b);
      if (kind === 'Date') return +toDate(a) - +toDate(b);
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    };
    const sorted = c.items.map((it, idx) => ({ it, idx })).sort((x, y) => {
      const a = val(x.it), b = val(y.it);
      const r = a == null || b == null ? cmp(a, b) : desc ? -cmp(a, b) : cmp(a, b);
      return r || x.idx - y.idx;
    });
    return [sorted.map((x) => x.it)];
  },

  async dedupe(c) {
    const fields = String(c.raw('compare') === 'Selected fields' ? c.raw('fields') || '' : '').split(',').map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const it of c.items) {
      const key = JSON.stringify(fields.length ? fields.map((f) => getPath(it.json, f) ?? null) : it.json);
      if (seen.has(key)) continue;
      seen.add(key); out.push(it);
    }
    return [out];
  },

  async summarize(c) {
    const field = String(c.raw('field') || '').trim();
    const op = String(c.raw('operation') || 'Count');
    const groupBy = String(c.raw('groupBy') || '').trim();
    if (op !== 'Count' && !field) throw new Error('Enter the field to summarize.');
    const groups = new Map<string, { key: any; items: Item[] }>();
    for (const it of c.items) {
      const key = groupBy ? getPath(it.json, groupBy) ?? null : null;
      const k = JSON.stringify(key);
      if (!groups.has(k)) groups.set(k, { key, items: [] });
      groups.get(k)!.items.push(it);
    }
    const name = op === 'Count' ? 'count' : `${op.toLowerCase().replace(/\s+/g, '_')}_${field.replace(/\W+/g, '_')}`;
    const out: Item[] = [];
    for (const g of groups.values()) {
      const vals = g.items.map((it) => getPath(it.json, field));
      const nums = vals.map(num).filter((n) => !isNaN(n));
      let r: any;
      switch (op) {
        case 'Count': r = g.items.length; break;
        case 'Count distinct': r = new Set(vals.map((v) => JSON.stringify(v))).size; break;
        case 'Sum': r = nums.reduce((a, b) => a + b, 0); break;
        case 'Average': r = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; break;
        case 'Min': r = nums.length ? Math.min(...nums) : null; break;
        case 'Max': r = nums.length ? Math.max(...nums) : null; break;
        case 'Concatenate': r = vals.filter((v) => v != null && v !== '').join(String(c.raw('separator') ?? ', ')); break;
        default: throw new Error(`Unknown operation "${op}"`);
      }
      out.push({ json: { ...(groupBy ? { [groupBy]: g.key } : {}), [name]: r } });
    }
    return [out];
  },

  datetime: each(async (c, i) => {
    const op = String(c.param('operation', i) || 'Format a date');
    const field = String(c.raw('outputField') || 'date').trim() || 'date';
    const tz = str(c, 'timezone', i) || 'UTC';
    const unit = String(c.raw('unit') || 'days');
    const amount = Number(c.param('amount', i));
    let result: any;
    if (op === 'Get current date') result = formatDate(new Date(), str(c, 'format', i), tz);
    else if (op === 'Format a date') result = formatDate(toDate(c.param('date', i)), str(c, 'format', i), tz);
    else if (op === 'Add to date' || op === 'Subtract from date') {
      if (!isFinite(amount)) throw new Error('Amount must be a number.');
      result = formatDate(addUnit(toDate(c.param('date', i)), op === 'Add to date' ? amount : -amount, unit), str(c, 'format', i), tz);
    } else if (op === 'Difference between dates') result = diffUnits(toDate(c.param('date', i)), toDate(c.param('date2', i)), unit);
    else throw new Error(`Unknown operation "${op}"`);
    return { ...c.items[i].json, [field]: result };
  }),

  crypto: each(async (c, i) => {
    const action = String(c.param('action', i) || 'Hash');
    const field = String(c.raw('outputField') || 'result').trim() || 'result';
    const value = String(c.param('value', i) ?? '');
    const algo = String(c.raw('algorithm') || 'sha256');
    const enc = String(c.raw('encoding') || 'hex') as 'hex' | 'base64';
    let result: string;
    if (action === 'Hash') result = createHash(algo).update(value).digest(enc);
    else if (action === 'HMAC') {
      const secret = str(c, 'secret', i);
      if (!secret) throw new Error('Secret is empty.');
      result = createHmac(algo, secret).update(value).digest(enc);
    } else if (action === 'Random UUID') result = randomUUID();
    else if (action === 'Random string') {
      const n = Math.min(512, Math.max(1, Number(c.raw('length')) || 16));
      result = randomBytes(n).toString('base64url').slice(0, n);
    }
    else if (action === 'Base64 encode') result = Buffer.from(value, 'utf8').toString('base64');
    else if (action === 'Base64 decode') result = Buffer.from(value, 'base64').toString('utf8');
    else throw new Error(`Unknown action "${action}"`);
    return { ...c.items[i].json, [field]: result };
  }),

  async rss(c) {
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const url = str(c, 'url', i);
      if (!/^https?:\/\//i.test(url)) throw new Error('Feed URL must start with http:// or https://');
      const res = await fetch(url, { headers: { 'user-agent': 'flowlite-rss/1.0', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`RSS ${res.status}: could not read ${url}`);
      const xml = (await res.text()).slice(0, 3_000_000);
      if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('That URL is not an RSS or Atom feed.');
      const max = Math.min(200, Math.max(1, Number(c.raw('max')) || 20));
      for (const m of Array.from(xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)).slice(0, max)) {
        const x = m[0];
        const atomLink = x.match(/<link\b[^>]*?href="([^"]+)"[^>]*>/i)?.[1];
        const published = tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated') || tag(x, 'dc:date');
        const d = published ? new Date(published) : undefined;
        const description = tag(x, 'description') || tag(x, 'summary');
        out.push({ json: {
          title: plain(tag(x, 'title')), link: tag(x, 'link') || atomLink, published: d && !isNaN(+d) ? d.toISOString() : published,
          author: plain(tag(x, 'dc:creator') || tag(x, 'author') || tag(x, 'name')), guid: tag(x, 'guid') || tag(x, 'id'),
          description, content: tag(x, 'content:encoded') || tag(x, 'content'), text: plain(description),
        } });
      }
    }
    return [out];
  },

  githubApi: each(async (c, i) => {
    const token = need(c, 'token', 'GitHub');
    const op = String(c.param('operation', i) || 'Create an issue');
    const owner = requireSafe(str(c, 'owner', i), 'Owner');
    const repo = requireSafe(str(c, 'repo', i), 'Repository');
    const number = str(c, 'number', i);
    const needNum = () => { if (!/^\d+$/.test(number)) throw new Error('Issue number must be a whole number.'); return number; };
    const call = (method: string, path: string, body?: unknown) => api('GitHub', `https://api.github.com/repos/${owner}/${repo}${path}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'flowlite', 'content-type': 'application/json' },
    });
    const brief = (r: any) => ({ number: r.number, title: r.title, state: r.state, url: r.html_url, body: r.body, user: r.user?.login, labels: (r.labels || []).map((l: any) => l.name), comments: r.comments, createdAt: r.created_at, updatedAt: r.updated_at });
    if (op === 'Create an issue') {
      const title = str(c, 'title', i);
      if (!title) throw new Error('Title is empty.');
      const labels = str(c, 'labels', i).split(',').map((s) => s.trim()).filter(Boolean);
      return brief(await call('POST', '/issues', { title, body: String(c.param('body', i) ?? ''), ...(labels.length ? { labels } : {}) }));
    }
    if (op === 'Get an issue') return brief(await call('GET', `/issues/${needNum()}`));
    if (op === 'Get many issues') {
      const limit = Math.min(100, Math.max(1, Number(c.raw('limit')) || 30));
      const state = String(c.raw('state') || 'open');
      const list = await call('GET', `/issues?state=${state}&per_page=${limit}`);
      return (list as any[]).filter((x) => !x.pull_request).map(brief);
    }
    if (op === 'Comment on an issue') {
      const body = String(c.param('body', i) ?? '');
      if (!body.trim()) throw new Error('Comment is empty.');
      const r = await call('POST', `/issues/${needNum()}/comments`, { body });
      return { id: r.id, url: r.html_url, body: r.body, user: r.user?.login };
    }
    if (op === 'Close an issue') return brief(await call('PATCH', `/issues/${needNum()}`, { state: 'closed' }));
    throw new Error(`Unknown action "${op}"`);
  }),

  airtable: each(async (c, i) => {
    const token = need(c, 'token', 'Airtable');
    const op = String(c.param('operation', i) || 'Get many records');
    const base = str(c, 'baseId', i);
    if (!/^app\w+$/.test(base)) throw new Error('Base ID looks like appXXXXXXXXXXXXXX. Find it in the Airtable API docs for your base.');
    const table = str(c, 'table', i);
    if (!table) throw new Error('Table name or ID is empty.');
    const rid = str(c, 'recordId', i);
    const needRid = () => { if (!/^rec\w+$/.test(rid)) throw new Error('Record ID looks like recXXXXXXXXXXXXXX.'); return rid; };
    const root = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
    const call = (method: string, url: string, body?: unknown) => api('Airtable', url, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
    const flat = (r: any) => ({ id: r.id, createdTime: r.createdTime, ...(r.fields || {}) });
    const fields = () => { const f = c.json('fields', i); if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('Fields must be a JSON object, like {"Name": "Ada"}.'); return f; };
    if (op === 'Get many records') {
      const limit = Math.min(500, Math.max(1, Number(c.raw('limit')) || 50));
      const formula = str(c, 'filterFormula', i);
      const rows: any[] = [];
      let offset = '';
      while (rows.length < limit) {
        const q = new URLSearchParams({ pageSize: String(Math.min(100, limit - rows.length)) });
        if (formula) q.set('filterByFormula', formula);
        if (offset) q.set('offset', offset);
        const r = await call('GET', `${root}?${q}`);
        rows.push(...(r.records || []));
        offset = r.offset || '';
        if (!offset) break;
      }
      return rows.slice(0, limit).map(flat);
    }
    if (op === 'Get a record') return flat(await call('GET', `${root}/${needRid()}`));
    if (op === 'Create a record') return flat(await call('POST', root, { fields: fields(), typecast: true }));
    if (op === 'Update a record') return flat(await call('PATCH', `${root}/${needRid()}`, { fields: fields(), typecast: true }));
    if (op === 'Delete a record') { const r = await call('DELETE', `${root}/${needRid()}`); return { id: r.id, deleted: !!r.deleted }; }
    throw new Error(`Unknown action "${op}"`);
  }),

  twilio: each(async (c, i) => {
    const sid = need(c, 'accountSid', 'Twilio');
    const auth = need(c, 'authToken', 'Twilio');
    const to = str(c, 'to', i), from = str(c, 'from', i), body = String(c.param('body', i) ?? '');
    if (!to || !from) throw new Error('From and To are required. Use +15551234567, or whatsapp:+15551234567 for WhatsApp.');
    if (!body.trim()) throw new Error('Message is empty.');
    const r = await api('Twilio', `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST', body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1600) }),
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64') },
    });
    return { sid: r.sid, status: r.status, to: r.to, from: r.from };
  }),

  supabaseApi: each(async (c, i) => {
    const url = need(c, 'url', 'Supabase').replace(/\/+$/, '');
    const key = need(c, 'key', 'Supabase');
    if (!/^https?:\/\//i.test(url)) throw new Error('Supabase project URL must start with https://');
    const op = String(c.param('operation', i) || 'Get rows');
    const table = str(c, 'table', i);
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error('Table name can only use letters, numbers and underscores.');
    const col = str(c, 'matchColumn', i), val = str(c, 'matchValue', i);
    const mop = String(c.raw('matchOp') || 'eq');
    const filter = () => { if (!col) return ''; if (!/^[A-Za-z0-9_]+$/.test(col)) throw new Error('Match column can only use letters, numbers and underscores.'); return `${col}=${mop}.${encodeURIComponent(val)}`; };
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=representation' };
    const root = `${url}/rest/v1/${table}`;
    const data = () => { const d = c.json('data', i); if (!d || typeof d !== 'object') throw new Error('Data must be a JSON object (or an array of objects).'); return d; };
    if (op === 'Get rows') {
      const q = [`select=${encodeURIComponent(str(c, 'select', i) || '*')}`, filter(), `limit=${Math.min(1000, Math.max(1, Number(c.raw('limit')) || 50))}`].filter(Boolean).join('&');
      return api('Supabase', `${root}?${q}`, { headers });
    }
    if (op === 'Insert rows') return api('Supabase', root, { method: 'POST', headers, body: JSON.stringify(data()) });
    if (op === 'Update rows') {
      if (!col) throw new Error('Update needs a Match column, so it cannot change every row by mistake.');
      return api('Supabase', `${root}?${filter()}`, { method: 'PATCH', headers, body: JSON.stringify(data()) });
    }
    if (op === 'Delete rows') {
      if (!col) throw new Error('Delete needs a Match column, so it cannot remove every row by mistake.');
      return api('Supabase', `${root}?${filter()}`, { method: 'DELETE', headers });
    }
    throw new Error(`Unknown action "${op}"`);
  }),
};
