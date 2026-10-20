// Client-safe node + credential metadata. Execution lives in runners.ts (server only).
export type ParamDef = {
  name: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'code';
  default?: any;
  options?: string[];
  /** Display names for options (multiselect). Stored value stays the option itself. */
  labels?: Record<string, string>;
  placeholder?: string;
  hint?: string;
  /** Renders a model picker (suggestions + live provider list). */
  model?: boolean;
  /** Only show this field while another field has this value. */
  showIf?: { param: string; equals?: any; oneOf?: any[] };
};
export type NodeGroup = 'trigger' | 'logic' | 'data' | 'app' | 'ai' | 'sub';
/** Sub-node sockets on an agent: they feed the agent instead of the main data flow. */
export type SlotId = 'model' | 'memory' | 'tool';
export type SlotDef = { id: SlotId; label: string; required?: boolean; multiple?: boolean };
export const SLOT_IDS: SlotId[] = ['model', 'memory', 'tool'];
export type NodeDef = {
  type: string;
  label: string;
  group: NodeGroup;
  description: string;
  inputs: 0 | 1;
  outputs: number;
  outputLabels?: string[];
  credentialTypes?: string[];
  /** Trigger that is started by an HTTP request. */
  hook?: boolean;
  /** Public URL prefix shown in the editor, e.g. /api/webhook/ */
  urlPrefix?: string;
  hidden?: boolean;
  /** Sub-node: plugs into this socket of an agent. Has no main input or output. */
  slot?: SlotId;
  /** Agent: the sockets that sub-nodes plug into. */
  slots?: SlotDef[];
  params: ParamDef[];
};
export type CredField = { name: string; label: string; secret?: boolean; optional?: boolean; placeholder?: string };
export type CredDef = {
  type: string;
  label: string;
  fields: CredField[];
  ai?: boolean;
  free?: boolean;
  baseUrl?: string;
  keyUrl?: string;
  note?: string;
  models?: string[];
};

export const GROUPS: Record<NodeGroup, string> = {
  trigger: 'Triggers', logic: 'Logic', data: 'Data', app: 'Apps', ai: 'AI', sub: 'AI sub-nodes',
};

// Telegram node actions (same names as the n8n Telegram node).
export const TG_OPS = [
  'Delete a chat message',
  'Edit a text message',
  'Pin a chat message',
  'Send an animated file',
  'Send an audio file',
  'Send a chat action',
  'Send a document',
  'Send a location',
  'Send a media group',
  'Send a text message',
  'Send a message draft',
  'Send a rich message',
  'Send a rich message draft',
  'Send a photo message',
  'Send a sticker',
  'Send a video',
  'Unpin a chat message',
];
export const TG_TEXT_OPS = ['Send a text message', 'Send a rich message', 'Send a message draft', 'Send a rich message draft', 'Edit a text message'];
export const TG_FILE_OPS = ['Send a photo message', 'Send a video', 'Send an audio file', 'Send a document', 'Send an animated file', 'Send a sticker'];
export const TG_CAPTION_OPS = TG_FILE_OPS.filter((o) => o !== 'Send a sticker');
export const TG_FORMAT_OPS = [...TG_TEXT_OPS, ...TG_CAPTION_OPS];
export const TG_SEND_OPS = ['Send a text message', 'Send a rich message', ...TG_FILE_OPS, 'Send a location', 'Send a media group'];

const KEY: CredField[] = [{ name: 'apiKey', label: 'API key', secret: true }];

