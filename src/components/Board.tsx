import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";
import dagre from "dagre";
import { Plus, Trash2, Square, Circle as CircleIcon, Diamond as DiamondIcon, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type FlowNodeData = {
  label: string;
  level: BoardLevel;
  editing?: boolean;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, label: string) => void;
  onDelete: (id: string) => void;
};

const NODE_DIMS: Record<BoardLevel, { w: number; h: number }> = {
  1: { w: 320, h: 96 },
  2: { w: 230, h: 80 },
  3: { w: 190, h: 64 },
};

const EDGE_COLORS: Record<BoardLevel, string> = {
  1: "#4F46E5",
  2: "#7C3AED",
  3: "#A78BFA",
};

const handleStyle = {
  width: 10,
  height: 10,
  border: "2px solid white",
  background: "#7C3AED",
};

const NodeHandles = () => (
  <>
    <Handle type="target" position={Position.Top} style={handleStyle} />
    <Handle type="source" position={Position.Bottom} style={handleStyle} />
  </>
);

const EditableLabel = ({
  id,
  label,
  editing,
  onCommit,
  className,
  style,
}: {
  id: string;
  label: string;
  editing?: boolean;
  onCommit: (id: string, label: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setValue(label), [label]);
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(id, value.trim() || label)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            setValue(label);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={`w-full resize-none bg-transparent text-center outline-none ${className ?? ""}`}
        style={style}
        rows={2}
      />
    );
  }
  return (
    <div className={className} style={style}>
      {label}
    </div>
  );
};

const NodeWrapper = ({
  children,
  onDelete,
  id,
}: {
  children: React.ReactNode;
  onDelete: (id: string) => void;
  id: string;
}) => (
  <div className="group relative">
    {children}
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onDelete(id);
      }}
      className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md group-hover:flex"
      aria-label="Supprimer le nœud"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  </div>
);

const RootNode = ({ id, data }: NodeProps<FlowNodeData>) => (
  <NodeWrapper id={id} onDelete={data.onDelete}>
    <div
      onDoubleClick={() => data.onStartEdit(id)}
      className="flex items-center justify-center rounded-2xl px-6 text-center text-white shadow-node"
      style={{
        width: NODE_DIMS[1].w,
        height: NODE_DIMS[1].h,
        background: "linear-gradient(135deg, #3730A3 0%, #4F46E5 100%)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      <NodeHandles />
      <EditableLabel
        id={id}
        label={data.label}
        editing={data.editing}
        onCommit={data.onCommitEdit}
        className="text-lg font-bold leading-tight tracking-tight text-white"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
      />
    </div>
  </NodeWrapper>
);

const MainNode = ({ id, data }: NodeProps<FlowNodeData>) => (
  <NodeWrapper id={id} onDelete={data.onDelete}>
    <div
      onDoubleClick={() => data.onStartEdit(id)}
      className="flex items-center justify-center rounded-full px-4 text-center text-white shadow-node"
      style={{
        width: NODE_DIMS[2].w,
        height: NODE_DIMS[2].h,
        background: "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
      }}
    >
      <NodeHandles />
      <EditableLabel
        id={id}
        label={data.label}
        editing={data.editing}
        onCommit={data.onCommitEdit}
        className="text-sm font-semibold leading-snug text-white"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      />
    </div>
  </NodeWrapper>
);

const DetailNode = ({ id, data }: NodeProps<FlowNodeData>) => (
  <NodeWrapper id={id} onDelete={data.onDelete}>
    <div
      onDoubleClick={() => data.onStartEdit(id)}
      className="flex items-center justify-center px-3 text-center"
      style={{
        width: NODE_DIMS[3].w,
        height: NODE_DIMS[3].h,
        background: "#FDE68A",
        color: "#78350F",
        border: "1px solid #F59E0B",
        boxShadow: "0 4px 10px -4px rgba(245, 158, 11, 0.3)",
        transform: "rotate(45deg)",
      }}
    >
      <NodeHandles />
      <div style={{ transform: "rotate(-45deg)" }}>
        <EditableLabel
          id={id}
          label={data.label}
          editing={data.editing}
          onCommit={data.onCommitEdit}
          className="text-xs font-medium leading-snug"
        />
      </div>
    </div>
  </NodeWrapper>
);

const nodeTypes = {
  level1: RootNode,
  level2: MainNode,
  level3: DetailNode,
};

const computeLayout = (nodes: BoardNode[]) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 96, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => {
    const { w, h } = NODE_DIMS[n.level];
    g.setNode(n.id, { width: w, height: h });
  });
  nodes.forEach((n) => {
    if (n.parent && nodes.find((x) => x.id === n.parent)) g.setEdge(n.parent, n.id);
  });
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => {
    const { w, h } = NODE_DIMS[n.level];
    const pos = g.node(n.id);
    if (pos) positions.set(n.id, { x: pos.x - w / 2, y: pos.y - h / 2 });
  });
  return positions;
};

const buildEdgeStyle = (level: BoardLevel) => ({
  type: "smoothstep" as const,
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: EDGE_COLORS[level],
  },
  style: {
    stroke: EDGE_COLORS[level],
    strokeWidth: level === 2 ? 2 : 1.5,
    opacity: 0.75,
  },
});

