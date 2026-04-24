import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Loader2, FileDown, LogOut, RefreshCcw, Image as ImageIcon } from "lucide-react";
import Board, { type BoardData } from "@/components/Board";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB

const Dashboard = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth", { replace: true });
      else setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Format non supporté. Utilise JPG ou PNG.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image trop lourde (max 8 MB).");
      return;
    }
    setProcessing(true);
    setBoard(null);
    try {
      const dataUrl = await fileToBase64(file);
      setPreview(dataUrl);

      const { data, error } = await supabase.functions.invoke("analyze-notes", {
        body: { image: dataUrl },
      });

      if (error) {
        // Surface meaningful errors
        const msg = (error as any)?.message ?? "Erreur d'analyse";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés. Recharge ton workspace.");
        else toast.error(msg);
        return;
      }

      if (!data?.ideas || data.ideas.length === 0) {
        toast.error("L'IA n'a pas réussi à extraire d'idées. Essaie une photo plus nette.");
        return;
      }

      setBoard(data as BoardData);
      toast.success(`${data.ideas.length} idées extraites !`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    } finally {
      setProcessing(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const exportPDF = async () => {
    if (!boardRef.current) return;
    toast.info("Génération du PDF…");
    try {
      const dataUrl = await toPng(boardRef.current, {
        backgroundColor: "#0d0d12",
        pixelRatio: 2,
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1600, 1000] });
      pdf.addImage(dataUrl, "PNG", 0, 0, 1600, 1000);
      pdf.save("gribouille-board.pdf");
      toast.success("PDF exporté !");
    } catch (e: any) {
      toast.error("Erreur d'export: " + e.message);
    }
  };

  const reset = () => {
    setBoard(null);
    setPreview(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-primary shadow-glow" />
            <span className="font-semibold tracking-tight">gribouille</span>
          </Link>
          <div className="flex items-center gap-2">
            {board && (
              <>
                <Button variant="outline" size="sm" onClick={reset}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Nouvelle photo
                </Button>
                <Button size="sm" onClick={exportPDF} className="bg-gradient-primary shadow-glow hover:opacity-90">
                  <FileDown className="mr-2 h-4 w-4" /> Exporter PDF
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        {!board && !processing && (
          <div className="mx-auto max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight">Upload tes notes</h1>
            <p className="mt-2 text-muted-foreground">
              Une photo nette de tes notes manuscrites. JPG ou PNG, max 8 MB.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`mt-8 cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition ${
                dragActive ? "border-primary bg-primary/5" : "border-border bg-gradient-card"
              }`}
            >
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-4 font-medium">Glisse une photo ici, ou clique pour choisir</p>
              <p className="mt-1 text-sm text-muted-foreground">JPG, PNG · max 8 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </div>
        )}

        {processing && (
          <div className="mx-auto max-w-2xl text-center py-20">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h2 className="mt-6 text-2xl font-semibold">L'IA analyse tes notes…</h2>
            <p className="mt-2 text-muted-foreground">
              Détection des idées, priorités et connexions. Environ 10–15 secondes.
            </p>
            {preview && (
              <img
                src={preview}
                alt="Aperçu de tes notes"
                className="mx-auto mt-8 max-h-64 rounded-lg border border-border"
              />
            )}
          </div>
        )}

        {board && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              {board.ideas.length} idées · {board.connections.length} connexions
            </div>
            <div
              ref={boardRef}
              className="h-[calc(100vh-220px)] w-full rounded-2xl border border-border bg-background overflow-hidden"
            >
              <Board data={board} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
