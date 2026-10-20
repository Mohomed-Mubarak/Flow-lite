export type Item = { json: Record<string, any> };
export type WFNode = {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  params: Record<string, any>;
};
export type WFEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
export type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: WFNode[];
  edges: WFEdge[];
  updated_at?: string;
};
export type NodeResult = {
  status: 'success' | 'error' | 'skipped';
  /** The items that fed into this node (what the Input tab shows). */
  inputs: Item[];
  outputs: Item[][];
  error?: string;
  ms: number;
};
export type ExecResult = {
  status: 'success' | 'error';
  results: Record<string, NodeResult>;
  order: string[];
  error?: string;
  last?: Item[];
  executionId?: string;
};
