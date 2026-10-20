import vm from 'node:vm';
import { db } from '../supabase';
import { resolve, type Scope } from '../expr';
import { CREDENTIAL_TYPES } from './catalog';
import type { Item } from '../types';
import type { Ctx, Sub } from './runners';
import { McpClient, cleanSchema } from './mcp';
import { extraTool } from './agentTools';
import { appTools } from './appTools';

type Msg = { role: 'user' | 'assistant'; content: string };
type Tool = {
  name: string;
  description: string;
  /** JSON schema of the arguments the model passes in. */
  schema: Record<string, any>;
  run: (args: Record<string, any>) => Promise<string>;
};
type Step = { tool: string; input: unknown; output: string };
/** MCP sessions opened for this run. Closed when the agent finishes. */
type Closer = () => Promise<void>;

/** A Vercel run is capped at 60s. Stop the agent before that so the error is clear. */
const BUDGET_MS = 50_000;
const MAX_TOOL_OUTPUT = 6000;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…[cut]' : s);

// ---------- Calculator (a small parser, so no eval) ----------
const FN: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, ln: Math.log, log: Math.log10,
};
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calc(input: string): number {
  const src = input.toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^');
  let i = 0;
  const fail = (): never => { throw new Error(`Cannot read "${input}" as a math expression`); };
  const num = /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/y;
  const name = /[a-z]+/y;

  function sum(): number {
    let v = term();
    while (src[i] === '+' || src[i] === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term(): number {
    let v = unary();
    while (src[i] === '*' || src[i] === '/' || src[i] === '%') {
      const op = src[i++]; const r = unary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function unary(): number {
    if (src[i] === '-') { i++; return -unary(); }
    if (src[i] === '+') { i++; return unary(); }
    const b = atom();
    if (src[i] === '^') { i++; return Math.pow(b, unary()); }
    return b;
  }
  function atom(): number {
    if (src[i] === '(') {
      i++; const v = sum();
      if (src[i++] !== ')') fail();
      return v;
    }
    num.lastIndex = i;
    const n = num.exec(src);
    if (n) { i += n[0].length; return Number(n[0]); }
    name.lastIndex = i;
    const w = name.exec(src);
    if (!w) return fail();
    i += w[0].length;
    if (src[i] === '(') {
      const fn = FN[w[0]];
      if (!fn) return fail();
      i++;
      const args: number[] = [];
      if (src[i] !== ')') { do { args.push(sum()); } while (src[i] === ',' && ++i); }
      if (src[i++] !== ')') fail();
      return fn(...args);
    }
    if (w[0] in CONST) return CONST[w[0]];
    return fail();
  }

  if (!src || /[\d.]\s+[\d.]/.test(input)) fail(); // "2 2" is not 22
  const v = sum();
  if (i !== src.length || !Number.isFinite(v)) fail();
  return v;
}

// ---------- Tools ----------
function toolName(raw: unknown, fallback: string, used: Set<string>): string {
  const base = String(raw || fallback).trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || fallback;
  let n = base, k = 2;
  while (used.has(n)) n = `${base}_${k++}`;
  used.add(n);
  return n;
}

function parseHeaders(v: unknown): Record<string, string> {
  if (v === '' || v == null) return {};
  let h: any = v;
  if (typeof v === 'string') { try { h = JSON.parse(v); } catch { throw new Error('HTTP tool: Headers must be a JSON object'); } }
  if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error('HTTP tool: Headers must be a JSON object');
  return Object.fromEntries(Object.entries(h).map(([k, x]) => [k, String(x)]));
}

/** Connects to an MCP server and turns its tools into agent tools. */
async function mcpTools(s: Sub, scope: Scope, used: Set<string>, closers: Closer[]): Promise<Tool[]> {
  const url = String(resolve(s.params.url ?? '', scope) ?? '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error(`${s.name}: Endpoint URL must start with http:// or https://`);
  const headers = parseHeaders(resolve(s.params.headers ?? '', scope));
  const cr = s.cred;
  if (cr?.type === 'httpBearer') headers.Authorization = `Bearer ${cr.token}`;
  if (cr?.type === 'httpBasic') headers.Authorization = 'Basic ' + Buffer.from(`${cr.user}:${cr.password}`).toString('base64');
  if (cr?.type === 'httpHeader') headers[cr.name] = cr.value;

  const client = new McpClient(url, headers);
  closers.push(() => client.close());
  let list;
  try {
    await client.connect();
    list = await client.listTools();
  } catch (e: any) {
    throw new Error(`${s.name}: ${e.message}`);
  }

  const mode = String(s.params.include || 'All');
  const names = new Set(String(s.params.toolNames || '').split(',').map((x) => x.trim()).filter(Boolean));
  const picked = list.filter((t) => (mode === 'Selected' ? names.has(t.name) : mode === 'All except' ? !names.has(t.name) : true));
  if (mode === 'Selected' && !picked.length) throw new Error(`${s.name}: none of the listed tool names exist on the server. It has: ${list.map((t) => t.name).join(', ') || '(no tools)'}`);

  return picked.map((t) => ({
    name: toolName(t.name, 'mcp_tool', used),
    description: clip(String(t.description || `MCP tool ${t.name}`), 1000),
    schema: cleanSchema(t.inputSchema),
    run: async (a) => clip(await client.callTool(t.name, a), MAX_TOOL_OUTPUT),
  }));
}

async function buildTools(subs: Sub[], scope: Scope, closers: Closer[]): Promise<Tool[]> {
  const used = new Set<string>();
  const tools: Tool[] = [];
  for (const s of subs) {
    const nm = (raw: unknown, fb: string) => toolName(raw, fb, used);
    const extra = extraTool(s, nm);
    const apps = extra ? undefined : appTools(s, scope, nm);
    if (extra) {
      tools.push(extra);
    } else if (apps) {
      tools.push(...apps);
    } else if (s.type === 'toolMcp') {
      tools.push(...(await mcpTools(s, scope, used, closers)));
    } else if (s.type === 'toolCalculator') {
      tools.push({
        name: toolName('calculator', 'calculator', used),
        description: 'Evaluate a math expression exactly, e.g. (12.5*3)/2. Supports + - * / % ^ ( ) and sqrt, abs, round, floor, ceil, min, max, ln, log, pi.',
        schema: { type: 'object', properties: { expression: { type: 'string', description: 'The expression to evaluate' } }, required: ['expression'] },
        run: async (a) => String(calc(String(a.expression ?? ''))),
      });
    } else if (s.type === 'toolHttp') {
      const method = String(s.params.method || 'GET').toUpperCase();
      const template = String(resolve(s.params.url ?? '', scope) ?? '').trim();
      const host = template.match(/^https?:\/\/([^/?#]*)/);
      if (!host) throw new Error(`${s.name}: URL must start with http:// or https://`);
      if (/[{}]/.test(host[1])) throw new Error(`${s.name}: the host in the URL must be fixed. Only the path or query can use {placeholders}`);
      const holes = Array.from(new Set(Array.from(template.matchAll(/\{(\w+)\}/g)).map((m) => m[1])));
      const hasBody = !['GET', 'HEAD'].includes(method);
      const props: Record<string, any> = Object.fromEntries(holes.map((h) => [h, { type: 'string' }]));
      props.query = { type: 'object', description: 'Optional query string parameters', additionalProperties: { type: 'string' } };
      if (hasBody) props.body = { type: 'object', description: 'Optional JSON request body' };
      const headers = parseHeaders(resolve(s.params.headers ?? '', scope));
      const cr = s.cred;
      if (cr?.type === 'httpBearer') headers.Authorization = `Bearer ${cr.token}`;
      if (cr?.type === 'httpBasic') headers.Authorization = 'Basic ' + Buffer.from(`${cr.user}:${cr.password}`).toString('base64');
      if (cr?.type === 'httpHeader') headers[cr.name] = cr.value;
      tools.push({
        name: toolName(s.params.toolName, 'http_request', used),
        description: String(s.params.toolDescription || 'Calls an HTTP API and returns the response.'),
        schema: { type: 'object', properties: props, required: holes },
        run: async (a) => {
          // Values are URL-encoded, so the model cannot change the host or add path segments.
          const url = new URL(template.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(String(a[k] ?? ''))));
          for (const [k, v] of Object.entries((a.query && typeof a.query === 'object' ? a.query : {}) as Record<string, unknown>)) url.searchParams.set(k, String(v));
          const h = { ...headers };
          if (hasBody && a.body !== undefined && !Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['content-type'] = 'application/json';
          const res = await fetch(url, {
            method, headers: h,
            body: hasBody && a.body !== undefined ? JSON.stringify(a.body) : undefined,
            signal: AbortSignal.timeout(15000),
          });
          return `HTTP ${res.status}\n${clip(await res.text(), MAX_TOOL_OUTPUT)}`;
        },
      });
    } else if (s.type === 'toolCode') {
      const code = String(s.params.code || '');
      tools.push({
        name: toolName(s.params.toolName, 'run_code', used),
        description: String(s.params.toolDescription || 'Runs a custom function on a text input.'),
        schema: { type: 'object', properties: { input: { type: 'string', description: 'Text passed to the function' } }, required: ['input'] },
        run: async (a) => {
          const sandbox = { input: String(a.input ?? ''), console: { log() {} }, JSON, Math, Date, fetch };
          const p = vm.runInNewContext(`(async () => {\n${code}\n})()`, sandbox, { timeout: 5000 });
          const r = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Code tool timed out after 15s')), 15000))]);
          return typeof r === 'string' ? r : JSON.stringify(r ?? null);
        },
      });
    }
  }
  return tools;
}

async function runTool(tools: Tool[], name: string, rawArgs: unknown, steps: Step[]): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  let args: Record<string, any> = {};
  if (typeof rawArgs === 'string') { try { args = JSON.parse(rawArgs || '{}'); } catch { args = {}; } }
  else if (rawArgs && typeof rawArgs === 'object') args = rawArgs as Record<string, any>;
  let output: string;
  try {
    if (!tool) throw new Error(`unknown tool "${name}"`);
    output = clip(await tool.run(args), MAX_TOOL_OUTPUT);
  } catch (e: any) {
    // The model sees the error and can try again.
    output = `Error: ${e.message}`;
  }
  steps.push({ tool: name, input: args, output });
  return output;
}

// ---------- Memory ----------
function memoryError(e: { message: string }): Error {
  return /chat_memory/.test(e.message)
    ? new Error('Chat memory table is missing. Run the chat_memory part of supabase/schema.sql in Supabase.')
    : new Error('Chat memory: ' + e.message);
}

async function loadHistory(workflowId: string | undefined, session: string, size: number): Promise<Msg[]> {
  if (!workflowId) return [];
  const { data, error } = await db().from('chat_memory').select('role,content')
    .eq('workflow_id', workflowId).eq('session_id', session).order('id', { ascending: false }).limit(size);
  if (error) throw memoryError(error);
  const list = ((data || []) as Msg[]).reverse();
  // Providers want the conversation to start with the user.
  while (list.length && list[0].role !== 'user') list.shift();
  return list;
}

async function saveTurn(workflowId: string | undefined, session: string, user: string, assistant: string) {
  if (!workflowId) return;
  const rows = [
    { workflow_id: workflowId, session_id: session, role: 'user', content: clip(user, 8000) },
    { workflow_id: workflowId, session_id: session, role: 'assistant', content: clip(assistant, 8000) },
  ];
  const ins = await db().from('chat_memory').insert(rows);
  if (ins.error) throw memoryError(ins.error);
  // Keep the last 100 messages per session.
  const { data: old } = await db().from('chat_memory').select('id')
    .eq('workflow_id', workflowId).eq('session_id', session).order('id', { ascending: false }).range(100, 100);
  if (old?.[0]) await db().from('chat_memory').delete().eq('workflow_id', workflowId).eq('session_id', session).lte('id', old[0].id);
}

// ---------- Model loop ----------
async function post(url: string, headers: Record<string, string>, body: unknown, label: string, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    throw new Error(e?.name === 'TimeoutError' ? `${label} did not answer in time` : `${label}: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${label} sent a reply that is not JSON`); }
}

type Loop = {
  cred: Record<string, any>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  system: string;
  history: Msg[];
  prompt: string;
  tools: Tool[];
  maxRounds: number;
  deadline: number;
};

async function modelLoop(o: Loop): Promise<{ text: string; steps: Step[] }> {
  const def = CREDENTIAL_TYPES.find((t) => t.type === o.cred.type);
  const model = o.model || def?.models?.[0];
  if (!model) throw new Error('Enter a model name on the Chat Model node');
  const label = def?.label || 'AI';
  const steps: Step[] = [];
  const timeout = () => {
    const left = o.deadline - Date.now();
    if (left < 3000) throw new Error('Agent ran out of time (a run must finish in 60 seconds)');
    return Math.min(25000, left - 1000);
  };

  if (o.cred.type === 'anthropic') {
    const messages: any[] = [...o.history, { role: 'user', content: o.prompt }];
    for (let round = 0; round <= o.maxRounds; round++) {
      const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': o.cred.apiKey, 'anthropic-version': '2023-06-01' }, {
        model, max_tokens: o.maxTokens || 2048, messages,
        ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
        ...(o.system ? { system: o.system } : {}),
        ...(o.tools.length ? { tools: o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema })) } : {}),
      }, label, timeout());
      const blocks: any[] = r?.content || [];
      const uses = blocks.filter((b) => b.type === 'tool_use');
      if (!uses.length) return { text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join(''), steps };
      if (round === o.maxRounds) break;
      messages.push({ role: 'assistant', content: blocks });
      const results: any[] = [];
      for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(o.tools, u.name, u.input, steps) });
      messages.push({ role: 'user', content: results });
    }
    throw new Error(`Agent stopped after ${o.maxRounds} tool rounds. Raise "Max tool rounds" or simplify the task.`);
  }

  // Everything else speaks the OpenAI chat-completions format.
  const base = String(o.cred.baseUrl || def?.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('This credential has no base URL');
  const headers: Record<string, string> = o.cred.apiKey ? { Authorization: `Bearer ${o.cred.apiKey}` } : {};
  const messages: any[] = [
    ...(o.system ? [{ role: 'system', content: o.system }] : []),
    ...o.history,
    { role: 'user', content: o.prompt },
  ];
  const toolDefs = o.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
  for (let round = 0; round <= o.maxRounds; round++) {
    const r = await post(`${base}/chat/completions`, headers, {
      model, messages,
      ...(toolDefs.length ? { tools: toolDefs } : {}),
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      ...(o.maxTokens && o.cred.type !== 'openai' ? { max_tokens: o.maxTokens } : {}),
    }, label, timeout());
    const msg = r?.choices?.[0]?.message;
    if (!msg) throw new Error(`${label} returned no message`);
    const calls: any[] = msg.tool_calls || [];
    if (!calls.length) return { text: typeof msg.content === 'string' ? msg.content : '', steps };
    if (round === o.maxRounds) break;
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(o.tools, call.function?.name, call.function?.arguments, steps) });
    }
  }
  throw new Error(`Agent stopped after ${o.maxRounds} tool rounds. Raise "Max tool rounds" or simplify the task.`);
}

