import { db } from './supabase';
import { decrypt } from './crypto';

export async function loadCredential(id: string): Promise<Record<string, any>> {
  const { data, error } = await db().from('credentials').select('type,data').eq('id', id).single();
  if (error || !data) throw new Error('Credential not found');
  return { type: data.type, ...decrypt(data.data) };
}
