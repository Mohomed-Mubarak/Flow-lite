// Server-only: runs one Telegram node action for one item.
import type { Ctx } from './runners';

const MEDIA: Record<string, { method: string; field: string }> = {
  'Send a photo message': { method: 'sendPhoto', field: 'photo' },
  'Send a video': { method: 'sendVideo', field: 'video' },
  'Send an audio file': { method: 'sendAudio', field: 'audio' },
  'Send a document': { method: 'sendDocument', field: 'document' },
  'Send an animated file': { method: 'sendAnimation', field: 'animation' },
  'Send a sticker': { method: 'sendSticker', field: 'sticker' },
};

const blank = (v: any) => v == null || String(v).trim() === '';
const asId = (v: any) => (/^-?\d+$/.test(String(v).trim()) ? Number(v) : String(v).trim());

async function call(token: string, method: string, body: Record<string, any>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text)?.result; } catch { return text; }
}

export async function telegramAction(c: Ctx, token: string, i: number) {
  const op = String(c.param('operation', i) || 'Send a text message');
  const chatId = c.param('chatId', i);
  if (blank(chatId))
    throw new Error('Chat ID is empty. Right after the Telegram Trigger use {{ $json.chatId }}. After any other node use {{ $node["Telegram Trigger"].json.chatId }} (use your trigger node\'s exact name).');

  const str = (n: string) => { const v = c.param(n, i); return blank(v) ? '' : String(v); };
  const flag = (n: string) => c.param(n, i) === true || c.param(n, i) === 'true';
  const parseModeRaw = str('parseMode');
  const rich = op === 'Send a rich message' || op === 'Send a rich message draft';
  const parse_mode = parseModeRaw && parseModeRaw !== 'None' ? parseModeRaw : rich ? 'HTML' : undefined;
  const messageId = str('messageId');
  const needMessageId = () => {
    if (!messageId) throw new Error('Message ID is empty. A Telegram send action outputs it as {{ $json.messageId }}. A Telegram Trigger outputs {{ $json.messageId }} for the incoming message.');
    return asId(messageId);
  };
  const needText = () => {
    const t = str('text');
    if (!t.trim()) throw new Error('Message is empty. After an AI Chat node use {{ $json.text }}, after an AI Agent use {{ $json.output }}.');
    return t.slice(0, 4096);
  };
  const buttons = () => {
    const raw = c.json('buttons', i);
    if (raw == null || raw === '') return undefined;
    if (!Array.isArray(raw)) throw new Error('Inline buttons must be a JSON array of rows, like [[{"text":"Open","url":"https://example.com"}]].');
    return { inline_keyboard: raw.map((row: any) => (Array.isArray(row) ? row : [row])) };
  };
  const sendExtras = () => ({
    ...(flag('silent') ? { disable_notification: true } : {}),
    ...(flag('protect') ? { protect_content: true } : {}),
    ...(str('replyTo') ? { reply_parameters: { message_id: asId(str('replyTo')) } } : {}),
  });
  const base = { chat_id: asId(chatId) };

  switch (op) {
    case 'Send a text message':
    case 'Send a rich message': {
      const markup = op === 'Send a rich message' ? buttons() : undefined;
      const r = await call(token, 'sendMessage', {
        ...base, text: needText(), ...(parse_mode ? { parse_mode } : {}), ...sendExtras(),
        ...(flag('noPreview') ? { link_preview_options: { is_disabled: true } } : {}),
        ...(markup ? { reply_markup: markup } : {}),
      });
      return { ok: true, operation: op, messageId: r?.message_id, chatId, result: r };
    }
    case 'Edit a text message': {
      const markup = buttons();
      const r = await call(token, 'editMessageText', {
        ...base, message_id: needMessageId(), text: needText(), ...(parse_mode ? { parse_mode } : {}),
        ...(flag('noPreview') ? { link_preview_options: { is_disabled: true } } : {}),
        ...(markup ? { reply_markup: markup } : {}),
      });
      return { ok: true, operation: op, messageId: typeof r === 'object' ? r?.message_id : Number(messageId), chatId, result: r };
    }
    case 'Delete a chat message': {
      const r = await call(token, 'deleteMessage', { ...base, message_id: needMessageId() });
      return { ok: r === true, operation: op, messageId: Number(messageId), chatId };
    }
    case 'Pin a chat message': {
      const r = await call(token, 'pinChatMessage', { ...base, message_id: needMessageId(), ...(flag('silent') ? { disable_notification: true } : {}) });
      return { ok: r === true, operation: op, messageId: Number(messageId), chatId };
    }
    case 'Unpin a chat message': {
      const r = await call(token, 'unpinChatMessage', { ...base, ...(messageId ? { message_id: asId(messageId) } : {}) });
      return { ok: r === true, operation: op, messageId: messageId ? Number(messageId) : undefined, chatId };
    }
    case 'Send a chat action': {
      const r = await call(token, 'sendChatAction', { ...base, action: str('chatAction') || 'typing' });
      return { ok: r === true, operation: op, action: str('chatAction') || 'typing', chatId };
    }
    case 'Send a location': {
      const lat = Number(str('latitude')), lon = Number(str('longitude'));
      if (!str('latitude') || !str('longitude') || !Number.isFinite(lat) || !Number.isFinite(lon))
        throw new Error('Latitude and longitude must be numbers, like 51.5074 and -0.1278.');
      const r = await call(token, 'sendLocation', { ...base, latitude: lat, longitude: lon, ...sendExtras() });
      return { ok: true, operation: op, messageId: r?.message_id, chatId, result: r };
    }
    case 'Send a media group': {
      const media = c.json('media', i);
      if (!Array.isArray(media) || media.length < 2 || media.length > 10)
        throw new Error('Media must be a JSON array of 2 to 10 items, like [{"type":"photo","media":"https://..."}].');
      const items = media.map((m: any, k: number) => {
        if (!m || typeof m !== 'object' || blank(m.media)) throw new Error(`Media item ${k + 1} needs a "media" URL or file_id.`);
        return { type: m.type || 'photo', ...m };
      });
      const r = await call(token, 'sendMediaGroup', { ...base, media: items, ...sendExtras() });
      const ids = Array.isArray(r) ? r.map((m: any) => m?.message_id) : [];
      return { ok: true, operation: op, messageId: ids[0], messageIds: ids, chatId, result: r };
    }
    case 'Send a message draft':
    case 'Send a rich message draft': {
      const draftId = Number(str('draftId') || 1);
      if (!Number.isInteger(draftId) || draftId === 0) throw new Error('Draft ID must be a non-zero whole number.');
      const r = await call(token, 'sendMessageDraft', { ...base, draft_id: draftId, text: needText(), ...(parse_mode ? { parse_mode } : {}) });
      return { ok: r === true, operation: op, draftId, chatId };
    }
    default: {
      const m = MEDIA[op];
      if (!m) throw new Error(`Unknown Telegram action "${op}".`);
      const file = str('file');
      if (!file) throw new Error('File is empty. Use a public https link or a Telegram file_id.');
      const caption = m.field === 'sticker' ? '' : str('caption').slice(0, 1024);
      const r = await call(token, m.method, {
        ...base, [m.field]: file, ...(caption ? { caption } : {}), ...(caption && parse_mode ? { parse_mode } : {}), ...sendExtras(),
      });
      return { ok: true, operation: op, messageId: r?.message_id, chatId, result: r };
    }
  }
}
