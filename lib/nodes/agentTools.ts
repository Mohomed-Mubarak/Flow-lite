// Server-only: extra tools an agent can use (Wikipedia, web search, web page reader, date and time).
import type { Sub } from './runners';

export type ToolSpec = { name: string; description: string; schema: Record<string, any>; run: (a: Record<string, any>) => Promise<string> };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…[cut]' : s);
const PRIVATE = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1?\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:|.*\.(local|internal)$)/i;

/** Fetches a public web page. Refuses private addresses and re-checks every redirect. */
export async function publicFetch(url: string, hops = 0): Promise<Response> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('That is not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links can be read');
  if (PRIVATE.test(u.hostname)) throw new Error('Private and local addresses are not allowed');
  const res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; flowlite-agent/1.0)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(12000) });
  const next = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && next) {
    if (hops >= 4) throw new Error('Too many redirects');
    return publicFetch(new URL(next, u).toString(), hops + 1);
  }
  return res;
}

const textOf = (html: string) => html
  .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export function extraTool(s: Sub, name: (raw: unknown, fallback: string) => string): ToolSpec | undefined {
  if (s.type === 'toolWikipedia') {
    const lang = /^[a-z]{2,8}(-[a-z]{2,8})?$/i.test(String(s.params.language || 'en').trim()) ? String(s.params.language || 'en').trim().toLowerCase() : 'en';
    return {
      name: name('wikipedia', 'wikipedia'),
      description: 'Look up a topic on Wikipedia and get the summary of the best matching article. Use for facts about people, places, events, science and history.',
      schema: { type: 'object', properties: { query: { type: 'string', description: 'The topic to look up' } }, required: ['query'] },
      run: async (a) => {
        const q = String(a.query ?? '').trim();
        if (!q) throw new Error('query is empty');
        const search = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(12000) })).json();
        const title = search?.query?.search?.[0]?.title;
        if (!title) return `No Wikipedia article found for "${q}".`;
        const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) return `Found "${title}" but could not load it (${r.status}).`;
        const j: any = await r.json();
        return `${j.title}\n${j.extract || '(no summary)'}\n${j.content_urls?.desktop?.page || ''}`.trim();
      },
    };
  }
  if (s.type === 'toolTavily') {
    const key = s.cred?.apiKey;
    if (!key) throw new Error(`${s.name}: select a Tavily credential`);
    const max = Math.min(10, Math.max(1, Number(s.params.maxResults) || 5));
    return {
      name: name('web_search', 'web_search'),
      description: 'Search the web for current information, news and facts. Returns an answer and the top sources.',
      schema: { type: 'object', properties: { query: { type: 'string', description: 'What to search for' } }, required: ['query'] },
      run: async (a) => {
        const q = String(a.query ?? '').trim();
        if (!q) throw new Error('query is empty');
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: q, max_results: max, include_answer: true }), signal: AbortSignal.timeout(20000),
        });
        const j: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Tavily ${res.status}: ${j?.detail?.error || j?.error || 'search failed'}`);
        const rows = (j.results || []).map((r: any, k: number) => `${k + 1}. ${r.title}\n${r.url}\n${clip(String(r.content || ''), 500)}`).join('\n\n');
        return `${j.answer ? `Answer: ${j.answer}\n\n` : ''}${rows || 'No results.'}`;
      },
    };
  }
  if (s.type === 'toolWebPage') {
    return {
      name: name('read_web_page', 'read_web_page'),
      description: 'Open a public web page and return its readable text. Use after a search to read a source in full.',
      schema: { type: 'object', properties: { url: { type: 'string', description: 'The https link to open' } }, required: ['url'] },
      run: async (a) => {
        const res = await publicFetch(String(a.url ?? '').trim());
        const type = res.headers.get('content-type') || '';
        const body = (await res.text()).slice(0, 1_500_000);
        const text = /html/i.test(type) || /^\s*<(!doctype|html)/i.test(body) ? textOf(body) : body;
        return `HTTP ${res.status}\n${clip(text, 6000)}`;
      },
    };
  }
  if (s.type === 'toolDateTime') {
    return {
      name: name('current_datetime', 'current_datetime'),
      description: 'Get the current date, time and weekday. Use whenever the answer depends on today\'s date.',
      schema: { type: 'object', properties: { timezone: { type: 'string', description: 'Optional IANA time zone, like Europe/London. Default UTC' } } },
      run: async (a) => {
        const tz = String(a.timezone || s.params.timezone || 'UTC').trim() || 'UTC';
        let text: string;
        try { text = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(new Date()); }
        catch { throw new Error(`Unknown time zone "${tz}"`); }
        return `${text}\nISO (UTC): ${new Date().toISOString()}`;
      },
    };
  }
  return undefined;
}
