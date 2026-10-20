# Flowlite

Light n8n-style automation for Vercel. Next.js + React Flow + Supabase.

## Setup
1. Supabase: run `supabase/schema.sql` in the SQL editor. Updating? Run it again. It is safe to repeat, and it adds the `chat_memory` table.
2. `cp .env.example .env.local` and fill every value.
3. `npm i && npm run dev`
4. Deploy: push to GitHub, import in Vercel, add the same env vars.

## What it has
- Visual editor: drag-connect nodes, run, inspect each node's output. Light and dark theme.
- 9 triggers: Manual, Webhook, Form (public page), Chat (test panel or public page), Telegram, GitHub, Stripe, Schedule (cron), Interval.
- AI Agent with sockets: Chat Model, Memory, Tools. Calculator, HTTP Request Tool, Code Tool and MCP Client Tool included.
- Executions tab in the editor: past runs of this workflow, colored graph, per-node output.
- AI Chat and AI Extract work with any provider:
  Groq, Google Gemini, OpenRouter, Mistral, Cerebras, NVIDIA NIM, Hugging Face (all with free tiers),
  Ollama (local), OpenAI, Claude, DeepSeek, and any OpenAI-compatible server.
- "Load models" lists the live models for your key. OpenRouter free models are starred.
- Data and logic: HTTP, Set, Code in JavaScript (all items or each item), Split Out, Aggregate, Limit, IF, Filter, Merge, Wait.
- Apps: Slack, Discord, Telegram, Email (Resend).
- Encrypted credentials (AES-256-GCM, key = `ENCRYPTION_KEY`). Secrets never reach the browser.
- Expressions: `{{ $json.x }}`, `{{ $node["Name"].json.x }}`, `$items`, `$index`, `$now`.
- Executions log in Supabase.

## Free AI quick start
1. Credentials, pick Groq or Google Gemini, press "Get an API key", paste it.
2. Add an AI Chat node, choose the credential, press Load models, pick one.

## Chat and AI Agent
1. Add a Chat Trigger and an AI Agent, and connect them.
2. On the agent, press the + under Chat Model and add one. Pick a credential and a model. The dashed lines show sub-nodes.
3. Optional: add Chat Memory (remembers the last N messages per session) and tools.
4. Press Open chat to test. It runs the unsaved graph and colors the nodes.
- Public chat: turn on "Make chat publicly available", activate the workflow, share `/chat/<path>`. Anyone with the link spends your AI credits.
- Tools need a model that supports tool calling. Groq, Gemini, OpenAI, Claude, Mistral and most OpenRouter models do.
- More nodes: Switch (4 rules + fallback), No Operation, Stop and Error, Sort, Remove Duplicates, Summarize, Date & Time, Crypto, RSS Read, GitHub (issues), Airtable, Twilio SMS, Supabase (rows). Each app node has its own credential type.
- Even more nodes: Notion, Google Sheets (service account), Send Email (SMTP), WhatsApp (Cloud API), Execute Workflow, AI Classify, Rename Keys, Remove Fields. Agent tools: Wikipedia, Web Search (Tavily), Web Page Reader, Date & Time. Run `npm install` after updating (adds nodemailer).
- Email and Google: Send Email (SMTP) can reply in a thread and attach files by link. Send Email (Resend) has cc, bcc, reply-to, text or HTML, attachments and delivery lookup. Email Read (IMAP) reads, marks, moves and deletes mail. Google Sheets has 10 actions (append or update, delete rows, clear, create tab, create spreadsheet and more). Google Drive and Google Calendar use the same service account credential. CSV, HTML Extract and XML nodes. Run `npm install` (adds imapflow, mailparser, cheerio, fast-xml-parser).
- Agent tools: Gmail, Blogger, Google Sheets, Google Calendar, Notion, GitHub, Airtable, Telegram message, Call Workflow (any workflow as a tool), Think. Tools that change things have an "Allow ..." switch, off by default for sending email, publishing posts and editing. Gmail and Blogger use the Google OAuth credential (client ID, secret, refresh token from the OAuth Playground; see the note on the credential). Gmail, Blogger and MCP Client are also normal nodes.
- Editor: drag on empty canvas to select several nodes (Select mode), or switch to Pan. Double-click a node to open it. Ctrl/Cmd+A select all, C copy, V paste, D duplicate, Delete removes. Tidy up arranges only the selection when 2+ nodes are selected.
- Editor: Auto-save (on by default, 1.2s after each change; run status and selection are not saved). "Tidy up" arranges nodes left to right, branches in output order, agent sub-nodes under their sockets. "Undo tidy" restores the old positions.
- MCP Client Tool: point it at a Streamable HTTP MCP server URL. Every tool the server lists becomes an agent tool. Use "Tools to include" to limit them. Bearer tokens go in an HTTP Bearer credential.
- HTTP Request Tool: the host must be fixed. Only the path and query take `{placeholders}`, and the values are URL-encoded.
- The agent output is `{ output }`. Turn on "Return tool steps" to also get the tool calls.
- The agent stops after 50 seconds or "Max tool rounds" (default 8).

## Triggers
- Webhook, GitHub, Stripe: `/api/webhook/<path>`. Workflow must be Active.
- Telegram: add a "Telegram bot" credential (token from @BotFather), pick it on the Telegram Trigger, turn the workflow Active.
  Flowlite registers the webhook for you and verifies every update. Deactivating removes it.
  Telegram needs a public https address. On a laptop, run `ngrok http 3000` (or cloudflared), set `PUBLIC_URL` in `.env.local`, restart.
  "Check status" in the node shows Telegram's last delivery error.
  "Listen for message" is a live test: send your bot a message and it appears in the node's Output with your real chat ID. Works even when the workflow is not Active.
  A "404 Not Found" delivery error means the workflow was not Active when Telegram called.
- GitHub and Stripe verify signatures when you attach a "Webhook signing secret" credential.
- Form: public page at `/form/<path>`.
- Chat: test panel in the editor, or public page at `/chat/<path>` when made public.

## Scheduling
Vercel Hobby cannot run per-minute crons. Pick one:
- Vercel Pro: add `vercel.json` with `{"crons":[{"path":"/api/cron","schedule":"* * * * *"}]}`.
- Free: `.github/workflows/cron.yml` pings every 5 min (set `APP_URL`, `CRON_SECRET` secrets).
- Any pinger with header `Authorization: Bearer $CRON_SECRET`.
Cron is evaluated in UTC.

## Limits (Vercel serverless)
- One run must finish in 60s (`maxDuration`). Wait node caps at 20s.
- No loops, no sub-workflows, no retries, no queue. Chat replies are not streamed.
- Executions tab shows the current graph colored with each run's results. Edited nodes may not match old runs.
- Code node runs in `node:vm`. It is not a hard sandbox. Single trusted admin only.
- Login is a form at `/login` (`ADMIN_USER` / `ADMIN_PASSWORD`) that sets a signed 7-day cookie. Set `SESSION_SECRET` to sign it (falls back to `ENCRYPTION_KEY`). Webhook, form, public chat and cron paths stay public.
