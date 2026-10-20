'use client';
import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react';
import { nodeTypes } from './FlowNode';
import OutputView from './OutputView';

type Exec = {
  id: string; status: string; mode: string; error: string | null;
  started_at: string; finished_at: string | null;
  data: { results?: Record<string, any>; order?: string[] } | null;
};

const ms = (x: Exec) => (x.finished_at ? new Date(x.finished_at).getTime() - new Date(x.started_at).getTime() : 0);
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** Past runs of one workflow: the graph colored by result, plus a log of each node's output. */
export default function ExecutionsView({ workflowId, nodes, edges, theme }: {
  workflowId: string; nodes: Node[]; edges: Edge[]; theme: 'light' | 'dark';
}) {
  const [list, setList] = useState<Exec[] | null>(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const [logNode, setLogNode] = useState<string | null>(null);
  const [ioTab, setIoTab] = useState<'input' | 'output'>('output');

  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/executions?workflow=${workflowId}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (Array.isArray(d)) { setList(d); setErr(''); } else { setList([]); setErr(d.error || 'Could not load executions'); }
    }).catch((e) => live && setErr(e.message));
    load();
    const t = auto ? setInterval(load, 5000) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
  }, [workflowId, auto]);

  const exec = list?.find((x) => x.id === pick) ?? list?.[0];
  const results = exec?.data?.results ?? {};
  const order = exec?.data?.order ?? [];
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const shown: Node[] = useMemo(
    () => nodes.map((n) => ({ ...n, selected: false, draggable: false, data: { ...n.data, status: results[n.id]?.status } })),
    [nodes, results],
  );
  const logId = logNode && results[logNode] ? logNode : order.find((id) => results[id]?.status === 'error') ?? order[order.length - 1];
  const log = logId ? results[logId] : undefined;

  return (
    <div className="ex-body">
      <aside className="ex-list">
        <div className="ex-head">
          <h3>Executions</h3>
          <label className="mute"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto refresh</label>
        </div>
        {err && <p className="err-text" style={{ padding: '0 14px' }}>{err}</p>}
        {list === null && <p className="mute" style={{ padding: '0 14px' }}>Loading…</p>}
        {list && !list.length && !err && <p className="mute" style={{ padding: '0 14px' }}>No runs yet. Run the workflow from the editor.</p>}
        {list?.map((x) => (
          <button key={x.id} className={`ex-item ${x.status} ${x.id === exec?.id ? 'on' : ''}`} onClick={() => { setPick(x.id); setLogNode(null); }}>
            <b>{fmt(x.started_at)}</b>
            <span className="mute">{x.status === 'success' ? 'Succeeded' : 'Failed'} in {ms(x)}ms · {x.mode}</span>
          </button>
        ))}
      </aside>

      <section className="ex-main">
        {!exec ? <p className="mute" style={{ padding: 18 }}>Select an execution.</p> : (
          <>
            <div className="ex-title">
              <b>{fmt(exec.started_at)}</b>{' '}
              <span className={exec.status === 'success' ? 'ok-text' : 'err-text'}>{exec.status === 'success' ? 'Succeeded' : 'Failed'}</span>
              <span className="mute"> in {ms(exec)}ms · {exec.mode} · {exec.id.slice(0, 8)}</span>
              {exec.error && <div className="err-text">{exec.error}</div>}
            </div>
            <div className="ex-canvas">
              <ReactFlow
                key={exec.id} nodes={shown} edges={edges} nodeTypes={nodeTypes} colorMode={theme} attributionPosition="top-right"
                nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
                onNodeClick={(_, n) => setLogNode(n.id)}
                fitView fitViewOptions={{ maxZoom: 1 }}
              >
                <Background gap={22} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <div className="ex-logs">
              <div className="ex-logl">
                <h4>Logs</h4>
                {!order.length && <p className="mute" style={{ padding: '0 12px' }}>Nothing ran.</p>}
                {order.map((id) => (
                  <button key={id} className={`${id === logId ? 'on' : ''} ${results[id]?.status || ''}`} onClick={() => setLogNode(id)}>
                    {(byId.get(id)?.data as any)?.name ?? id}
                    <span className="mute">{results[id]?.status === 'skipped' ? 'skipped' : `${results[id]?.ms ?? 0}ms`}</span>
                  </button>
                ))}
              </div>
              <div className="ex-logo">
                {log && (
                  <>
                    <div className="ex-logo-status">
                      <div className="seg">
                        <button className={ioTab === 'input' ? 'on' : ''} onClick={() => setIoTab('input')}>Input</button>
                        <button className={ioTab === 'output' ? 'on' : ''} onClick={() => setIoTab('output')}>Output</button>
                      </div>
                      <span className={`badge ${log.status}`}>{log.status}</span> <span className="mute">{log.ms} ms</span>
                    </div>
                    {log.error && <div className="err-text">{log.error}</div>}
                    {ioTab === 'input'
                      ? <OutputView data={log.inputs ? [log.inputs] : []} title="Input" />
                      : <OutputView data={log.outputs} title="Output" />}
                  </>
                )}
                {!log && <p className="mute">Click a node to see its input and output.</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
