import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Loader2, FileDown, LogOut, RefreshCcw, Image as ImageIcon } from "lucide-react";
import Board, { type BoardData } from "@/components/Board";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import heic2any from "heic2any";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

const normalizeImageFile = async (file: File): Promise<File> => {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  try {
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    const output = Array.isArray(converted) ? converted[0] : converted;
    if (!(output instanceof Blob)) {
      throw new Error("Conversion HEIC impossible");
    }

    const safeName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([output], safeName, { type: "image/jpeg" });
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (msg.includes("ERR_LIBHEIF") || msg.toLowerCase().includes("format not supported")) {
      throw new Error(
        "Ce fichier HEIC n'est pas lisible par le navigateur. Sur iPhone : Réglages > Appareil photo > Formats > « Le plus compatible », ou exporte la photo en JPG/PNG.",
      );
    }
    throw new Error("Impossible de convertir l'image HEIC. Réessaie en JPG ou PNG.");
  }
};

const isLevel = (v: unknown): v is 1 | 2 | 3 => v === 1 || v === 2 || v === 3;

const parseBoardData = (input: unknown): BoardData | null => {
  if (!input || typeof input !== "object") return null;
  const c = input as { nodes?: Array<Record<string, unknown>> };
  if (!Array.isArray(c.nodes)) return null;

  const nodes = c.nodes
    .filter(
      (n) =>
        typeof n.id === "string" &&
        typeof n.label === "string" &&
        isLevel(n.level) &&
        (n.parent === null || typeof n.parent === "string"),
    )
    .map((n) => ({
      id: n.id as string,
      label: n.label as string,
      level: n.level as 1 | 2 | 3,
      parent: (n.parent as string | null) ?? null,
    }));

  if (!nodes.length) return null;

  // Ensure parents reference existing ids
  const ids = new Set(nodes.map((n) => n.id));
  const safe = nodes.map((n) =>
    n.parent && !ids.has(n.parent) ? { ...n, parent: null } : n,
  );

  return { nodes: safe };
};

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
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast.error("Format non supporté. Utilise JPG, PNG ou HEIC.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image trop lourde (max 8 MB).");
      return;
    }
    setProcessing(true);
    setBoard(null);
    try {
      const normalizedFile = await normalizeImageFile(file);
      const dataUrl = await fileToBase64(normalizedFile);
      setPreview(dataUrl);

      const { data, error } = await supabase.functions.invoke("analyze-notes", {
        body: { image: dataUrl },
      });

      if (error) {
        // Surface meaningful errors
        const msg = (error as any)?.message ?? "Erreur d'analyse";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés. Recharge ton workspace.");
         else if (msg.toLowerCase().includes("unsupported image format")) {
           toast.error("Cette image n'est pas encore lisible. Essaie une photo JPG ou PNG.");
         } else toast.error(msg);
        return;
      }

      const parsedBoard = parseBoardData(data);

      if (!parsedBoard) {
        toast.error("L'IA n'a pas renvoyé un diagramme valide. Essaie une photo plus nette.");
        return;
      }

      setBoard(parsedBoard);
      toast.success(`${parsedBoard.nodes.length} nœuds extraits !`);
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
        backgroundColor: "#F5F3FF",
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
    <div className="min-h-screen bg-hero flex flex-col">
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-10">
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
              className={`mt-8 cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition shadow-elegant ${
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-primary/30 bg-gradient-card hover:border-primary/60"
              }`}
            >
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-4 font-medium">Glisse une photo ici, ou clique pour choisir</p>
               <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, HEIC · max 8 MB</p>
              <input
                ref={inputRef}
                type="file"
                 accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
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
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 rounded-full bg-gradient-primary opacity-20 animate-brand-pulse" />
              <div className="absolute inset-3 rounded-full bg-gradient-primary shadow-glow" />
              <div className="absolute inset-0 animate-brand-orbit">
                <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-accent shadow-md" />
              </div>
            </div>
            <h2 className="mt-8 text-2xl font-semibold tracking-tight">L'IA analyse tes notes…</h2>
            <p className="mt-2 text-muted-foreground">
              Détection des idées, formes et connexions. Environ 10–15 secondes.
            </p>
            {preview && (
              <img
                src={preview}
                alt="Aperçu de tes notes"
                className="mx-auto mt-8 max-h-64 rounded-2xl border border-border shadow-elegant"
              />
            )}
          </div>
        )}

        {board && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              {board.nodes.length} nœuds ·{" "}
              {board.nodes.filter((n) => n.level === 2).length} idées principales ·{" "}
              {board.nodes.filter((n) => n.level === 3).length} détails
            </div>
            <div
              ref={boardRef}
              className="h-[calc(100vh-220px)] w-full rounded-2xl border border-border shadow-elegant overflow-hidden"
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
