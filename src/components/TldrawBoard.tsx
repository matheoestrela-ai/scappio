import { useEffect, useRef, useState } from "react";
import {
  Tldraw,
  Editor,
  TLShapeId,
  createShapeId,
  toRichText,
} from "tldraw";
import "tldraw/tldraw.css";
import { PaintBucket, Check, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  BoardApi,
  BoardData,
  BoardLevel,
  BoardNode,
  BoardShape,
  SuggestionInsert,
} from "./Board";

// ============================================================
// ============================================================
//  Layout constants — hierarchical top-to-bottom tree
const BG_SWATCHES: { value: string; label: string; dark?: boolean }[] = [
  { value: "#FAFAF8", label: "Off-white" },
  { value: "#F5F0E8", label: "Soft beige" },
  { value: "#F3F4F6", label: "Very light gray" },
  { value: "#FFF8F0", label: "Cream" },
  { value: "#FDE8F0", label: "Powder pink" },
  { value: "#FEE8D6", label: "Soft peach" },
  { value: "#FEF9C3", label: "Pale yellow" },
  { value: "#E8F8F0", label: "Mint green" },
  { value: "#E8F0FE", label: "Pale sky blue" },
  { value: "#F0E8FE", label: "Soft lavender" },
  { value: "#E8F0E8", label: "Pale sage green" },
  { value: "#1F2937", label: "Dark", dark: true },
];
const DEFAULT_BG = "#FAFAF8";

const isLightHex = (hex: string) => {
  const v = hex.replace("#", "");
  if (v.length !== 6) return true;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
};

// ============================================================

const NODE_GAP_X = 40; // horizontal gap between siblings
const NODE_GAP_Y = 100; // vertical gap between hierarchy levels
const BOARD_PADDING = 80; // padding around the whole board
const MIN_W = 180;
const MIN_H = 70;
const MAX_W = 360;

// tldraw color names — orange pur partout
const colorForLevel = (level: number): "orange" | "grey" => {
  if (level <= 3) return "orange";
  return "grey";
};

const fillForLevel = (level: number): "solid" | "semi" | "none" => {
  if (level <= 1) return "solid";
  if (level === 2) return "semi";
  return "none";
};

const sizeForLevel = (level: number): "l" | "m" | "s" => {
  if (level <= 1) return "l";
  if (level === 2) return "m";
  return "s";
};

const geoForLevel = (level: number): "rectangle" | "ellipse" => {
  if (level === 2) return "ellipse";
  return "rectangle";
};

const SHAPE_TO_GEO: Partial<Record<BoardShape, "rectangle" | "ellipse" | "diamond">> = {
  rect: "rectangle",
  circle: "ellipse",
  diamond: "diamond",
};

// Map a BoardNode id → tldraw shape id (deterministic so re-layout updates same shapes)
const sid = (id: string): TLShapeId =>
  createShapeId(`gribouille-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`);

// ============================================================
//  Auto-size each node based on its text length & level
// ============================================================

const sizeForNode = (label: string, level: number): { w: number; h: number } => {
  // Approximate char width per level (rem-ish heuristic)
  const charPx = level <= 1 ? 13 : level === 2 ? 11 : 9;
  const lineH = level <= 1 ? 32 : level === 2 ? 26 : 22;
  const padX = 36;
  const padY = level <= 1 ? 30 : 24;

  const text = (label || " ").trim();
  // Estimate width with a soft cap, then compute lines based on cap
  const naturalW = text.length * charPx + padX * 2;
  const w = Math.max(MIN_W, Math.min(MAX_W, naturalW));
  const usableTextW = w - padX * 2;
  const charsPerLine = Math.max(6, Math.floor(usableTextW / charPx));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const h = Math.max(MIN_H, lines * lineH + padY * 2);
  return { w, h };
};

// ============================================================
//  Hierarchical top-to-bottom layout (tidy tree)
//  Computes positions so that no two nodes ever overlap.
// ============================================================

