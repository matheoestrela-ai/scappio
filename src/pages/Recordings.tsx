import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Trash2, Share2, Video as VideoIcon, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteRecording, listRecordings, type Recording } from "@/lib/recordings-db";

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const Recordings = () => {
  const [items, setItems] = useState<Recording[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const recs = await listRecordings();
      setItems(recs);
      if (recs.length && !selectedId) setSelectedId(recs[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) || null,
    [items, selectedId],
  );

  const selectedUrl = useMemo(() => {
    if (!selected) return null;
    return URL.createObjectURL(selected.blob);
  }, [selected]);

  useEffect(() => {
    return () => {
      if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    };
  }, [selectedUrl]);

  const handleDownload = (rec: Recording) => {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
    a.download = `${rec.name.replace(/[^a-z0-9-_ ]/gi, "_")}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleDelete = async (rec: Recording) => {
    if (!confirm(`Supprimer "${rec.name}" ? Cette action est définitive.`)) return;
    await deleteRecording(rec.id);
    if (selectedId === rec.id) setSelectedId(null);
    await refresh();
    toast.success("Enregistrement supprimé");
  };

  const handleShare = async (rec: Recording) => {
    // Browser-only storage → no real public link. Use Web Share API with the file when possible.
    try {
      const file = new File([rec.blob], `${rec.name}.${rec.mimeType.includes("mp4") ? "mp4" : "webm"}`, { type: rec.mimeType });
      // @ts-ignore — canShare with files
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: rec.name });
        return;
      }
    } catch { /* ignore */ }
    handleDownload(rec);
    toast.message("Partage non supporté ici — fichier téléchargé pour partage manuel.");
  };

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-10">
        <div className="container flex items-center justify-between py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" /> Retour
              </Button>
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Mes enregistrements</h1>
          </div>
          <span className="text-xs text-muted-foreground">{items.length} vidéo{items.length > 1 ? "s" : ""}</span>
        </div>
      </header>

      <main className="container py-6 sm:py-8">
        {loading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="mx-auto max-w-md text-center py-20">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <VideoIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-xl font-semibold">Aucun enregistrement</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Passe un tableau en plein écran et clique sur le bouton rouge en haut à droite pour démarrer.
            </p>
            <Link to="/dashboard">
              <Button className="mt-6 bg-gradient-primary shadow-glow hover:opacity-90">
                Aller au tableau
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            {/* Player */}
            <div className="space-y-4">
              {selected && selectedUrl ? (
                <>
                  <div className="rounded-2xl overflow-hidden border border-border bg-black shadow-elegant">
                    <video
                      key={selected.id}
                      src={selectedUrl}
                      controls
                      autoPlay
                      className="w-full aspect-video"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-lg">{selected.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {new Date(selected.createdAt).toLocaleString("fr-FR")} · {formatDuration(selected.duration)} · {formatBytes(selected.size)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleShare(selected)}>
                        <Share2 className="h-4 w-4 mr-2" /> Partager
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(selected)}>
                        <Download className="h-4 w-4 mr-2" /> Télécharger
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(selected)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                  Sélectionne un enregistrement.
                </div>
              )}
            </div>

            {/* List */}
            <div className="space-y-2">
              {items.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => setSelectedId(rec.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    selectedId === rec.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50 bg-card"
                  }`}
                >
                  <div className="relative h-14 w-20 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                    <Play className="h-5 w-5 text-muted-foreground" />
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-mono bg-black/70 text-white px-1 rounded">
                      {formatDuration(rec.duration)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{rec.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(rec.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Recordings;
