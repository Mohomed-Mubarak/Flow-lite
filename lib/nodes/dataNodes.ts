// Server-only: CSV, HTML Extract and XML nodes.
import type { Item } from '../types';
import type { Runner } from './runners';
import { each, str } from './extra';

/** RFC 4180 CSV parser: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, i = 0;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = []; i++; continue;
    }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
const cell = (v: any, delim: string) => {
  const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /["\r\n]/.test(t) || t.includes(delim) ? `"${t.replace(/"/g, '""')}"` : t;
};
const DELIMS: Record<string, string> = { Comma: ',', Semicolon: ';', Tab: '\t', Pipe: '|' };

export const dataRunners: Record<string, Runner> = {
  async csv(c) {
    const delim = DELIMS[String(c.raw('delimiter') || 'Comma')] ?? ',';
    if (c.raw('operation') === 'Items to CSV') {
      const cols: string[] = [];
      for (const it of c.items) for (const k of Object.keys(it.json)) if (!cols.includes(k)) cols.push(k);
      const lines = c.items.map((it) => cols.map((k) => cell(it.json[k], delim)).join(delim));
      if (c.raw('header') !== false) lines.unshift(cols.map((k) => cell(k, delim)).join(delim));
      return [[{ json: { csv: lines.join('\n'), rows: c.items.length, columns: cols } }]];
    }
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const text = String(c.param('text', i) ?? '');
      const rows = parseCsv(text, delim);
      if (!rows.length) continue;
      const hasHeader = c.raw('header') !== false;
      const head = hasHeader ? rows[0].map((h, k) => h.trim() || `column${k + 1}`) : rows[0].map((_, k) => `column${k + 1}`);
      for (const r of hasHeader ? rows.slice(1) : rows) out.push({ json: Object.fromEntries(head.map((h, k) => [h, r[k] ?? ''])) });
    }
    return [out];
  },

  htmlExtract: each(async (c, i) => {
    const cheerio = await import('cheerio');
    const html = String(c.param('html', i) ?? '');
    if (!html.trim()) throw new Error('HTML is empty. Use the field that holds the page, like {{ $json.body }}.');
    const map = c.json('selectors', i);
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Selectors must be a JSON object, like {"title": "h1", "links": "a@href"}.');
    const $ = cheerio.load(html);
    const many = c.raw('multiple') === true;
    const out: Record<string, any> = {};
    for (const [key, spec] of Object.entries(map as Record<string, string>)) {
      const at = String(spec).lastIndexOf('@');
      const sel = at > 0 ? String(spec).slice(0, at) : String(spec);
      const mode = at > 0 ? String(spec).slice(at + 1) : 'text';
      const read = (el: any) => {
        const $el = $(el);
        const v = mode === 'text' ? $el.text().replace(/\s+/g, ' ').trim() : mode === 'html' ? $el.html() : $el.attr(mode);
        return v ?? null;
      };
      let els;
      try { els = $(sel); } catch { throw new Error(`"${sel}" is not a valid CSS selector.`); }
      out[key] = many ? els.toArray().map(read) : els.length ? read(els.get(0)) : null;
    }
    return { ...c.items[i].json, ...out };
  }),

  xml: each(async (c, i) => {
    const { XMLParser, XMLBuilder } = await import('fast-xml-parser');
    const field = str(c, 'outputField', i) || 'data';
    if (c.raw('operation') === 'JSON to XML') {
      const data = c.json('data', i);
      if (data == null || typeof data !== 'object') throw new Error('Data must be a JSON object.');
      const root = str(c, 'rootName', i) || 'root';
      const xml = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true }).build({ [root]: data });
      return { ...c.items[i].json, [field]: xml };
    }
    const text = String(c.param('text', i) ?? '');
    if (!text.trim()) throw new Error('XML is empty. Use the field that holds it, like {{ $json.body }}.');
    try {
      return { ...c.items[i].json, [field]: new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true }).parse(text) };
    } catch (e: any) { throw new Error(`That is not valid XML: ${e.message}`); }
  }),
};
