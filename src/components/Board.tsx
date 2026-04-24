import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";

export type BoardShape = "rectangle" | "circle" | "diamond";
export type BoardRole = "main" | "sub" | "decision";

export type BoardIdea = {
  id: string;
  title: string;
  detail?: string;
  priority?: "high" | "medium" | "low";
  category?: string;
  shape?: BoardShape;
  role?: BoardRole;
};

export type BoardConnection = {
  from: string;
  to: string;
  label?: string;
};

export type BoardData = {
  ideas: BoardIdea[];
  connections: BoardConnection[];
};

const priorityColor: Record<string, string> = {
  high: "hsl(0 72% 55%)",
  medium: "hsl(38 92% 55%)",
  low: "hsl(160 60% 45%)",
};

const shapeAccent: Record<BoardShape, string> = {
  rectangle: "hsl(239 84% 60%)",
  circle: "hsl(280 70% 60%)",
  diamond: "hsl(38 92% 55%)",
};

function inferShape(idea: BoardIdea): BoardShape {
  if (idea.shape) return idea.shape;
  if (idea.role === "decision") return "diamond";
  if (idea.role === "sub") return "circle";
  return "rectangle";
}

/** Layered layout: main nodes on a central row, sub-ideas radiate around their parents. */
function layout(
  ideas: BoardIdea[],
  connections: BoardConnection[],
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  if (!ideas.length) return pos;

  const mains = ideas.filter((i) => (i.role ?? (i.shape === "rectangle" ? "main" : "sub")) === "main");
  const others = ideas.filter((i) => !mains.includes(i));

  const mainList = mains.length ? mains : [ideas[0]];
  const restFallback = mains.length ? others : ideas.slice(1);

  // Place mains along a horizontal axis
  const mainGap = 480;
  const mainStartX = -((mainList.length - 1) * mainGap) / 2;
  mainList.forEach((m, i) => {
    pos[m.id] = { x: mainStartX + i * mainGap, y: 0 };
  });

  // Build parent map from connections (first incoming edge from a main)
  const parentOf: Record<string, string> = {};
  connections.forEach((c) => {
    if (pos[c.from] && !pos[c.to] && !parentOf[c.to]) parentOf[c.to] = c.from;
  });

  // Group children per parent
  const children: Record<string, BoardIdea[]> = {};
  const orphans: BoardIdea[] = [];
  restFallback.forEach((idea) => {
    const p = parentOf[idea.id];
    if (p) {
      (children[p] ||= []).push(idea);
    } else {
      orphans.push(idea);
    }
  });

  // Distribute orphans evenly across mains
  orphans.forEach((idea, i) => {
    const parent = mainList[i % mainList.length];
    (children[parent.id] ||= []).push(idea);
  });

  // Place children radially around each main
  Object.entries(children).forEach(([parentId, kids]) => {
    const center = pos[parentId];
    const radius = 280;
    kids.forEach((kid, i) => {
      const angle = (i / kids.length) * Math.PI * 2 - Math.PI / 2;
      pos[kid.id] = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  });

  // Safety net for any unplaced node
  ideas.forEach((idea, i) => {
    if (!pos[idea.id]) pos[idea.id] = { x: i * 240, y: 320 };
  });

  return pos;
}

const handleStyle = { background: "transparent", border: "none", width: 1, height: 1 };

const NodeContent = ({ idea }: { idea: BoardIdea }) => (
  <div className="text-center px-2">
    {idea.category && (
      <div className="text-[9px] uppercase tracking-wider opacity-70 mb-0.5">
        {idea.category}
      </div>
    )}
    <div className="font-semibold text-sm leading-tight">{idea.title}</div>
    {idea.detail && (
      <div className="mt-1 text-[11px] opacity-80 leading-snug">{idea.detail}</div>
    )}
    {idea.priority && (
      <div
        className="mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium"
        style={{
          background: priorityColor[idea.priority] + "33",
          color: priorityColor[idea.priority],
        }}
      >
        {idea.priority}
      </div>
    )}
  </div>
);

const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </>
);

const baseBox = "flex items-center justify-center text-foreground bg-card";

const RectangleNode = ({ data }: NodeProps<{ idea: BoardIdea }>) => {
  const accent = data.idea.priority ? priorityColor[data.idea.priority] : shapeAccent.rectangle;
  return (
    <div
      className={`${baseBox} rounded-xl px-4 py-3`}
      style={{
        border: `2px solid ${accent}`,
        minWidth: 200,
        maxWidth: 240,
        boxShadow: `0 10px 30px -12px ${accent}55`,
      }}
    >
      <Handles />
      <NodeContent idea={data.idea} />
    </div>
  );
};

const CircleNode = ({ data }: NodeProps<{ idea: BoardIdea }>) => {
  const accent = data.idea.priority ? priorityColor[data.idea.priority] : shapeAccent.circle;
  return (
    <div
      className={`${baseBox} rounded-full p-4`}
      style={{
        border: `2px solid ${accent}`,
        width: 180,
        height: 180,
        boxShadow: `0 10px 30px -12px ${accent}55`,
      }}
    >
      <Handles />
      <NodeContent idea={data.idea} />
    </div>
  );
};

const DiamondNode = ({ data }: NodeProps<{ idea: BoardIdea }>) => {
  const accent = data.idea.priority ? priorityColor[data.idea.priority] : shapeAccent.diamond;
  const size = 200;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <Handles />
      <div
        className="absolute inset-0 bg-card"
        style={{
          transform: "rotate(45deg)",
          border: `2px solid ${accent}`,
          borderRadius: 12,
          boxShadow: `0 10px 30px -12px ${accent}55`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <NodeContent idea={data.idea} />
      </div>
    </div>
  );
};

const nodeTypes = {
  rectangle: RectangleNode,
  circle: CircleNode,
  diamond: DiamondNode,
};

const Board = ({ data }: { data: BoardData }) => {
  const { nodes, edges } = useMemo(() => {
    const positions = layout(data.ideas, data.connections);
    const nodes: Node[] = data.ideas.map((idea, i) => {
      const shape = inferShape(idea);
      return {
        id: idea.id,
        position: positions[idea.id] ?? { x: i * 240, y: 0 },
        data: { idea },
        type: shape,
      };
    });

    const edges: Edge[] = data.connections.map((c, i) => ({
      id: `e-${i}`,
      source: c.from,
      target: c.to,
      label: c.label,
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(239 84% 60%)", width: 22, height: 22 },
      style: { stroke: "hsl(239 84% 60% / 0.8)", strokeWidth: 2 },
      labelStyle: { fill: "hsl(240 10% 96%)", fontSize: 11 },
      labelBgStyle: { fill: "hsl(240 8% 8%)" },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes, edges };
  }, [data]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="hsl(240 6% 16%)" gap={20} />
      <Controls />
    </ReactFlow>
  );
};

export default Board;
