// Server-only: Google Sheets, Drive and Calendar through a service account.
import { createSign } from 'node:crypto';
import type { Runner } from './runners';
import { api, each, need, str, toDate } from './extra';

const SCOPE = {
  sheets: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  drive: 'https://www.googleapis.com/auth/drive',
  calendar: 'https://www.googleapis.com/auth/calendar',
};
const tokens = new Map<string, { token: string; exp: number }>();

async function googleToken(raw: string, scope: string): Promise<string> {
  let sa: any;
  try { sa = JSON.parse(raw); } catch { throw new Error('Paste the whole service account JSON file into the credential.'); }
  if (!sa.client_email || !sa.private_key) throw new Error('That JSON has no client_email or private_key. Use a service account key file.');
  const cacheKey = `${sa.client_email}|${scope}`;
  const hit = tokens.get(cacheKey);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let sig: string;
  try { sig = createSign('RSA-SHA256').update(head).sign(String(sa.private_key).replace(/\\n/g, '\n')).toString('base64url'); }
  catch { throw new Error('The private_key in the JSON could not be read. Paste the file again without changes.'); }
  const r = await api('Google', 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${sig}` }),
  });
  tokens.set(cacheKey, { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
  return r.access_token;
}
const gcall = (label: string, token: string) => (method: string, url: string, body?: unknown) =>
  api(label, url, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

const colLetter = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const cellText = (v: any) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v);
const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
const idFrom = (v: string, what: string) => {
  const id = v.match(/\/(?:d|folders)\/([\w-]+)/)?.[1] ?? v.match(/[?&]id=([\w-]+)/)?.[1] ?? v;
  if (!/^[\w-]+$/.test(id)) throw new Error(`${what} is empty or wrong. Paste the link or the ID.`);
  return id;
};
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3';

export const googleRunners: Record<string, Runner> = {
  googleSheets: each(async (c, i) => {
    const op = String(c.param('operation', i) || 'Get rows');
    const token = await googleToken(need(c, 'json', 'Google service account'), SCOPE.sheets);
    const call = gcall('Google Sheets', token);
    const enc = encodeURIComponent;

    if (op === 'Create spreadsheet') {
      const title = str(c, 'title', i);
      if (!title) throw new Error('Title is empty.');
      const tabs = str(c, 'sheetNames', i).split(',').map((s) => s.trim()).filter(Boolean);
      const r = await call('POST', SHEETS, { properties: { title }, ...(tabs.length ? { sheets: tabs.map((t) => ({ properties: { title: t } })) } : {}) });
      const share = str(c, 'shareWith', i);
      if (share) await gcall('Google Drive', token)('POST', `${DRIVE}/files/${r.spreadsheetId}/permissions?sendNotificationEmail=false`, { type: 'user', role: 'writer', emailAddress: share });
      return { spreadsheetId: r.spreadsheetId, url: r.spreadsheetUrl, title, sharedWith: share || undefined };
    }

    const id = idFrom(str(c, 'spreadsheetId', i), 'Spreadsheet');
    const base = `${SHEETS}/${id}/values`;
    const sheet = str(c, 'sheet', i) || 'Sheet1';
    const ref = quoteSheet(sheet);
    const meta = async () => ((await call('GET', `${SHEETS}/${id}?fields=sheets.properties(sheetId,title,index)`)).sheets || []).map((s: any) => s.properties);
    const sheetId = async () => { const m = (await meta()).find((p: any) => p.title === sheet); if (!m) throw new Error(`There is no tab named "${sheet}" in this spreadsheet.`); return m.sheetId as number; };

    if (op === 'Get sheet names') return (await meta()).map((p: any) => ({ title: p.title, sheetId: p.sheetId, index: p.index }));
    if (op === 'Create sheet') {
      const r = await call('POST', `${SHEETS}/${id}:batchUpdate`, { requests: [{ addSheet: { properties: { title: sheet } } }] });
      const p = r.replies?.[0]?.addSheet?.properties;
      return { sheetId: p?.sheetId, title: p?.title ?? sheet };
    }
    if (op === 'Delete sheet') {
      await call('POST', `${SHEETS}/${id}:batchUpdate`, { requests: [{ deleteSheet: { sheetId: await sheetId() } }] });
      return { deleted: true, title: sheet };
    }
    if (op === 'Clear sheet') {
      const keep = c.raw('keepHeader') !== false;
      await call('POST', `${base}/${enc(keep ? `${ref}!A2:ZZZ` : ref)}:clear`, {});
      return { cleared: true, sheet, headerKept: keep };
    }
    if (op === 'Delete rows') {
      const start = Number(str(c, 'rowNumber', i));
      const count = Math.min(1000, Math.max(1, Number(str(c, 'count', i)) || 1));
      if (!Number.isInteger(start) || start < 2) throw new Error('Row number must be 2 or higher. Row 1 holds the column names.');
      await call('POST', `${SHEETS}/${id}:batchUpdate`, { requests: [{ deleteDimension: { range: { sheetId: await sheetId(), dimension: 'ROWS', startIndex: start - 1, endIndex: start - 1 + count } } }] });
      return { deleted: count, fromRow: start };
    }

    if (op === 'Get rows') {
      const r = await call('GET', `${base}/${enc(ref)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
      const rows: any[][] = r.values || [];
      if (!rows.length) return [];
      const head = rows[0].map(String);
      let list = rows.slice(1).map((row, k) => ({ rowNumber: k + 2, ...Object.fromEntries(head.map((h, x) => [h, row[x] ?? '']).filter(([h]) => h)) }));
      const fc = str(c, 'filterColumn', i);
      if (fc) {
        if (!head.includes(fc)) throw new Error(`No column named "${fc}" in row 1. Columns are: ${head.join(', ')}`);
        const fv = String(c.param('filterValue', i) ?? '');
        list = list.filter((row: any) => String(row[fc]) === fv);
      }
      return list.slice(0, Math.min(5000, Math.max(1, Number(c.raw('limit')) || 100)));
    }

    // Everything below needs the header row.
    const hr = await call('GET', `${base}/${enc(`${ref}!1:1`)}`);
    const head: string[] = (hr.values?.[0] || []).map(String);
    if (!head.length) throw new Error(`Row 1 of "${sheet}" is empty. Put column names in the first row.`);
    const raw = c.json('values', i);
    const objs: Record<string, any>[] = Array.isArray(raw) ? raw : [raw];
    if (!objs.length || objs.some((o) => !o || typeof o !== 'object' || Array.isArray(o))) throw new Error('Values must be a JSON object keyed by column name, like {"Name": "Ada"}, or a list of such objects.');
    for (const o of objs) {
      const unknown = Object.keys(o).filter((k) => !head.includes(k));
      if (unknown.length) throw new Error(`No column named ${unknown.map((k) => `"${k}"`).join(', ')} in row 1. Columns are: ${head.join(', ')}`);
    }
    const toRow = (o: Record<string, any>) => head.map((h) => (h in o ? cellText(o[h]) : ''));
    const updateCells = async (rowNo: number, o: Record<string, any>) => {
      const data = Object.entries(o).map(([k, v]) => ({ range: `${ref}!${colLetter(head.indexOf(k))}${rowNo}`, values: [[cellText(v)]] }));
      if (!data.length) throw new Error('Values is empty, so there is nothing to update.');
      return call('POST', `${base}:batchUpdate`, { valueInputOption: 'USER_ENTERED', data });
    };
    const append = async (list: Record<string, any>[]) => call('POST', `${base}/${enc(`${ref}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: list.map(toRow) });

    if (op === 'Append row') {
      const r = await append(objs);
      return { appended: objs.length, updatedRange: r.updates?.updatedRange };
    }
    if (op === 'Update row') {
      const n = Number(str(c, 'rowNumber', i));
      if (!Number.isInteger(n) || n < 2) throw new Error('Row number must be 2 or higher. Row 1 holds the column names. Get rows returns rowNumber.');
      const r = await updateCells(n, objs[0]);
      return { rowNumber: n, updatedCells: r.totalUpdatedCells };
    }
    if (op === 'Append or update row') {
      const mc = str(c, 'matchColumn', i);
      if (!head.includes(mc)) throw new Error(`Match column "${mc}" is not in row 1. Columns are: ${head.join(', ')}`);
      const o = objs[0];
      if (!(mc in o)) throw new Error(`Values needs a "${mc}" key to match on.`);
      const col = colLetter(head.indexOf(mc));
      const colVals = await call('GET', `${base}/${enc(`${ref}!${col}:${col}`)}`);
      const at = ((colVals.values || []) as any[][]).findIndex((r, k) => k > 0 && String(r[0] ?? '') === String(o[mc]));
      if (at === -1) { const r = await append([o]); return { action: 'appended', updatedRange: r.updates?.updatedRange }; }
      await updateCells(at + 1, o);
      return { action: 'updated', rowNumber: at + 1 };
    }
    throw new Error(`Unknown action "${op}"`);
  }),

  googleDrive: each(async (c, i) => {
    const token = await googleToken(need(c, 'json', 'Google service account'), SCOPE.drive);
    const call = gcall('Google Drive', token);
    const op = String(c.param('operation', i) || 'List files');
    const FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink,parents,trashed';
    const flags = 'supportsAllDrives=true';
    const fileId = () => idFrom(str(c, 'fileId', i), 'File');
    const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    if (op === 'List files') {
      const q = ['trashed = false'];
      const folder = str(c, 'folderId', i);
      if (folder) q.push(`'${esc(idFrom(folder, 'Folder'))}' in parents`);
      const search = str(c, 'search', i);
      if (search) q.push(`name contains '${esc(search)}'`);
      const size = Math.min(200, Math.max(1, Number(c.raw('limit')) || 50));
      const r = await call('GET', `${DRIVE}/files?q=${encodeURIComponent(q.join(' and '))}&pageSize=${size}&fields=${encodeURIComponent(`files(${FIELDS})`)}&${flags}&includeItemsFromAllDrives=true&orderBy=modifiedTime%20desc`);
      return r.files || [];
    }
    if (op === 'Get file info') return call('GET', `${DRIVE}/files/${fileId()}?fields=${FIELDS}&${flags}`);
    if (op === 'Read file as text') {
      const id = fileId();
      const m = await call('GET', `${DRIVE}/files/${id}?fields=id,name,mimeType,size&${flags}`);
      const mime = String(m.mimeType);
      let url: string;
      if (mime === 'application/vnd.google-apps.document' || mime === 'application/vnd.google-apps.presentation') url = `${DRIVE}/files/${id}/export?mimeType=text/plain`;
      else if (mime === 'application/vnd.google-apps.spreadsheet') url = `${DRIVE}/files/${id}/export?mimeType=text/csv`;
      else if (/^text\/|json|xml|csv|javascript/.test(mime)) url = `${DRIVE}/files/${id}?alt=media&${flags}`;
      else throw new Error(`"${m.name}" is a ${mime} file. Only Google Docs, Sheets, Slides and plain text files can be read as text.`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`Google Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const text = (await res.text()).slice(0, 1_000_000);
      return { id: m.id, name: m.name, mimeType: mime, text };
    }
    if (op === 'Create folder') {
      const name = str(c, 'name', i);
      if (!name) throw new Error('Folder name is empty.');
      const parent = str(c, 'folderId', i);
      return call('POST', `${DRIVE}/files?fields=${FIELDS}&${flags}`, { name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [idFrom(parent, 'Folder')] } : {}) });
    }
    if (op === 'Share file') {
      const email = str(c, 'shareWith', i);
      if (!email) throw new Error('Email to share with is empty.');
      const r = await call('POST', `${DRIVE}/files/${fileId()}/permissions?sendNotificationEmail=false&${flags}`, { type: 'user', role: String(c.raw('role') || 'reader'), emailAddress: email });
      return { shared: true, with: email, role: r.role, permissionId: r.id };
    }
    if (op === 'Move to trash') return call('PATCH', `${DRIVE}/files/${fileId()}?fields=${FIELDS}&${flags}`, { trashed: true });
    throw new Error(`Unknown action "${op}"`);
  }),

  googleCalendar: each(async (c, i) => {
    const token = await googleToken(need(c, 'json', 'Google service account'), SCOPE.calendar);
    const call = gcall('Google Calendar', token);
    const op = String(c.param('operation', i) || 'Get many events');
    const cal = encodeURIComponent(str(c, 'calendarId', i) || 'primary');
    const root = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;
    const eventId = () => { const v = str(c, 'eventId', i); if (!/^[\w-]+$/.test(v)) throw new Error('Event ID is empty or wrong.'); return v; };
    const flat = (e: any) => ({ id: e.id, summary: e.summary, description: e.description, location: e.location, start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date, allDay: !!e.start?.date, status: e.status, url: e.htmlLink, creator: e.creator?.email, attendees: (e.attendees || []).map((a: any) => a.email) });
    const when = (v: string, tz: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? { date: v } : { dateTime: toDate(v).toISOString(), timeZone: tz });

    if (op === 'Get many events') {
      const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: String(Math.min(250, Math.max(1, Number(c.raw('limit')) || 25))), timeMin: toDate(str(c, 'timeMin', i)).toISOString() });
      if (str(c, 'timeMax', i)) q.set('timeMax', toDate(str(c, 'timeMax', i)).toISOString());
      if (str(c, 'search', i)) q.set('q', str(c, 'search', i));
      return ((await call('GET', `${root}?${q}`)).items || []).map(flat);
    }
    if (op === 'Get an event') return flat(await call('GET', `${root}/${eventId()}`));
    if (op === 'Create an event') {
      const summary = str(c, 'summary', i), start = str(c, 'start', i), end = str(c, 'end', i);
      if (!summary || !start || !end) throw new Error('Title, Start and End are required. Use 2026-03-01T10:00:00Z, or 2026-03-01 for an all-day event.');
      const tz = str(c, 'timezone', i) || 'UTC';
      return flat(await call('POST', root, { summary, start: when(start, tz), end: when(end, tz), ...(str(c, 'location', i) ? { location: str(c, 'location', i) } : {}), ...(String(c.param('description', i) ?? '').trim() ? { description: String(c.param('description', i)) } : {}) }));
    }
    if (op === 'Delete an event') { await call('DELETE', `${root}/${eventId()}`); return { deleted: true, id: eventId() }; }
    throw new Error(`Unknown action "${op}"`);
  }),
};
