import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL, createSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export async function POST(req: Request) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return Response.json({ error: 'ADMIN_PASSWORD is not set in .env' }, { status: 500 });
  if (!process.env.SESSION_SECRET && !process.env.ENCRYPTION_KEY) {
    return Response.json({ error: 'Set SESSION_SECRET (or ENCRYPTION_KEY) in .env' }, { status: 500 });
  }
  const b = await req.json().catch(() => ({}));
  const user = String(b.username ?? '');
  const password = String(b.password ?? '');
  const okUser = same(user, process.env.ADMIN_USER || 'admin');
  const okPass = same(password, pass);
  if (!(okUser && okPass)) {
    await new Promise((r) => setTimeout(r, 600)); // slows down guessing
    return Response.json({ error: 'Wrong username or password' }, { status: 401 });
  }
  const https = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')) === 'https';
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: await createSession(), httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: SESSION_TTL });
  return res;
}
