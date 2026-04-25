import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  ControlButton,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  NodeResizer,
  NodeToolbar,
  Position,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";
import dagre from "dagre";
import {
  Plus,
  Square,
  Circle as CircleIcon,
  Diamond as DiamondIcon,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Bold,
  Italic,
  Copy,
  Trash2,
  Palette,
  Sparkles as SparklesIcon,
  LayoutGrid,
  Info,
  ArrowRight,
  MoveHorizontal,
  Minus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ============================================================
//  Types
// ============================================================

export type BoardLevel = 1 | 2 | 3;
export type BoardShape = "rect" | "circle" | "diamond";

export type BoardNode = {
  id: string;
  label: string;
  level: BoardLevel;
  parent: string | null;
  shape?: BoardShape;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};

export type BoardData = {
  nodes: BoardNode[];
};

type EditorNodeData = {
  label: string;
  level: BoardLevel;
  shape: BoardShape;
  color: string;
  bold: boolean;
  italic: boolean;
  width: number;
  height: number;
  editing?: boolean;
  // callbacks injected by board
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, label: string, w: number, h: number) => void;
  onPatch: (id: string, patch: Partial<EditorNodeData>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

// ============================================================
//  Style constants
// ============================================================

const SHAPE_DEFAULTS: Record<
  BoardShape,
  { w: number; h: number; minW: number; minH: number; color: string; textColor: string }
> = {
  rect:    { w: 300, h: 120, minW: 180, minH: 84,  color: "#312E81", textColor: "#FFFFFF" },
  circle:  { w: 230, h: 230, minW: 150, minH: 150, color: "#7C3AED", textColor: "#FFFFFF" },
  diamond: { w: 210, h: 210, minW: 150, minH: 150, color: "#F59E0B", textColor: "#FFFFFF" },
};

const LEVEL_TO_SHAPE: Record<BoardLevel, BoardShape> = {
  1: "rect",
  2: "circle",
  3: "rect",
};

// Distinct color per hierarchy level — instantly readable hierarchy.
// Indigo foncé → Violet → Lavande
const LEVEL_COLOR: Record<BoardLevel, string> = {
  1: "#312E81", // indigo-900 — sujet principal, dense et profond
  2: "#7C3AED", // violet-600 — idées clés
  3: "#C4B5FD", // lavande (violet-300) — détails
};

// Texte par niveau : niveau 3 (lavande clair) doit avoir du texte sombre
const LEVEL_TEXT: Record<BoardLevel, string> = {
  1: "#FFFFFF",
  2: "#FFFFFF",
  3: "#1E1B4B", // indigo-950 sur fond lavande
};

const LEVEL_DEFAULT_SIZE: Record<BoardLevel, { w: number; h: number }> = {
  1: { w: 380, h: 130 },
  2: { w: 240, h: 120 },
  3: { w: 210, h: 96 },
};

const LEVEL_FONT: Record<BoardLevel, { size: string; weight: number }> = {
  1: { size: "1.5rem", weight: 800 },
  2: { size: "1.1rem", weight: 700 },
  3: { size: "0.95rem", weight: 600 },
};

const PALETTE = [
  "#312E81", // indigo-900
  "#4F46E5", // indigo-600
  "#7C3AED", // violet-600
  "#C4B5FD", // lavender
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EF4444", // red
  "#0EA5E9", // sky
  "#EC4899", // pink
  "#0F172A", // slate
];

const handleStyle = {
  width: 10,
  height: 10,
  border: "2px solid white",
  background: "#7C3AED",
};

// ============================================================
//  Helpers
// ============================================================

const isLightColor = (hex: string) => {
  const v = hex.replace("#", "");
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  // Perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
};

const textColorFor = (bg: string) => (isLightColor(bg) ? "#0F172A" : "#FFFFFF");

const measureText = (
  text: string,
  fontSize: string,
  fontWeight: number,
  italic: boolean,
  maxWidth: number,
) => {
  if (typeof document === "undefined") return { w: maxWidth, h: 60 };
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  el.style.whiteSpace = "pre-wrap";
  el.style.wordBreak = "break-word";
  el.style.padding = "0";
  el.style.fontFamily = getComputedStyle(document.body).fontFamily;
  el.style.fontSize = fontSize;
  el.style.fontWeight = String(fontWeight);
  el.style.fontStyle = italic ? "italic" : "normal";
  el.style.lineHeight = "1.25";
  el.style.maxWidth = `${maxWidth}px`;
  el.style.left = "-9999px";
  el.textContent = text || " ";
  document.body.appendChild(el);
  const rect = el.getBoundingClientRect();
  document.body.removeChild(el);
  return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) };
};

const computeAutoSize = (data: EditorNodeData) => {
  const padX = data.shape === "circle" ? 36 : data.shape === "diamond" ? 44 : 28;
  const padY = data.shape === "circle" ? 36 : data.shape === "diamond" ? 44 : 20;
  const font = LEVEL_FONT[data.level];
  const minW = SHAPE_DEFAULTS[data.shape].minW;
  const minH = SHAPE_DEFAULTS[data.shape].minH;

  // Try to keep current width if user resized; otherwise grow up to a comfortable cap.
  const targetMaxWidth = Math.max(minW, Math.min(data.width, 360)) - padX * 2;
  const measured = measureText(
    data.label,
    font.size,
    data.bold ? 800 : font.weight,
    data.italic,
    Math.max(80, targetMaxWidth),
  );

  let w = Math.max(minW, Math.min(360, measured.w + padX * 2));
  let h = Math.max(minH, measured.h + padY * 2);

  if (data.shape === "circle" || data.shape === "diamond") {
    const s = Math.max(w, h);
    w = s;
    h = s;
  }
  return { w, h };
};

// ============================================================
//  Editable label (auto-grows)
// ============================================================

const EditableLabel = ({
  id,
  data,
  onCommit,
}: {
  id: string;
  data: EditorNodeData;
  onCommit: (id: string, label: string, w: number, h: number) => void;
}) => {
  const [value, setValue] = useState(data.label);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setValue(data.label), [data.label]);
  useEffect(() => {
    if (data.editing) {
      requestAnimationFrame(() => {
        taRef.current?.focus();
        taRef.current?.select();
      });
    }
  }, [data.editing]);

  const commit = () => {
    const finalLabel = value.trim() || data.label;
    const next = computeAutoSize({ ...data, label: finalLabel });
    onCommit(id, finalLabel, next.w, next.h);
  };

  const font = LEVEL_FONT[data.level];
  const color = textColorFor(data.color);
  const fontStyle: React.CSSProperties = {
    fontSize: font.size,
    fontWeight: data.bold ? 800 : font.weight,
    fontStyle: data.italic ? "italic" : "normal",
    color,
    textAlign: "center",
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
  };

  if (data.editing) {
    return (
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            setValue(data.label);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        rows={1}
        className="resize-none bg-transparent outline-none"
        style={fontStyle}
      />
    );
  }
  return <div style={fontStyle}>{data.label}</div>;
};

// ============================================================
//  Node toolbar (color, bold, italic, duplicate, delete)
// ============================================================

const InlineToolbar = ({
  id,
  data,
}: {
  id: string;
  data: EditorNodeData;
}) => (
  <NodeToolbar position={Position.Top} offset={10} className="!bg-transparent !border-0 !p-0">
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md">
      <button
        type="button"
        onClick={() => data.onPatch(id, { bold: !data.bold })}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent ${
          data.bold ? "bg-accent" : ""
        }`}
        title="Gras"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => data.onPatch(id, { italic: !data.italic })}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent ${
          data.italic ? "bg-accent" : ""
        }`}
        title="Italique"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent"
            title="Couleur"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-auto p-2">
          <DropdownMenuLabel className="px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Couleur
          </DropdownMenuLabel>
          <div className="grid grid-cols-4 gap-1.5 p-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => data.onPatch(id, { color: c })}
                className="h-6 w-6 rounded-md border border-border transition hover:scale-110"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => data.onDuplicate(id)}
        className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent"
        title="Dupliquer"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-border" />

      <button
        type="button"
        onClick={() => data.onDelete(id)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive transition hover:bg-destructive/10"
        title="Supprimer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </NodeToolbar>
);

// ============================================================
//  Single shape node component
// ============================================================

const ShapeNode = ({ id, data, selected }: NodeProps<EditorNodeData>) => {
  const { shape, color, width, height } = data;
  const minW = SHAPE_DEFAULTS[shape].minW;
  const minH = SHAPE_DEFAULTS[shape].minH;

  // Auto-fit when label/style changes (and the user hasn't resized smaller than required)
  const lastAuto = useRef<{ w: number; h: number; key: string }>({ w: 0, h: 0, key: "" });
  useLayoutEffect(() => {
    const key = `${data.label}|${data.bold}|${data.italic}|${data.shape}|${data.level}`;
    if (key === lastAuto.current.key) return;
    const next = computeAutoSize(data);
    lastAuto.current = { w: next.w, h: next.h, key };
    if (next.w > width || next.h > height) {
      data.onPatch(id, { width: next.w, height: next.h });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.label, data.bold, data.italic, data.shape, data.level]);

  const containerStyle: React.CSSProperties = {
    width,
    height,
    background: shape === "diamond" ? "transparent" : color,
    boxShadow: selected
      ? `0 0 0 2px white, 0 0 0 4px ${color}, 0 24px 48px -16px rgba(49,46,129,0.45), 0 8px 16px -8px rgba(49,46,129,0.35)`
      : "0 18px 36px -14px rgba(49,46,129,0.35), 0 6px 12px -6px rgba(15,23,42,0.18)",
    borderRadius:
      shape === "rect" ? 16 : shape === "circle" ? 9999 : 0,
    position: "relative",
    // Bords parfaitement nets sur tous les écrans
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
    WebkitFontSmoothing: "antialiased",
  };

  const innerWrap: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: shape === "rect" ? "16px 22px" : shape === "circle" ? "26px" : "30px",
    boxSizing: "border-box",
    overflow: "hidden",
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={minW}
        minHeight={minH}
        keepAspectRatio={shape !== "rect"}
        lineStyle={{ borderColor: color, opacity: 0.4 }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: "white",
          border: `2px solid ${color}`,
        }}
        onResize={(_e, params) =>
          data.onPatch(id, { width: params.width, height: params.height })
        }
      />

      <InlineToolbar id={id} data={data} />

      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" position={Position.Left} style={handleStyle} id="l" />
      <Handle type="source" position={Position.Right} style={handleStyle} id="r" />

      {shape === "diamond" ? (
        // Diamond: a rotated square with un-rotated content centered in it
        <div style={{ ...containerStyle, boxShadow: "none", background: "transparent" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: "rotate(45deg)",
              background: color,
              borderRadius: 14,
              boxShadow: selected
                ? `0 0 0 2px white, 0 0 0 4px ${color}, 0 24px 48px -16px rgba(49,46,129,0.45)`
                : "0 18px 36px -14px rgba(49,46,129,0.35), 0 6px 12px -6px rgba(15,23,42,0.18)",
            }}
          />
          <div
            style={{ ...innerWrap, position: "absolute", inset: 0 }}
            onDoubleClick={() => data.onStartEdit(id)}
          >
            <EditableLabel id={id} data={data} onCommit={data.onCommitEdit} />
          </div>
        </div>
      ) : (
        <div style={containerStyle} onDoubleClick={() => data.onStartEdit(id)}>
          <div style={innerWrap}>
            <EditableLabel id={id} data={data} onCommit={data.onCommitEdit} />
          </div>
        </div>
      )}
    </>
  );
};

const nodeTypes = { shape: ShapeNode };

// ============================================================
//  Hierarchical auto-layout
//  - Row 1: root(s) centered at top, biggest
//  - Row 2: secondary ideas evenly distributed
//  - Row 3: details grouped tightly under their parent
//  Generous spacing — readability over compactness.
// ============================================================

const LAYOUT = {
  rowGap: 260,        // vertical gap between levels — généreux
  siblingGap: 110,    // min horizontal gap between siblings of same parent
  branchGap: 180,     // min horizontal gap between different branches
  marginX: 100,
  marginY: 100,
};

const sizeOf = (n: BoardNode) => {
  const def = LEVEL_DEFAULT_SIZE[n.level];
  return { w: n.width ?? def.w, h: n.height ?? def.h };
};

/**
 * Tidy hierarchical layout. Returns a Map of node id -> top-left position.
 * Caps depth at 3: any node deeper than level 3 is collapsed to level 3.
 */
