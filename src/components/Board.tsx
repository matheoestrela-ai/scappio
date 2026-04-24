import { useMemo } from "react";
import ReactFlow, {
  Background,
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
  position: {
    x: number;
    y: number;
  };
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

type FlowNodeData = {
  label: string;
  shape: BoardShape;
};

const handleStyle = {
  width: 8,
  height: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--background))",
};

const shapeStyles: Record<BoardShape, { borderColor: string; shadowColor: string }> = {
  rectangle: {
    borderColor: "hsl(var(--primary))",
    shadowColor: "hsl(var(--primary) / 0.35)",
  },
  circle: {
    borderColor: "hsl(var(--accent))",
    shadowColor: "hsl(var(--accent) / 0.35)",
  },
  diamond: {
    borderColor: "hsl(var(--primary-glow))",
    shadowColor: "hsl(var(--primary-glow) / 0.35)",
  },
};

const NodeHandles = () => (
  <>
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
    <Handle type="target" position={Position.Left} style={handleStyle} />
  </>
);

const NodeLabel = ({ label }: { label: string }) => (
  <div className="px-4 text-center text-sm font-semibold leading-tight text-card-foreground whitespace-pre-wrap break-words">
    {label}
  </div>
);

const RectangleNode = ({ data }: NodeProps<FlowNodeData>) => {
  const styles = shapeStyles.rectangle;

  return (
    <div
      className="relative flex min-h-24 w-[220px] items-center justify-center rounded-md border bg-card"
      style={{
        borderColor: styles.borderColor,
        boxShadow: `0 22px 40px -26px ${styles.shadowColor}`,
      }}
    >
      <NodeHandles />
      <NodeLabel label={data.label} />
    </div>
  );
};

const CircleNode = ({ data }: NodeProps<FlowNodeData>) => {
  const styles = shapeStyles.circle;

  return (
    <div
      className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full border bg-card"
      style={{
        borderColor: styles.borderColor,
        boxShadow: `0 22px 40px -26px ${styles.shadowColor}`,
      }}
    >
      <NodeHandles />
      <NodeLabel label={data.label} />
    </div>
  );
};

const DiamondNode = ({ data }: NodeProps<FlowNodeData>) => {
  const styles = shapeStyles.diamond;

  return (
    <div className="relative h-[210px] w-[210px]">
      <NodeHandles />
      <div
        className="absolute inset-[24px] rounded-md border bg-card"
        style={{
          transform: "rotate(45deg)",
          borderColor: styles.borderColor,
          boxShadow: `0 22px 40px -26px ${styles.shadowColor}`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-10">
        <NodeLabel label={data.label} />
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
    const nodes: Node<FlowNodeData>[] = data.nodes.map((node) => ({
      id: node.id,
      type: node.shape,
      position: node.position,
      draggable: false,
      selectable: false,
      data: {
        label: node.label,
        shape: node.shape,
      },
    }));

    const edges: Edge[] = data.edges.map((edge, index) => ({
      id: `edge-${edge.source}-${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: "smoothstep",
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: "hsl(var(--primary))",
      },
      style: {
        stroke: "hsl(var(--primary))",
        strokeWidth: 2.5,
      },
      labelStyle: {
        fill: "hsl(var(--foreground))",
        fontSize: 12,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "hsl(var(--card))",
      },
      labelBgBorderRadius: 6,
      labelBgPadding: [8, 4],
    }));

    return { nodes, edges };
  }, [data]);

  return (
    <div className="h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.5 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
      >
        <Background color="hsl(var(--border))" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export default Board;