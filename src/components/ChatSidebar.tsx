import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PenLine, Trash2, Settings, LogOut, Loader2, Menu, X, History as HistoryIcon, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listBoards, deleteBoard, type BoardRow } from "@/lib/boards-history";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Group = { label: string; boards: BoardRow[] };

const groupBoards = (boards: BoardRow[]): Group[] => {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const sevenDays = today - 7 * 24 * 60 * 60 * 1000;

  const g: Record<string, BoardRow[]> = {
    "Today": [],
    "Yesterday": [],
    "Last 7 days": [],
    "Older": [],
  };
  for (const b of boards) {
    const t = new Date(b.updated_at).getTime();
    if (t >= today) g["Today"].push(b);
    else if (t >= yesterday) g["Yesterday"].push(b);
    else if (t >= sevenDays) g["Last 7 days"].push(b);
    else g["Older"].push(b);
  }
  return Object.entries(g)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, boards: list }));
};

type Props = {
  currentBoardId: string | null;
  onNewBoard: () => void;
  onSelectBoard: (id: string) => void;
  refreshKey?: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

const ChatSidebar = ({ currentBoardId, onNewBoard, onSelectBoard, refreshKey, open, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBoards();
      setBoards(data);
    } catch (e: any) {
      // silent — sidebar shouldn't spam toasts
      console.warn("listBoards", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [refresh, refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this board?")) return;
    try {
      await deleteBoard(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
      if (id === currentBoardId) onNewBoard();
      toast.success("Board deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Unable to delete");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const groups = groupBoards(boards);

  const content = (
    <div className="flex h-full w-full flex-col bg-[#f4f1ec] border-r border-border/60">
      {/* Header */}
      <div className="p-3 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 px-1">
          <span className="font-bold tracking-tight text-base"><span className="text-primary">scapp</span>io</span>
        </Link>
        <button
          className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted/70"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* New board */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            onNewBoard();
            onOpenChange(false);
          }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-medium text-sm h-10 hover:opacity-90 transition shadow-sm"
        >
          <PenLine className="h-4 w-4" />
          New board
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-6 text-center">
            No board yet.<br />Create your first!
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {g.boards.map((b) => {
                  const active = b.id === currentBoardId;
                  return (
                    <li key={b.id}>
                      <button
                        onClick={() => {
                          onSelectBoard(b.id);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "group w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/80 hover:bg-black/5",
                        )}
                      >
                        <span className="truncate flex-1">{b.title || "Untitled"}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleDelete(b.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5 transition">
              <div className="h-8 w-8 rounded-full bg-gradient-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {(email[0] ?? "U").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium truncate">{email || "User"}</p>
              </div>
              <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/history")}>
              <HistoryIcon className="h-4 w-4 mr-2" /> History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop static sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative w-[280px] max-w-[85vw] h-full animate-slide-in-right" style={{ animation: "slide-in-right 0.25s ease-out" }}>
            {content}
          </div>
        </div>
      )}
    </>
  );
};

export const SidebarToggleButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition"
    aria-label="Open menu"
  >
    <Menu className="h-5 w-5" />
  </button>
);

export default ChatSidebar;