const computeLayout = (nodes: BoardNode[]): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return positions;

  // Index
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const childrenOf = new Map<string | null, BoardNode[]>();
  for (const n of nodes) {
    const p = n.parent && byId.has(n.parent) ? n.parent : null;
    const arr = childrenOf.get(p) ?? [];
    arr.push(n);
    childrenOf.set(p, arr);
  }

  // Roots = level 1 with no parent (or any orphan)
  const roots = (childrenOf.get(null) ?? []).slice();
  if (!roots.length) {
    // fallback: pick first node as root
    roots.push(nodes[0]);
  }

  // Compute subtree width recursively (only down to level 3)
  const subtreeWidth = new Map<string, number>();
  const computeWidth = (n: BoardNode): number => {
    const own = sizeOf(n).w;
    if (n.level >= 3) {
      subtreeWidth.set(n.id, own);
      return own;
    }
    const kids = (childrenOf.get(n.id) ?? []).filter((c) => c.level > n.level);
    if (!kids.length) {
      subtreeWidth.set(n.id, own);
      return own;
    }
    const childTotal = kids.reduce((acc, k, i) => {
      return acc + computeWidth(k) + (i > 0 ? LAYOUT.siblingGap : 0);
    }, 0);
    const w = Math.max(own, childTotal);
    subtreeWidth.set(n.id, w);
    return w;
  };

  // Place a subtree starting at left edge `left`, top `top`
  const place = (n: BoardNode, left: number, top: number) => {
    const w = subtreeWidth.get(n.id) ?? sizeOf(n).w;
    const own = sizeOf(n);
    const cx = left + w / 2;
    positions.set(n.id, { x: cx - own.w / 2, y: top });

    if (n.level >= 3) return;
    const kids = (childrenOf.get(n.id) ?? []).filter((c) => c.level > n.level);
    if (!kids.length) return;

    const childTop = top + own.h + LAYOUT.rowGap;
    const childTotal = kids.reduce(
      (acc, k, i) => acc + (subtreeWidth.get(k.id) ?? sizeOf(k).w) + (i > 0 ? LAYOUT.siblingGap : 0),
      0,
    );
    let cursor = cx - childTotal / 2;
    for (const k of kids) {
      const kw = subtreeWidth.get(k.id) ?? sizeOf(k).w;
      place(k, cursor, childTop);
      cursor += kw + LAYOUT.siblingGap;
    }
  };

  // Total width of all roots
  const rootWidths = roots.map((r) => computeWidth(r));
  const totalW = rootWidths.reduce((a, b, i) => a + b + (i > 0 ? LAYOUT.branchGap : 0), 0);
  let cursor = LAYOUT.marginX;
  // Center roots horizontally around 0 — viewport will fitView anyway
  cursor = -totalW / 2;
  roots.forEach((r, i) => {
    place(r, cursor, LAYOUT.marginY);
    cursor += rootWidths[i] + LAYOUT.branchGap;
  });

  return positions;
};

// ============================================================
//  Edges — Bézier propre, 3 styles (arrow, double, line), hover delete + label
// ============================================================

export type EdgeStyleVariant = "arrow" | "double" | "line";

type EditorEdgeData = {
  variant: EdgeStyleVariant;
  importance: "main" | "secondary";
  label?: string;
};

const EDGE_COLOR_MAIN = "#4F46E5";
const EDGE_COLOR_SECONDARY = "#94A3B8";

const edgeVisualFor = (variant: EdgeStyleVariant, importance: "main" | "secondary") => {
  const isMain = importance === "main";
  const stroke = isMain ? EDGE_COLOR_MAIN : EDGE_COLOR_SECONDARY;
  const strokeWidth = isMain ? 2.8 : 1.6;
  const opacity = isMain ? 0.92 : 0.72;
  const arrowSize = isMain ? 20 : 16;
  return { stroke, strokeWidth, opacity, arrowSize };
};

const buildEdgeStyle = (level: BoardLevel, variant: EdgeStyleVariant = "arrow") => {
  const importance: "main" | "secondary" = level === 2 ? "main" : "secondary";
  return {
    type: "smart" as const,
    data: { variant, importance } as EditorEdgeData,
  };
};

