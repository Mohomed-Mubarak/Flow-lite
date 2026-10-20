// Server-only. Flowlite as an MCP server (Streamable HTTP, stateless, JSON replies).
// Any MCP client can connect: n8n's MCP Client node, Claude, Cursor, other agents.
import { authenticate, hasScope, type KeyInfo, type Scope } from './apiKeys';
import { ApiError } from './apiError';
import * as svc from './service';
import { CORS, errorResponse } from './v1';

const SERVER = { name: 'flowlite', title: 'Flowlite', version: '1.0.0' };
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_TEXT = 60_000;

const INSTRUCTIONS = `Flowlite runs automation workflows: a trigger node followed by connected nodes (HTTP, AI, Slack, email, Google, code and more).

Typical use:
1. list_workflows to see what exists. run_workflow to start one and get its output.
2. To build one: list_node_types -> describe_node_type (parameters) -> list_credentials (ids) -> create_workflow -> run_workflow -> get_execution to debug.

Graph format:
- nodes: [{ id, type, name, params }]. id and name are optional (generated). position is optional.
- edges: [{ source, target }] connect the main flow. Nodes with several outputs (IF, Switch) use sourceHandle "out0", "out1", ...
- AI Agent: plug sub-nodes INTO the agent with targetHandle "model" (Chat Model, required), "memory" or "tool", e.g. { source: "lm", target: "agent", targetHandle: "model" }.
- Params may use expressions: {{ $json.field }} or {{ $node["Node Name"].json.field }}.
- Nodes that need a key take params.credential = a credential id from list_credentials.
- A workflow needs a trigger node first (manual, webhook, schedule, chatTrigger...). Webhook/schedule workflows only fire automatically after set_workflow_active.
One run must finish within 60 seconds. For longer work use run_workflow with wait=false, then poll get_execution.`;

type Tool = {
  name: string; title: string; description: string; scope: Scope;
  inputSchema: Record<string, any>;
  hints: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (c: svc.Ctx, a: any) => Promise<unknown>;
};

const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const id = { type: 'string', description: 'Workflow id (UUID).' };

const nodesSchema = {
  type: 'array', description: 'Workflow nodes. The first should be a trigger.',
  items: {
    type: 'object', required: ['type'],
    properties: {
      id: { type: 'string', description: 'Unique id inside the workflow. Optional.' },
      type: { type: 'string', description: 'Node type from list_node_types, e.g. "webhook", "aichat", "agent".' },
      name: { type: 'string', description: 'Display name, unique in the workflow. Optional.' },
      position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Canvas position. Optional.' },
      params: { type: 'object', description: 'Node parameters. See describe_node_type.', additionalProperties: true },
    },
  },
};
const edgesSchema = {
  type: 'array', description: 'Connections between nodes.',
  items: {
    type: 'object', required: ['source', 'target'],
    properties: {
      source: { type: 'string', description: 'Id of the node the data comes from.' },
      target: { type: 'string', description: 'Id of the node that receives it.' },
      sourceHandle: { type: 'string', description: 'Output: "out0" (default), "out1"... for IF/Switch.' },
      targetHandle: { type: 'string', enum: ['model', 'memory', 'tool'], description: 'Only for sub-nodes plugged into an AI Agent.' },
    },
  },
};

