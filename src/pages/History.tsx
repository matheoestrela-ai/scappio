import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Image as ImageIcon,
  Mic,
  Pencil,
  FileText,
  PenLine,
  Edit,
  Copy,
  FileDown,
  Trash2,
  Clock,
  Sparkles,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  deleteBoard,
  duplicateBoard,
  listBoards,
  listVersions,
  updateBoard,
  type BoardMethod,
  type BoardRow,
  type BoardVersionRow,
} from "@/lib/boards-history";

const METHOD_META: Record<
  BoardMethod,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  photo: { label: "Photo", icon: ImageIcon },
  voice: { label: "Voice", icon: Mic },
  text: { label: "Text", icon: Pencil },
  pdf: { label: "PDF", icon: FileText },
  manual: { label: "Manual", icon: PenLine },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const nodeCount = (b: BoardRow) =>
  Array.isArray(b.data?.nodes) ? b.data.nodes.length : 0;

const History = () => {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [versionsFor, setVersionsFor] = useState<BoardRow | null>(null);
  const [versions, setVersions] = useState<BoardVersionRow[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      setBoards(await listBoards());
    } catch (e: any) {
      toast.error(e.message ?? "Unable to load boards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => {
      if (b.title.toLowerCase().includes(q)) return true;
      return b.data?.nodes?.some((n) => n.label?.toLowerCase().includes(q));
    });
  }, [boards, query]);

  const openBoard = (id: string) => navigate(`/dashboard?board=${id}`);

  const handleDuplicate = async (b: BoardRow) => {
    try {
      await duplicateBoard(b.id);
      toast.success("Copy created");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Error while duplicating");
    }
  };

  const handleDelete = async (b: BoardRow) => {
    if (!confirm(`Delete "${b.title}"? This action is permanent.`)) return;
    try {
      await deleteBoard(b.id);
      toast.success("Board deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Error while deleting");
    }
  };

  const handleExportPdf = async (b: BoardRow) => {
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
      if (b.thumbnail) {
        const img = new Image();
        img.src = b.thumbnail;
        await new Promise((r) => (img.onload = r));
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pw / img.width, ph / img.height);
        pdf.addImage(b.thumbnail, "PNG", 20, 20, img.width * ratio - 40, img.height * ratio - 40);
      } else {
        pdf.text(b.title, 40, 60);
      }
      pdf.save(`${b.title.replace(/[^a-z0-9-_ ]/gi, "_")}.pdf`);
      toast.success("PDF exported");
    } catch (e: any) {
      toast.error("Export error");
    }
  };

  const openVersions = async (b: BoardRow) => {
    setVersionsFor(b);
    try {
      setVersions(await listVersions(b.id));
    } catch (e: any) {
      toast.error("Unable to load versions");
    }
  };

  const restoreVersion = async (v: BoardVersionRow) => {
    if (!versionsFor) return;
    try {
      await updateBoard({
        id: versionsFor.id,
        data: v.data,
        edges: v.edges,
        thumbnail: v.thumbnail ?? null,
        snapshotVersion: true, // back up current before restore
      });
      toast.success("Version restored");
      setVersionsFor(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Restore failed");
    }
  };

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-10">
        <div className="container flex items-center justify-between py-3 sm:py-4 gap-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">History</h1>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search a board…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-8">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : boards.length === 0 ? (
          <EmptyState onPick={(method) => navigate(`/dashboard?new=${method}`)} />
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No board matches "{query}".
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((b) => {
              const Meta = METHOD_META[b.method] ?? METHOD_META.manual;
              const Icon = Meta.icon;
              return (
                <div
                  key={b.id}
                  className="group relative rounded-2xl border border-border bg-card shadow-elegant overflow-hidden transition hover:border-primary/60 hover:shadow-lg"
                >
                  <button
                    onClick={() => openBoard(b.id)}
                    className="block w-full aspect-video bg-muted overflow-hidden"
                    aria-label={`Open ${b.title}`}
                  >
                    {b.thumbnail ? (
                      <img
                        src={b.thumbnail}
                        alt={b.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Sparkles className="h-8 w-8 opacity-40" />
                      </div>
                    )}
                  </button>

                  <div className="p-3">
                    <p className="font-medium truncate">{b.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      <span>{Meta.label}</span>
                      <span>·</span>
                      <span>{nodeCount(b)} nodes</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(b.updated_at)}
                    </p>
                  </div>

                  {/* Hover actions */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100">
                    <ActionBtn title="Versions" onClick={() => openVersions(b)}>
                      <Clock className="h-3.5 w-3.5" />
                    </ActionBtn>
                    <ActionBtn title="Edit" onClick={() => openBoard(b.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </ActionBtn>
                    <ActionBtn title="Duplicate" onClick={() => handleDuplicate(b)}>
                      <Copy className="h-3.5 w-3.5" />
                    </ActionBtn>
                    <ActionBtn title="Export PDF" onClick={() => handleExportPdf(b)}>
                      <FileDown className="h-3.5 w-3.5" />
                    </ActionBtn>
                    <ActionBtn
                      title="Delete"
                      onClick={() => handleDelete(b)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ActionBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Versions modal */}
      <Dialog open={!!versionsFor} onOpenChange={(o) => !o && setVersionsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Versions of "{versionsFor?.title}"</DialogTitle>
            <DialogDescription>
              The last 10 versions are kept. The current version is saved before restoring.
            </DialogDescription>
          </DialogHeader>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No earlier versions for this board.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => restoreVersion(v)}
                  className="rounded-xl border border-border overflow-hidden hover:border-primary/60 transition text-left"
                >
                  <div className="aspect-video bg-muted overflow-hidden">
                    {v.thumbnail ? (
                      <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Sparkles className="h-6 w-6 opacity-40" />
                      </div>
                    )}
                  </div>
                  <p className="px-2 py-1.5 text-xs">{formatDate(v.created_at)}</p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ActionBtn = ({
  children,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/95 backdrop-blur border border-border shadow-sm hover:bg-accent transition ${className}`}
  >
    {children}
  </button>
);

const EmptyState = ({ onPick }: { onPick: (m: "photo" | "voice" | "text") => void }) => (
  <div className="mx-auto max-w-md text-center py-16">
    <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow">
      <Plus className="h-7 w-7" />
    </div>
    <h2 className="mt-5 text-2xl font-semibold tracking-tight">No board yet</h2>
    <p className="mt-2 text-muted-foreground">create your first board</p>
    <div className="mt-6 grid grid-cols-3 gap-3">
      <Button variant="outline" onClick={() => onPick("photo")}>
        <ImageIcon className="h-4 w-4 mr-2" /> Photo
      </Button>
      <Button variant="outline" onClick={() => onPick("voice")}>
        <Mic className="h-4 w-4 mr-2" /> Voice
      </Button>
      <Button variant="outline" onClick={() => onPick("text")}>
        <Pencil className="h-4 w-4 mr-2" /> Text
      </Button>
    </div>
  </div>
);

export default History;
