// Server-only: agent tools built on top of the app nodes (Gmail, Blogger, Sheets, Calendar, Notion, GitHub, Airtable, Telegram, other workflows).
// A tool runs the node's own runner. Fixed settings come from the tool node, the rest from the model's arguments.
import type { Item } from '../types';
import { resolve, type Scope } from '../expr';
import type { Ctx, Sub } from './runners';
import type { ToolSpec } from './agentTools';

type Arg = { type: 'string' | 'number' | 'boolean' | 'object'; description: string; required?: boolean };
type Def = {
  tool: string; description: string; node: string; operation?: string;
  args: Record<string, Arg>;
  /** The tool node's checkbox that must be on for this tool to exist. */
  gate?: string;
  /** Extra settings forced on the node (not chosen by the model). */
  force?: (p: Record<string, any>) => Record<string, any>;
};
const S = (description: string, required = false): Arg => ({ type: 'string', description, required });
const N = (description: string): Arg => ({ type: 'number', description });
const O = (description: string, required = false): Arg => ({ type: 'object', description, required });

/** Settings of the tool node that are passed to the app node as they are. */
const FIXED: Record<string, string[]> = {
  toolGmail: [],
  toolBlogger: ['blog'],
  toolGoogleSheets: ['spreadsheetId', 'sheet'],
  toolGoogleCalendar: ['calendarId', 'timezone'],
  toolNotion: ['databaseId', 'titleProperty'],
  toolGithub: ['owner', 'repo'],
  toolAirtable: ['baseId', 'table'],
  toolTelegram: ['chatId'],
};

