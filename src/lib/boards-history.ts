import { supabase } from "@/integrations/supabase/client";
import type { BoardData } from "@/components/Board";

export type BoardMethod = "photo" | "voice" | "text" | "pdf" | "manual";

export type BoardRow = {
  id: string;
  user_id: string;
  title: string;
  data: BoardData;
  edges: any[];
  method: BoardMethod;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
};

export type BoardVersionRow = {
  id: string;
  board_id: string;
  user_id: string;
  data: BoardData;
  edges: any[];
  thumbnail: string | null;
  created_at: string;
};

/** Auto-generate a title from the root node when none was set. */
export const titleFromBoard = (data: BoardData): string => {
  if (!data?.nodes?.length) return "Sans titre";
  const root = data.nodes.find((n) => n.level === 1) ?? data.nodes[0];
  const t = (root?.label || "").trim();
  return t ? t.slice(0, 80) : "Sans titre";
};

const requireUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
};

/**
 * Insert a brand-new board.
 */
export const createBoard = async (params: {
  data: BoardData;
  edges?: any[];
  method: BoardMethod;
  title?: string;
  thumbnail?: string | null;
}): Promise<BoardRow> => {
  const user_id = await requireUserId();
  const title = params.title?.trim() || titleFromBoard(params.data);
  const { data, error } = await supabase
    .from("boards")
    .insert({
      user_id,
      title,
      data: params.data as any,
      edges: (params.edges ?? []) as any,
      method: params.method,
      thumbnail: params.thumbnail ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BoardRow;
};

/**
 * Update an existing board (auto-save). Snapshots a version first when forceVersion=true.
 */
export const updateBoard = async (params: {
  id: string;
  data: BoardData;
  edges?: any[];
  title?: string;
  thumbnail?: string | null;
  snapshotVersion?: boolean;
}): Promise<void> => {
  const user_id = await requireUserId();

  // Optionally snapshot the current state as a version BEFORE overwriting.
  if (params.snapshotVersion) {
    const { data: current } = await supabase
      .from("boards")
      .select("data, edges, thumbnail")
      .eq("id", params.id)
      .maybeSingle();
    if (current) {
      await supabase.from("board_versions").insert({
        board_id: params.id,
        user_id,
        data: current.data as any,
        edges: (current.edges ?? []) as any,
        thumbnail: current.thumbnail ?? null,
      });
    }
  }

  const patch: {
    data: any;
    edges: any;
    title?: string;
    thumbnail?: string | null;
  } = {
    data: params.data as any,
    edges: (params.edges ?? []) as any,
  };
  if (params.title !== undefined) patch.title = params.title || titleFromBoard(params.data);
  if (params.thumbnail !== undefined) patch.thumbnail = params.thumbnail;

  const { error } = await supabase.from("boards").update(patch).eq("id", params.id);
  if (error) throw error;
};

export const listBoards = async (): Promise<BoardRow[]> => {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BoardRow[];
};

export const getBoard = async (id: string): Promise<BoardRow | null> => {
  const { data, error } = await supabase.from("boards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as BoardRow) ?? null;
};

export const deleteBoard = async (id: string): Promise<void> => {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
};

export const duplicateBoard = async (id: string): Promise<BoardRow> => {
  const src = await getBoard(id);
  if (!src) throw new Error("Board introuvable");
  return createBoard({
    data: src.data,
    edges: src.edges,
    method: src.method,
    title: `${src.title} (copie)`,
    thumbnail: src.thumbnail,
  });
};

export const listVersions = async (boardId: string): Promise<BoardVersionRow[]> => {
  const { data, error } = await supabase
    .from("board_versions")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BoardVersionRow[];
};
