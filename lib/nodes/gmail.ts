// Server-only: Gmail node runner and helpers.
import type { Ctx, Runner } from './runners';
import { each, str } from './extra';
import { oauthCall } from './googleAuth';
import { fetchAttachments } from './email';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const dec = (d?: string) => (d ? Buffer.from(d, 'base64url').toString('utf8') : '');
const strip = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export const gmailCall = (cred: Record<string, any> | null) => oauthCall('Gmail', cred, 'Gmail');

function parse(m: any) {
  const hdr = (n: string) => (m.payload?.headers || []).find((h: any) => h.name.toLowerCase() === n)?.value ?? '';
  let text = '', html = '';
  const attachments: { filename: string; mimeType: string; size: number }[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename) attachments.push({ filename: p.filename, mimeType: p.mimeType, size: p.body?.size ?? 0 });
    else if (p.mimeType === 'text/plain' && p.body?.data) text += dec(p.body.data);
    else if (p.mimeType === 'text/html' && p.body?.data) html += dec(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(m.payload);
  const body = text || (html ? strip(html) : '');
  return {
    id: m.id, threadId: m.threadId, subject: hdr('subject'), from: hdr('from'), to: hdr('to'), cc: hdr('cc'), replyTo: hdr('reply-to'), date: hdr('date'),
    messageId: hdr('message-id'), references: hdr('references'), snippet: m.snippet, labels: m.labelIds || [], unread: (m.labelIds || []).includes('UNREAD'),
    ...(body ? { text: clip(body, 20000) } : {}), attachments,
  };
}

export async function gmailSearch(cred: Record<string, any> | null, q: string, limit: number, full: boolean) {
  const call = gmailCall(cred);
  const n = Math.min(50, Math.max(1, limit || 10));
  const list = await call('GET', `${GMAIL}/messages?maxResults=${n}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const ids: string[] = (list.messages || []).map((m: any) => m.id);
  const meta = ['Subject', 'From', 'To', 'Date', 'Message-ID'].map((h) => `metadataHeaders=${h}`).join('&');
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    out.push(...(await Promise.all(ids.slice(i, i + 5).map((id) => call('GET', `${GMAIL}/messages/${id}?format=${full ? 'full' : 'metadata'}&${meta}`)))));
  }
  return out.map(parse);
}
export async function gmailGet(cred: Record<string, any> | null, id: string) {
  if (!/^[0-9a-f]+$/i.test(id)) throw new Error('Message ID is empty or wrong. Get many emails returns it as id.');
  return parse(await gmailCall(cred)('GET', `${GMAIL}/messages/${id}?format=full`));
}

type Mail = { to: string; cc?: string; bcc?: string; subject: string; body: string; html?: boolean; inReplyTo?: string; references?: string; attachments?: any[] };
async function raw(o: Mail): Promise<string> {
  if (!o.to.trim()) throw new Error('To is empty.');
  const MailComposer = (await import('nodemailer/lib/mail-composer')).default;
  const mail = new MailComposer({
    to: o.to, ...(o.cc ? { cc: o.cc } : {}), ...(o.bcc ? { bcc: o.bcc } : {}), subject: o.subject, ...(o.html ? { html: o.body } : { text: o.body }),
    ...(o.inReplyTo ? { inReplyTo: o.inReplyTo, references: o.references || o.inReplyTo } : {}), ...(o.attachments?.length ? { attachments: o.attachments } : {}),
  });
  const buf: Buffer = await new Promise((res, rej) => mail.compile().build((e: Error | null, b: Buffer) => (e ? rej(e) : res(b))));
  return buf.toString('base64url');
}
export async function gmailSend(cred: Record<string, any> | null, o: Mail & { threadId?: string }, draft = false) {
  const call = gmailCall(cred);
  const message = { raw: await raw(o), ...(o.threadId ? { threadId: o.threadId } : {}) };
  if (draft) { const r = await call('POST', `${GMAIL}/drafts`, { message }); return { draftId: r.id, messageId: r.message?.id, threadId: r.message?.threadId }; }
  const r = await call('POST', `${GMAIL}/messages/send`, message);
  return { id: r.id, threadId: r.threadId, labels: r.labelIds || [] };
}
export async function gmailReply(cred: Record<string, any> | null, id: string, body: string, html: boolean, draft = false) {
  const orig = await gmailGet(cred, id);
  const to = orig.replyTo || orig.from;
  const subject = /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
  return gmailSend(cred, { to, subject, body, html, inReplyTo: orig.messageId, references: `${orig.references} ${orig.messageId}`.trim(), threadId: orig.threadId }, draft);
}
async function labelId(cred: Record<string, any> | null, name: string): Promise<string> {
  const labels: any[] = (await gmailCall(cred)('GET', `${GMAIL}/labels`)).labels || [];
  const hit = labels.find((l) => l.name.toLowerCase() === name.toLowerCase() || l.id === name);
  if (!hit) throw new Error(`No label named "${name}". Labels are: ${labels.map((l) => l.name).join(', ')}`);
  return hit.id;
}

export const gmailRunners: Record<string, Runner> = {
  gmail: each(async (c: Ctx, i: number) => {
    const cred = c.cred;
    const op = String(c.param('operation', i) || 'Get many emails');
    const id = () => str(c, 'messageId', i);
    const html = c.raw('format') === 'HTML';
    const body = String(c.param('body', i) ?? '');
    const modify = async (add: string[], remove: string[]) => { await gmailCall(cred)('POST', `${GMAIL}/messages/${id()}/modify`, { addLabelIds: add, removeLabelIds: remove }); return { id: id(), done: true }; };
    switch (op) {
      case 'Get many emails': return gmailSearch(cred, str(c, 'query', i), Number(c.raw('limit')) || 10, c.raw('includeBody') !== false);
      case 'Get an email': return gmailGet(cred, id());
      case 'Send an email': {
        const atts = str(c, 'attachmentUrls', i) ? await fetchAttachments(str(c, 'attachmentUrls', i)) : [];
        return gmailSend(cred, { to: str(c, 'to', i), cc: str(c, 'cc', i), bcc: str(c, 'bcc', i), subject: String(c.param('subject', i) ?? ''), body, html, attachments: atts });
      }
      case 'Reply to an email': return gmailReply(cred, id(), body, html);
      case 'Create a draft': return gmailSend(cred, { to: str(c, 'to', i), subject: String(c.param('subject', i) ?? ''), body, html }, true);
      case 'Mark as read': return modify([], ['UNREAD']);
      case 'Mark as unread': return modify(['UNREAD'], []);
      case 'Move to trash': { await gmailCall(cred)('POST', `${GMAIL}/messages/${id()}/trash`, {}); return { id: id(), trashed: true }; }
      case 'Add label': return modify([await labelId(cred, str(c, 'label', i))], []);
      case 'Remove label': return modify([], [await labelId(cred, str(c, 'label', i))]);
      case 'Get labels': return ((await gmailCall(cred)('GET', `${GMAIL}/labels`)).labels || []).map((l: any) => ({ id: l.id, name: l.name, type: l.type }));
      default: throw new Error(`Unknown action "${op}"`);
    }
  }),
};
