import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import dagre from "dagre";

export type BoardLevel = 1 | 2 | 3;

export type BoardNode = {
  id: string;
  label: string;
  level: BoardLevel;
  parent: string | null;
};

export type BoardData = {
  nodes: BoardNode[];
};

type FlowNodeData = { label: string; level: BoardLevel };

// Per-level dimensions (used by both renderer and dagre)
const NODE_DIMS: Record<BoardLevel, { w: number; h: number }> = {
  1: { w: 320, h: 96 },
  2: { w: 230, h: 80 },
  3: { w: 190, h: 64 },
};

const handleStyle = {
  width: 6,
  height: 6,
  border: "none",
  background: "transparent",
  opacity: 0,
};

const NodeHandles = () => (
  <>
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </>
);

const RootNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div
    className="flex items-center justify-center rounded-2xl px-6 text-center text-white shadow-node"
    style={{
      width: NODE_DIMS[1].w,
      height: NODE_DIMS[1].h,
      background: "linear-gradient(135deg, #3730A3 0%, #4F46E5 100%)",
      border: "1px solid rgba(255,255,255,0.15)",
    }}
  >
    <NodeHandles />
    <div
      className="text-lg font-bold leading-tight tracking-tight"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
    >
      {data.label}
    </div>
  </div>
);

const MainNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div
    className="flex items-center justify-center rounded-xl px-4 text-center text-white shadow-node"
    style={{
      width: NODE_DIMS[2].w,
      height: NODE_DIMS[2].h,
      background: "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
    }}
  >
    <NodeHandles />
    <div
      className="text-sm font-semibold leading-snug"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
    >
      {data.label}
    </div>
  </div>
);

const DetailNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div
    className="flex items-center justify-center rounded-lg px-3 text-center"
    style={{
      width: NODE_DIMS[3].w,
      height: NODE_DIMS[3].h,
      background: "#EDE9FE",
      color: "#4338CA",
      border: "1px solid #C4B5FD",
      boxShadow: "0 4px 10px -4px rgba(124, 58, 237, 0.18)",
    }}
  >
    <NodeHandles />
    <div className="text-xs font-medium leading-snug">{data.label}</div>
  </div>
);

const nodeTypes = {
  level1: RootNode,
  level2: MainNode,
  level3: DetailNode,
};

/** Run dagre to compute positions for a clean top-down hierarchy. */
const computeLayout = (nodes: BoardNode[]) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 48,
    ranksep: 96,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => {
    const { w, h } = NODE_DIMS[n.level];
    g.setNode(n.id, { width: w, height: h });
  });

  nodes.forEach((n) => {
    if (n.parent) g.setEdge(n.parent, n.id);
  });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => {
    const { w, h } = NODE_DIMS[n.level];
    const pos = g.node(n.id);
    if (pos) {
      // dagre returns center; React Flow expects top-left
      positions.set(n.id, { x: pos.x - w / 2, y: pos.y - h / 2 });
    }
  });
  return positions;
};

const EDGE_COLORS: Record<BoardLevel, string> = {
  1: "#4F46E5",
  2: "#7C3AED",
  3: "#A78BFA",
};

const Board = ({ data }: { data: BoardData }) => {
  const { nodes, edges } = useMemo(() => {
    const positions = computeLayout(data.nodes);

    const flowNodes: Node<FlowNodeData>[] = data.nodes.map((n) => ({
      id: n.id,
      type: `level${n.level}`,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: { label: n.label, level: n.level },
    }));

    // Edges derived strictly from parent → child
    const flowEdges: Edge[] = data.nodes
      .filter((n) => n.parent)
      .map((n) => ({
        id: `e-${n.parent}-${n.id}`,
        source: n.parent as string,
        target: n.id,
        type: "smoothstep",
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: EDGE_COLORS[n.level],
        },
        style: {
          stroke: EDGE_COLORS[n.level],
          strokeWidth: n.level === 2 ? 2 : 1.5,
          opacity: 0.7,
        },
      }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [data]);

  return (
    <div className="h-full w-full bg-gradient-board">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} color="#C4B5FD" gap={28} size={1.5} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export default Board;
