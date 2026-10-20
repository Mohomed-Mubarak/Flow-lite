import { guard } from '@/lib/api';
import { db } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { CREDENTIAL_TYPES } from '@/lib/nodes/catalog';

export const dynamic = 'force-dynamic';

// Secrets are never returned to the client.
async function _GET() {
  const { data, error } = await db().from('credentials').select('id,name,type,created_at').order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

async function _POST(req: Request) {
  const b = await req.json();
  const def = CREDENTIAL_TYPES.find((t) => t.type === b.type);
  if (!def || !b.name) return Response.json({ error: 'name and a valid type are required' }, { status: 400 });
  const clean = Object.fromEntries(def.fields.map((f) => [f.name, String(b.data?.[f.name] ?? '')]));
  if (def.fields.some((f) => !f.optional && !clean[f.name])) return Response.json({ error: 'All fields are required' }, { status: 400 });
  const { data, error } = await db().from('credentials').insert({ name: b.name, type: b.type, data: encrypt(clean) }).select('id,name,type').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export const GET = guard(_GET);
export const POST = guard(_POST);
