'use client';
import { createContext, useContext, useState } from 'react';
import { Handle, Position, type Edge, type NodeProps } from '@xyflow/react';
import { NODES, SLOT_IDS, getDef, type SlotId } from '@/lib/nodes/catalog';

export type EditorActions = {
  /** Creates a sub-node below an agent and plugs it into the socket. */
  addSub: (agentId: string, slot: SlotId, type: string) => void;
  openChat: () => void;
  /** How many sub-nodes are plugged into each socket, per agent. */
  plugged: Record<string, Partial<Record<SlotId, number>>>;
  /** Past-run view: no add buttons, no Open chat. */
  readonly?: boolean;
};
export const EditorCtx = createContext<EditorActions>({ addSub: () => {}, openChat: () => {}, plugged: {} });

/** Edges into an agent socket are drawn dashed. */
export const isSlotEdge = (e: { targetHandle?: string | null }) => !!e.targetHandle && (SLOT_IDS as string[]).includes(e.targetHandle);
export const decorate = (e: Edge): Edge => (isSlotEdge(e) ? { ...e, className: 'subedge' } : e);

const WarnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 2 21h20L12 3Z" fill="var(--err)" />
    <path d="M12 9v6M12 17.5v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as any;
  const def = getDef(d.type)!;
  const act = useContext(EditorCtx);
  const [menu, setMenu] = useState<SlotId | null>(null);
  const plugged = act.plugged[id] || {};
  const missing = !!def.slots?.some((s) => s.required && !plugged[s.id]);
  const cls = ['fnode', `g-${def.group}`, selected ? 'sel' : '', d.status || '', def.slots ? 'agent' : '', def.slot ? 'subnode' : ''].join(' ');

  return (
    <div className={cls} style={def.outputs > 2 ? { minHeight: def.outputs * 26 + 14 } : undefined}>
      {def.inputs > 0 && <Handle type="target" position={Position.Left} />}
      {def.slot && <Handle id="sub" type="source" position={Position.Top} className="slot" />}
      <div className="t">{def.label}</div>
      <div className="n">{d.name}</div>

      {Array.from({ length: def.outputs }).map((_, i) => {
        const top = def.outputs > 2 ? `${((i + 1) / (def.outputs + 1)) * 100}%` : def.outputs > 1 ? `${28 + i * 44}%` : '50%';
        return (
          <span key={i}>
            <Handle id={`out${i}`} type="source" position={Position.Right} style={{ top }} />
            {def.outputLabels && <span className="ol" style={{ top }}>{def.outputLabels[i]}</span>}
          </span>
        );
      })}

      {def.type === 'chatTrigger' && !act.readonly && (
        <button className="openchat nodrag" onClick={(e) => { e.stopPropagation(); act.openChat(); }}>Open chat</button>
      )}
      {missing && <span className="warnico" title="Connect a Chat Model"><WarnIcon /></span>}

      {def.slots?.map((s, k) => {
        const left = `${((k + 0.5) / def.slots!.length) * 100}%`;
        const full = !s.multiple && !!plugged[s.id];
        const options = NODES.filter((n) => n.slot === s.id && !n.hidden);
        return (
          <span key={s.id}>
            <Handle id={s.id} type="target" position={Position.Bottom} className="slot" style={{ left }} isConnectable={!full} />
            <span className="slotl" style={{ left }}>{s.label}{s.required && <b className="req">*</b>}</span>
            {!full && !act.readonly && (
              <button className="slotplus nodrag" style={{ left }} aria-label={`Add ${s.label}`}
                onClick={(e) => { e.stopPropagation(); setMenu(menu === s.id ? null : s.id); }}>+</button>
            )}
            {menu === s.id && !act.readonly && (
              <div className="slotmenu nodrag nowheel" style={{ left }}>
                {options.map((o) => (
                  <button key={o.type} onClick={(e) => { e.stopPropagation(); setMenu(null); act.addSub(id, s.id, o.type); }}>
                    {o.label}<span className="mute">{o.description}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}
export const nodeTypes = { flow: FlowNode };
