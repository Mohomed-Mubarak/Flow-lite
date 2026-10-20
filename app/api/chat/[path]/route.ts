import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { readChatBody, replyText, runChat } from '@/lib/chat';
import { cleanPath } from '@/lib/triggers';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Finds the public Chat Trigger for a path. Only active workflows with "publicly available" on. */
async function find(path: string) {
  const { data } = await db().from('workflows').select('*').eq('active', true);
  for (const w of data || []) {
    const node = (w.nodes as WFNode[]).find((n) => n.type === 'chatTrigger' && n.params.public === true && cleanPath(n.params.path || 'chat') === path);
    if (node) return { wf: w, node };
  }
  return null;
}

// Public: display settings only.
async function _GET(_: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const hit = await find(path);
  if (!hit) return Response.json({ error: 'This chat is not available' }, { status: 404 });
  const p = hit.node.params;
  return Response.json({ title: p.title || 'Chat', initialMessage: p.initialMessage ?? 'Hi! How can I help?' });
}

// Public: one chat turn. Errors are logged in Executions, not shown to visitors.
async function _POST(req: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const body = readChatBody(await req.json().catch(() => ({})));
  if ('error' in body) return Response.json({ error: body.error }, { status: 400 });
  const hit = await find(path);
  if (!hit) return Response.json({ error: 'This chat is not available' }, { status: 404 });
  const res = await runChat(hit.wf, hit.node, body.message, body.sessionId);
  if (res.status === 'error') return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  return Response.json({ reply: replyText(res.last) });
}

export const GET = guard(_GET);
export const POST = guard(_POST);