const TOOLS: Tool[] = [
  { name: 'list_workflows', title: 'List workflows', scope: 'read', hints: { readOnlyHint: true },
    description: 'List all workflows with id, name, active state and how each trigger starts (webhook URL, cron).',
    inputSchema: obj({ active: { type: 'boolean', description: 'Only active (true) or inactive (false) workflows.' } }),
    run: (c, a) => svc.listWorkflows(c, { active: typeof a.active === 'boolean' ? a.active : undefined }) },
  { name: 'get_workflow', title: 'Get workflow', scope: 'read', hints: { readOnlyHint: true },
    description: 'Get one workflow with all its nodes, edges and trigger URLs.',
    inputSchema: obj({ id }, ['id']), run: (c, a) => svc.getWorkflow(c, a.id) },
  { name: 'run_workflow', title: 'Run workflow', scope: 'run', hints: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    description: 'Run a workflow now and return its final output and per-node status. The workflow does not need to be active. `input` becomes the trigger data: for a Webhook trigger it is the request body, for a Chat trigger use {"message": "...", "sessionId": "..."}, for a Form trigger the field values, for a Manual trigger it is $json. The workflow may have real side effects (send email, post messages). With wait=false it returns an executionId immediately; poll get_execution.',
    inputSchema: obj({
      id, input: { type: 'object', description: 'Trigger data. Optional.', additionalProperties: true },
      wait: { type: 'boolean', description: 'Wait for the result (default true). false = return executionId at once.' },
      start_node_id: { type: 'string', description: 'Trigger node id, when the workflow has several triggers. Optional.' },
    }, ['id']),
    run: (c, a) => svc.runWorkflowNow(c, a.id, { input: a.input, wait: a.wait !== false, startNodeId: a.start_node_id }) },
  { name: 'get_execution', title: 'Get execution', scope: 'read', hints: { readOnlyHint: true },
    description: 'Get the result of a run: status, error, final output and each node\'s status. Use full=true to also get every node\'s input and output (large) when debugging.',
    inputSchema: obj({ id: { type: 'string', description: 'Execution id.' }, full: { type: 'boolean' } }, ['id']),
    run: (_c, a) => svc.getExecution(a.id, { full: a.full === true }) },
  { name: 'list_executions', title: 'List executions', scope: 'read', hints: { readOnlyHint: true },
    description: 'Recent runs, newest first. Filter by workflow or status.',
    inputSchema: obj({ workflow_id: id, status: { type: 'string', enum: ['success', 'error', 'running'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } }),
    run: (_c, a) => svc.listExecutions({ workflowId: a.workflow_id, status: a.status, limit: a.limit }) },
  { name: 'list_node_types', title: 'List node types', scope: 'read', hints: { readOnlyHint: true },
    description: 'The node types you can use in a workflow, with a one-line description. Groups: trigger, logic, data, app, ai, sub (agent sub-nodes: model, memory, tools).',
    inputSchema: obj({ group: { type: 'string', enum: ['trigger', 'logic', 'data', 'app', 'ai', 'sub'] }, search: { type: 'string', description: 'Text to look for in the name or description.' } }),
    run: async (_c, a) => svc.listNodeTypes({ group: a.group, search: a.search }) },
  { name: 'describe_node_type', title: 'Describe node type', scope: 'read', hints: { readOnlyHint: true },
    description: 'All parameters of one node type: names, types, options, defaults, and which credential types it takes.',
    inputSchema: obj({ type: { type: 'string', description: 'Node type, e.g. "httpRequest".' } }, ['type']),
    run: async (_c, a) => svc.describeNodeType(a.type) },
  { name: 'list_credentials', title: 'List credentials', scope: 'read', hints: { readOnlyHint: true },
    description: 'Saved credentials (id, name, type). Secrets are never shown. Put an id in a node\'s params.credential.',
    inputSchema: obj({}), run: () => svc.listCredentials() },
  { name: 'create_workflow', title: 'Create workflow', scope: 'full', hints: { readOnlyHint: false, destructiveHint: false },
    description: 'Create a workflow from nodes and edges. Validates the graph and returns warnings. Created inactive unless active=true. Without nodes it starts with a Manual Trigger.',
    inputSchema: obj({ name: { type: 'string' }, nodes: nodesSchema, edges: edgesSchema, active: { type: 'boolean' } }, ['name']),
    run: (c, a) => svc.createWorkflow(c, a) },
  { name: 'update_workflow', title: 'Update workflow', scope: 'full', hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Change a workflow\'s name and/or replace its nodes/edges. Send the COMPLETE new nodes and edges (they replace the old ones), so call get_workflow first and edit that.',
    inputSchema: obj({ id, name: { type: 'string' }, nodes: nodesSchema, edges: edgesSchema }, ['id']),
    run: (c, a) => svc.updateWorkflow(c, a.id, a) },
  { name: 'set_workflow_active', title: 'Activate or deactivate workflow', scope: 'full', hints: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: 'Turn a workflow on or off. Only active workflows react to webhooks, Telegram messages, schedules and public chat/forms.',
    inputSchema: obj({ id, active: { type: 'boolean' } }, ['id', 'active']),
    run: (c, a) => svc.setActive(c, a.id, a.active) },
  { name: 'delete_workflow', title: 'Delete workflow', scope: 'full', hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Permanently delete a workflow and its run history. Ask the user first.',
    inputSchema: obj({ id }, ['id']), run: (c, a) => svc.deleteWorkflow(c, a.id) },
];

const ok = (rid: unknown, result: unknown) => ({ jsonrpc: '2.0', id: rid, result });
const fail = (rid: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: rid, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

async function dispatch(m: any, key: KeyInfo, req: Request): Promise<any | null> {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0') return fail(m?.id ?? null, -32600, 'Invalid JSON-RPC message');
  if (m.method === undefined) return null; // a response from the client: nothing to do
  if (m.id === undefined) return null; // a notification (notifications/initialized, notifications/cancelled)
  const p = m.params ?? {};
  switch (m.method) {
    case 'initialize':
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS,
      });
    case 'ping': return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: TOOLS.filter((t) => hasScope(key.scope, t.scope)).map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.hints } })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === p.name);
      if (!tool) return fail(m.id, -32602, `Unknown tool: ${p.name}`);
      if (!hasScope(key.scope, tool.scope)) return ok(m.id, text(`This API key has "${key.scope}" access. "${tool.scope}" access is needed for ${tool.name}.`, true));
      const args = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
      try {
        const out = await tool.run({ req, source: 'mcp' }, args);
        let t = JSON.stringify(out);
        if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT) + `\n…truncated (${t.length} characters). Ask for less, for example without full=true.`;
        return ok(m.id, text(t));
      } catch (e: any) {
        return ok(m.id, text(e instanceof ApiError ? e.message : `Server error: ${e?.message || 'unknown'}`, true));
      }
    }
    case 'resources/list': return ok(m.id, { resources: [] });
    case 'prompts/list': return ok(m.id, { prompts: [] });
    default: return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function handleMcpPost(req: Request): Promise<Response> {
  let key: KeyInfo;
  try { key = await authenticate(req); } catch (e) { return errorResponse(e); }
  let body: any;
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, 'Parse error'), { status: 400, headers: CORS }); }
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m: any) => dispatch(m, key, req)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(batch ? replies : replies[0], { headers: CORS });
}

/** This server has no streams and no sessions, so GET and DELETE are not offered. */
export const notAllowed = () => new Response('This MCP server accepts POST only (Streamable HTTP, no sessions).', { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } });
