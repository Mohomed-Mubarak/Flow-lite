// Server-only: email nodes. SMTP send/reply, Resend, IMAP read and manage.
import type { Item } from '../types';
import type { Runner } from './runners';
import { api, each, need, str } from './extra';
import { publicFetch } from './agentTools';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Downloads public https files for attachments. Max 5 files and 10 MB in total. */
export async function fetchAttachments(list: string): Promise<{ filename: string; content: Buffer; contentType?: string }[]> {
  const urls = list.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  let total = 0;
  const out: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const u of urls) {
    const res = await publicFetch(u);
    if (!res.ok) throw new Error(`Attachment ${u} answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    total += buf.length;
    if (total > 10 * 1024 * 1024) throw new Error('Attachments are over 10 MB in total.');
    const name = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || 'file');
    out.push({ filename: name, content: buf, contentType: res.headers.get('content-type') || undefined });
  }
  return out;
}

export const emailRunners: Record<string, Runner> = {
  // ---------- Resend ----------
  async email(c) {
    const key = need(c, 'apiKey', 'Resend');
    const headers = { Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    const out: Item[] = [];
    for (let i = 0; i < c.items.length; i++) {
      const op = String(c.param('operation', i) || 'Send an email');
      if (op === 'Get an email') {
        const id = str(c, 'emailId', i);
        if (!id) throw new Error('Email ID is empty. Send an email returns it as id.');
        const r = await api('Resend', `https://api.resend.com/emails/${encodeURIComponent(id)}`, { headers });
        out.push({ json: { id: r.id, from: r.from, to: r.to, subject: r.subject, lastEvent: r.last_event, createdAt: r.created_at } });
        continue;
      }
      const list = (n: string) => str(c, n, i).split(',').map((s) => s.trim()).filter(Boolean);
      const to = list('to');
      if (!str(c, 'from', i) || !to.length) throw new Error('From and To are required.');
      const text = c.raw('format') === 'Text';
      const body = String(c.param('html', i) ?? '');
      const atts = str(c, 'attachmentUrls', i)
        ? (await fetchAttachments(str(c, 'attachmentUrls', i))).map((a) => ({ filename: a.filename, content: a.content.toString('base64') }))
        : [];
      const r = await api('Resend', 'https://api.resend.com/emails', {
        method: 'POST', headers,
        body: JSON.stringify({
          from: str(c, 'from', i), to, subject: String(c.param('subject', i) ?? ''), [text ? 'text' : 'html']: body,
          ...(list('cc').length ? { cc: list('cc') } : {}), ...(list('bcc').length ? { bcc: list('bcc') } : {}),
          ...(str(c, 'replyTo', i) ? { reply_to: list('replyTo') } : {}), ...(atts.length ? { attachments: atts } : {}),
        }),
      });
      out.push({ json: { id: r?.id } });
    }
    return [out];
  },

  // ---------- SMTP ----------
  async smtp(c) {
    const host = need(c, 'host', 'SMTP');
    const port = Number(c.cred?.port) || 587;
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465,
      ...(c.cred?.user ? { auth: { user: String(c.cred.user), pass: String(c.cred.password ?? '') } } : {}),
      connectionTimeout: 15000, socketTimeout: 30000,
    });
    const out: Item[] = [];
    try {
      for (let i = 0; i < c.items.length; i++) {
        const op = String(c.param('operation', i) || 'Send an email');
        const from = str(c, 'from', i), to = str(c, 'to', i);
        if (!from || !to) throw new Error('From and To are required.');
        const body = String(c.param('body', i) ?? '');
        let subject = String(c.param('subject', i) ?? '');
        const extra: Record<string, any> = {};
        if (op === 'Reply to an email') {
          const mid = str(c, 'inReplyTo', i);
          if (!mid) throw new Error('Message ID of the email you reply to is empty. Email Read returns it as messageId.');
          extra.inReplyTo = mid;
          extra.references = str(c, 'references', i) ? `${str(c, 'references', i)} ${mid}` : mid;
          if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
        }
        const atts = str(c, 'attachmentUrls', i) ? await fetchAttachments(str(c, 'attachmentUrls', i)) : [];
        const info = await transport.sendMail({
          from, to, subject, ...extra,
          ...(str(c, 'cc', i) ? { cc: str(c, 'cc', i) } : {}), ...(str(c, 'bcc', i) ? { bcc: str(c, 'bcc', i) } : {}),
          ...(str(c, 'replyTo', i) ? { replyTo: str(c, 'replyTo', i) } : {}),
          ...(c.raw('format') === 'HTML' ? { html: body } : { text: body }),
          ...(atts.length ? { attachments: atts } : {}),
        });
        out.push({ json: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected } });
      }
    } finally { transport.close(); }
    return [out];
  },

  // ---------- IMAP ----------
  async emailRead(c) {
    const host = need(c, 'host', 'IMAP');
    const user = need(c, 'user', 'IMAP');
    const pass = need(c, 'password', 'IMAP');
    const port = Number(c.cred?.port) || 993;
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');
    const client = new ImapFlow({ host, port, secure: port === 993, auth: { user, pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 40000 });
    client.on('error', () => { /* surfaced by the awaited call */ });
    try { await client.connect(); }
    catch (e: any) { throw new Error(`IMAP login failed: ${e?.responseText || e?.message || e}. Check host, port 993, user and password (Gmail needs an app password).`); }

    const out: Item[] = [];
    try {
      for (let i = 0; i < c.items.length; i++) {
        const op = String(c.param('operation', i) || 'Get many emails');
        if (op === 'Get mailboxes') {
          for (const m of await client.list()) out.push({ json: { path: m.path, name: m.name, specialUse: m.specialUse ?? null, flags: [...(m.flags || [])] } });
          continue;
        }
        const mailbox = str(c, 'mailbox', i) || 'INBOX';
        const lock = await client.getMailboxLock(mailbox);
        try {
          const uidOf = () => { const v = str(c, 'uid', i); if (!/^\d+$/.test(v)) throw new Error('UID must be a number. Get many emails returns it as uid.'); return v; };
          if (op === 'Mark as read') { await client.messageFlagsAdd(uidOf(), ['\\Seen'], { uid: true }); out.push({ json: { uid: Number(uidOf()), seen: true } }); }
          else if (op === 'Mark as unread') { await client.messageFlagsRemove(uidOf(), ['\\Seen'], { uid: true }); out.push({ json: { uid: Number(uidOf()), seen: false } }); }
          else if (op === 'Move an email') {
            const dest = str(c, 'destination', i);
            if (!dest) throw new Error('Destination folder is empty. Use Get mailboxes to see the names.');
            await client.messageMove(uidOf(), dest, { uid: true });
            out.push({ json: { uid: Number(uidOf()), movedTo: dest } });
          } else if (op === 'Delete an email') { await client.messageDelete(uidOf(), { uid: true }); out.push({ json: { uid: Number(uidOf()), deleted: true } }); }
          else if (op === 'Get many emails') {
            const q: Record<string, any> = {};
            if (c.raw('status') !== 'All') q.seen = false;
            if (str(c, 'from', i)) q.from = str(c, 'from', i);
            if (str(c, 'subject', i)) q.subject = str(c, 'subject', i);
            const days = Number(c.raw('sinceDays'));
            if (days > 0) q.since = new Date(Date.now() - days * 864e5);
            const limit = Math.min(100, Math.max(1, Number(c.raw('limit')) || 20));
            const found = await client.search(Object.keys(q).length ? q : { all: true }, { uid: true });
            const uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a).slice(0, limit);
            for (const uid of uids) {
              const m = await client.fetchOne(String(uid), { source: { maxLength: 1_500_000 }, flags: true, uid: true }, { uid: true });
              if (!m || !m.source) continue;
              const p = await simpleParser(m.source);
              const addr = (a: any) => (Array.isArray(a) ? a.flatMap((x) => x.value) : a?.value || []).map((v: any) => v.address).filter(Boolean).join(', ');
              const text = p.text || (p.html ? String(p.html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
              out.push({ json: {
                uid, messageId: p.messageId, subject: p.subject ?? '', from: addr(p.from), fromName: p.from?.value?.[0]?.name || '', to: addr(p.to), cc: addr(p.cc),
                date: p.date?.toISOString(), text: clip(text, 20000), snippet: clip(text.replace(/\s+/g, ' ').trim(), 200),
                ...(c.raw('includeHtml') === true ? { html: clip(String(p.html || ''), 100000) } : {}),
                seen: m.flags?.has('\\Seen') ?? false, flags: [...(m.flags || [])], inReplyTo: p.inReplyTo, references: Array.isArray(p.references) ? p.references.join(' ') : p.references,
                attachments: (p.attachments || []).map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
              } });
              if (c.raw('markAsRead') === true) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            }
          } else throw new Error(`Unknown action "${op}"`);
        } finally { lock.release(); }
      }
    } finally { await client.logout().catch(() => {}); }
    return [out];
  },
};
