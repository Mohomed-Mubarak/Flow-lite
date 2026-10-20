create extension if not exists pgcrypto;

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default false,
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  data text not null, -- AES-256-GCM ciphertext
  created_at timestamptz not null default now()
);

create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  workflow_name text,
  status text not null,
  mode text not null,
  error text,
  data jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists executions_started_idx on executions (started_at desc);

-- Chat memory for the AI Agent (Chat Memory sub-node).
create table if not exists chat_memory (
  id bigint generated always as identity primary key,
  workflow_id uuid references workflows(id) on delete cascade,
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_memory_session_idx on chat_memory (workflow_id, session_id, id desc);

-- API keys for external agents (REST API and MCP server). Only a SHA-256 hash is stored.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scope text not null default 'full' check (scope in ('read', 'run', 'full')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);

-- Knowledge base for RAG (Vector Store node + Knowledge Base Tool on the AI Agent).
create extension if not exists vector;

create table if not exists vector_documents (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade,
  store text not null,
  content text not null,
  metadata jsonb not null default '{}',
  embedding vector, -- no fixed size: different embedding models have different dimensions
  created_at timestamptz not null default now()
);
create index if not exists vector_documents_store_idx on vector_documents (workflow_id, store);

-- Cosine-similarity search used by the Knowledge Base Tool. Safe to re-run; replaces itself.
create or replace function match_vector_documents(
  query_embedding vector,
  match_workflow_id uuid,
  match_store text,
  match_count int default 5
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select id, content, metadata, 1 - (embedding <=> query_embedding) as similarity
  from vector_documents
  where workflow_id = match_workflow_id and store = match_store and embedding is not null
  order by embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

-- Server uses the service-role key; lock everything else out.
alter table workflows enable row level security;
alter table credentials enable row level security;
alter table executions enable row level security;
alter table chat_memory enable row level security;
alter table api_keys enable row level security;
alter table vector_documents enable row level security;
