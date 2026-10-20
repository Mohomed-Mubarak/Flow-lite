import { executeAndStore } from './run';
import type { ExecResult, Item, WFEdge, WFNode } from './types';

export const MAX_CHAT_CHARS = 4000;

/** Picks the text a chat user should see from the last node's items. */
export function replyText(items?: Item[]): string {
  if (!items?.length) return '';
  return items
    .map((it) => {
      const j = it.json ?? {};
      for (const k of ['output', 'text', 'message', 'reply', 'response']) if (typeof j[k] === 'string' && j[k]) return j[k] as string;
      return JSON.stringify(j, null, 2);
    })
    .join('\n\n');
}

/** Validates a chat request body. */
export function readChatBody(b: any): { message: string; sessionId: string } | { error: string } {
  const message = typeof b?.message === 'string' ? b.message.trim() : '';
  if (!message) return { error: 'Type a message first' };
  if (message.length > MAX_CHAT_CHARS) return { error: `Messages are limited to ${MAX_CHAT_CHARS} characters` };
  const sid = typeof b?.sessionId === 'string' ? b.sessionId.trim().slice(0, 100) : '';
  return { message, sessionId: sid || 'default' };
}

type Wf = { id: string; name: string; nodes: WFNode[]; edges: WFEdge[] };

/** Runs one chat turn: starts the workflow at the Chat Trigger with the message. */
export async function runChat(wf: Wf, node: WFNode, message: string, sessionId: string): Promise<ExecResult> {
  return executeAndStore(wf, {
    startNodeId: node.id,
    mode: 'chat',
    triggerItems: [{ json: { sessionId, action: 'sendMessage', chatInput: message } }],
  });
}
