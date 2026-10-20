'use client';
import { useMemo, useState } from 'react';
import type { Item } from '@/lib/types';

type ViewMode = 'schema' | 'table' | 'json';

const typeOf = (v: any): string => {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'object' ? 'object' : t;
};
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** Builds the expression for a field, e.g. {{ $json.user["first name"] }}. */
export const exprFor = (prefix: string, path: (string | number)[]) =>
  `{{ ${prefix}${path.map((k) => (typeof k === 'number' ? `[${k}]` : IDENT.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`)).join('')} }}`;

type Row = { path: string[]; depth: number; types: Set<string> };
const MAX_DEPTH = 3;
function walk(v: any, path: string[], depth: number, rows: Map<string, Row>) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return;
  for (const [k, val] of Object.entries(v)) {
    const p = [...path, k];
    const key = JSON.stringify(p);
    const row = rows.get(key) ?? { path: p, depth, types: new Set<string>() };
    row.types.add(typeOf(val));
    rows.set(key, row);
    if (depth < MAX_DEPTH) walk(val, p, depth + 1, rows);
  }
}
const cell = (v: any): string => {
  if (v === undefined) return '';
  if (v === null) return 'null';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

/**
 * One node's items (either what fed into it, or what it produced), viewable as
 * Schema (field names + inferred types), Table (one row per item) or raw JSON.
 * Shared by the editor's node Input/Output tabs and the Executions log panel so
 * all three render item data the same way.
 */
export default function OutputView({ data, title = 'Output', draggable = false, prefix = '$json' }: {
  data: Item[][] | undefined; title?: string;
  /** Let the person drag fields into parameters (they drop as {{ expressions }}). */
  draggable?: boolean; prefix?: string;
}) {
  const [mode, setMode] = useState<ViewMode>('schema');
  const items = useMemo(() => (data ?? []).flat(), [data]);
  const fields = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const it of items) {
      for (const [k, v] of Object.entries(it?.json ?? {})) {
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k)!.add(typeOf(v));
      }
    }
    return Array.from(seen.entries()).map(([name, types]) => ({ name, types: Array.from(types) }));
  }, [items]);

  const rows = useMemo(() => {
    const m = new Map<string, Row>();
    for (const it of items) walk(it?.json, [], 0, m);
    return Array.from(m.values());
  }, [items]);
  const drag = (expr: string) => draggable
    ? { draggable: true, title: 'Drag into a parameter', onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', expr); e.dataTransfer.effectAllowed = 'copy'; } }
    : {};

  return (
    <div className="outview">
      <div className="outview-head">
        <span className="outview-title">{title}</span>
        <div className="seg" role="tablist" aria-label="Output view">
          {(['schema', 'table', 'json'] as ViewMode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'schema' ? 'Schema' : m === 'table' ? 'Table' : 'JSON'}
            </button>
          ))}
        </div>
      </div>

      {!items.length ? (
        <p className="mute">No items.</p>
      ) : mode === 'schema' ? (
        <ul className="outview-schema">
          {rows.map((r) => (
            <li key={r.path.join('\u0000')} className={draggable ? 'drag' : ''} style={{ paddingLeft: 10 + r.depth * 18 }} {...drag(exprFor(prefix, r.path))}>
              <span className="fn">{r.path[r.path.length - 1]}</span>
              <span className="ft">{Array.from(r.types).join(' | ')}</span>
            </li>
          ))}
          {!rows.length && <li className="mute">No fields.</li>}
        </ul>
      ) : mode === 'table' ? (
        <div className="outview-table-wrap">
          <table className="outview-table">
            <thead>
              <tr>{fields.map((f) => <th key={f.name} {...drag(exprFor(prefix, [f.name]))}>{f.name}</th>)}{!fields.length && <th className="mute">(empty)</th>}</tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>{fields.map((f) => <td key={f.name}>{cell(it?.json?.[f.name])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre>{JSON.stringify(data, null, 2).slice(0, 12000)}</pre>
      )}
      {draggable && items.length > 0 && <p className="hint">Drag a field into a parameter to map it.</p>}
    </div>
  );
}