export const CREDENTIAL_TYPES: CredDef[] = [
  // ---- AI providers ----
  { type: 'groq', label: 'Groq', ai: true, free: true, baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'], fields: KEY },
  { type: 'gemini', label: 'Google Gemini', ai: true, free: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'], fields: KEY },
  { type: 'openrouter', label: 'OpenRouter', ai: true, free: true, baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys',
    note: 'Models ending in :free cost nothing. Use Load models to list them.',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'], fields: KEY },
  { type: 'mistral', label: 'Mistral', ai: true, free: true, baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys',
    models: ['mistral-small-latest', 'open-mistral-nemo'], fields: KEY },
  { type: 'cerebras', label: 'Cerebras', ai: true, free: true, baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai',
    models: ['llama-3.3-70b', 'llama3.1-8b'], fields: KEY },
  { type: 'nvidia', label: 'NVIDIA (NIM)', ai: true, free: true, baseUrl: 'https://integrate.api.nvidia.com/v1', keyUrl: 'https://build.nvidia.com/settings/api-keys',
    note: 'Free API credits from build.nvidia.com. Keys start with nvapi-. Use Load models to list every model. Tool calling works on Llama 3.1/3.3, Mistral and Qwen models, not on all of them.',
    models: ['meta/llama-3.3-70b-instruct', 'meta/llama-3.1-8b-instruct', 'meta/llama-3.1-405b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-coder-32b-instruct'], fields: KEY },
  { type: 'huggingface', label: 'Hugging Face', ai: true, free: true, baseUrl: 'https://router.huggingface.co/v1', keyUrl: 'https://huggingface.co/settings/tokens',
    models: ['meta-llama/Llama-3.3-70B-Instruct'], fields: KEY },
  { type: 'ollama', label: 'Ollama (local)', ai: true, free: true, baseUrl: 'http://localhost:11434/v1',
    note: 'Runs on your own machine. It is not reachable from Vercel.',
    models: ['llama3.2', 'qwen2.5'],
    fields: [
      { name: 'baseUrl', label: 'Base URL', optional: true, placeholder: 'http://localhost:11434/v1' },
      { name: 'apiKey', label: 'API key', secret: true, optional: true },
    ] },
  { type: 'openai', label: 'OpenAI', ai: true, baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o-mini', 'gpt-4o'], fields: KEY },
  { type: 'anthropic', label: 'Anthropic (Claude)', ai: true, keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'], fields: KEY },
  { type: 'deepseek', label: 'DeepSeek', ai: true, baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner'], fields: KEY },
  { type: 'custom', label: 'Custom (OpenAI-compatible)', ai: true,
    note: 'Any server with a /chat/completions endpoint: LM Studio, vLLM, Together, Fireworks, and more.',
    fields: [
      { name: 'baseUrl', label: 'Base URL', placeholder: 'https://host/v1' },
      { name: 'apiKey', label: 'API key', secret: true, optional: true },
    ] },
  // ---- Apps ----
  { type: 'httpBearer', label: 'HTTP bearer token', fields: [{ name: 'token', label: 'Token', secret: true }] },
  { type: 'httpBasic', label: 'HTTP basic auth', fields: [{ name: 'user', label: 'User' }, { name: 'password', label: 'Password', secret: true }] },
  { type: 'httpHeader', label: 'HTTP custom header', fields: [{ name: 'name', label: 'Header name' }, { name: 'value', label: 'Header value', secret: true }] },
  { type: 'slack', label: 'Slack incoming webhook', fields: [{ name: 'webhookUrl', label: 'Webhook URL', secret: true }] },
  { type: 'discord', label: 'Discord webhook', fields: [{ name: 'webhookUrl', label: 'Webhook URL', secret: true }] },
  { type: 'telegram', label: 'Telegram bot', fields: [{ name: 'botToken', label: 'Bot token', secret: true }] },
  { type: 'resend', label: 'Resend', fields: KEY },
  { type: 'githubApi', label: 'GitHub token', keyUrl: 'https://github.com/settings/tokens', note: 'A personal access token with access to the repository (issues read and write).', fields: [{ name: 'token', label: 'Token', secret: true }] },
  { type: 'airtableApi', label: 'Airtable token', keyUrl: 'https://airtable.com/create/tokens', note: 'A personal access token. Give it data.records:read and data.records:write on your base.', fields: [{ name: 'token', label: 'Token', secret: true }] },
  { type: 'twilioApi', label: 'Twilio', keyUrl: 'https://console.twilio.com', fields: [{ name: 'accountSid', label: 'Account SID' }, { name: 'authToken', label: 'Auth token', secret: true }] },
  { type: 'supabaseApi', label: 'Supabase project', keyUrl: 'https://supabase.com/dashboard/project/_/settings/api', note: 'Use the project URL and the service_role key (server only, it skips row security). Or an anon key if your policies allow it.', fields: [{ name: 'url', label: 'Project URL', placeholder: 'https://xxxx.supabase.co' }, { name: 'key', label: 'API key', secret: true }] },
  { type: 'notionApi', label: 'Notion integration', keyUrl: 'https://www.notion.so/profile/integrations', note: 'Create an internal integration, copy its secret, then share each page or database with it (… menu, Connections).', fields: [{ name: 'token', label: 'Integration secret', secret: true }] },
  { type: 'googleServiceAccount', label: 'Google service account', keyUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts', note: 'Used by Google Sheets, Drive and Calendar. Create a service account, add a JSON key, enable those APIs in the project, then share each sheet, folder or calendar with the account\'s email. Paste the whole JSON file.', fields: [{ name: 'json', label: 'Service account JSON', secret: true }] },
  { type: 'smtp', label: 'SMTP email server', note: 'Port 465 uses SSL. Other ports (587, 25) use STARTTLS when the server offers it. Gmail needs an app password.', fields: [{ name: 'host', label: 'Host', placeholder: 'smtp.example.com' }, { name: 'port', label: 'Port', placeholder: '587' }, { name: 'user', label: 'User', optional: true }, { name: 'password', label: 'Password', secret: true, optional: true }] },
  { type: 'googleOAuth', label: 'Google OAuth (Gmail, Blogger)', keyUrl: 'https://console.cloud.google.com/apis/credentials', note: '1) In Google Cloud make an OAuth client (Web). Add https://developers.google.com/oauthplayground as a redirect URI. Turn on the Gmail API and Blogger API v3. 2) Open OAuth Playground, gear icon, tick "Use your own OAuth credentials", paste the client ID and secret. 3) Pick the scopes you need: https://www.googleapis.com/auth/gmail.modify and/or https://www.googleapis.com/auth/blogger. Authorize, then Exchange authorization code and copy the refresh token. 4) Set the OAuth app to "In production", or the token dies after 7 days.', fields: [{ name: 'clientId', label: 'Client ID' }, { name: 'clientSecret', label: 'Client secret', secret: true }, { name: 'refreshToken', label: 'Refresh token', secret: true }] },
  { type: 'imap', label: 'IMAP mailbox', note: 'Port 993 (SSL). Gmail: imap.gmail.com and an app password. Outlook: outlook.office365.com.', fields: [{ name: 'host', label: 'Host', placeholder: 'imap.example.com' }, { name: 'port', label: 'Port', placeholder: '993' }, { name: 'user', label: 'User' }, { name: 'password', label: 'Password', secret: true }] },
  { type: 'whatsappApi', label: 'WhatsApp Business (Cloud API)', keyUrl: 'https://developers.facebook.com/apps', note: 'From your Meta app: WhatsApp, API Setup. Free-form text only works inside 24 hours of the customer\'s last message. Use a template otherwise.', fields: [{ name: 'accessToken', label: 'Access token', secret: true }, { name: 'phoneNumberId', label: 'Phone number ID' }] },
  { type: 'tavilyApi', label: 'Tavily search', keyUrl: 'https://app.tavily.com/home', note: 'Free tier available. Used by the Web Search tool of an AI Agent.', free: true, fields: KEY },
  { type: 'webhookSecret', label: 'Webhook signing secret', note: 'For GitHub and Stripe triggers. Telegram uses the Telegram bot credential instead.', fields: [{ name: 'secret', label: 'Secret', secret: true }] },
];

export const AI_CRED_TYPES = CREDENTIAL_TYPES.filter((c) => c.ai).map((c) => c.type);

const COND_OPS = ['equals', 'notEquals', 'contains', 'notContains', 'gt', 'lt', 'gte', 'lte', 'isEmpty', 'isNotEmpty', 'regex'];
const COND: ParamDef[] = [
  { name: 'value1', label: 'Value', type: 'string', placeholder: '{{ $json.status }}' },
  { name: 'operation', label: 'Operation', type: 'select', default: 'equals',
    options: COND_OPS },
  { name: 'value2', label: 'Compare to', type: 'string' },
];
const sample = (v: string): ParamDef => ({ name: 'sample', label: 'Test payload', type: 'json', default: v, hint: 'Used when you press Run in the editor.' });
const events = (ph: string): ParamDef => ({ name: 'events', label: 'Only these events', type: 'string', placeholder: ph, hint: 'Comma separated. Empty means all.' });

export const NODES: NodeDef[] = [
  // ---- Triggers ----
  { type: 'manual', label: 'Manual Trigger', group: 'trigger', description: 'Start by clicking Run.', inputs: 0, outputs: 1, params: [] },
  { type: 'webhook', label: 'Webhook', group: 'trigger', description: 'Start from any HTTP request.', inputs: 0, outputs: 1, hook: true, urlPrefix: '/api/webhook/',
    params: [
      { name: 'path', label: 'Path', type: 'string', default: 'my-hook' },
      { name: 'method', label: 'Method', type: 'select', default: 'POST', options: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'response', label: 'Respond', type: 'select', default: 'immediately', options: ['immediately', 'lastNode'] },
      sample('{ "body": { "hello": "world" }, "query": {} }'),
    ] },
  { type: 'form', label: 'Form Trigger', group: 'trigger', description: 'A public web form that starts the workflow.', inputs: 0, outputs: 1, hook: true, urlPrefix: '/form/',
    params: [
      { name: 'path', label: 'Path', type: 'string', default: 'contact' },
      { name: 'title', label: 'Form title', type: 'string', default: 'Contact us' },
      { name: 'description', label: 'Description', type: 'string', default: '' },
      { name: 'fields', label: 'Fields', type: 'json', hint: 'type: text, email, number, textarea',
        default: '[{"name":"name","label":"Name","type":"text","required":true},{"name":"email","label":"Email","type":"email"},{"name":"message","label":"Message","type":"textarea"}]' },
      { name: 'button', label: 'Button text', type: 'string', default: 'Submit' },
      { name: 'thanks', label: 'Thank-you message', type: 'string', default: 'Thanks! We got it.' },
      sample('{ "fields": { "name": "Ada", "email": "ada@example.com", "message": "Hi" } }'),
    ] },
  { type: 'telegramTrigger', label: 'Telegram Trigger', group: 'trigger', description: 'Runs when your bot gets a message, button press, channel post and more.', inputs: 0, outputs: 1, hook: true,
    urlPrefix: '/api/webhook/', credentialTypes: ['telegram', 'webhookSecret'],
    params: [
      { name: 'updates', label: 'Trigger on', type: 'multiselect', default: 'message',
        options: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query', 'inline_query', 'poll', 'pre_checkout_query', 'shipping_query'],
        labels: { message: 'On message', edited_message: 'On edited message', channel_post: 'On channel post', edited_channel_post: 'On edited channel post', callback_query: 'On callback query', inline_query: 'On inline query', poll: 'On Poll Change', pre_checkout_query: 'On pre checkout query', shipping_query: 'On shipping query' },
        hint: 'Pick one or more. Nothing ticked means every update. Telegram allows one webhook per bot, so use one trigger and branch on {{ $json.updateType }} with an IF node.' },
      { name: 'path', label: 'Path', type: 'string', default: 'telegram',
        hint: 'Pick your Telegram bot credential, then turn the workflow Active. Flowlite registers the webhook with Telegram for you. It needs a public https address.' },
      sample('{ "updateType": "message", "update": {}, "text": "hello", "chatId": 12345, "from": { "id": 12345, "first_name": "Ada" } }'),
    ] },
  { type: 'github', label: 'GitHub Trigger', group: 'trigger', description: 'Runs on GitHub webhook events.', inputs: 0, outputs: 1, hook: true,
    urlPrefix: '/api/webhook/', credentialTypes: ['webhookSecret'],
    params: [
      { name: 'path', label: 'Path', type: 'string', default: 'github', hint: 'In GitHub, set content type to application/json.' },
      events('push,pull_request,issues'),
      sample('{ "event": "push", "body": { "ref": "refs/heads/main" } }'),
    ] },
  { type: 'stripeTrigger', label: 'Stripe Trigger', group: 'trigger', description: 'Runs on Stripe webhook events.', inputs: 0, outputs: 1, hook: true,
    urlPrefix: '/api/webhook/', credentialTypes: ['webhookSecret'],
    params: [
      { name: 'path', label: 'Path', type: 'string', default: 'stripe', hint: 'Use the whsec_ signing secret as the credential.' },
      events('checkout.session.completed,invoice.paid'),
      sample('{ "type": "checkout.session.completed", "body": { "data": { "object": {} } } }'),
    ] },
  { type: 'chatTrigger', label: 'Chat Trigger', group: 'trigger', description: 'Runs when someone sends a chat message.', inputs: 0, outputs: 1, hook: true,
    params: [
      { name: 'public', label: 'Make chat publicly available', type: 'boolean', default: false,
        hint: 'On: anyone with the link can chat once the workflow is Active. Each message uses your AI credits.' },
      { name: 'path', label: 'Public path', type: 'string', default: 'chat', hint: 'Public page: /chat/<path>', showIf: { param: 'public', equals: true } },
      { name: 'title', label: 'Chat title', type: 'string', default: 'Chat', showIf: { param: 'public', equals: true } },
      { name: 'initialMessage', label: 'Welcome message', type: 'string', default: 'Hi! How can I help?', showIf: { param: 'public', equals: true } },
      sample('{ "sessionId": "test", "action": "sendMessage", "chatInput": "Hello!" }'),
    ] },
  { type: 'schedule', label: 'Schedule', group: 'trigger', description: 'Run on a cron schedule (UTC).', inputs: 0, outputs: 1,
    params: [{ name: 'cron', label: 'Cron', type: 'string', default: '*/15 * * * *', hint: 'minute hour day month weekday' }] },
  { type: 'interval', label: 'Interval', group: 'trigger', description: 'Run every N minutes.', inputs: 0, outputs: 1,
    params: [{ name: 'minutes', label: 'Every (minutes)', type: 'number', default: 5, hint: 'Needs the cron pinger to call /api/cron.' }] },

  // ---- AI ----
  { type: 'aichat', label: 'AI Chat', group: 'ai', description: 'Any model: Groq, Gemini, OpenRouter, Claude, local and more.', inputs: 1, outputs: 1, credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'model', label: 'Model', type: 'string', model: true, hint: 'Type any model id, or press Load models.' },
      { name: 'system', label: 'System prompt', type: 'text' },
      { name: 'prompt', label: 'Prompt', type: 'text', default: '{{ $json.text }}' },
      { name: 'temperature', label: 'Temperature', type: 'number', default: '' },
      { name: 'maxTokens', label: 'Max tokens', type: 'number', default: '' },
    ] },
  { type: 'aiextract', label: 'AI Extract', group: 'ai', description: 'Turn text into structured JSON.', inputs: 1, outputs: 1, credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'model', label: 'Model', type: 'string', model: true },
      { name: 'instructions', label: 'What to extract', type: 'text', default: 'Extract the person\'s name and email.' },
      { name: 'text', label: 'Text', type: 'text', default: '{{ $json.text }}' },
      { name: 'schema', label: 'Shape', type: 'json', default: '{ "name": "string", "email": "string" }' },
    ] },
  { type: 'agent', label: 'AI Agent', group: 'ai', description: 'An agent that can use tools and remember the chat.', inputs: 1, outputs: 1,
    slots: [
      { id: 'model', label: 'Chat Model', required: true },
      { id: 'memory', label: 'Memory' },
      { id: 'tool', label: 'Tool', multiple: true },
    ],
    params: [
      { name: 'prompt', label: 'Prompt (user message)', type: 'text', default: '{{ $json.chatInput }}' },
      { name: 'system', label: 'System message', type: 'text', default: 'You are a helpful assistant.' },
      { name: 'maxIterations', label: 'Max tool rounds', type: 'number', default: 8, hint: 'Stops the agent from looping. A run must finish in 60 seconds.' },
      { name: 'returnSteps', label: 'Return tool steps', type: 'boolean', default: false },
    ] },
  { type: 'vectorStore', label: 'Vector Store', group: 'ai', description: 'Save text as searchable knowledge (RAG), using AI embeddings. Read it back with a Knowledge Base Tool on an AI Agent.', inputs: 1, outputs: 1, credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'operation', label: 'Operation', type: 'select', default: 'Insert', options: ['Insert', 'Clear store'] },
      { name: 'store', label: 'Store name', type: 'string', default: 'default', hint: 'Documents are grouped by this name, scoped to this workflow. A Knowledge Base Tool reads the same name.' },
      { name: 'model', label: 'Embedding model', type: 'string', model: true, showIf: { param: 'operation', equals: 'Insert' },
        hint: 'Must be an embeddings model for the chosen credential: text-embedding-3-small (OpenAI), text-embedding-004 (Gemini), mistral-embed (Mistral), nvidia/nv-embedqa-e5-v5 (NVIDIA NIM). Claude has no embeddings API.' },
      { name: 'text', label: 'Text', type: 'text', default: '{{ $json.text }}', showIf: { param: 'operation', equals: 'Insert' } },
      { name: 'metadata', label: 'Metadata (optional)', type: 'json', default: '', showIf: { param: 'operation', equals: 'Insert' }, hint: 'Saved alongside every chunk from this item, e.g. { "source": "{{ $json.url }}" }.' },
      { name: 'chunkSize', label: 'Chunk size (characters)', type: 'number', default: 1000, showIf: { param: 'operation', equals: 'Insert' } },
      { name: 'chunkOverlap', label: 'Chunk overlap (characters)', type: 'number', default: 150, showIf: { param: 'operation', equals: 'Insert' } },
    ] },
  { type: 'openai', label: 'OpenAI (legacy)', group: 'ai', description: 'Use AI Chat instead.', inputs: 1, outputs: 1, credentialTypes: ['openai'], hidden: true,
    params: [
      { name: 'model', label: 'Model', type: 'string', default: 'gpt-4o-mini', model: true },
      { name: 'system', label: 'System prompt', type: 'text' },
      { name: 'prompt', label: 'Prompt', type: 'text', default: '{{ $json.text }}' },
    ] },
  { type: 'anthropic', label: 'Claude (legacy)', group: 'ai', description: 'Use AI Chat instead.', inputs: 1, outputs: 1, credentialTypes: ['anthropic'], hidden: true,
    params: [
      { name: 'model', label: 'Model', type: 'string', default: 'claude-sonnet-5-5', model: true },
      { name: 'system', label: 'System prompt', type: 'text' },
      { name: 'prompt', label: 'Prompt', type: 'text', default: '{{ $json.text }}' },
      { name: 'maxTokens', label: 'Max tokens', type: 'number', default: 1024 },
    ] },

  // ---- AI sub-nodes (plug into an AI Agent) ----
  { type: 'lmchat', label: 'Chat Model', group: 'sub', description: 'The model that powers an agent.', inputs: 0, outputs: 0, slot: 'model', credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'model', label: 'Model', type: 'string', model: true, hint: 'The model must support tool calling if the agent has tools.' },
      { name: 'temperature', label: 'Temperature', type: 'number', default: '' },
      { name: 'maxTokens', label: 'Max tokens', type: 'number', default: '' },
    ] },
  { type: 'memoryBuffer', label: 'Chat Memory', group: 'sub', description: 'Remembers the last messages of each chat session.', inputs: 0, outputs: 0, slot: 'memory',
    params: [
      { name: 'sessionKey', label: 'Session key', type: 'string', default: '{{ $json.sessionId }}', hint: 'Same key = same conversation.' },
      { name: 'windowSize', label: 'Messages to remember', type: 'number', default: 10 },
    ] },
  { type: 'toolCalculator', label: 'Calculator', group: 'sub', description: 'Lets the agent do exact math.', inputs: 0, outputs: 0, slot: 'tool', params: [] },
  { type: 'toolHttp', label: 'HTTP Request Tool', group: 'sub', description: 'Lets the agent call one API.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['httpBearer', 'httpBasic', 'httpHeader'],
    params: [
      { name: 'toolName', label: 'Tool name', type: 'string', default: 'http_request', hint: 'Letters, numbers and underscores.' },
      { name: 'toolDescription', label: 'Description', type: 'text', default: 'Calls an HTTP API and returns the response.', hint: 'Tell the model when to use this tool.' },
      { name: 'method', label: 'Method', type: 'select', default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'url', label: 'URL', type: 'string', placeholder: 'https://api.example.com/weather/{city}',
        hint: 'The host must be fixed. Each {name} becomes an input the model fills in.' },
      { name: 'headers', label: 'Headers', type: 'json', default: '' },
    ] },
  { type: 'toolMcp', label: 'MCP Client Tool', group: 'sub', description: 'Gives the agent every tool of an MCP server.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['httpBearer', 'httpBasic', 'httpHeader'],
    params: [
      { name: 'url', label: 'Endpoint URL', type: 'string', placeholder: 'https://example.com/mcp', hint: 'A Streamable HTTP MCP server. The older SSE-only transport is not supported.' },
      { name: 'headers', label: 'Extra headers', type: 'json', default: '', placeholder: '{"X-Api-Key":"..."}', hint: 'Optional. For a bearer token, pick a credential above instead.' },
      { name: 'include', label: 'Tools to include', type: 'select', default: 'All', options: ['All', 'Selected', 'All except'] },
      { name: 'toolNames', label: 'Tool names', type: 'string', placeholder: 'search, get_page', showIf: { param: 'include', oneOf: ['Selected', 'All except'] }, hint: 'Comma separated. Names are case sensitive.' },
    ] },
  { type: 'toolWikipedia', label: 'Wikipedia Tool', group: 'sub', description: 'Lets the agent look up Wikipedia.', inputs: 0, outputs: 0, slot: 'tool',
    params: [{ name: 'language', label: 'Language', type: 'string', default: 'en', hint: 'Wikipedia language code, like en, de, fr.' }] },
  { type: 'toolTavily', label: 'Web Search Tool', group: 'sub', description: 'Lets the agent search the web (Tavily).', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['tavilyApi'],
    params: [{ name: 'maxResults', label: 'Results', type: 'number', default: 5 }] },
  { type: 'toolWebPage', label: 'Web Page Reader Tool', group: 'sub', description: 'Lets the agent open a public web page and read it.', inputs: 0, outputs: 0, slot: 'tool', params: [] },
  { type: 'toolDateTime', label: 'Date & Time Tool', group: 'sub', description: 'Tells the agent today\'s date and time.', inputs: 0, outputs: 0, slot: 'tool',
    params: [{ name: 'timezone', label: 'Default time zone', type: 'string', default: 'UTC', placeholder: 'Europe/London' }] },
  { type: 'toolGmail', label: 'Gmail Tool', group: 'sub', description: 'Lets the agent search, read and write Gmail.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['googleOAuth'],
    params: [
      { name: 'allowDraft', label: 'Allow creating drafts', type: 'boolean', default: true, hint: 'Drafts are saved, never sent.' },
      { name: 'allowSend', label: 'Allow sending and replying', type: 'boolean', default: false, hint: 'Off by default. When on, the agent can send real email from your account.' },
    ] },
  { type: 'toolBlogger', label: 'Blogger Tool', group: 'sub', description: 'Lets the agent read and write blog posts.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['googleOAuth'],
    params: [
      { name: 'blog', label: 'Blog', type: 'string', placeholder: 'https://yourblog.blogspot.com', hint: 'The blog address or numeric ID.' },
      { name: 'allowCreate', label: 'Allow creating posts', type: 'boolean', default: true, hint: 'New posts are saved as drafts unless publishing is allowed below.' },
      { name: 'allowPublish', label: 'Publish new posts right away', type: 'boolean', default: false, hint: 'Off: the agent can only create drafts. You publish them yourself.' },
      { name: 'allowEdit', label: 'Allow editing posts', type: 'boolean', default: false },
    ] },
  { type: 'toolGoogleSheets', label: 'Google Sheets Tool', group: 'sub', description: 'Lets the agent read and write a spreadsheet.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['googleServiceAccount'],
    params: [
      { name: 'spreadsheetId', label: 'Spreadsheet', type: 'string', placeholder: 'Sheet URL or ID', hint: 'Share the sheet with your service account first.' },
      { name: 'sheet', label: 'Tab name', type: 'string', default: 'Sheet1' },
      { name: 'allowWrite', label: 'Allow adding and changing rows', type: 'boolean', default: false },
    ] },
  { type: 'toolGoogleCalendar', label: 'Google Calendar Tool', group: 'sub', description: 'Lets the agent read and create events.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['googleServiceAccount'],
    params: [
      { name: 'calendarId', label: 'Calendar', type: 'string', default: 'primary', placeholder: 'you@gmail.com', hint: 'Share the calendar with your service account first.' },
      { name: 'timezone', label: 'Time zone', type: 'string', default: 'UTC', placeholder: 'Europe/London' },
      { name: 'allowWrite', label: 'Allow creating events', type: 'boolean', default: false },
    ] },
  { type: 'toolNotion', label: 'Notion Tool', group: 'sub', description: 'Lets the agent read and add Notion pages.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['notionApi'],
    params: [
      { name: 'databaseId', label: 'Database', type: 'string', placeholder: 'Database URL or ID' },
      { name: 'titleProperty', label: 'Title property', type: 'string', default: 'Name', hint: 'The name of the database title column.' },
      { name: 'allowWrite', label: 'Allow creating pages', type: 'boolean', default: false },
    ] },
  { type: 'toolGithub', label: 'GitHub Tool', group: 'sub', description: 'Lets the agent read and write issues.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['githubApi'],
    params: [
      { name: 'owner', label: 'Owner', type: 'string', placeholder: 'octocat' },
      { name: 'repo', label: 'Repository', type: 'string', placeholder: 'hello-world' },
      { name: 'allowWrite', label: 'Allow creating issues and comments', type: 'boolean', default: false },
    ] },
  { type: 'toolAirtable', label: 'Airtable Tool', group: 'sub', description: 'Lets the agent read and add Airtable records.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['airtableApi'],
    params: [
      { name: 'baseId', label: 'Base ID', type: 'string', placeholder: 'appXXXXXXXXXXXXXX' },
      { name: 'table', label: 'Table', type: 'string', placeholder: 'Contacts' },
      { name: 'allowWrite', label: 'Allow creating records', type: 'boolean', default: false },
    ] },
  { type: 'toolTelegram', label: 'Telegram Message Tool', group: 'sub', description: 'Lets the agent send a Telegram message.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: ['telegram'],
    params: [
      { name: 'chatId', label: 'Chat ID', type: 'string', placeholder: '12345678', hint: 'The chat the agent can message. It cannot pick another one.' },
    ] },
  { type: 'toolWorkflow', label: 'Call Workflow Tool', group: 'sub', description: 'Lets the agent run another workflow.', inputs: 0, outputs: 0, slot: 'tool',
    params: [
      { name: 'toolName', label: 'Tool name', type: 'string', placeholder: 'lookup_customer', hint: 'Short name with letters and underscores. The agent sees it.' },
      { name: 'description', label: 'What it does', type: 'text', hint: 'Tell the agent when to use it and what to pass as input.' },
      { name: 'workflowId', label: 'Workflow ID', type: 'string', hint: 'The id in that workflow address (/workflows/<id>). It gets {input} as its trigger item, and its last node items come back.' },
    ] },
  { type: 'toolThink', label: 'Think Tool', group: 'sub', description: 'A scratchpad the agent uses to plan before acting.', inputs: 0, outputs: 0, slot: 'tool',
    params: [

    ] },
  { type: 'toolCode', label: 'Code Tool', group: 'sub', description: 'Lets the agent run your JavaScript.', inputs: 0, outputs: 0, slot: 'tool',
    params: [
      { name: 'toolName', label: 'Tool name', type: 'string', default: 'run_code', hint: 'Letters, numbers and underscores.' },
      { name: 'toolDescription', label: 'Description', type: 'text', default: 'Runs a custom function on a text input.', hint: 'Tell the model when to use this tool and what to pass.' },
      { name: 'code', label: 'JavaScript', type: 'code', default: '// input = the text the model passes in\nreturn input.toUpperCase();' },
    ] },
  { type: 'toolKnowledgeBase', label: 'Knowledge Base Tool', group: 'sub', description: 'RAG: lets the agent search a Vector Store for relevant passages before answering.', inputs: 0, outputs: 0, slot: 'tool', credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'toolName', label: 'Tool name', type: 'string', default: 'search_knowledge_base', hint: 'Letters, numbers and underscores.' },
      { name: 'toolDescription', label: 'Description', type: 'text', placeholder: 'Searches the product manual for relevant sections.', hint: 'Tell the model when to use this tool. Leave empty for a generic description.' },
      { name: 'store', label: 'Store name', type: 'string', default: 'default', hint: 'Must match the store name used by a Vector Store node.' },
      { name: 'model', label: 'Embedding model', type: 'string', model: true, hint: 'Use the same embedding model that filled this store. Claude has no embeddings API.' },
      { name: 'topK', label: 'Results to return', type: 'number', default: 4 },
    ] },

  // ---- Data ----
  { type: 'http', label: 'HTTP Request', group: 'data', description: 'Call any REST API.', inputs: 1, outputs: 1, credentialTypes: ['httpBearer', 'httpBasic', 'httpHeader'],
    params: [
      { name: 'method', label: 'Method', type: 'select', default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'url', label: 'URL', type: 'string', placeholder: 'https://api.example.com/items' },
      { name: 'query', label: 'Query', type: 'json', default: '' },
      { name: 'headers', label: 'Headers', type: 'json', default: '' },
      { name: 'body', label: 'Body', type: 'json', default: '' },
      { name: 'failOnError', label: 'Fail on 4xx/5xx', type: 'boolean', default: true },
    ] },
  { type: 'set', label: 'Set', group: 'data', description: 'Add or overwrite fields.', inputs: 1, outputs: 1,
    params: [
      { name: 'values', label: 'Fields', type: 'json', default: '{ "name": "{{ $json.title }}" }' },
      { name: 'keepOnlySet', label: 'Drop other fields', type: 'boolean', default: false },
    ] },
  { type: 'code', label: 'Code in JavaScript', group: 'data', description: 'Run your own JavaScript on the items.', inputs: 1, outputs: 1,
    params: [
      { name: 'mode', label: 'Mode', type: 'select', default: 'Run once for all items', options: ['Run once for all items', 'Run once for each item'],
        hint: 'All items: $input.all() holds every item, return an array. Each item: $json is the current item, return one object.' },
      { name: 'code', label: 'JavaScript', type: 'code',
        default: '// Run once for all items. Return an array of objects.\n// Available: $input.all(), $input.first(), $json, $node["Name"].json, $now, fetch, items\nreturn $input.all().map((item) => ({ ...item.json, seen: true }));',
        hint: 'Use await freely. Return null in each-item mode to drop an item. Runs in node:vm, 5s of CPU and 25s total.' },
    ] },
  { type: 'split', label: 'Split Out', group: 'data', description: 'One item per array element.', inputs: 1, outputs: 1,
    params: [{ name: 'field', label: 'Array field', type: 'string', default: 'data', hint: 'Dotted path, e.g. data.results' }] },
  { type: 'aggregate', label: 'Aggregate', group: 'data', description: 'Combine all items into one.', inputs: 1, outputs: 1,
    params: [{ name: 'field', label: 'Output field', type: 'string', default: 'data' }] },
  { type: 'limit', label: 'Limit', group: 'data', description: 'Keep the first N items.', inputs: 1, outputs: 1,
    params: [{ name: 'max', label: 'Max items', type: 'number', default: 10 }] },

  { type: 'sort', label: 'Sort', group: 'data', description: 'Order items by a field.', inputs: 1, outputs: 1,
    params: [
      { name: 'field', label: 'Field', type: 'string', default: 'name', hint: 'Dotted path, e.g. user.age' },
      { name: 'order', label: 'Order', type: 'select', default: 'Ascending', options: ['Ascending', 'Descending'] },
      { name: 'type', label: 'Compare as', type: 'select', default: 'Auto', options: ['Auto', 'Number', 'Text', 'Date'], hint: 'Auto sorts numbers as numbers and everything else as text. Empty values go last.' },
    ] },
  { type: 'dedupe', label: 'Remove Duplicates', group: 'data', description: 'Keep the first of each repeated item.', inputs: 1, outputs: 1,
    params: [
      { name: 'compare', label: 'Compare', type: 'select', default: 'All fields', options: ['All fields', 'Selected fields'] },
      { name: 'fields', label: 'Fields', type: 'string', placeholder: 'email, id', showIf: { param: 'compare', equals: 'Selected fields' }, hint: 'Comma separated. Dotted paths work.' },
    ] },
  { type: 'summarize', label: 'Summarize', group: 'data', description: 'Count, sum, average and more, with optional groups.', inputs: 1, outputs: 1,
    params: [
      { name: 'operation', label: 'Operation', type: 'select', default: 'Count', options: ['Count', 'Count distinct', 'Sum', 'Average', 'Min', 'Max', 'Concatenate'] },
      { name: 'field', label: 'Field', type: 'string', placeholder: 'price', showIf: { param: 'operation', oneOf: ['Count distinct', 'Sum', 'Average', 'Min', 'Max', 'Concatenate'] } },
      { name: 'separator', label: 'Separator', type: 'string', default: ', ', showIf: { param: 'operation', equals: 'Concatenate' } },
      { name: 'groupBy', label: 'Group by (optional)', type: 'string', placeholder: 'category', hint: 'One output item per value. Empty means one item for everything.' },
    ] },
  { type: 'datetime', label: 'Date & Time', group: 'data', description: 'Format dates, add or subtract time, find differences.', inputs: 1, outputs: 1,
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Format a date', options: ['Get current date', 'Format a date', 'Add to date', 'Subtract from date', 'Difference between dates'] },
      { name: 'date', label: 'Date', type: 'string', default: '{{ $json.date }}', placeholder: '2026-03-01T10:30:00Z', showIf: { param: 'operation', oneOf: ['Format a date', 'Add to date', 'Subtract from date', 'Difference between dates'] }, hint: 'ISO text, or a Unix timestamp in seconds or milliseconds. Empty means now.' },
      { name: 'amount', label: 'Amount', type: 'string', default: '1', showIf: { param: 'operation', oneOf: ['Add to date', 'Subtract from date'] } },
      { name: 'date2', label: 'Other date', type: 'string', placeholder: '{{ $now }}', showIf: { param: 'operation', equals: 'Difference between dates' }, hint: 'The result is Other date minus Date, as whole units.' },
      { name: 'unit', label: 'Unit', type: 'select', default: 'days', options: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'], showIf: { param: 'operation', oneOf: ['Add to date', 'Subtract from date', 'Difference between dates'] } },
      { name: 'format', label: 'Format', type: 'string', default: 'ISO', placeholder: "yyyy-MM-dd HH:mm:ss", showIf: { param: 'operation', oneOf: ['Get current date', 'Format a date', 'Add to date', 'Subtract from date'] },
        hint: "ISO, or tokens: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H hh h mm ss SSS a. Put plain text in quotes: yyyy 'at' HH:mm." },
      { name: 'timezone', label: 'Time zone', type: 'string', default: 'UTC', placeholder: 'Europe/London', showIf: { param: 'operation', oneOf: ['Get current date', 'Format a date', 'Add to date', 'Subtract from date'] } },
      { name: 'outputField', label: 'Save result in', type: 'string', default: 'date' },
    ] },
  { type: 'crypto', label: 'Crypto', group: 'data', description: 'Hash, HMAC, random values, Base64.', inputs: 1, outputs: 1,
    params: [
      { name: 'action', label: 'Action', type: 'select', default: 'Hash', options: ['Hash', 'HMAC', 'Random UUID', 'Random string', 'Base64 encode', 'Base64 decode'] },
      { name: 'value', label: 'Value', type: 'string', default: '{{ $json.text }}', showIf: { param: 'action', oneOf: ['Hash', 'HMAC', 'Base64 encode', 'Base64 decode'] } },
      { name: 'algorithm', label: 'Algorithm', type: 'select', default: 'sha256', options: ['md5', 'sha1', 'sha256', 'sha512'], showIf: { param: 'action', oneOf: ['Hash', 'HMAC'] } },
      { name: 'secret', label: 'Secret', type: 'string', showIf: { param: 'action', equals: 'HMAC' } },
      { name: 'encoding', label: 'Output encoding', type: 'select', default: 'hex', options: ['hex', 'base64'], showIf: { param: 'action', oneOf: ['Hash', 'HMAC'] } },
      { name: 'length', label: 'Length', type: 'number', default: 16, showIf: { param: 'action', equals: 'Random string' } },
      { name: 'outputField', label: 'Save result in', type: 'string', default: 'result' },
    ] },
  { type: 'renameKeys', label: 'Rename Keys', group: 'data', description: 'Rename fields.', inputs: 1, outputs: 1,
    params: [{ name: 'renames', label: 'Renames', type: 'json', default: '{ "old_name": "new_name" }' }] },
  { type: 'removeFields', label: 'Remove Fields', group: 'data', description: 'Drop fields, or keep only some.', inputs: 1, outputs: 1,
    params: [
      { name: 'mode', label: 'Mode', type: 'select', default: 'Remove these', options: ['Remove these', 'Keep only these'] },
      { name: 'fields', label: 'Fields', type: 'string', placeholder: 'password, internalId', hint: 'Comma separated.' },
    ] },
  { type: 'executeWorkflow', label: 'Execute Workflow', group: 'logic', description: 'Run another workflow and use its result.', inputs: 1, outputs: 1,
    params: [{ name: 'workflowId', label: 'Workflow ID', type: 'string', placeholder: '00000000-0000-0000-0000-000000000000', hint: 'The id in the other workflow\'s address (/workflows/<id>). The items go in as its trigger output. Its last node\'s items come back. Max 3 levels deep.' }] },
  { type: 'aiclassify', label: 'AI Classify', group: 'ai', description: 'Put text into one of your categories.', inputs: 1, outputs: 1, credentialTypes: AI_CRED_TYPES,
    params: [
      { name: 'model', label: 'Model', type: 'string', model: true },
      { name: 'text', label: 'Text', type: 'text', default: '{{ $json.text }}' },
      { name: 'categories', label: 'Categories', type: 'string', default: 'question, complaint, praise', hint: 'Comma separated. The result goes in the category field. Branch on it with Switch.' },
      { name: 'hint', label: 'Extra guidance', type: 'string', placeholder: 'A complaint mentions a problem or refund.' },
      { name: 'fallback', label: 'If unsure', type: 'string', default: 'other' },
    ] },

  { type: 'csv', label: 'CSV', group: 'data', description: 'Turn CSV text into items, or items into CSV.', inputs: 1, outputs: 1,
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'CSV to items', options: ['CSV to items', 'Items to CSV'] },
      { name: 'text', label: 'CSV text', type: 'text', default: '{{ $json.text }}', showIf: { param: 'operation', equals: 'CSV to items' } },
      { name: 'delimiter', label: 'Separator', type: 'select', default: 'Comma', options: ['Comma', 'Semicolon', 'Tab', 'Pipe'] },
      { name: 'header', label: 'First row is the header', type: 'boolean', default: true },
    ] },
  { type: 'htmlExtract', label: 'HTML Extract', group: 'data', description: 'Pick text, links and attributes out of HTML with CSS selectors.', inputs: 1, outputs: 1,
    params: [
      { name: 'html', label: 'HTML', type: 'text', default: '{{ $json.body }}' },
      { name: 'selectors', label: 'Selectors (JSON)', type: 'json', default: '{ "title": "h1", "links": "a@href" }', hint: 'name: CSS selector. Add @attribute for an attribute, like a@href or img@src, or @html for inner HTML. Without it you get the text.' },
      { name: 'multiple', label: 'Return all matches', type: 'boolean', default: false, hint: 'Off: first match only. On: a list of every match.' },
    ] },
  { type: 'xml', label: 'XML', group: 'data', description: 'Convert XML to JSON, or JSON to XML.', inputs: 1, outputs: 1,
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'XML to JSON', options: ['XML to JSON', 'JSON to XML'] },
      { name: 'text', label: 'XML', type: 'text', default: '{{ $json.body }}', showIf: { param: 'operation', equals: 'XML to JSON' } },
      { name: 'data', label: 'Data (JSON)', type: 'json', default: '{ "name": "{{ $json.name }}" }', showIf: { param: 'operation', equals: 'JSON to XML' } },
      { name: 'rootName', label: 'Root tag', type: 'string', default: 'root', showIf: { param: 'operation', equals: 'JSON to XML' } },
      { name: 'outputField', label: 'Save result in', type: 'string', default: 'data' },
    ] },
  { type: 'rss', label: 'RSS Read', group: 'data', description: 'Read the entries of an RSS or Atom feed.', inputs: 1, outputs: 1,
    params: [
      { name: 'url', label: 'Feed URL', type: 'string', placeholder: 'https://example.com/feed.xml' },
      { name: 'max', label: 'Max entries', type: 'number', default: 20 },
    ] },

  // ---- Logic ----
  { type: 'if', label: 'IF', group: 'logic', description: 'Route items down true or false.', inputs: 1, outputs: 2, outputLabels: ['true', 'false'], params: COND },
  { type: 'filter', label: 'Filter', group: 'logic', description: 'Keep items that match.', inputs: 1, outputs: 1, params: COND },
  { type: 'merge', label: 'Merge', group: 'logic', description: 'Combine items from many branches.', inputs: 1, outputs: 1, params: [] },
  { type: 'wait', label: 'Wait', group: 'logic', description: 'Pause (max 20 seconds).', inputs: 1, outputs: 1,
    params: [{ name: 'seconds', label: 'Seconds', type: 'number', default: 2 }] },

  { type: 'switch', label: 'Switch', group: 'logic', description: 'Send items down one of four rules, or the fallback.', inputs: 1, outputs: 5, outputLabels: ['1', '2', '3', '4', 'fallback'],
    params: [
      { name: 'value1', label: 'Value', type: 'string', placeholder: '{{ $json.type }}' },
      ...[1, 2, 3, 4].flatMap((k): ParamDef[] => [
        { name: `op${k}`, label: `Rule ${k}`, type: 'select', default: 'equals', options: COND_OPS },
        { name: `val${k}`, label: `Rule ${k} compare to`, type: 'string', hint: k === 1 ? 'Leave a rule empty to skip it. Items that match no rule go to fallback.' : undefined },
      ]),
      { name: 'allMatches', label: 'Send to all matching rules', type: 'boolean', default: false, hint: 'Off: an item goes to the first rule it matches.' },
    ] },
  { type: 'noop', label: 'No Operation', group: 'logic', description: 'Passes items through. Handy as a joint or a note.', inputs: 1, outputs: 1, params: [] },
  { type: 'stop', label: 'Stop and Error', group: 'logic', description: 'Stop the run with your own error message.', inputs: 1, outputs: 0, params: [
    { name: 'message', label: 'Error message', type: 'string', default: 'Something went wrong' },
  ] },

  // ---- Apps ----
  { type: 'slack', label: 'Slack', group: 'app', description: 'Post a message.', inputs: 1, outputs: 1, credentialTypes: ['slack'],
    params: [{ name: 'text', label: 'Message', type: 'text', default: 'Hello from Flowlite' }] },
  { type: 'discord', label: 'Discord', group: 'app', description: 'Post a message.', inputs: 1, outputs: 1, credentialTypes: ['discord'],
    params: [{ name: 'content', label: 'Message', type: 'text', default: 'Hello from Flowlite' }] },
  { type: 'telegram', label: 'Telegram', group: 'app', description: 'Send, edit, delete or pin chat messages, send media and more.', inputs: 1, outputs: 1, credentialTypes: ['telegram'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Send a text message', options: TG_OPS },
      { name: 'chatId', label: 'Chat ID', type: 'string', default: '{{ $json.chatId }}' },
      { name: 'messageId', label: 'Message ID', type: 'string', placeholder: '{{ $json.messageId }}', showIf: { param: 'operation', oneOf: ['Edit a text message', 'Delete a chat message', 'Pin a chat message', 'Unpin a chat message'] },
        hint: 'The ID of the message. A Telegram send action outputs it as messageId. Unpin: leave empty to unpin the most recent pinned message.' },
      { name: 'text', label: 'Message', type: 'text', default: 'Hello from Flowlite', showIf: { param: 'operation', oneOf: TG_TEXT_OPS } },
      { name: 'parseMode', label: 'Format', type: 'select', default: 'None', options: ['None', 'HTML', 'Markdown', 'MarkdownV2'], showIf: { param: 'operation', oneOf: TG_FORMAT_OPS },
        hint: 'Rich actions use HTML when this is None. HTML tags: <b>, <i>, <a href="...">, <code>, <pre>.' },
      { name: 'buttons', label: 'Inline buttons (JSON)', type: 'json', placeholder: '[[{"text":"Open site","url":"https://example.com"}]]', showIf: { param: 'operation', oneOf: ['Send a rich message', 'Edit a text message'] },
        hint: 'Rows of buttons. Each button needs text plus url or callback_data. Leave empty for none.' },
      { name: 'file', label: 'File (URL or file_id)', type: 'string', placeholder: 'https://example.com/photo.jpg', showIf: { param: 'operation', oneOf: TG_FILE_OPS },
        hint: 'A public https link or a Telegram file_id. Uploading binary files is not supported.' },
      { name: 'caption', label: 'Caption', type: 'text', showIf: { param: 'operation', oneOf: TG_CAPTION_OPS }, hint: 'Optional. Up to 1024 characters.' },
      { name: 'latitude', label: 'Latitude', type: 'string', placeholder: '51.5074', showIf: { param: 'operation', equals: 'Send a location' } },
      { name: 'longitude', label: 'Longitude', type: 'string', placeholder: '-0.1278', showIf: { param: 'operation', equals: 'Send a location' } },
      { name: 'media', label: 'Media (JSON)', type: 'json', placeholder: '[{"type":"photo","media":"https://example.com/a.jpg","caption":"One"},{"type":"photo","media":"https://example.com/b.jpg"}]', showIf: { param: 'operation', equals: 'Send a media group' },
        hint: '2 to 10 items. type: photo, video, audio or document. Mixing audio or document with other types is not allowed by Telegram.' },
      { name: 'chatAction', label: 'Chat action', type: 'select', default: 'typing', options: ['typing', 'upload_photo', 'record_video', 'upload_video', 'record_voice', 'upload_voice', 'upload_document', 'choose_sticker', 'find_location', 'record_video_note', 'upload_video_note'], showIf: { param: 'operation', equals: 'Send a chat action' },
        hint: 'Shows "typing…" or similar for about 5 seconds.' },
      { name: 'draftId', label: 'Draft ID', type: 'string', default: '1', showIf: { param: 'operation', oneOf: ['Send a message draft', 'Send a rich message draft'] },
        hint: 'Any non-zero number. Sending the same ID again updates the draft. Private chats only.' },
      { name: 'replyTo', label: 'Reply to message ID', type: 'string', showIf: { param: 'operation', oneOf: TG_SEND_OPS } },
      { name: 'silent', label: 'Send silently', type: 'boolean', default: false, showIf: { param: 'operation', oneOf: [...TG_SEND_OPS, 'Pin a chat message'] } },
      { name: 'protect', label: 'Protect content', type: 'boolean', default: false, showIf: { param: 'operation', oneOf: TG_SEND_OPS }, hint: 'Stops forwarding and saving.' },
      { name: 'noPreview', label: 'Disable link preview', type: 'boolean', default: false, showIf: { param: 'operation', oneOf: ['Send a text message', 'Send a rich message', 'Edit a text message'] } },
    ] },
  { type: 'githubApi', label: 'GitHub', group: 'app', description: 'Create, read and comment on issues.', inputs: 1, outputs: 1, credentialTypes: ['githubApi'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Create an issue', options: ['Create an issue', 'Get an issue', 'Get many issues', 'Comment on an issue', 'Close an issue'] },
      { name: 'owner', label: 'Owner', type: 'string', placeholder: 'octocat' },
      { name: 'repo', label: 'Repository', type: 'string', placeholder: 'hello-world' },
      { name: 'number', label: 'Issue number', type: 'string', placeholder: '42', showIf: { param: 'operation', oneOf: ['Get an issue', 'Comment on an issue', 'Close an issue'] } },
      { name: 'title', label: 'Title', type: 'string', showIf: { param: 'operation', equals: 'Create an issue' } },
      { name: 'body', label: 'Body', type: 'text', showIf: { param: 'operation', oneOf: ['Create an issue', 'Comment on an issue'] } },
      { name: 'labels', label: 'Labels', type: 'string', placeholder: 'bug, help wanted', showIf: { param: 'operation', equals: 'Create an issue' }, hint: 'Comma separated.' },
      { name: 'state', label: 'State', type: 'select', default: 'open', options: ['open', 'closed', 'all'], showIf: { param: 'operation', equals: 'Get many issues' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 30, showIf: { param: 'operation', equals: 'Get many issues' } },
    ] },
  { type: 'airtable', label: 'Airtable', group: 'app', description: 'Read and write records in a base.', inputs: 1, outputs: 1, credentialTypes: ['airtableApi'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get many records', options: ['Get many records', 'Get a record', 'Create a record', 'Update a record', 'Delete a record'] },
      { name: 'baseId', label: 'Base ID', type: 'string', placeholder: 'appXXXXXXXXXXXXXX' },
      { name: 'table', label: 'Table', type: 'string', placeholder: 'Contacts', hint: 'Table name or ID (tblXXXX).' },
      { name: 'recordId', label: 'Record ID', type: 'string', placeholder: 'recXXXXXXXXXXXXXX', showIf: { param: 'operation', oneOf: ['Get a record', 'Update a record', 'Delete a record'] } },
      { name: 'fields', label: 'Fields', type: 'json', default: '{ "Name": "{{ $json.name }}" }', showIf: { param: 'operation', oneOf: ['Create a record', 'Update a record'] } },
      { name: 'filterFormula', label: 'Filter formula', type: 'string', placeholder: "{Status} = 'Active'", showIf: { param: 'operation', equals: 'Get many records' }, hint: 'Optional Airtable formula.' },
      { name: 'limit', label: 'Limit', type: 'number', default: 50, showIf: { param: 'operation', equals: 'Get many records' } },
    ] },
  { type: 'twilio', label: 'Twilio SMS', group: 'app', description: 'Send an SMS or WhatsApp message.', inputs: 1, outputs: 1, credentialTypes: ['twilioApi'],
    params: [
      { name: 'from', label: 'From', type: 'string', placeholder: '+15551234567' },
      { name: 'to', label: 'To', type: 'string', placeholder: '{{ $json.phone }}' },
      { name: 'body', label: 'Message', type: 'text', default: 'Hello from Flowlite' },
    ] },
  { type: 'supabaseApi', label: 'Supabase', group: 'app', description: 'Read and write rows in your Supabase tables.', inputs: 1, outputs: 1, credentialTypes: ['supabaseApi'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get rows', options: ['Get rows', 'Insert rows', 'Update rows', 'Delete rows'] },
      { name: 'table', label: 'Table', type: 'string', placeholder: 'todos' },
      { name: 'select', label: 'Columns', type: 'string', default: '*', showIf: { param: 'operation', equals: 'Get rows' } },
      { name: 'matchColumn', label: 'Match column', type: 'string', placeholder: 'id', showIf: { param: 'operation', oneOf: ['Get rows', 'Update rows', 'Delete rows'] }, hint: 'Update and Delete need this, so they cannot touch every row by mistake.' },
      { name: 'matchOp', label: 'Match operator', type: 'select', default: 'eq', options: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike'], showIf: { param: 'operation', oneOf: ['Get rows', 'Update rows', 'Delete rows'] } },
      { name: 'matchValue', label: 'Match value', type: 'string', placeholder: '{{ $json.id }}', showIf: { param: 'operation', oneOf: ['Get rows', 'Update rows', 'Delete rows'] } },
      { name: 'data', label: 'Data', type: 'json', default: '{ "title": "{{ $json.title }}" }', showIf: { param: 'operation', oneOf: ['Insert rows', 'Update rows'] } },
      { name: 'limit', label: 'Limit', type: 'number', default: 50, showIf: { param: 'operation', equals: 'Get rows' } },
    ] },
  { type: 'notionApi', label: 'Notion', group: 'app', description: 'Query databases, create and update pages.', inputs: 1, outputs: 1, credentialTypes: ['notionApi'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Query a database', options: ['Query a database', 'Create a page in a database', 'Get a page', 'Update page properties', 'Append text to a page'] },
      { name: 'databaseId', label: 'Database ID', type: 'string', placeholder: 'Database URL or ID', showIf: { param: 'operation', oneOf: ['Query a database', 'Create a page in a database'] } },
      { name: 'pageId', label: 'Page ID', type: 'string', placeholder: 'Page URL or ID', showIf: { param: 'operation', oneOf: ['Get a page', 'Update page properties', 'Append text to a page'] } },
      { name: 'filter', label: 'Filter (JSON)', type: 'json', default: '', placeholder: '{"property":"Status","status":{"equals":"Done"}}', showIf: { param: 'operation', equals: 'Query a database' }, hint: 'Optional, in Notion filter format.' },
      { name: 'limit', label: 'Limit', type: 'number', default: 50, showIf: { param: 'operation', equals: 'Query a database' } },
      { name: 'titleProperty', label: 'Title property', type: 'string', default: 'Name', showIf: { param: 'operation', equals: 'Create a page in a database' }, hint: 'The name of the database\'s title column.' },
      { name: 'title', label: 'Title', type: 'string', default: '{{ $json.title }}', showIf: { param: 'operation', equals: 'Create a page in a database' } },
      { name: 'properties', label: 'Other properties (JSON)', type: 'json', default: '', placeholder: '{"Status":{"status":{"name":"Todo"}}}', showIf: { param: 'operation', oneOf: ['Create a page in a database', 'Update page properties'] }, hint: 'Notion property format. Optional when creating.' },
      { name: 'content', label: 'Text', type: 'text', showIf: { param: 'operation', oneOf: ['Create a page in a database', 'Append text to a page'] }, hint: 'Each blank-line separated block becomes a paragraph.' },
    ] },
  { type: 'googleSheets', label: 'Google Sheets', group: 'app', description: 'Read and change rows, tabs and spreadsheets. Row 1 holds column names.', inputs: 1, outputs: 1, credentialTypes: ['googleServiceAccount'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get rows', options: ['Get rows', 'Append row', 'Append or update row', 'Update row', 'Delete rows', 'Clear sheet', 'Get sheet names', 'Create sheet', 'Delete sheet', 'Create spreadsheet'] },
      { name: 'spreadsheetId', label: 'Spreadsheet', type: 'string', placeholder: 'Sheet URL or ID', showIf: { param: 'operation', oneOf: ['Get rows', 'Append row', 'Append or update row', 'Update row', 'Delete rows', 'Clear sheet', 'Get sheet names', 'Create sheet', 'Delete sheet'] }, hint: 'Share the sheet with your service account\'s email first.' },
      { name: 'sheet', label: 'Tab name', type: 'string', default: 'Sheet1', showIf: { param: 'operation', oneOf: ['Get rows', 'Append row', 'Append or update row', 'Update row', 'Delete rows', 'Clear sheet', 'Create sheet', 'Delete sheet'] } },
      { name: 'filterColumn', label: 'Filter column', type: 'string', placeholder: 'Status', showIf: { param: 'operation', equals: 'Get rows' }, hint: 'Optional. Only rows where this column equals the value below.' },
      { name: 'filterValue', label: 'Filter value', type: 'string', placeholder: 'Active', showIf: { param: 'operation', equals: 'Get rows' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 100, showIf: { param: 'operation', equals: 'Get rows' } },
      { name: 'matchColumn', label: 'Match column', type: 'string', placeholder: 'Email', showIf: { param: 'operation', equals: 'Append or update row' }, hint: 'If a row has the same value in this column it is updated. Otherwise a new row is added.' },
      { name: 'rowNumber', label: 'Row number', type: 'string', placeholder: '{{ $json.rowNumber }}', showIf: { param: 'operation', oneOf: ['Update row', 'Delete rows'] }, hint: 'Get rows returns rowNumber. Row 1 cannot be changed here.' },
      { name: 'count', label: 'How many rows', type: 'number', default: 1, showIf: { param: 'operation', equals: 'Delete rows' } },
      { name: 'values', label: 'Values (JSON)', type: 'json', default: '{ "Name": "{{ $json.name }}" }', showIf: { param: 'operation', oneOf: ['Append row', 'Append or update row', 'Update row'] }, hint: 'Keys must match the column names in row 1. Append row also takes a list of objects to add several rows.' },
      { name: 'keepHeader', label: 'Keep header row', type: 'boolean', default: true, showIf: { param: 'operation', equals: 'Clear sheet' } },
      { name: 'title', label: 'Title', type: 'string', showIf: { param: 'operation', equals: 'Create spreadsheet' } },
      { name: 'sheetNames', label: 'Tabs (optional)', type: 'string', placeholder: 'Orders, Customers', showIf: { param: 'operation', equals: 'Create spreadsheet' }, hint: 'Comma separated.' },
      { name: 'shareWith', label: 'Share with', type: 'string', placeholder: 'you@gmail.com', showIf: { param: 'operation', equals: 'Create spreadsheet' }, hint: 'Strongly recommended. A sheet made by a service account is invisible to you until it is shared.' },
    ] },
  { type: 'googleDrive', label: 'Google Drive', group: 'app', description: 'List, read, share and organize files shared with your service account.', inputs: 1, outputs: 1, credentialTypes: ['googleServiceAccount'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'List files', options: ['List files', 'Get file info', 'Read file as text', 'Create folder', 'Share file', 'Move to trash'] },
      { name: 'folderId', label: 'Folder', type: 'string', placeholder: 'Folder link or ID', showIf: { param: 'operation', oneOf: ['List files', 'Create folder'] }, hint: 'Optional. Share the folder with your service account first.' },
      { name: 'search', label: 'Name contains', type: 'string', showIf: { param: 'operation', equals: 'List files' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 50, showIf: { param: 'operation', equals: 'List files' } },
      { name: 'fileId', label: 'File', type: 'string', placeholder: 'File link or ID', showIf: { param: 'operation', oneOf: ['Get file info', 'Read file as text', 'Share file', 'Move to trash'] } },
      { name: 'name', label: 'Folder name', type: 'string', showIf: { param: 'operation', equals: 'Create folder' } },
      { name: 'shareWith', label: 'Email', type: 'string', showIf: { param: 'operation', equals: 'Share file' } },
      { name: 'role', label: 'Access', type: 'select', default: 'reader', options: ['reader', 'commenter', 'writer'], showIf: { param: 'operation', equals: 'Share file' } },
    ] },
  { type: 'googleCalendar', label: 'Google Calendar', group: 'app', description: 'Read, create and delete events on calendars shared with your service account.', inputs: 1, outputs: 1, credentialTypes: ['googleServiceAccount'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get many events', options: ['Get many events', 'Get an event', 'Create an event', 'Delete an event'] },
      { name: 'calendarId', label: 'Calendar', type: 'string', default: 'primary', placeholder: 'you@gmail.com', hint: 'Share your calendar with the service account ("Make changes to events"), then use your calendar\'s email or ID here.' },
      { name: 'timeMin', label: 'From', type: 'string', placeholder: 'Empty means now', showIf: { param: 'operation', equals: 'Get many events' } },
      { name: 'timeMax', label: 'Until', type: 'string', showIf: { param: 'operation', equals: 'Get many events' } },
      { name: 'search', label: 'Search text', type: 'string', showIf: { param: 'operation', equals: 'Get many events' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 25, showIf: { param: 'operation', equals: 'Get many events' } },
      { name: 'eventId', label: 'Event ID', type: 'string', placeholder: '{{ $json.id }}', showIf: { param: 'operation', oneOf: ['Get an event', 'Delete an event'] } },
      { name: 'summary', label: 'Title', type: 'string', showIf: { param: 'operation', equals: 'Create an event' } },
      { name: 'start', label: 'Start', type: 'string', placeholder: '2026-03-01T10:00:00Z or 2026-03-01', showIf: { param: 'operation', equals: 'Create an event' }, hint: 'A date alone makes an all-day event.' },
      { name: 'end', label: 'End', type: 'string', placeholder: '2026-03-01T11:00:00Z', showIf: { param: 'operation', equals: 'Create an event' }, hint: 'For all-day events this day is not included.' },
      { name: 'timezone', label: 'Time zone', type: 'string', default: 'UTC', showIf: { param: 'operation', equals: 'Create an event' } },
      { name: 'location', label: 'Location', type: 'string', showIf: { param: 'operation', equals: 'Create an event' } },
      { name: 'description', label: 'Description', type: 'text', showIf: { param: 'operation', equals: 'Create an event' } },
    ] },
  { type: 'smtp', label: 'Send Email (SMTP)', group: 'app', description: 'Send or reply to email through any SMTP server.', inputs: 1, outputs: 1, credentialTypes: ['smtp'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Send an email', options: ['Send an email', 'Reply to an email'] },
      { name: 'from', label: 'From', type: 'string', placeholder: 'Name <you@example.com>' },
      { name: 'to', label: 'To', type: 'string', placeholder: '{{ $json.from }}', hint: 'Comma separated for several.' },
      { name: 'cc', label: 'Cc', type: 'string' },
      { name: 'bcc', label: 'Bcc', type: 'string' },
      { name: 'replyTo', label: 'Reply to', type: 'string' },
      { name: 'inReplyTo', label: 'Message ID to reply to', type: 'string', placeholder: '{{ $json.messageId }}', showIf: { param: 'operation', equals: 'Reply to an email' }, hint: 'From Email Read (IMAP). The reply is threaded under that email and "Re: " is added to the subject.' },
      { name: 'references', label: 'References', type: 'string', placeholder: '{{ $json.references }}', showIf: { param: 'operation', equals: 'Reply to an email' }, hint: 'Optional. Keeps long threads together.' },
      { name: 'subject', label: 'Subject', type: 'string', placeholder: '{{ $json.subject }}' },
      { name: 'format', label: 'Format', type: 'select', default: 'Text', options: ['Text', 'HTML'] },
      { name: 'body', label: 'Body', type: 'text' },
      { name: 'attachmentUrls', label: 'Attachment links', type: 'string', placeholder: 'https://example.com/invoice.pdf', hint: 'Optional. Public https links, comma separated. Up to 5 files, 10 MB in total.' },
    ] },
  { type: 'emailRead', label: 'Email Read (IMAP)', group: 'app', description: 'Read, mark, move and delete emails in a mailbox.', inputs: 1, outputs: 1, credentialTypes: ['imap'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get many emails', options: ['Get many emails', 'Mark as read', 'Mark as unread', 'Move an email', 'Delete an email', 'Get mailboxes'] },
      { name: 'mailbox', label: 'Mailbox', type: 'string', default: 'INBOX', showIf: { param: 'operation', oneOf: ['Get many emails', 'Mark as read', 'Mark as unread', 'Move an email', 'Delete an email'] } },
      { name: 'status', label: 'Which emails', type: 'select', default: 'Unread', options: ['Unread', 'All'], showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'from', label: 'From contains', type: 'string', showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'subject', label: 'Subject contains', type: 'string', showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'sinceDays', label: 'Newer than (days)', type: 'number', default: '', showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 20, showIf: { param: 'operation', equals: 'Get many emails' }, hint: 'Newest first. Up to 100.' },
      { name: 'markAsRead', label: 'Mark as read after reading', type: 'boolean', default: false, showIf: { param: 'operation', equals: 'Get many emails' }, hint: 'Turn on when polling on a schedule, so each email is handled once.' },
      { name: 'includeHtml', label: 'Include HTML body', type: 'boolean', default: false, showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'uid', label: 'Email UID', type: 'string', placeholder: '{{ $json.uid }}', showIf: { param: 'operation', oneOf: ['Mark as read', 'Mark as unread', 'Move an email', 'Delete an email'] } },
      { name: 'destination', label: 'Move to folder', type: 'string', placeholder: 'Archive', showIf: { param: 'operation', equals: 'Move an email' }, hint: 'Use Get mailboxes to see the exact names.' },
    ] },
  { type: 'whatsapp', label: 'WhatsApp', group: 'app', description: 'Send a WhatsApp message (Cloud API).', inputs: 1, outputs: 1, credentialTypes: ['whatsappApi'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Send a text message', options: ['Send a text message', 'Send a template message'] },
      { name: 'to', label: 'To', type: 'string', placeholder: '15551234567', hint: 'Full number with country code, digits only.' },
      { name: 'body', label: 'Message', type: 'text', default: 'Hello from Flowlite', showIf: { param: 'operation', equals: 'Send a text message' } },
      { name: 'template', label: 'Template name', type: 'string', placeholder: 'hello_world', showIf: { param: 'operation', equals: 'Send a template message' } },
      { name: 'language', label: 'Template language', type: 'string', default: 'en_US', showIf: { param: 'operation', equals: 'Send a template message' } },
    ] },
  { type: 'gmail', label: 'Gmail', group: 'app', description: 'Search, read, send, reply, draft and label Gmail.', inputs: 1, outputs: 1, credentialTypes: ['googleOAuth'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get many emails', options: ['Get many emails', 'Get an email', 'Send an email', 'Reply to an email', 'Create a draft', 'Mark as read', 'Mark as unread', 'Add label', 'Remove label', 'Move to trash', 'Get labels'] },
      { name: 'query', label: 'Search', type: 'string', default: 'is:unread in:inbox', showIf: { param: 'operation', equals: 'Get many emails' }, hint: 'Gmail search syntax: from:, to:, subject:, label:, newer_than:2d, has:attachment.' },
      { name: 'limit', label: 'Limit', type: 'number', default: 10, showIf: { param: 'operation', equals: 'Get many emails' }, hint: 'Newest first. Up to 50.' },
      { name: 'includeBody', label: 'Include full text', type: 'boolean', default: true, showIf: { param: 'operation', equals: 'Get many emails' } },
      { name: 'messageId', label: 'Email ID', type: 'string', placeholder: '{{ $json.id }}', showIf: { param: 'operation', oneOf: ['Get an email', 'Reply to an email', 'Mark as read', 'Mark as unread', 'Add label', 'Remove label', 'Move to trash'] } },
      { name: 'label', label: 'Label', type: 'string', placeholder: 'Important', showIf: { param: 'operation', oneOf: ['Add label', 'Remove label'] }, hint: 'The label name. Get labels lists them.' },
      { name: 'to', label: 'To', type: 'string', showIf: { param: 'operation', oneOf: ['Send an email', 'Create a draft'] } },
      { name: 'cc', label: 'Cc', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'bcc', label: 'Bcc', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'subject', label: 'Subject', type: 'string', showIf: { param: 'operation', oneOf: ['Send an email', 'Create a draft'] } },
      { name: 'format', label: 'Format', type: 'select', default: 'Text', options: ['Text', 'HTML'], showIf: { param: 'operation', oneOf: ['Send an email', 'Reply to an email', 'Create a draft'] } },
      { name: 'body', label: 'Body', type: 'text', showIf: { param: 'operation', oneOf: ['Send an email', 'Reply to an email', 'Create a draft'] }, hint: 'A reply goes to the sender, in the same thread.' },
      { name: 'attachmentUrls', label: 'Attachment links', type: 'string', showIf: { param: 'operation', equals: 'Send an email' }, hint: 'Optional. Public https links, comma separated. Up to 5 files, 10 MB in total.' },
    ] },
  { type: 'blogger', label: 'Blogger', group: 'app', description: 'List, search, create, update, publish and delete blog posts.', inputs: 1, outputs: 1, credentialTypes: ['googleOAuth'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Get many posts', options: ['Get blogs', 'Get many posts', 'Search posts', 'Get a post', 'Create a post', 'Update a post', 'Publish a draft', 'Delete a post'] },
      { name: 'blog', label: 'Blog', type: 'string', placeholder: 'https://yourblog.blogspot.com', showIf: { param: 'operation', oneOf: ['Get many posts', 'Search posts', 'Get a post', 'Create a post', 'Update a post', 'Publish a draft', 'Delete a post'] }, hint: 'The blog address, or its numeric ID. Get blogs lists yours.' },
      { name: 'status', label: 'Status', type: 'select', default: 'live', options: ['live', 'draft', 'scheduled', 'all'], showIf: { param: 'operation', equals: 'Get many posts' } },
      { name: 'query', label: 'Search', type: 'string', showIf: { param: 'operation', equals: 'Search posts' } },
      { name: 'limit', label: 'Limit', type: 'number', default: 10, showIf: { param: 'operation', oneOf: ['Get many posts', 'Search posts'] } },
      { name: 'includeContent', label: 'Include content', type: 'boolean', default: false, showIf: { param: 'operation', oneOf: ['Get many posts', 'Search posts'] } },
      { name: 'postId', label: 'Post ID', type: 'string', placeholder: '{{ $json.id }}', showIf: { param: 'operation', oneOf: ['Get a post', 'Update a post', 'Publish a draft', 'Delete a post'] } },
      { name: 'title', label: 'Title', type: 'string', showIf: { param: 'operation', oneOf: ['Create a post', 'Update a post'] } },
      { name: 'content', label: 'Content', type: 'text', showIf: { param: 'operation', oneOf: ['Create a post', 'Update a post'] }, hint: 'HTML, or plain text with blank lines between paragraphs.' },
      { name: 'labels', label: 'Labels', type: 'string', placeholder: 'news, update', showIf: { param: 'operation', oneOf: ['Create a post', 'Update a post'] }, hint: 'Comma separated.' },
      { name: 'publish', label: 'When creating', type: 'select', default: 'Save as draft', options: ['Save as draft', 'Publish now'], showIf: { param: 'operation', equals: 'Create a post' } },
    ] },
  { type: 'mcpClient', label: 'MCP Client', group: 'app', description: 'List the tools of an MCP server, or run one.', inputs: 1, outputs: 1, credentialTypes: ['httpBearer', 'httpBasic', 'httpHeader'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'List tools', options: ['List tools', 'Call a tool'] },
      { name: 'url', label: 'Endpoint URL', type: 'string', placeholder: 'https://example.com/mcp', hint: 'A Streamable HTTP MCP server.' },
      { name: 'headers', label: 'Extra headers', type: 'json', default: '', placeholder: '{"X-Api-Key":"..."}' },
      { name: 'tool', label: 'Tool', type: 'string', showIf: { param: 'operation', equals: 'Call a tool' }, hint: 'Use List tools to see the names.' },
      { name: 'arguments', label: 'Arguments (JSON)', type: 'json', default: '{ }', showIf: { param: 'operation', equals: 'Call a tool' } },
    ] },
  { type: 'email', label: 'Send Email (Resend)', group: 'app', description: 'Send email via Resend, or look up a sent email.', inputs: 1, outputs: 1, credentialTypes: ['resend'],
    params: [
      { name: 'operation', label: 'Action', type: 'select', default: 'Send an email', options: ['Send an email', 'Get an email'] },
      { name: 'emailId', label: 'Email ID', type: 'string', placeholder: '{{ $json.id }}', showIf: { param: 'operation', equals: 'Get an email' }, hint: 'Send an email returns it as id. Shows delivery status.' },
      { name: 'from', label: 'From', type: 'string', placeholder: 'Name <you@yourdomain.com>', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'to', label: 'To', type: 'string', hint: 'Comma separated for several.', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'cc', label: 'Cc', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'bcc', label: 'Bcc', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'replyTo', label: 'Reply to', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'subject', label: 'Subject', type: 'string', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'format', label: 'Format', type: 'select', default: 'HTML', options: ['HTML', 'Text'], showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'html', label: 'Body', type: 'text', showIf: { param: 'operation', equals: 'Send an email' } },
      { name: 'attachmentUrls', label: 'Attachment links', type: 'string', placeholder: 'https://example.com/invoice.pdf', showIf: { param: 'operation', equals: 'Send an email' }, hint: 'Optional. Public https links, comma separated. Up to 5 files, 10 MB in total.' },
    ] },
];

export const getDef = (type: string): NodeDef | undefined => NODES.find((n) => n.type === type);

export function defaultParams(def: NodeDef): Record<string, any> {
  return Object.fromEntries(def.params.filter((p) => p.default !== undefined).map((p) => [p.name, p.default]));
}

/**
 * Node palette grouping: buckets NODES by category (in GROUPS order), drops hidden
 * node types, applies an optional search filter, and skips groups left empty by that
 * filter. Single source of truth for "what shows under which heading in the palette".
 */
export type NodeGroupBucket = { group: NodeGroup; label: string; items: NodeDef[] };
export function groupedNodes(filter = ''): NodeGroupBucket[] {
  const needle = filter.trim().toLowerCase();
  const matches = (n: NodeDef) => !needle || n.label.toLowerCase().includes(needle) || n.description.toLowerCase().includes(needle);
  return (Object.keys(GROUPS) as NodeGroup[])
    .map((group) => ({ group, label: GROUPS[group], items: NODES.filter((n) => n.group === group && !n.hidden && matches(n)) }))
    .filter((b) => b.items.length > 0);
}