const DEFS: Record<string, Def[]> = {
  toolGmail: [
    { tool: 'gmail_search_emails', node: 'gmail', operation: 'Get many emails', description: 'Search Gmail. Uses Gmail search syntax, like "from:ann is:unread newer_than:7d". Returns subject, sender, date, snippet and id.', args: { query: S('Gmail search query. Empty lists the newest emails'), limit: N('How many emails, default 10') }, force: () => ({ includeBody: false }) },
    { tool: 'gmail_read_email', node: 'gmail', operation: 'Get an email', description: 'Read one email in full by its id (from gmail_search_emails).', args: { messageId: S('The email id', true) } },
    { tool: 'gmail_create_draft', node: 'gmail', operation: 'Create a draft', description: 'Save an email as a draft in Gmail. It is not sent.', args: { to: S('Recipient address', true), subject: S('Subject', true), body: S('Plain text body', true) }, gate: 'allowDraft' },
    { tool: 'gmail_send_email', node: 'gmail', operation: 'Send an email', description: 'Send an email from the connected Gmail account. This cannot be undone.', args: { to: S('Recipient address', true), subject: S('Subject', true), body: S('Plain text body', true) }, gate: 'allowSend' },
    { tool: 'gmail_reply', node: 'gmail', operation: 'Reply to an email', description: 'Reply in the same thread to an email, by its id. This sends the reply.', args: { messageId: S('Id of the email to reply to', true), body: S('Plain text reply', true) }, gate: 'allowSend' },
  ],
  toolBlogger: [
    { tool: 'blogger_list_posts', node: 'blogger', operation: 'Get many posts', description: 'List the newest posts of the blog.', args: { limit: N('How many, default 10') }, force: () => ({ status: 'live', includeContent: false }) },
    { tool: 'blogger_search_posts', node: 'blogger', operation: 'Search posts', description: 'Search the blog\'s posts by text.', args: { query: S('Words to search for', true), limit: N('How many, default 10') } },
    { tool: 'blogger_get_post', node: 'blogger', operation: 'Get a post', description: 'Read one post, with its HTML content, by id.', args: { postId: S('The post id', true) } },
    { tool: 'blogger_create_post', node: 'blogger', operation: 'Create a post', description: 'Create a post on the blog. Write the content as HTML, or plain text with blank lines between paragraphs.', args: { title: S('Post title', true), content: S('Post body', true), labels: S('Comma separated labels') }, gate: 'allowCreate',
      force: (p) => ({ publish: p.allowPublish === true ? 'Publish now' : 'Save as draft' }) },
    { tool: 'blogger_update_post', node: 'blogger', operation: 'Update a post', description: 'Change the title, content or labels of an existing post. Only fields you pass change.', args: { postId: S('The post id', true), title: S('New title'), content: S('New body'), labels: S('Comma separated labels') }, gate: 'allowEdit' },
  ],
  toolGoogleSheets: [
    { tool: 'sheets_get_rows', node: 'googleSheets', operation: 'Get rows', description: 'Read rows of the spreadsheet. Each row is an object keyed by the column names in row 1, plus rowNumber. Optional filter on one column.', args: { filterColumn: S('Column name to filter on'), filterValue: S('Value the column must equal'), limit: N('Max rows, default 100') } },
    { tool: 'sheets_append_row', node: 'googleSheets', operation: 'Append row', description: 'Add a row at the bottom. Keys must be column names from row 1.', args: { values: O('Object like {"Name":"Ada","Email":"ada@x.com"}', true) }, gate: 'allowWrite' },
    { tool: 'sheets_update_row', node: 'googleSheets', operation: 'Update row', description: 'Change cells of an existing row by its rowNumber (2 or higher). Only the keys you pass change.', args: { rowNumber: S('Row number from sheets_get_rows', true), values: O('Object of column name to new value', true) }, gate: 'allowWrite' },
  ],
  toolGoogleCalendar: [
    { tool: 'calendar_list_events', node: 'googleCalendar', operation: 'Get many events', description: 'List upcoming events, soonest first.', args: { timeMin: S('Start of the range as ISO date or time. Empty means now'), timeMax: S('End of the range'), search: S('Text to search for'), limit: N('Max events, default 25') } },
    { tool: 'calendar_create_event', node: 'googleCalendar', operation: 'Create an event', description: 'Create an event. Use an ISO date and time like 2026-03-01T10:00:00Z, or a date alone for an all-day event.', args: { summary: S('Title', true), start: S('Start', true), end: S('End', true), description: S('Details'), location: S('Place') }, gate: 'allowWrite' },
  ],
  toolNotion: [
    { tool: 'notion_list_pages', node: 'notionApi', operation: 'Query a database', description: 'List pages of the Notion database with their properties.', args: { limit: N('Max pages, default 50'), filter: O('Optional Notion filter object') } },
    { tool: 'notion_get_page', node: 'notionApi', operation: 'Get a page', description: 'Read one Notion page\'s properties by id.', args: { pageId: S('Page id', true) } },
    { tool: 'notion_create_page', node: 'notionApi', operation: 'Create a page in a database', description: 'Add a page to the Notion database.', args: { title: S('Page title', true), content: S('Text for the page body') }, gate: 'allowWrite' },
  ],
  toolGithub: [
    { tool: 'github_list_issues', node: 'githubApi', operation: 'Get many issues', description: 'List issues of the repository.', args: { state: S('open, closed or all'), limit: N('Max issues, default 30') } },
    { tool: 'github_get_issue', node: 'githubApi', operation: 'Get an issue', description: 'Read one issue by number.', args: { number: S('Issue number', true) } },
    { tool: 'github_create_issue', node: 'githubApi', operation: 'Create an issue', description: 'Open a new issue.', args: { title: S('Title', true), body: S('Details'), labels: S('Comma separated labels') }, gate: 'allowWrite' },
    { tool: 'github_comment', node: 'githubApi', operation: 'Comment on an issue', description: 'Add a comment to an issue.', args: { number: S('Issue number', true), body: S('Comment text', true) }, gate: 'allowWrite' },
  ],
  toolAirtable: [
    { tool: 'airtable_list_records', node: 'airtable', operation: 'Get many records', description: 'List records of the Airtable table.', args: { filterFormula: S('Optional Airtable formula'), limit: N('Max records, default 50') } },
    { tool: 'airtable_create_record', node: 'airtable', operation: 'Create a record', description: 'Add a record to the Airtable table.', args: { fields: O('Object of field name to value', true) }, gate: 'allowWrite' },
  ],
  toolTelegram: [
    { tool: 'telegram_send_message', node: 'telegram', operation: 'Send a text message', description: 'Send a Telegram message to the chat chosen in this tool.', args: { text: S('Message text', true) } },
  ],
};

/** Runs an app node once with the model's arguments as its input item. */
async function runNode(type: string, fixed: Record<string, any>, templates: Record<string, string>, cred: Record<string, any> | null, args: Record<string, any>): Promise<string> {
  const { runners } = await import('./runners');
  const items: Item[] = [{ json: args }];
  const scope = (): Scope => ({ json: args, nodes: {}, index: 0, items });
  const val = (n: string) => (n in templates ? resolve(templates[n], scope()) : fixed[n]);
  const ctx: Ctx = {
    items, cred, subs: { tools: [] }, scope,
    raw: (n) => (n in templates ? templates[n] : fixed[n]),
    param: (n) => val(n),
    json: (n) => {
      let v = val(n);
      if (typeof v === 'string' && v !== '') { try { v = JSON.parse(v); } catch { /* keep text */ } }
      return v === '' ? undefined : v;
    },
  };
  const out = await runners[type](ctx);
  const text = JSON.stringify(out.flat().map((i) => i.json));
  return text.length > 6000 ? text.slice(0, 6000) + '…[cut]' : text === '[]' ? 'No results.' : text;
}

export function appTools(s: Sub, scope: Scope, name: (raw: unknown, fallback: string) => string): ToolSpec[] | undefined {
  if (s.type === 'toolWorkflow') {
    const id = String(resolve(s.params.workflowId ?? '', scope) ?? '').trim();
    if (!id) throw new Error(`${s.name}: Workflow ID is empty`);
    return [{
      name: name(s.params.toolName, 'run_workflow'),
      description: String(s.params.description || 'Runs another workflow and returns its result.').slice(0, 1000),
      schema: { type: 'object', properties: { input: { type: 'string', description: 'The input for the workflow. Plain text, or a JSON object as text' } }, required: ['input'] },
      run: async (a) => {
        let json: Record<string, any> = { input: a.input };
        try { const j = JSON.parse(String(a.input)); if (j && typeof j === 'object' && !Array.isArray(j)) json = { ...j, input: a.input }; } catch { /* plain text */ }
        return runNode('executeWorkflow', { workflowId: id }, {}, null, json);
      },
    }];
  }
  if (s.type === 'toolThink') {
    return [{
      name: name('think', 'think'),
      description: 'Use this to think through a problem step by step before acting. It does nothing except record your thought. Use it for planning and for checking your work.',
      schema: { type: 'object', properties: { thought: { type: 'string', description: 'Your reasoning' } }, required: ['thought'] },
      run: async () => 'Thought noted. Continue.',
    }];
  }
  const defs = DEFS[s.type];
  if (!defs) return undefined;
  const fixed: Record<string, any> = {};
  for (const k of FIXED[s.type] ?? []) fixed[k] = resolve(s.params[k] ?? '', scope);
  const out: ToolSpec[] = [];
  for (const d of defs) {
    if (d.gate && s.params[d.gate] !== true) continue;
    const templates = Object.fromEntries(Object.keys(d.args).map((k) => [k, `{{ $json.${k} }}`]));
    const base = { ...fixed, ...(d.operation ? { operation: d.operation } : {}), ...(d.force?.(s.params) ?? {}) };
    out.push({
      name: name(d.tool, d.tool),
      description: d.description,
      schema: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(d.args).map(([k, a]) => [k, { type: a.type, description: a.description }])),
        required: Object.entries(d.args).filter(([, a]) => a.required).map(([k]) => k),
      },
      run: async (a) => {
        const missing = Object.entries(d.args).filter(([k, x]) => x.required && (a[k] == null || a[k] === '')).map(([k]) => k);
        if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
        const use: Record<string, string> = {};
        for (const [k, v] of Object.entries(templates)) if (a[k] !== undefined && a[k] !== '') use[k] = v; // unset args fall back to the node's own defaults
        return runNode(d.node, base, use, s.cred, a);
      },
    });
  }
  return out;
}
