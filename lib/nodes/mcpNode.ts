// Server-only: the MCP Client node (run one tool on an MCP server).
import type { Item } from '../types';
import type { Runner } from './runners';
import { str } from './extra';
import { McpClient } from './mcp';

export const mcpRunners: Record<string, Runner> = {
  async mcpClient(c) {
    const url = str(c, 'url', 0);
    if (!/^https?:\/\//i.test(url)) throw new Error('Endpoint URL must start with http:// or https://');
    const headers: Record<string, string> = {};
    const extra = c.json('headers', 0);
    if (extra && typeof extra === 'object') for (const [k, v] of Object.entries(extra)) headers[k] = String(v);
    const cr = c.cred;
    if (cr?.type === 'httpBearer') headers.Authorization = `Bearer ${cr.token}`;
    if (cr?.type === 'httpBasic') headers.Authorization = 'Basic ' + Buffer.from(`${cr.user}:${cr.password}`).toString('base64');
    if (cr?.type === 'httpHeader') headers[cr.name] = cr.value;
    const client = new McpClient(url, headers);
    const out: Item[] = [];
    try {
      await client.connect();
      if (String(c.raw('operation') || 'List tools') === 'List tools') {
        for (const t of await client.listTools()) out.push({ json: { name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} } });
      } else {
        for (let i = 0; i < c.items.length; i++) {
          const tool = str(c, 'tool', i);
          if (!tool) throw new Error('Tool name is empty. Use List tools to see the names.');
          const args = c.json('arguments', i);
          if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new Error('Arguments must be a JSON object.');
          const result = await client.callTool(tool, (args as Record<string, any>) ?? {});
          let parsed: unknown = result;
          try { parsed = JSON.parse(result); } catch { /* plain text */ }
          out.push({ json: { tool, result: parsed } });
        }
      }
    } finally { await client.close(); }
    return [out];
  },
};
