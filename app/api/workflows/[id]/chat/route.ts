import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { readChatBody, replyText, runChat } from '@/lib/chat';
import type { WFNode } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Editor chat (behind the admin login). Runs the editor's unsaved graph, like Run does.
async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const body = readChatBody(b);
  if ('error' in body) return Response.json({ error: body.error }, { status: 400 });

  const wf = Array.isArray(b.nodes)
    ? { id, name: b.name || 'Workflow', nodes: b.nodes as WFNode[], edges: b.edges || [] }
    : (await db().from('workflows').select('*').eq('id', id).single()).data;
  if (!wf) return Response.json({ error: 'Workflow not found' }, { status: 404 });

  const triggers = (wf.nodes as WFNode[]).filter((n) => n.type === 'chatTrigger');
  const node = triggers.find((n) => n.id === b.startNodeId) ?? triggers[0];
  if (!node) return Response.json({ error: 'Add a Chat Trigger node first' }, { status: 400 });

  const res = await runChat(wf, node, body.message, body.sessionId);
  return Response.json({
    reply: res.status === 'success' ? replyText(res.last) : '',
    status: res.status, error: res.error, results: res.results, executionId: res.executionId,
  });
}

export const POST = guard(_POST);
