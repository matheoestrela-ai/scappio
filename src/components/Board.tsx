import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";

export type BoardIdea = {
  id: string;
  title: string;
  detail?: string;
  priority?: "high" | "medium" | "low";
  category?: string;
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

const priorityRing: Record<string, string> = {
  high: "hsl(0 72% 55%)",
  medium: "hsl(38 92% 55%)",
  low: "hsl(160 60% 45%)",
};

function layout(ideas: BoardIdea[]): Record<string, { x: number; y: number }> {
  // Simple radial layout — first idea center, others around
  const pos: Record<string, { x: number; y: number }> = {};
  if (ideas.length === 0) return pos;
  const [first, ...rest] = ideas;
  pos[first.id] = { x: 0, y: 0 };
  const radius = 320;
  rest.forEach((idea, i) => {
    const angle = (i / rest.length) * Math.PI * 2;
    pos[idea.id] = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
  return pos;
}

const Board = ({ data }: { data: BoardData }) => {
  const { nodes, edges } = useMemo(() => {
    const positions = layout(data.ideas);
    const nodes: Node[] = data.ideas.map((idea, i) => ({
      id: idea.id,
      position: positions[idea.id] ?? { x: i * 220, y: 0 },
      data: { label: idea },
      type: "default",
      style: {
        background: "hsl(240 8% 10%)",
        border: `2px solid ${idea.priority ? priorityRing[idea.priority] : "hsl(239 84% 60% / 0.6)"}`,
        borderRadius: 12,
        color: "hsl(240 10% 96%)",
        padding: 14,
        minWidth: 200,
        maxWidth: 260,
        boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6)",
      },
      sourcePosition: "right" as any,
      targetPosition: "left" as any,
    }));

    // Replace label with rich content
    nodes.forEach((n) => {
      const idea = (n.data as any).label as BoardIdea;
      n.data = {
        label: (
          <div className="text-left">
            {idea.category && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {idea.category}
              </div>
            )}
            <div className="font-semibold text-sm leading-tight">{idea.title}</div>
            {idea.detail && (
              <div className="mt-1 text-xs text-muted-foreground">{idea.detail}</div>
            )}
            {idea.priority && (
              <div
                className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: priorityRing[idea.priority] + "33",
                  color: priorityRing[idea.priority],
                }}
              >
                {idea.priority}
              </div>
            )}
          </div>
        ),
      };
    });

    const edges: Edge[] = data.connections.map((c, i) => ({
      id: `e-${i}`,
      source: c.from,
      target: c.to,
      label: c.label,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(239 84% 60%)" },
      style: { stroke: "hsl(239 84% 60% / 0.7)" },
      labelStyle: { fill: "hsl(240 10% 96%)", fontSize: 11 },
      labelBgStyle: { fill: "hsl(240 8% 8%)" },
    }));

    return { nodes, edges };
  }, [data]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color="hsl(240 6% 16%)" gap={20} />
      <Controls />
    </ReactFlow>
  );
};

export default Board;
