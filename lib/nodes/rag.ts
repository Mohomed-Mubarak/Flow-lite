// Server-only: embeddings + a light vector store (Supabase/pgvector) for RAG.
// Used by the Vector Store node (ingest) and the Knowledge Base Tool (agent retrieval).
import { db } from '../supabase';
import { resolve, type Scope } from '../expr';
import { CREDENTIAL_TYPES } from './catalog';
import type { Ctx, Runner, Sub } from './runners';

function need(cred: Record<string, any> | null, what: string): Record<string, any> {
  if (!cred) throw new Error(`Select an AI credential for ${what} on this node`);
  return cred;
}

function vecError(e: { message: string }): Error {
  return /vector_documents|relation .* does not exist|type "?vector"?|extension "?vector"?|function match_vector_documents/i.test(e.message)
    ? new Error('The knowledge base table is missing. Run the vector_documents part of supabase/schema.sql in Supabase (it also enables the pgvector extension).')
    : new Error('Knowledge base: ' + e.message);
}

/**
 * Calls the OpenAI-compatible /embeddings endpoint. Works with OpenAI, Google Gemini, Mistral,
 * Cerebras, NVIDIA NIM, Hugging Face, DeepSeek, Ollama and most OpenAI-compatible OpenRouter models.
 * Claude (Anthropic) has no embeddings API.
 */
export async function embed(cred: Record<string, any>, model: string, inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  if (cred.type === 'anthropic') throw new Error('Claude has no embeddings API. Pick a different AI credential for embeddings (OpenAI, Gemini, Mistral, NVIDIA NIM, DeepSeek, Hugging Face or Ollama all work).');
  const def = CREDENTIAL_TYPES.find((t) => t.type === cred.type);
  const m = String(model || def?.models?.[0] || '').trim();
  if (!m) throw new Error('Enter an embedding model name, e.g. text-embedding-3-small (OpenAI), text-embedding-004 (Gemini), mistral-embed (Mistral).');
  const base = String(cred.baseUrl || def?.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('This credential has no base URL');
  let res: Response;
  try {
    res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cred.apiKey ? { Authorization: `Bearer ${cred.apiKey}` } : {}) },
      body: JSON.stringify({ model: m, input: inputs }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e: any) {
    throw new Error(e?.name === 'TimeoutError' ? `${def?.label || 'Embeddings'} did not answer in time` : `${def?.label || 'Embeddings'}: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${def?.label || 'Embeddings'} ${res.status}: ${text.slice(0, 300)}`);
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error(`${def?.label || 'Embeddings'} sent a reply that is not JSON`); }
  const rows = j?.data;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${def?.label || 'Embeddings'} returned no vectors. Check that "${m}" is an embeddings model.`);
  return rows
    .slice()
    .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
    .map((r: any) => r.embedding as number[]);
}

/** Splits long text into overlapping chunks so each stays well under an embedding model's input limit. */
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const step = Math.max(1, size - Math.max(0, overlap));
  const out: string[] = [];
  for (let i = 0; i < t.length; i += step) out.push(t.slice(i, i + size));
  return out;
}

export const ragRunners: Record<string, Runner> = {
  async vectorStore(c) {
    const store = String(c.raw('store') || '').trim();
    if (!store) throw new Error('Enter a store name');
    if (!c.workflowId) throw new Error('Save the workflow before running this node');
    const op = String(c.raw('operation') || 'Insert');

    if (op === 'Clear store') {
      const { error, count } = await db().from('vector_documents').delete({ count: 'exact' }).eq('workflow_id', c.workflowId).eq('store', store);
      if (error) throw vecError(error);
      return [[{ json: { store, cleared: count ?? 0 } }]];
    }

    const cred = need(c.cred, 'Vector Store');
    const model = String(c.raw('model') || '');
    const size = Math.max(200, Math.min(4000, Number(c.raw('chunkSize')) || 1000));
    const overlap = Math.max(0, Math.min(size - 50, Number(c.raw('chunkOverlap')) || 150));
    const rows: { workflow_id: string; store: string; content: string; metadata: any; embedding: any }[] = [];

    for (let i = 0; i < c.items.length; i++) {
      const text = String(c.param('text', i) ?? '').trim();
      if (!text) continue;
      const meta = c.json('metadata', i);
      const chunks = chunkText(text, size, overlap);
      if (!chunks.length) continue;
      const vectors = await embed(cred, model, chunks);
      chunks.forEach((content, k) => rows.push({
        workflow_id: c.workflowId!, store, content,
        metadata: meta && typeof meta === 'object' ? meta : {},
        embedding: vectors[k] as any,
      }));
    }
    if (rows.length) {
      const { error } = await db().from('vector_documents').insert(rows);
      if (error) throw vecError(error);
    }
    return [[{ json: { store, chunksInserted: rows.length } }]];
  },
};

/** The Knowledge Base Tool: embeds the agent's query and returns the closest chunks from a store. */
export function knowledgeBaseTool(s: Sub, scope: Scope, workflowId: string | undefined, toolName: (raw: unknown, fallback: string) => string) {
  const store = String(resolve(s.params.store ?? '', scope) ?? '').trim();
  if (!store) throw new Error(`${s.name}: enter a store name`);
  if (!workflowId) throw new Error(`${s.name}: save the workflow before running the agent`);
  const cred = need(s.cred, 'Knowledge Base');
  const model = String(resolve(s.params.model ?? '', scope) ?? '');
  const topK = Math.min(20, Math.max(1, Number(s.params.topK) || 4));
  return {
    name: toolName(s.params.toolName || 'search_knowledge_base', 'search_knowledge_base'),
    description: String(s.params.toolDescription || '').trim() || `Searches the "${store}" knowledge base and returns the most relevant passages. Use this before answering questions that depend on it.`,
    schema: { type: 'object', properties: { query: { type: 'string', description: 'What to search for' } }, required: ['query'] },
    run: async (a: Record<string, any>) => {
      const q = String(a.query ?? '').trim();
      if (!q) throw new Error('query is empty');
      const [vector] = await embed(cred, model, [q]);
      const { data, error } = await db().rpc('match_vector_documents', {
        query_embedding: vector as any, match_workflow_id: workflowId, match_store: store, match_count: topK,
      });
      if (error) throw vecError(error);
      const rows = (data || []) as { content: string; metadata: any; similarity: number }[];
      if (!rows.length) return `No results in the "${store}" knowledge base. It may be empty — add documents with a Vector Store node first.`;
      return rows.map((r, i) => `${i + 1}. (similarity ${Number(r.similarity).toFixed(2)})\n${r.content}`).join('\n\n');
    },
  };
}