type Positioned = BoardNode & { _x: number; _y: number; _w: number; _h: number };

type LayoutNode = {
  node: BoardNode;
  w: number;
  h: number;
  depth: number;
  children: LayoutNode[];
  subtreeW: number; // total width of this node's subtree
  x: number; // assigned center x
  y: number; // assigned top y
};

const layoutBoard = (data: BoardData): Positioned[] => {
  if (!data.nodes.length) return [];

  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string | null, BoardNode[]>();
  for (const n of data.nodes) {
    const key = n.parent && byId.has(n.parent) ? n.parent : null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(n);
  }

  // Pick the root: lowest level, otherwise first node
  const roots = data.nodes.filter(
    (n) => !n.parent || !byId.has(n.parent),
  );
  const primaryRoot =
    roots.find((n) => n.level === 1) ?? roots[0] ?? data.nodes[0];

  // Build the layout tree (recursively)
  const buildTree = (node: BoardNode, depth: number): LayoutNode => {
    const size = sizeForNode(node.label, node.level);
    const kids = (childrenOf.get(node.id) ?? []).map((c) =>
      buildTree(c, depth + 1),
    );
    const childrenSubtreeW = kids.reduce(
      (acc, k, i) => acc + k.subtreeW + (i > 0 ? NODE_GAP_X : 0),
      0,
    );
    const subtreeW = Math.max(size.w, childrenSubtreeW);
    return {
      node,
      w: size.w,
      h: size.h,
      depth,
      children: kids,
      subtreeW,
      x: 0,
      y: 0,
    };
  };

  const tree = buildTree(primaryRoot, 0);

  // Track maximum height per depth so each row aligns vertically
  const heightAtDepth = new Map<number, number>();
  const collectHeights = (n: LayoutNode) => {
    heightAtDepth.set(
      n.depth,
      Math.max(heightAtDepth.get(n.depth) ?? 0, n.h),
    );
    n.children.forEach(collectHeights);
  };
  collectHeights(tree);

  // Assign x recursively (centered around parent), y by depth
  const yAtDepth: number[] = [];
  let cumulativeY = 0;
  const maxDepth = Math.max(...heightAtDepth.keys());
  for (let d = 0; d <= maxDepth; d++) {
    yAtDepth[d] = cumulativeY;
    cumulativeY += (heightAtDepth.get(d) ?? MIN_H) + NODE_GAP_Y;
  }

  const assignPositions = (n: LayoutNode, leftEdge: number) => {
    n.y = yAtDepth[n.depth];
    if (n.children.length === 0) {
      n.x = leftEdge + n.subtreeW / 2;
      return;
    }
    // Place children left-to-right
    let cursor = leftEdge;
    for (const c of n.children) {
      assignPositions(c, cursor);
      cursor += c.subtreeW + NODE_GAP_X;
    }
    // Center this node above its children
    const firstC = n.children[0];
    const lastC = n.children[n.children.length - 1];
    n.x = (firstC.x + lastC.x) / 2;
  };
  assignPositions(tree, 0);

  // Flatten tree → positioned list
  const positioned: Positioned[] = [];
  const placedIds = new Set<string>();
  const flatten = (n: LayoutNode) => {
    positioned.push({
      ...n.node,
      _x: n.x - n.w / 2,
      _y: n.y,
      _w: n.w,
      _h: n.h,
    });
    placedIds.add(n.node.id);
    n.children.forEach(flatten);
  };
  flatten(tree);

  // Place orphan trees (other roots) in additional rows below
  const orphanRoots = roots.filter((r) => !placedIds.has(r.id));
  if (orphanRoots.length) {
    const yStart = cumulativeY + 60;
    let xCursor = 0;
    orphanRoots.forEach((r) => {
      const subtree = buildTree(r, 0);
      // shift y of subtree
      const subPositioned: Positioned[] = [];
      const flattenShift = (n: LayoutNode, dx: number, dy: number) => {
        n.y = yAtDepth[n.depth] + dy;
        if (n.children.length === 0) {
          n.x = dx + n.subtreeW / 2;
        } else {
          let cur = dx;
          for (const c of n.children) {
            flattenShift(c, cur, dy);
            cur += c.subtreeW + NODE_GAP_X;
          }
          n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
        }
        subPositioned.push({
          ...n.node,
          _x: n.x - n.w / 2,
          _y: n.y,
          _w: n.w,
          _h: n.h,
        });
        placedIds.add(n.node.id);
      };
      flattenShift(subtree, xCursor, yStart);
      positioned.push(...subPositioned);
      xCursor += subtree.subtreeW + NODE_GAP_X * 2;
    });
  }

  // Truly orphan nodes (not even a root): grid them at the bottom
  const trulyOrphans = data.nodes.filter((n) => !placedIds.has(n.id));
  if (trulyOrphans.length) {
    const allYs = positioned.map((p) => p._y + p._h);
    const baseY = (allYs.length ? Math.max(...allYs) : 0) + 100;
    let xCursor = 0;
    let yCursor = baseY;
    let rowH = 0;
    trulyOrphans.forEach((n) => {
      const size = sizeForNode(n.label, n.level);
      if (xCursor + size.w > 1200) {
        xCursor = 0;
        yCursor += rowH + NODE_GAP_Y;
        rowH = 0;
      }
      positioned.push({
        ...n,
        _x: xCursor,
        _y: yCursor,
        _w: size.w,
        _h: size.h,
      });
      xCursor += size.w + NODE_GAP_X;
      rowH = Math.max(rowH, size.h);
    });
  }

  // ============================================================
  //  Final overlap pass — guarantees no two nodes overlap.
  //  AABB collision detection with iterative push-apart.
  // ============================================================
  const minGap = NODE_GAP_X;
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const overlapX =
          Math.min(a._x + a._w + minGap, b._x + b._w + minGap) -
          Math.max(a._x - minGap, b._x - minGap);
        const overlapY =
          Math.min(a._y + a._h + minGap, b._y + b._h + minGap) -
          Math.max(a._y - minGap, b._y - minGap);
        if (overlapX > 0 && overlapY > 0) {
          // Push apart on the smaller axis
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            if (a._x < b._x) {
              a._x -= push;
              b._x += push;
            } else {
              a._x += push;
              b._x -= push;
            }
          } else {
            const push = overlapY / 2 + 1;
            if (a._y < b._y) {
              a._y -= push;
              b._y += push;
            } else {
              a._y += push;
              b._y -= push;
            }
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Apply outer board padding (translate everything so min x/y is at BOARD_PADDING)
  const minX = Math.min(...positioned.map((p) => p._x));
  const minY = Math.min(...positioned.map((p) => p._y));
  const dx = BOARD_PADDING - minX;
  const dy = BOARD_PADDING - minY;
  positioned.forEach((p) => {
    p._x += dx;
    p._y += dy;
  });

  return positioned;
};

// ============================================================
//  Render board into tldraw editor
// ============================================================

const renderBoardInEditor = (editor: Editor, data: BoardData) => {
  const positioned = layoutBoard(data);

  // Wipe previous gribouille shapes (keep user-drawn shapes intact: ones whose id starts with "shape:" but NOT "shape:gribouille-")
  const existing = editor.getCurrentPageShapes().filter((s) =>
    s.id.startsWith("shape:gribouille-"),
  );
  if (existing.length) {
    editor.deleteShapes(existing.map((s) => s.id));
  }

  // Create node shapes
  const shapesToCreate = positioned.map((p) => ({
    id: sid(p.id),
    type: "geo" as const,
    x: p._x,
    y: p._y,
    props: {
      geo: (SHAPE_TO_GEO[p.shape ?? "rect"] ?? geoForLevel(p.level)) as
        | "rectangle"
        | "ellipse"
        | "diamond",
      w: p._w,
      h: p._h,
      color: colorForLevel(p.level),
      fill: fillForLevel(p.level),
      size: sizeForLevel(p.level),
      font: "sans" as const,
      align: "middle" as const,
      verticalAlign: "middle" as const,
      richText: toRichText(p.label),
    },
  }));

  if (shapesToCreate.length) {
    editor.createShapes(shapesToCreate);
  }

  // Create arrows for parent → child
  const arrows = positioned
    .filter((p) => p.parent)
    .map((p) => {
      const arrowId = createShapeId(
        `gribouille-arrow-${p.parent!.replace(/[^a-zA-Z0-9_-]/g, "_")}-${p.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      );
      return {
        id: arrowId,
        type: "arrow" as const,
        x: 0,
        y: 0,
        props: {
          color: "grey" as const,
          size: "s" as const,
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 },
        },
      };
    });

  if (arrows.length) {
    editor.createShapes(arrows);

    // Bind arrows to start/end shapes
    arrows.forEach((arrow, i) => {
      const node = positioned.filter((p) => p.parent)[i];
      const fromId = sid(node.parent!);
      const toId = sid(node.id);
      editor.createBindings([
        {
          fromId: arrow.id,
          toId: fromId,
          type: "arrow",
          props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        },
        {
          fromId: arrow.id,
          toId: toId,
          type: "arrow",
          props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        },
      ]);
    });
  }

  // Frame the view on the new content (BOARD_PADDING is already baked into the layout)
  setTimeout(() => {
    editor.zoomToFit({ animation: { duration: 500 } });
  }, 80);
};

// ============================================================
//  Read board state from editor (for getBoardData / autosave)
// ============================================================

const readBoardFromEditor = (editor: Editor, baseData: BoardData): BoardData => {
  // Keep canonical structure (level/parent/order) from baseData but read updated labels & positions from tldraw
  const shapes = editor.getCurrentPageShapes();
  const nodeShapes = new Map(
    shapes
      .filter((s) => s.id.startsWith("shape:gribouille-") && s.type === "geo")
      .map((s) => [s.id, s as any]),
  );

  const updated: BoardNode[] = baseData.nodes.map((n) => {
    const s = nodeShapes.get(sid(n.id));
    if (!s) return n;
    // Extract plain text from rich text
    let label = n.label;
    try {
      const rt = s.props?.richText;
      if (rt && typeof rt === "object") {
        const text = JSON.stringify(rt).match(/"text":"([^"]*)"/g)?.map((m) =>
          m.slice(8, -1),
        ).join(" ");
        if (text) label = text;
      }
    } catch {
      /* ignore */
    }
    return {
      ...n,
      label,
      x: s.x,
      y: s.y,
      width: s.props?.w ?? n.width,
      height: s.props?.h ?? n.height,
    };
  });

  return { nodes: updated };
};

// ============================================================
//  Component
// ============================================================

export type TldrawBoardProps = {
  data: BoardData;
  apiRef?: React.MutableRefObject<BoardApi | null>;
  onChange?: (data: BoardData) => void;
};

const PERSIST_KEY = "gribouille-tldraw-board";

const TldrawBoard = ({ data, apiRef, onChange }: TldrawBoardProps) => {
  const editorRef = useRef<Editor | null>(null);
  const dataRef = useRef<BoardData>(data);
  const onChangeRef = useRef(onChange);
  const [bgColor, setBgColor] = useState<string>(data.bgColor ?? DEFAULT_BG);
  const [bgOpen, setBgOpen] = useState(false);
  const isDarkBoard = bgColor === "#0D0D0D";

  useEffect(() => {
    dataRef.current = data;
    if (data.bgColor && data.bgColor !== bgColor) setBgColor(data.bgColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Persist bg changes through onChange
  useEffect(() => {
    const next = { ...dataRef.current, bgColor };
    dataRef.current = next;
    onChangeRef.current?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgColor]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Re-render board whenever the upstream data prop changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    renderBoardInEditor(editor, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleMount = (editor: Editor) => {
    editorRef.current = editor;

    // Initial render of the AI-generated board
    renderBoardInEditor(editor, dataRef.current);

    // Wire BoardApi
    if (apiRef) {
      apiRef.current = {
        getBoardData: () => readBoardFromEditor(editor, dataRef.current),
        replaceBoard: (next: BoardData) => {
          dataRef.current = next;
          renderBoardInEditor(editor, next);
        },
        relayout: () => {
          renderBoardInEditor(editor, dataRef.current);
        },
        addNode: (shape: BoardShape) => {
          const id = `node-${Date.now()}`;
          const newNode: BoardNode = {
            id,
            label: "New idea",
            level: 2,
            parent: null,
            shape,
          };
          const next: BoardData = {
            nodes: [...dataRef.current.nodes, newNode],
          };
          dataRef.current = next;
          renderBoardInEditor(editor, next);
        },
        addSuggestionNode: (s: SuggestionInsert) => {
          const id = `node-${Date.now()}`;
          const newNode: BoardNode = {
            id,
            label: s.label,
            level: s.level,
            parent: s.parentHint ?? null,
            shape: s.shape,
          };
          const next: BoardData = {
            nodes: [...dataRef.current.nodes, newNode],
          };
          dataRef.current = next;
          renderBoardInEditor(editor, next);
        },
      };
    }

    // Notify parent on changes (debounced)
    let saveTimer: number | null = null;
    editor.store.listen(
      () => {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          const next = readBoardFromEditor(editor, dataRef.current);
          dataRef.current = next;
          onChangeRef.current?.(next);
        }, 500);
      },
      { source: "user", scope: "document" },
    );
  };

  return (
    <div
      className="h-full w-full relative transition-colors duration-300"
      style={{ background: bgColor }}
    >
      <style>{`
        .tldraw-bg-overlay .tl-background { background-color: ${bgColor} !important; }
      `}</style>
      <div className="tldraw-bg-overlay h-full w-full">
        <Tldraw
          persistenceKey={PERSIST_KEY}
          onMount={handleMount}
          licenseKey="tldraw-2026-08-03/WyJOWWwxMEtsaiIsWyIqIl0sMTYsIjIwMjYtMDgtMDMiXQ.xedsaiEOkJIoMSqTxL5xT8ebkwSIXsIeI2uamoT3SdvJb4EFJPUFE0gw/PSIpKhS9UIuzW6BqgGRVaqKJDzT9g"
        />
      </div>

      {/* Background color picker — top center, next to tldraw action menu */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 z-[200]">
        <Popover open={bgOpen} onOpenChange={setBgOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              title="Background color"
              className="shadow-md backdrop-blur"
              style={
                isDarkBoard
                  ? { background: "#1A1A1A", borderColor: "#2A2A2A", color: "#fff" }
                  : { background: "rgba(255,255,255,0.95)" }
              }
            >
              <PaintBucket className="h-4 w-4 mr-1.5" />
              Background
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={8}
            className="w-auto p-3"
            style={
              isDarkBoard
                ? { background: "#1A1A1A", borderColor: "#2A2A2A", color: "#fff" }
                : undefined
            }
          >
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Board background
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BG_SWATCHES.map((s) => {
                const selected = bgColor === s.value;
                return (
                  <div key={s.value} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBgColor(s.value);
                        setBgOpen(false);
                      }}
                      title={s.label}
                      className="relative flex items-center justify-center rounded-full transition hover:scale-110"
                      style={{
                        width: 28,
                        height: 28,
                        background: s.value,
                        border: selected
                          ? "2px solid hsl(var(--foreground))"
                          : s.dark
                          ? "2px solid #FFFFFF"
                          : "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      {selected && (
                        <Check
                          className="h-3.5 w-3.5"
                          style={{ color: isLightHex(s.value) ? "#0F172A" : "#fff" }}
                        />
                      )}
                    </button>
                    {s.dark && (
                      <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                        <Moon className="h-2.5 w-2.5" /> Dark
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default TldrawBoard;
