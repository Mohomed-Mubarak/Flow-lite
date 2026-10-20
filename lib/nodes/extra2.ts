// Server-only runners, part 2: Notion, Google Sheets, SMTP, WhatsApp, Execute Workflow, AI Classify, field tools.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Item } from '../types';
import type { Runner } from './runners';
import { api, each, getPath, need, str } from './extra';

// ---------- Notion ----------
const NOTION = 'https://api.notion.com/v1';
const notionId = (v: string, what: string) => {
  const m = v.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!m) throw new Error(`${what} must be a Notion ID (32 characters). It is the last part of the page or database URL.`);
  return m[0];
};
const rich = (a: any[] | undefined) => (a || []).map((t) => t.plain_text).join('');
function simplifyProp(p: any): any {
  switch (p?.type) {
    case 'title': return rich(p.title);
    case 'rich_text': return rich(p.rich_text);
    case 'number': case 'checkbox': case 'url': case 'email': case 'phone_number': return p[p.type];
    case 'select': case 'status': return p[p.type]?.name ?? null;
    case 'multi_select': return (p.multi_select || []).map((o: any) => o.name);
    case 'date': return p.date?.start ?? null;
    case 'people': return (p.people || []).map((u: any) => u.name || u.id);
    case 'files': return (p.files || []).map((f: any) => f.name);
    case 'relation': return (p.relation || []).map((r: any) => r.id);
    case 'formula': return p.formula?.[p.formula?.type];
    case 'created_time': case 'last_edited_time': return p[p.type];
    default: return null;
  }
}
const flatPage = (r: any) => ({
  ...Object.fromEntries(Object.entries(r.properties || {}).map(([k, v]) => [k, simplifyProp(v)])),
  id: r.id, url: r.url, createdTime: r.created_time, lastEditedTime: r.last_edited_time,
});
const paragraphs = (text: string) => text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).slice(0, 90)
  .map((t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t.slice(0, 2000) } }] } }));

// ---------- Execute Workflow ----------
const depth = new AsyncLocalStorage<{ chain: string[] }>();

