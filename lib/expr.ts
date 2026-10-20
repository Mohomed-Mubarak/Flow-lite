import vm from 'node:vm';
import type { Item } from './types';

export type Scope = { json: any; nodes: Record<string, Item[]>; index: number; items: Item[] };

/** $node["Name"].json and .all(): output of an earlier node. */
export function nodeProxy(nodes: Record<string, Item[]>) {
  return new Proxy(
    {},
    {
      get: (_t, name: string) => ({
        json: nodes[name]?.[0]?.json ?? {},
        all: () => (nodes[name] || []).map((i) => i.json),
      }),
    }
  );
}

function evalExpr(code: string, scope: Scope): any {
  const $node = nodeProxy(scope.nodes);
  const sandbox = {
    $json: scope.json,
    $node,
    $index: scope.index,
    $items: scope.items.map((i) => i.json),
    $now: new Date().toISOString(),
    JSON, Math, Date, String, Number, Array, Object,
  };
  try {
    return vm.runInNewContext(`(${code})`, sandbox, { timeout: 1000 });
  } catch (e: any) {
    throw new Error(`Expression "{{${code}}}" failed: ${e.message}`);
  }
}

const SINGLE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
const ANY = /\{\{([\s\S]+?)\}\}/g;

/** Resolves {{ expressions }} in strings, arrays and objects. */
export function resolve(value: any, scope: Scope): any {
  if (typeof value === 'string') {
    const single = value.match(SINGLE);
    if (single && (value.match(/\{\{/g) || []).length === 1) return evalExpr(single[1], scope);
    return value.replace(ANY, (_m, code) => {
      const v = evalExpr(code, scope);
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, scope));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, scope)]));
  }
  return value;
}
