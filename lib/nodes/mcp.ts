// Server-only: a small MCP client over Streamable HTTP (the current MCP remote transport).
const PROTOCOL = '2025-06-18';
const MAX_PAGES = 5;

export type McpTool = { name: string; description?: string; inputSchema?: Record<string, any> };
type Rpc = { jsonrpc: '2.0'; id?: number; result?: any; error?: { code: number; message: string } };

/** Reads either a plain JSON reply or a text/event-stream reply and returns the message for `id`. */
async function readReply(res: Response, id: number): Promise<Rpc> {
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!type.includes('text/event-stream')) {
    try { const j = JSON.parse(text); const all: Rpc[] = Array.isArray(j) ? j : [j]; return all.find((m) => m.id === id) ?? all[0]; }
    catch { throw new Error(`MCP server sent a reply that is not JSON: ${text.slice(0, 200)}`); }
  }
  let found: Rpc | undefined;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (!data) continue;
    try { const m = JSON.parse(data) as Rpc; if (m.id === id) found = m; } catch { /* skip non-JSON events */ }
  }
  if (!found) throw new Error('MCP server closed the stream without an answer');
  return found;
}

export class McpClient {
  private session?: string;
  private version = PROTOCOL;
  private next = 1;
  private ready = false;
  constructor(private url: string, private headers: Record<string, string>, private timeoutMs = 15000) {}

  private async post(body: unknown, expectReply: boolean): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', accept: 'application/json, text/event-stream',
          ...(this.session ? { 'mcp-session-id': this.session } : {}),
          ...(this.ready ? { 'mcp-protocol-version': this.version } : {}),
          ...this.headers,
        },
        body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e: any) {
      throw new Error(e?.name === 'TimeoutError' ? 'MCP server did not answer in time' : `MCP server unreachable: ${e.message}`);
    }
    if (!res.ok && !(expectReply === false && res.status === 202)) {
      const t = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 401 || res.status === 403) throw new Error(`MCP server refused access (${res.status}). Check the credential. ${t}`);
      if (res.status === 405 || res.status === 404) throw new Error(`MCP ${res.status}. The URL must be a Streamable HTTP MCP endpoint (often ending in /mcp). ${t}`);
      throw new Error(`MCP ${res.status}: ${t}`);
    }
    return res;
  }

  private async rpc(method: string, params?: unknown): Promise<any> {
    const id = this.next++;
    const res = await this.post({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) }, true);
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    const m = await readReply(res, id);
    if (m.error) throw new Error(`MCP ${method}: ${m.error.message}`);
    return m.result;
  }

  async connect() {
    const r = await this.rpc('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'flowlite', version: '1.0.0' } });
    if (r?.protocolVersion) this.version = String(r.protocolVersion);
    this.ready = true;
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, false).then((x) => x.text()).catch(() => '');
  }

  async listTools(): Promise<McpTool[]> {
    const out: McpTool[] = [];
    let cursor: string | undefined;
    for (let p = 0; p < MAX_PAGES; p++) {
      const r = await this.rpc('tools/list', cursor ? { cursor } : {});
      out.push(...((r?.tools as McpTool[]) || []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const r = await this.rpc('tools/call', { name, arguments: args });
    const parts: string[] = [];
    for (const b of (r?.content as any[]) || []) {
      if (b.type === 'text') parts.push(String(b.text ?? ''));
      else if (b.type === 'image' || b.type === 'audio') parts.push(`[${b.type} ${b.mimeType || ''} omitted]`);
      else if (b.type === 'resource') parts.push(b.resource?.text ?? JSON.stringify(b.resource ?? b));
      else if (b.type === 'resource_link') parts.push(`${b.name || ''} ${b.uri || ''}`.trim());
      else parts.push(JSON.stringify(b));
    }
    let text = parts.join('\n');
    if (!text && r?.structuredContent !== undefined) text = JSON.stringify(r.structuredContent);
    return r?.isError ? `Error: ${text || 'the tool failed'}` : text;
  }

  /** Best-effort: tell the server we are done with this session. */
  async close() {
    if (!this.session) return;
    await fetch(this.url, { method: 'DELETE', headers: { 'mcp-session-id': this.session, ...this.headers }, signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
}

/** JSON Schema as models accept it: an object schema without $schema. */
export function cleanSchema(s?: Record<string, any>): Record<string, any> {
  const { $schema, ...rest } = s || {};
  return { properties: {}, ...rest, type: 'object' };
}