const optNum = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? undefined : Number(v));

export async function agentRun(c: Ctx): Promise<Item[][]> {
  const { model, memory, tools: toolSubs } = c.subs;
  if (!model) throw new Error('Connect a Chat Model to the agent (drag from its top dot to the Chat Model socket)');
  if (!model.cred) throw new Error('Select an AI credential on the Chat Model node');
  const deadline = Date.now() + BUDGET_MS;
  const maxRounds = Math.min(20, Math.max(1, Number(c.raw('maxIterations')) || 8));
  const out: Item[] = [];

  for (let i = 0; i < c.items.length; i++) {
    const scope = c.scope(i);
    const prompt = String(c.param('prompt', i) ?? '');
    if (!prompt.trim()) throw new Error('The prompt is empty. Check the Prompt field of the agent.');
    const closers: Closer[] = [];
    let tools: Tool[];
    try { tools = await buildTools(toolSubs, scope, closers); }
    catch (e) { await Promise.all(closers.map((f) => f())); throw e; }

    let session = '';
    let history: Msg[] = [];
    if (memory) {
      const key = resolve(memory.params.sessionKey ?? '{{ $json.sessionId }}', scope);
      session = String(key ?? '').trim() || 'default';
      const size = Math.min(50, Math.max(1, Number(memory.params.windowSize ?? 10) || 10));
      history = await loadHistory(c.workflowId, session, size);
    }

    let text: string, steps: Step[];
    try {
      ({ text, steps } = await modelLoop({
        cred: model.cred,
        model: String(resolve(model.params.model ?? '', scope) || ''),
        temperature: optNum(model.params.temperature),
        maxTokens: optNum(model.params.maxTokens),
        system: String(c.param('system', i) || ''),
        history, prompt, tools, maxRounds, deadline,
      }));
    } finally {
      await Promise.all(closers.map((f) => f()));
    }

    if (memory) await saveTurn(c.workflowId, session, prompt, text);
    out.push({ json: { output: text, ...(c.raw('returnSteps') === true ? { steps } : {}) } });
  }
  return [out];
}