export const extraRunners2: Record<string, Runner> = {
  notionApi: each(async (c, i) => {
    const token = need(c, 'token', 'Notion');
    const op = String(c.param('operation', i) || 'Query a database');
    const call = (method: string, path: string, body?: unknown) => api('Notion', `${NOTION}${path}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'content-type': 'application/json' },
    });
    const props = () => { const p = c.json('properties', i); if (p == null || p === '') return {}; if (typeof p !== 'object' || Array.isArray(p)) throw new Error('Properties must be a JSON object in Notion format.'); return p; };
    if (op === 'Query a database') {
      const db = notionId(str(c, 'databaseId', i), 'Database ID');
      const limit = Math.min(500, Math.max(1, Number(c.raw('limit')) || 50));
      const filter = c.json('filter', i);
      const rows: any[] = [];
      let cursor: string | undefined;
      while (rows.length < limit) {
        const r = await call('POST', `/databases/${db}/query`, { page_size: Math.min(100, limit - rows.length), ...(filter && typeof filter === 'object' ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}) });
        rows.push(...(r.results || []));
        if (!r.has_more) break;
        cursor = r.next_cursor;
      }
      return rows.slice(0, limit).map(flatPage);
    }
    if (op === 'Create a page in a database') {
      const db = notionId(str(c, 'databaseId', i), 'Database ID');
      const title = String(c.param('title', i) ?? '');
      const titleProp = str(c, 'titleProperty', i) || 'Name';
      const content = String(c.param('content', i) ?? '');
      return flatPage(await call('POST', '/pages', {
        parent: { database_id: db },
        properties: { [titleProp]: { title: [{ type: 'text', text: { content: title.slice(0, 2000) } }] }, ...props() },
        ...(content.trim() ? { children: paragraphs(content) } : {}),
      }));
    }
    if (op === 'Get a page') return flatPage(await call('GET', `/pages/${notionId(str(c, 'pageId', i), 'Page ID')}`));
    if (op === 'Update page properties') return flatPage(await call('PATCH', `/pages/${notionId(str(c, 'pageId', i), 'Page ID')}`, { properties: props() }));
    if (op === 'Append text to a page') {
      const content = String(c.param('content', i) ?? '');
      if (!content.trim()) throw new Error('Text is empty.');
      const r = await call('PATCH', `/blocks/${notionId(str(c, 'pageId', i), 'Page ID')}/children`, { children: paragraphs(content) });
      return { appended: (r.results || []).length };
    }
    throw new Error(`Unknown action "${op}"`);
  }),

  whatsapp: each(async (c, i) => {
    const token = need(c, 'accessToken', 'WhatsApp');
    const phone = need(c, 'phoneNumberId', 'WhatsApp');
    const to = str(c, 'to', i).replace(/[^\d]/g, '');
    if (!to) throw new Error('To is empty. Use the full number with country code, like 15551234567.');
    const op = String(c.param('operation', i) || 'Send a text message');
    const body = op === 'Send a template message'
      ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: str(c, 'template', i), language: { code: str(c, 'language', i) || 'en_US' } } }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(c.param('body', i) ?? '').slice(0, 4096) } };
    if (op === 'Send a template message' && !str(c, 'template', i)) throw new Error('Template name is empty.');
    if (op !== 'Send a template message' && !(body as any).text.body.trim()) throw new Error('Message is empty.');
    const r = await api('WhatsApp', `https://graph.facebook.com/v21.0/${encodeURIComponent(phone)}/messages`, {
      method: 'POST', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    return { messageId: r.messages?.[0]?.id, to };
  }),

  async executeWorkflow(c) {
    const id = String(c.param('workflowId', 0) ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Workflow ID must be the id from that workflow\'s address, like /workflows/<id>.');
    const chain = depth.getStore()?.chain ?? (c.workflowId ? [c.workflowId] : []);
    if (chain.includes(id)) throw new Error('A workflow cannot run itself, even through another workflow.');
    if (chain.length >= 3) throw new Error('Workflows can be nested 3 levels deep at most.');
    const { db } = await import('../supabase');
    const { runWorkflow } = await import('../engine');
    const { data, error } = await db().from('workflows').select('name,nodes,edges').eq('id', id).single();
    if (error || !data) throw new Error(`Workflow ${id} was not found.`);
    const res = await depth.run({ chain: [...chain, id] }, () => runWorkflow({ nodes: data.nodes, edges: data.edges, triggerItems: c.items, workflowId: id }));
    if (res.status === 'error') throw new Error(`Workflow "${data.name}" failed: ${res.error}`);
    return [res.last ?? []];
  },

  async aiclassify(c) {
    const { aiComplete } = await import('./runners');
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const cats = String(c.param('categories', i) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (cats.length < 2) throw new Error('Enter at least two categories, separated by commas.');
      const fallback = String(c.raw('fallback') || 'other');
      const reply = await aiComplete(c.cred, {
        model: String(c.param('model', i) || ''), temperature: 0, maxTokens: 30,
        system: `Classify the user's text into exactly one of these categories: ${cats.join(', ')}.${c.raw('hint') ? ` ${c.param('hint', i)}` : ''} Reply with only the category name, nothing else.`,
        prompt: String(c.param('text', i) ?? ''),
      });
      const clean = reply.trim().toLowerCase().replace(/^["'`]+|["'`.]+$/g, '');
      const hit = cats.find((x) => x.toLowerCase() === clean) ?? cats.find((x) => clean.includes(x.toLowerCase()));
      out.push({ json: { ...c.items[i].json, category: hit ?? fallback } });
    }
    return [out];
  },

  renameKeys: each(async (c, i) => {
    const map = c.json('renames', i);
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Renames must be a JSON object, like {"old_name": "new_name"}.');
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(c.items[i].json)) out[(map as Record<string, string>)[k] ?? k] = v;
    return out;
  }),

  removeFields: each(async (c, i) => {
    const list = String(c.raw('fields') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const json = c.items[i].json;
    if (c.raw('mode') === 'Keep only these') return Object.fromEntries(list.filter((k) => getPath(json, k) !== undefined).map((k) => [k, getPath(json, k)]));
    const { ...rest } = json;
    for (const k of list) delete rest[k];
    return rest;
  }),
};