// Custom Bézier edge with hover halo + delete button + inline label editing
const SmartEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<EditorEdgeData>) => {
  const variant = data?.variant ?? "arrow";
  const importance = data?.importance ?? "secondary";
  const { stroke, strokeWidth, opacity, arrowSize } = edgeVisualFor(variant, importance);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  });

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data?.label ?? "");
  const flow = useReactFlow();

  useEffect(() => setLabel(data?.label ?? ""), [data?.label]);

  const showOverlay = hovered || selected || editing;

  // Unique marker IDs per edge to allow per-edge color/size variations
  const markerEndId = `m-end-${id}`;
  const markerStartId = `m-start-${id}`;

  const commitLabel = () => {
    setEditing(false);
    flow.setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, data: { ...(e.data as EditorEdgeData), label: label.trim() || undefined } }
          : e,
      ),
    );
  };

  const removeEdge = () => {
    flow.setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  return (
    <>
      <defs>
        <marker
          id={markerEndId}
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth={arrowSize / 2}
          markerHeight={arrowSize / 2}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 12 6 L 0 12 z" fill={stroke} />
        </marker>
        {variant === "double" && (
          <marker
            id={markerStartId}
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth={arrowSize / 2}
            markerHeight={arrowSize / 2}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill={stroke} />
          </marker>
        )}
      </defs>

      {/* Halo on hover/selection */}
      {showOverlay && (
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeOpacity={0.18}
          strokeWidth={strokeWidth + 8}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Visible edge */}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth,
          opacity: showOverlay ? 1 : opacity,
          transition: "opacity 120ms ease, stroke-width 120ms ease",
          strokeLinecap: "round",
        }}
        markerEnd={variant === "line" ? undefined : `url(#${markerEndId})`}
        markerStart={variant === "double" ? `url(#${markerStartId})` : undefined}
      />

      {/* Wide invisible hit area for hover + double-click */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") {
                  setLabel(data?.label ?? "");
                  setEditing(false);
                }
              }}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm outline-none ring-2 ring-primary/30"
              style={{ minWidth: 80 }}
            />
          ) : data?.label ? (
            <button
              type="button"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="rounded-md border border-border bg-background/95 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur"
              title="Double-clic pour modifier"
            >
              {data.label}
            </button>
          ) : showOverlay ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-dashed border-border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
              title="Ajouter un label"
            >
              + label
            </button>
          ) : null}

          {showOverlay && (
            <button
              type="button"
              onClick={removeEdge}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-destructive shadow-sm transition hover:bg-destructive hover:text-white"
              title="Supprimer la connexion"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = { smart: SmartEdge };


const toFlowNode = (n: BoardNode, pos?: { x: number; y: number }): Node<EditorNodeData> => {
  const shape: BoardShape = n.shape ?? LEVEL_TO_SHAPE[n.level];
  const color = n.color ?? LEVEL_COLOR[n.level] ?? SHAPE_DEFAULTS[shape].color;
  const size = LEVEL_DEFAULT_SIZE[n.level];
  return {
    id: n.id,
    type: "shape",
    position: { x: n.x ?? pos?.x ?? 0, y: n.y ?? pos?.y ?? 0 },
    data: {
      label: n.label,
      level: n.level,
      shape,
      color,
      bold: n.bold ?? (n.level === 1),
      italic: n.italic ?? false,
      width: n.width ?? size.w,
      height: n.height ?? size.h,
      // placeholders, replaced by enrich step
      onStartEdit: () => {},
      onCommitEdit: () => {},
      onPatch: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
    },
  };
};

/**
 * Cap depth at 3 levels. If the AI ever returns deeper trees, collapse them
 * by clamping level and reparenting to the nearest level-3 ancestor.
 */
const capDepth = (data: BoardData): BoardData => {
  const byId = new Map(data.nodes.map((n) => [n.id, n] as const));
  return {
    nodes: data.nodes.map((n) => {
      const lvl = (n.level > 3 ? 3 : n.level) as BoardLevel;
      return { ...n, level: lvl };
    }),
  };
};

const buildInitial = (data: BoardData) => {
  const capped = capDepth(data);
  // Strip stored x/y so layout always re-runs cleanly on (re)generate
  const fresh = capped.nodes.map((n) => ({ ...n, x: undefined, y: undefined }));
  const positions = computeLayout(fresh);
  const nodes = fresh.map((n) => toFlowNode(n, positions.get(n.id)));
  const edges: Edge[] = fresh
    .filter((n) => n.parent)
    .map((n) => {
      const labelText = (n as any).edgeLabel as string | undefined;
      return {
        id: `e-${n.parent}-${n.id}`,
        source: n.parent as string,
        target: n.id,
        label: labelText,
        labelStyle: labelText
          ? { fill: "#475569", fontSize: 11, fontWeight: 600 }
          : undefined,
        labelBgStyle: labelText
          ? { fill: "#FFFFFF", fillOpacity: 0.9 }
          : undefined,
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        ...buildEdgeStyle(n.level),
      };
    });
  return { nodes, edges };
};

// ============================================================
//  Snapshot (for undo/redo + export to AI)
// ============================================================

type Snapshot = { nodes: Node<EditorNodeData>[]; edges: Edge[] };

const snapshotToBoardData = (nodes: Node<EditorNodeData>[], edges: Edge[]): BoardData => {
  // Reconstruct a parent for each node from incoming edges (best effort).
  const parentByChild = new Map<string, string>();
  for (const e of edges) {
    if (!parentByChild.has(e.target)) parentByChild.set(e.target, e.source);
  }
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      level: n.data.level,
      parent: parentByChild.get(n.id) ?? null,
      shape: n.data.shape,
      color: n.data.color,
      bold: n.data.bold,
      italic: n.data.italic,
      width: n.data.width,
      height: n.data.height,
      x: n.position.x,
      y: n.position.y,
    })),
  };
};

