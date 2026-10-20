/**
 * Client-side preview of {{ expressions }} against the node's input item.
 * Only used to show "Result: ..." under a parameter in the node screen.
 * The real evaluation still happens on the server (lib/expr.ts).
 */
export type Preview = { ok: boolean; text: string };

export function preview(value: unknown, json: any, byName: Record<string, any[]>): Preview | null {
  if (typeof value !== 'string' || !value.includes('{{')) return null;
  const $node = new Proxy({}, {
    get: (_t, name: string) => ({ json: byName[name]?.[0]?.json ?? {}, all: () => (byName[name] || []).map((i) => i.json) }),
  });
  try {
    const text = value.replace(/\{\{([\s\S]+?)\}\}/g, (_m, code) => {
      const v = new Function('$json', '$node', `"use strict"; return (${code});`)(json, $node);
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    });
    return { ok: true, text: text.length > 240 ? text.slice(0, 240) + '…' : text };
  } catch (e: any) {
    return { ok: false, text: e?.message || 'Invalid expression' };
  }
}
