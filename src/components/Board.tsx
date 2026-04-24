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

export type BoardShape = "rectangle" | "circle" | "diamond";

export type BoardNode = {
  id: string;
  label: string;
  shape: BoardShape;
  position: { x: number; y: number };
};

export type BoardEdge = {
  source: string;
  target: string;
  label?: string;
};

export type BoardData = {
  nodes: BoardNode[];
  edges: BoardEdge[];
};

type FlowNodeData = { label: string; shape: BoardShape };

const SHAPE_COLOR: Record<BoardShape, string> = {
  rectangle: "#4F46E5", // indigo
  circle: "#7C3AED", // violet
  diamond: "#F59E0B", // amber
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
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
    <Handle type="target" position={Position.Left} style={handleStyle} />
  </>
);

const NodeText = ({ label, className = "" }: { label: string; className?: string }) => (
  <div
    className={`px-4 text-center text-sm font-semibold leading-snug text-white whitespace-pre-wrap break-words ${className}`}
    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
  >
    {label}
  </div>
);

const RectangleNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div
    className="relative flex min-h-[72px] w-[220px] items-center justify-center rounded-2xl shadow-node"
    style={{
      background: `linear-gradient(135deg, ${SHAPE_COLOR.rectangle} 0%, #6366F1 100%)`,
    }}
  >
    <NodeHandles />
    <NodeText label={data.label} className="py-3" />
  </div>
);

const CircleNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div
    className="relative flex h-[160px] w-[160px] items-center justify-center rounded-full shadow-node"
    style={{
      background: `linear-gradient(135deg, ${SHAPE_COLOR.circle} 0%, #A855F7 100%)`,
    }}
  >
    <NodeHandles />
    <NodeText label={data.label} />
  </div>
);

const DiamondNode = ({ data }: NodeProps<FlowNodeData>) => (
  <div className="relative h-[180px] w-[180px]">
    <NodeHandles />
    <div
      className="absolute inset-[22px] rounded-2xl shadow-node"
      style={{
        transform: "rotate(45deg)",
        background: `linear-gradient(135deg, ${SHAPE_COLOR.diamond} 0%, #FBBF24 100%)`,
      }}
    />
    <div className="absolute inset-0 flex items-center justify-center px-8">
      <NodeText label={data.label} />
    </div>
  </div>
);

const nodeTypes = {
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
};

/** Lightweight hierarchical layout: main idea on top, children below. */
const layoutNodes = (data: BoardData): BoardNode[] => {
  const { nodes, edges } = data;
  if (!nodes.length) return nodes;

  // Build parent map (first incoming edge wins)
  const parents = new Map<string, string>();
  edges.forEach((e) => {
    if (!parents.has(e.target) && e.source !== e.target) {
      parents.set(e.target, e.source);
    }
  });

  // Roots = nodes with no parent
  const roots = nodes.filter((n) => !parents.has(n.id));
  if (!roots.length) return nodes;

  // Build children map
  const children = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source)!.push(e.target);
  });

  // Assign levels (BFS)
  const level = new Map<string, number>();
  const queue: string[] = [];
  roots.forEach((r) => {
    level.set(r.id, 0);
    queue.push(r.id);
  });
  while (queue.length) {
    const id = queue.shift()!;
    const lvl = level.get(id)!;
    (children.get(id) ?? []).forEach((c) => {
      if (!level.has(c)) {
        level.set(c, lvl + 1);
        queue.push(c);
      }
    });
  }
  // Orphans get level 0
  nodes.forEach((n) => { if (!level.has(n.id)) level.set(n.id, 0); });

  // Group by level
  const byLevel = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = level.get(n.id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(n.id);
  });

  const H_GAP = 280;
  const V_GAP = 200;
  const positions = new Map<string, { x: number; y: number }>();

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  sortedLevels.forEach((lvl) => {
    const ids = byLevel.get(lvl)!;
    const totalWidth = (ids.length - 1) * H_GAP;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: i * H_GAP - totalWidth / 2,
        y: lvl * V_GAP,
      });
    });
  });

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position }));
};

const Board = ({ data }: { data: BoardData }) => {
  const { nodes, edges } = useMemo(() => {
    const laidOut = layoutNodes(data);

    const flowNodes: Node<FlowNodeData>[] = laidOut.map((node) => ({
      id: node.id,
      type: node.shape,
      position: node.position,
      draggable: false,
      selectable: false,
      data: { label: node.label, shape: node.shape },
    }));

    const flowEdges: Edge[] = data.edges.map((edge, index) => ({
      id: `edge-${edge.source}-${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: "default", // bezier curve
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: "#7C3AED",
      },
      style: {
        stroke: "#7C3AED",
        strokeWidth: 2,
        opacity: 0.75,
      },
      labelStyle: { fill: "#4338CA", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "#FFFFFF", fillOpacity: 0.95 },
      labelBgBorderRadius: 6,
      labelBgPadding: [6, 3],
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
        fitViewOptions={{ padding: 0.2, minZoom: 0.4 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background variant={BackgroundVariant.Dots} color="#C4B5FD" gap={28} size={1.5} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export default Board;