const buildInitial = (data: BoardData) => {
  const positions = computeLayout(data.nodes);
  const nodes: Node[] = data.nodes.map((n) => ({
    id: n.id,
    type: `level${n.level}`,
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { label: n.label, level: n.level },
  }));
  const edges: Edge[] = data.nodes
    .filter((n) => n.parent)
    .map((n) => ({
      id: `e-${n.parent}-${n.id}`,
      source: n.parent as string,
      target: n.id,
      ...buildEdgeStyle(n.level),
    }));
  return { nodes, edges };
};

type Snapshot = { nodes: Node[]; edges: Edge[] };

const BoardInner = ({ data }: { data: BoardData }) => {
  const initial = useMemo(() => buildInitial(data), [data]);
  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reset when a new board is generated
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setEditingId(null);
    historyRef.current = { past: [], future: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Undo/redo
  const historyRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({
    past: [],
    future: [],
  });
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((prevNodes: Node[], prevEdges: Edge[]) => {
    historyRef.current.past.push({ nodes: prevNodes, edges: prevEdges });
    if (historyRef.current.past.length > 100) historyRef.current.past.shift();
    historyRef.current.future = [];
  }, []);

  const commit = useCallback(
    (updater: (s: Snapshot) => Snapshot) => {
      setNodes((curN) => {
        setEdges((curE) => {
          pushHistory(curN, curE);
          const next = updater({ nodes: curN, edges: curE });
          // Defer node update via separate setNodes below
          queueMicrotask(() => setNodes(next.nodes));
          return next.edges;
        });
        return curN;
      });
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    const past = historyRef.current.past.pop();
    if (!past) return;
    historyRef.current.future.push({ nodes, edges });
    skipHistoryRef.current = true;
    setNodes(past.nodes);
    setEdges(past.edges);
  }, [nodes, edges]);

  const redo = useCallback(() => {
    const fut = historyRef.current.future.pop();
    if (!fut) return;
    historyRef.current.past.push({ nodes, edges });
    skipHistoryRef.current = true;
    setNodes(fut.nodes);
    setEdges(fut.edges);
  }, [nodes, edges]);

  // Editing handlers (stable refs via callbacks reading state)
  const handleStartEdit = useCallback((id: string) => setEditingId(id), []);
  const handleCommitEdit = useCallback(
    (id: string, label: string) => {
      pushHistory(nodes, edges);
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      );
      setEditingId(null);
    },
    [nodes, edges, pushHistory],
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      pushHistory(nodes, edges);
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [nodes, edges, pushHistory],
  );

  // Inject handlers + editing flag into node data
  const enrichedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          editing: editingId === n.id,
          onStartEdit: handleStartEdit,
          onCommitEdit: handleCommitEdit,
          onDelete: handleDeleteNode,
        },
      })),
    [nodes, editingId, handleStartEdit, handleCommitEdit, handleDeleteNode],
  );

  // RF change handlers — push history on meaningful changes (drag end, removal)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const significant = changes.some(
        (c) =>
          c.type === "remove" ||
          (c.type === "position" && (c as any).dragging === false),
      );
      if (significant) pushHistory(nodes, edges);
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [nodes, edges, pushHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const significant = changes.some((c) => c.type === "remove");
      if (significant) pushHistory(nodes, edges);
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [nodes, edges, pushHistory],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      pushHistory(nodes, edges);
      const targetNode = nodes.find((n) => n.id === conn.target);
      const level = (targetNode?.data?.level as BoardLevel) ?? 2;
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${conn.source}-${conn.target}-${Date.now()}`,
            ...buildEdgeStyle(level),
          },
          eds,
        ),
      );
    },
    [nodes, edges, pushHistory],
  );

  // Add node
  const addNode = useCallback(
    (level: BoardLevel) => {
      pushHistory(nodes, edges);
      const id = `n-${Date.now()}`;
      const newNode: Node = {
        id,
        type: `level${level}`,
        position: {
          x: 200 + Math.random() * 300,
          y: 200 + Math.random() * 200,
        },
        data: { label: "Nouveau nœud", level },
      };
      setNodes((nds) => [...nds, newNode]);
      setEditingId(id);
    },
    [nodes, edges, pushHistory],
  );

  // Keyboard: undo/redo (delete is handled natively by ReactFlow via deleteKeyCode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditingField) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="relative h-full w-full bg-gradient-board">
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-border bg-background/90 p-1.5 shadow-elegant backdrop-blur">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90">
              <Plus className="mr-1 h-4 w-4" /> Ajouter un nœud
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => addNode(1)}>
              <Square className="mr-2 h-4 w-4 text-[#4F46E5]" /> Rectangle (principal)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode(2)}>
              <CircleIcon className="mr-2 h-4 w-4 text-[#7C3AED]" /> Cercle (idée)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode(3)}>
              <DiamondIcon className="mr-2 h-4 w-4 text-[#F59E0B]" /> Diamant (détail)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden md:block px-2 text-xs text-muted-foreground">
          Double-clique pour éditer · Glisse pour connecter · ⌫ pour supprimer · ⌘Z / ⌘Y
        </div>
      </div>

      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.3 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Delete", "Backspace"]}
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} color="#C4B5FD" gap={28} size={1.5} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const Board = ({ data }: { data: BoardData }) => (
  <ReactFlowProvider>
    <BoardInner data={data} />
  </ReactFlowProvider>
);

export default Board;
