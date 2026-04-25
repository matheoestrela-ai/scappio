import { useEffect, useRef } from "react";
import {
  Tldraw,
  Editor,
  TLShapeId,
  createShapeId,
  toRichText,
} from "tldraw";
import "tldraw/tldraw.css";
import type {
  BoardApi,
  BoardData,
  BoardLevel,
  BoardNode,
  BoardShape,
  SuggestionInsert,
} from "./Board";

// ============================================================
//  Layout constants — radial tree around the central topic
// ============================================================

const LEVEL_SIZE: Record<BoardLevel, { w: number; h: number }> = {
  1: { w: 320, h: 130 },
  2: { w: 220, h: 110 },
  3: { w: 200, h: 90 },
};

// tldraw color names (limited palette)
const LEVEL_COLOR: Record<BoardLevel, string> = {
  1: "violet",
  2: "light-violet",
  3: "grey",
};

const LEVEL_GEO: Record<BoardLevel, "rectangle" | "ellipse"> = {
  1: "rectangle",
  2: "ellipse",
  3: "rectangle",
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
//  Compute positions in a simple radial layout
// ============================================================

type Positioned = BoardNode & { _x: number; _y: number; _w: number; _h: number };

const layoutBoard = (data: BoardData): Positioned[] => {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string | null, BoardNode[]>();
  for (const n of data.nodes) {
    const key = n.parent ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(n);
  }

  const root =
    data.nodes.find((n) => n.level === 1 && (!n.parent || !byId.has(n.parent))) ??
    data.nodes[0];

  const positioned: Positioned[] = [];

  // Root at center of canvas
  const rootSize = LEVEL_SIZE[root.level];
  const cx = 0;
  const cy = 0;
  positioned.push({
    ...root,
    _x: cx - rootSize.w / 2,
    _y: cy - rootSize.h / 2,
    _w: rootSize.w,
    _h: rootSize.h,
  });

  // Level 2 children placed radially around root
  const lvl2 = childrenOf.get(root.id) ?? [];
  const ringRadius = Math.max(380, 120 + lvl2.length * 35);

  lvl2.forEach((n, i) => {
    const size = LEVEL_SIZE[n.level];
    const angle = (i / lvl2.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * ringRadius - size.w / 2;
    const y = cy + Math.sin(angle) * ringRadius - size.h / 2;
    positioned.push({ ...n, _x: x, _y: y, _w: size.w, _h: size.h });

    // Level 3 children placed further out along the same direction
    const lvl3 = childrenOf.get(n.id) ?? [];
    const innerRadius = ringRadius + 200;
    const spread = Math.PI / 6; // ±30°
    lvl3.forEach((c, j) => {
      const csize = LEVEL_SIZE[c.level];
      const sub =
        lvl3.length === 1
          ? angle
          : angle - spread + (j / (lvl3.length - 1)) * spread * 2;
      const cxp = cx + Math.cos(sub) * innerRadius - csize.w / 2;
      const cyp = cy + Math.sin(sub) * innerRadius - csize.h / 2;
      positioned.push({ ...c, _x: cxp, _y: cyp, _w: csize.w, _h: csize.h });
    });
  });

  // Orphans (parent unknown / level 2 without root link) — put below the layout
  const placedIds = new Set(positioned.map((p) => p.id));
  let orphanY = ringRadius + 600;
  let orphanX = -400;
  for (const n of data.nodes) {
    if (placedIds.has(n.id)) continue;
    const size = LEVEL_SIZE[n.level];
    positioned.push({ ...n, _x: orphanX, _y: orphanY, _w: size.w, _h: size.h });
    orphanX += size.w + 40;
    if (orphanX > 800) {
      orphanX = -400;
      orphanY += size.h + 60;
    }
  }

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
  const shapesToCreate = positioned.map((p) => {
    const geo = SHAPE_TO_GEO[p.shape ?? "rect"] ?? LEVEL_GEO[p.level];
    return {
      id: sid(p.id),
      type: "geo" as const,
      x: p._x,
      y: p._y,
      props: {
        geo,
        w: p._w,
        h: p._h,
        color: LEVEL_COLOR[p.level],
        fill: p.level === 1 ? "solid" : p.level === 2 ? "semi" : "none",
        size: p.level === 1 ? "l" : p.level === 2 ? "m" : "s",
        font: "sans",
        align: "middle" as const,
        verticalAlign: "middle" as const,
        richText: toRichText(p.label),
      },
    };
  });

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

  // Frame the view on the new content
  setTimeout(() => {
    editor.zoomToFit({ animation: { duration: 400 } });
  }, 50);
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

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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
            label: "Nouvelle idée",
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
    <div className="h-full w-full relative">
      <Tldraw persistenceKey={PERSIST_KEY} onMount={handleMount} />
    </div>
  );
};

export default TldrawBoard;
