import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Trash2, Share2, Loader2, Video, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listRecordings, deleteRecording, type Recording } from "@/lib/recordings-db";
import { supabase } from "@/integrations/supabase/client";

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const Recordings = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listRecordings();
      console.log("[Recordings] loaded", r.length, "items");
      setItems(r);
      if (r[0] && !activeId) selectItem(r[0]);
    } catch (e) {
      console.error("[Recordings] load failed", e);
      toast.error("Could not load recordings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectItem = (r: Recording) => {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    const url = URL.createObjectURL(r.blob);
    setActiveUrl(url);
    setActiveId(r.id);
  };

  const handleDownload = (r: Recording) => {
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    const ext = r.mimeType.includes("mp4") ? "mp4" : "webm";
    a.href = url;
    a.download = `${(r.title || "recording").replace(/\s+/g, "-")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDelete = async (r: Recording) => {
    if (!confirm("Delete this recording?")) return;
    await deleteRecording(r.id);
    if (activeId === r.id) {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      setActiveUrl(null); setActiveId(null);
    }
    toast.success("Deleted");
    refresh();
  };

  const handleShare = async (r: Recording) => {
    try {
      const url = URL.createObjectURL(r.blob);
      if (navigator.share && (navigator as any).canShare?.({ files: [new File([r.blob], "rec.webm", { type: r.blob.type })] })) {
        await navigator.share({ title: r.title, files: [new File([r.blob], "rec.webm", { type: r.blob.type })] });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied (local). Download to share publicly.");
      }
    } catch {
      toast.error("Sharing failed");
    }
  };

  const handlePublicShare = async (r: Recording) => {
    if (sharing) return;
    setSharing(true);
    const t = toast.loading("Création du lien…");
    try {
      const id = crypto.randomUUID();
      const ext = r.mimeType.includes("mp4") ? "mp4" : "webm";
      const path = `${id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("shared-videos")
        .upload(path, r.blob, { contentType: r.blob.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shared-videos").getPublicUrl(path);
      const format = r.format === "9:16" ? "tiktok" : "standard";
      const { error: insErr } = await supabase.from("shared_videos").insert({
        id,
        video_url: pub.publicUrl,
        format,
      });
      if (insErr) throw insErr;
      const link = `https://scappio.fr/v/${id}`;
      await navigator.clipboard.writeText(link);
      toast.dismiss(t);
      toast.success("Lien copié ✓ — Partageable sans compte");
    } catch (e: any) {
      toast.dismiss(t);
      toast.error("Échec du partage : " + (e?.message || e));
    } finally {
      setSharing(false);
    }
  };

  const active = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <header className="sticky top-0 z-10 bg-[#FAFAF8]/90 backdrop-blur border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <h1 className="font-semibold">Mes enregistrements</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Player */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          {active && activeUrl ? (
            <>
              <video src={activeUrl} controls className="w-full max-h-[70vh] object-contain bg-black" />
              <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{active.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {new Date(active.createdAt).toLocaleString()} · {fmtDuration(active.durationSec)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownload(active)}>
                    <Download className="h-4 w-4 mr-1.5" /> Download
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handlePublicShare(active)}
                    disabled={sharing}
                    className="bg-white text-orange-600 border border-orange-500 hover:bg-orange-50"
                  >
                    <Link2 className="h-4 w-4 mr-1.5" />
                    {sharing ? "Création…" : "🔗 Partager la vidéo"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleShare(active)}>
                    <Share2 className="h-4 w-4 mr-1.5" /> Share
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(active)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="aspect-video flex items-center justify-center text-muted-foreground">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex flex-col items-center gap-2"><Video className="h-8 w-8" />No recording yet</span>}
            </div>
          )}
        </section>

        {/* List */}
        <aside className="space-y-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No recordings yet. Record a board to see it here.</p>
          )}
          {items.map((r) => (
            <button
              key={r.id}
              onClick={() => selectItem(r)}
              className={`w-full text-left flex gap-3 p-2 rounded-xl border transition ${
                activeId === r.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="w-24 aspect-video rounded-md overflow-hidden bg-muted shrink-0">
                {r.thumbnail ? <img src={r.thumbnail} className="w-full h-full object-cover" alt="" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDuration(r.durationSec)} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </aside>
      </main>
    </div>
  );
};

export default Recordings;
