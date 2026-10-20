import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

// Reachable without logging in: public chat/form/webhook links, the login page and its API.
// /api/v1/ and /api/mcp are for external agents. They do their own check: an API key (Bearer fl_...).
const PUBLIC = ['/api/webhook/', '/api/form/', '/form/', '/api/chat/', '/chat/', '/api/auth/', '/api/v1/', '/api/mcp'];

export async function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p === '/login' || p === '/api/cron' || PUBLIC.some((x) => p.startsWith(x))) return NextResponse.next();

  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (p.startsWith('/api/')) return Response.json({ error: 'Not logged in' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = p === '/' ? '' : `?next=${encodeURIComponent(p + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