// ============================================================
//  Public API
// ============================================================

export type SuggestionInsert = {
  label: string;
  level: BoardLevel;
  shape?: BoardShape;
  parentHint?: string | null; // existing node id to link from
};

export type BoardApi = {
  addSuggestionNode: (s: SuggestionInsert) => void;
  addNode: (shape: BoardShape) => void;
  getBoardData: () => BoardData;
  replaceBoard: (data: BoardData) => void;
  relayout: () => void;
};

export type BoardProps = {
  data: BoardData;
  apiRef?: React.MutableRefObject<BoardApi | null>;
  onChange?: (data: BoardData) => void;
};

// ============================================================
//  Inner board
// ============================================================

const BoardInner = ({ data, apiRef, onChange }: BoardProps) => {
  const initial = useMemo(() => buildInitial(data), [data]);
  const [nodes, setNodes] = useState<Node<EditorNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();

  // Reset on board prop change
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setEditingId(null);
    historyRef.current = { past: [], future: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Notify parent of changes (auto-save)
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    onChangeRef.current?.(snapshotToBoardData(nodes, edges));
  }, [nodes, edges]);

  // ------- Undo / redo -------
  const historyRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({
    past: [],
    future: [],
  });

  const pushHistory = useCallback((prevN: Node<EditorNodeData>[], prevE: Edge[]) => {
    historyRef.current.past.push({ nodes: prevN, edges: prevE });
    if (historyRef.current.past.length > 100) historyRef.current.past.shift();
    historyRef.current.future = [];
  }, []);

  const undo = useCallback(() => {
    const past = historyRef.current.past.pop();
    if (!past) return;
    historyRef.current.future.push({ nodes, edges });
    setNodes(past.nodes);
    setEdges(past.edges);
  }, [nodes, edges]);

  const redo = useCallback(() => {
    const fut = historyRef.current.future.pop();
    if (!fut) return;
    historyRef.current.past.push({ nodes, edges });
    setNodes(fut.nodes);
    setEdges(fut.edges);
  }, [nodes, edges]);

  // ------- Node mutations -------
  const handleStartEdit = useCallback((id: string) => setEditingId(id), []);

  const handleCommitEdit = useCallback(
    (id: string, label: string, w: number, h: number) => {
      pushHistory(nodes, edges);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, label, width: w, height: h } }
            : n,
        ),
      );
      setEditingId(null);
    },
    [nodes, edges, pushHistory],
  );

  const handlePatch = useCallback(
    (id: string, patch: Partial<EditorNodeData>) => {
      // Only push history for "meaningful" patches (style/color/size jumps)
      const trackable =
        "color" in patch || "bold" in patch || "italic" in patch ||
        ("width" in patch && Math.abs((patch.width ?? 0)) > 0);
      if (trackable) pushHistory(nodes, edges);
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
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

  const handleDuplicateNode = useCallback(
    (id: string) => {
      const src = nodes.find((n) => n.id === id);
      if (!src) return;
      pushHistory(nodes, edges);
      const newId = `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const dup: Node<EditorNodeData> = {
        ...src,
        id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        selected: true,
        data: { ...src.data },
      };
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), dup]);
    },
    [nodes, edges, pushHistory],
  );

  // Inject callbacks into every node's data
  const enrichedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          editing: editingId === n.id,
          onStartEdit: handleStartEdit,
          onCommitEdit: handleCommitEdit,
          onPatch: handlePatch,
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode,
        },
      })),
    [nodes, editingId, handleStartEdit, handleCommitEdit, handlePatch, handleDuplicateNode, handleDeleteNode],
  );

  // ------- React Flow change handlers -------
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const significant = changes.some(
        (c) =>
          c.type === "remove" ||
          (c.type === "position" && (c as any).dragging === false) ||
          c.type === "dimensions",
      );
      if (significant) pushHistory(nodes, edges);
      setNodes((nds) => applyNodeChanges(changes, nds) as Node<EditorNodeData>[]);
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
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${conn.source}-${conn.target}-${Date.now()}`,
            ...buildEdgeStyle(2),
          },
          eds,
        ),
      );
    },
    [nodes, edges, pushHistory],
  );

  // ------- Add node -------
  const addNode = useCallback(
    (shape: BoardShape) => {
      pushHistory(nodes, edges);
      const id = `n-${Date.now()}`;
      const level: BoardLevel = shape === "rect" ? 1 : shape === "circle" ? 2 : 3;
      const size = LEVEL_DEFAULT_SIZE[level];
      const def = SHAPE_DEFAULTS[shape];
      const newNode: Node<EditorNodeData> = {
        id,
        type: "shape",
        position: { x: 220 + Math.random() * 240, y: 180 + Math.random() * 200 },
        selected: true,
        data: {
          label: "Nouveau nœud",
          level,
          shape,
          color: def.color,
          bold: false,
          italic: false,
          width: size.w,
          height: size.h,
          onStartEdit: () => {},
          onCommitEdit: () => {},
          onPatch: () => {},
          onDuplicate: () => {},
          onDelete: () => {},
        },
      };
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
      setEditingId(id);
    },
    [nodes, edges, pushHistory],
  );

  // ------- Imperative API -------
  const addSuggestionNode = useCallback(
    (s: SuggestionInsert) => {
      pushHistory(nodes, edges);
      const shape: BoardShape = s.shape ?? LEVEL_TO_SHAPE[s.level];
      const def = SHAPE_DEFAULTS[shape];
      const size = LEVEL_DEFAULT_SIZE[s.level];
      const id = `s-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Position near parent if provided, else random in view
      let pos = { x: 260 + Math.random() * 320, y: 220 + Math.random() * 200 };
      const parent = s.parentHint ? nodes.find((n) => n.id === s.parentHint) : undefined;
      if (parent) {
        pos = {
          x: parent.position.x + (parent.data.width ?? size.w) / 2 + 40,
          y: parent.position.y + (parent.data.height ?? size.h) + 60,
        };
      }

      const newNode: Node<EditorNodeData> = {
        id,
        type: "shape",
        position: pos,
        data: {
          label: s.label,
          level: s.level,
          shape,
          color: def.color,
          bold: false,
          italic: false,
          width: size.w,
          height: size.h,
          onStartEdit: () => {},
          onCommitEdit: () => {},
          onPatch: () => {},
          onDuplicate: () => {},
          onDelete: () => {},
        },
      };
      setNodes((nds) => [...nds, newNode]);

      if (parent) {
        setEdges((eds) => [
          ...eds,
          {
            id: `e-${parent.id}-${id}`,
            source: parent.id,
            target: id,
            ...buildEdgeStyle(s.level),
          },
        ]);
      }
    },
    [nodes, edges, pushHistory],
  );

  const replaceBoard = useCallback((next: BoardData) => {
    const built = buildInitial(next);
    historyRef.current.past.push({ nodes, edges });
    setNodes(built.nodes);
    setEdges(built.edges);
    setEditingId(null);
    requestAnimationFrame(() => fitView({ padding: 0.18, duration: 400 }));
  }, [nodes, edges, fitView]);

  const getBoardData = useCallback(
    () => snapshotToBoardData(nodes, edges),
    [nodes, edges],
  );

  // Recompute clean hierarchical layout for the current board (keeps styles + edges).
  const relayout = useCallback(() => {
    pushHistory(nodes, edges);
    const current = snapshotToBoardData(nodes, edges);
    const built = buildInitial({ nodes: current.nodes });
    // preserve user style overrides (color/bold/italic/width/height) where present
    const styleById = new Map(nodes.map((n) => [n.id, n.data] as const));
    const merged = built.nodes.map((n) => {
      const prev = styleById.get(n.id);
      return prev ? { ...n, data: { ...n.data, color: prev.color, bold: prev.bold, italic: prev.italic } } : n;
    });
    setNodes(merged);
    setEdges(built.edges);
    requestAnimationFrame(() => fitView({ padding: 0.18, duration: 500 }));
  }, [nodes, edges, fitView, pushHistory]);

  useEffect(() => {
    if (apiRef) apiRef.current = { addSuggestionNode, addNode, getBoardData, replaceBoard, relayout };
    return () => { if (apiRef) apiRef.current = null; };
  }, [apiRef, addSuggestionNode, addNode, getBoardData, replaceBoard, relayout]);

  // ------- Keyboard shortcuts (undo/redo) -------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isField) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        meta &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        redo();
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const sel = nodes.find((n) => n.selected);
        if (sel) handleDuplicateNode(sel.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, nodes, handleDuplicateNode]);

  // ------- Right-click context menu -------
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, n: Node) => {
      e.preventDefault();
      // Mark this node as the only selection so toolbar/menus refer to it
      setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === n.id })));
      setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
    },
    [],
  );
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-gradient-board">
      {/* Top toolbar */}
      <div className="absolute left-2 top-2 sm:left-3 sm:top-3 z-10 flex items-center gap-1.5 sm:gap-2 rounded-xl border border-border bg-background/90 p-1 sm:p-1.5 shadow-elegant backdrop-blur">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90 px-2 sm:px-3">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Ajouter une forme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => addNode("rect")}>
              <Square className="mr-2 h-4 w-4 text-[#4F46E5]" /> Rectangle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode("circle")}>
              <CircleIcon className="mr-2 h-4 w-4 text-[#7C3AED]" /> Cercle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addNode("diamond")}>
              <DiamondIcon className="mr-2 h-4 w-4 text-[#F59E0B]" /> Diamant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          onClick={relayout}
          title="Réorganiser le board"
          className="px-2 sm:px-3"
        >
          <LayoutGrid className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Réorganiser</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fitView({ padding: 0.18, duration: 400 })}
          title="Adapter à l'écran"
          className="px-2 sm:hidden"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <div className="hidden md:block px-2 text-xs text-muted-foreground">
          Double-clic : éditer · Clic droit : menu · Shift-clic : multi-sélection · ⌘Z / ⌘Y · ⌘D
        </div>
      </div>

      {/* Legend (bottom-left) — masquée sur mobile pour laisser de la place */}
      <div className="hidden md:block absolute bottom-3 left-3 z-10 rounded-xl border border-border bg-background/90 p-3 shadow-elegant backdrop-blur text-xs space-y-2 max-w-[220px]">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Info className="h-3.5 w-3.5" /> Légende
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm" style={{ background: LEVEL_COLOR[1] }} />
            <span className="font-semibold">Sujet principal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[2] }} />
            <span>Idées clés</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm" style={{ background: LEVEL_COLOR[3] }} />
            <span>Détails</span>
          </div>
        </div>
        <div className="pt-1 border-t border-border space-y-1 text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block h-[3px] w-6 rounded" style={{ background: "#4F46E5" }} />
            <span>Lien principal</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-[1.5px] w-6 rounded" style={{ background: "#94A3B8" }} />
            <span>Lien secondaire</span>
          </div>
        </div>
      </div>

      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => setCtxMenu(null)}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Delete", "Backspace"]}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionKeyCode={["Shift"]}
        zoomOnDoubleClick={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnDrag
        minZoom={0.2}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} color="#C4B5FD" gap={28} size={1.5} />
        <Controls
          showZoom={false}
          showFitView={false}
          showInteractive={false}
          position="bottom-right"
          className="!flex-row !rounded-xl !border !border-border !bg-background/90 !p-1 !shadow-elegant !backdrop-blur"
        >
          <ControlButton onClick={() => zoomIn({ duration: 200 })} title="Zoom avant">
            <ZoomIn className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton onClick={() => zoomOut({ duration: 200 })} title="Zoom arrière">
            <ZoomOut className="h-3.5 w-3.5" />
          </ControlButton>
          <ControlButton
            onClick={() => fitView({ padding: 0.18, duration: 400 })}
            title="Adapter à l'écran"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </ControlButton>
        </Controls>
      </ReactFlow>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { handleStartEdit(ctxMenu.nodeId); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <SparklesIcon className="h-3.5 w-3.5" /> Éditer le texte
          </button>
          <button
            onClick={() => { handleDuplicateNode(ctxMenu.nodeId); setCtxMenu(null); }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" /> Dupliquer
          </button>
          <button
            onClick={() => {
              handlePatch(ctxMenu.nodeId, { bold: !nodes.find((n) => n.id === ctxMenu.nodeId)?.data.bold });
              setCtxMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Bold className="h-3.5 w-3.5" /> Gras
          </button>
          <button
            onClick={() => {
              handlePatch(ctxMenu.nodeId, { italic: !nodes.find((n) => n.id === ctxMenu.nodeId)?.data.italic });
              setCtxMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Italic className="h-3.5 w-3.5" /> Italique
          </button>
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Couleur</div>
          <div className="grid grid-cols-4 gap-1.5 p-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => { handlePatch(ctxMenu.nodeId, { color: c }); setCtxMenu(null); }}
                className="h-6 w-6 rounded-md border border-border transition hover:scale-110"
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            onClick={() => { handleDeleteNode(ctxMenu.nodeId); setCtxMenu(null); }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
};

const Board = ({ data, apiRef, onChange }: BoardProps) => (
  <ReactFlowProvider>
    <BoardInner data={data} apiRef={apiRef} onChange={onChange} />
  </ReactFlowProvider>
);

export default Board;
