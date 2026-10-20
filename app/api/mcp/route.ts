import { handleMcpPost, notAllowed } from '@/lib/mcpServer';
import { preflight } from '@/lib/v1';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// MCP endpoint (Streamable HTTP). Auth: "Authorization: Bearer fl_..." (create keys on the API page).
export const POST = handleMcpPost;
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = preflight;
