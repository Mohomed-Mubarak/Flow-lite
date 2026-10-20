// Server-only. Wrapper for /api/v1 routes: API-key auth, scope check, JSON errors, CORS.
import { authenticate, requireScope, type KeyInfo, type Scope } from './apiKeys';
import { ApiError } from './apiError';
import type { Ctx } from './service';

export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-api-key, mcp-session-id, mcp-protocol-version',
  'access-control-expose-headers': 'mcp-session-id',
  'access-control-max-age': '86400',
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const errorResponse = (e: unknown) => {
  if (e instanceof ApiError) {
    return Response.json({ error: e.message, code: e.code }, {
      status: e.status, headers: { ...CORS, ...(e.status === 401 ? { 'www-authenticate': 'Bearer realm="flowlite"' } : {}) },
    });
  }
  return Response.json({ error: (e as any)?.message || 'Server error', code: 'server_error' }, { status: 500, headers: CORS });
};

type Args = { req: Request; c: Ctx; key: KeyInfo; params: Record<string, string>; url: URL; body: () => Promise<any> };

export function v1(need: Scope, fn: (a: Args) => Promise<unknown>) {
  return async (req: Request, ctx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const key = await authenticate(req);
      requireScope(key, need);
      const out = await fn({
        req, key, c: { req, source: 'api' }, url: new URL(req.url), params: (await ctx?.params) ?? {},
        body: async () => {
          const t = await req.text();
          if (!t.trim()) return {};
          try { return JSON.parse(t); } catch { throw new ApiError(400, 'The request body is not valid JSON.', 'bad_request'); }
        },
      });
      return out instanceof Response ? out : Response.json(out, { headers: CORS });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
