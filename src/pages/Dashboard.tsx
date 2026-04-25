import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Loader2, FileDown, LogOut, RefreshCcw, Image as ImageIcon, Sparkles, Pencil, FileText, Maximize2, Minimize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import VoiceRecorder from "@/components/VoiceRecorder";
import { type BoardData, type BoardApi } from "@/components/Board";
import TldrawBoard from "@/components/TldrawBoard";
import SuggestionsPanel, {
  type Insights,
  type Suggestion,
} from "@/components/SuggestionsPanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
  const [authChecked, setAuthChecked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardApiRef = useRef<BoardApi | null>(null);

  const refreshSuggestions = useCallback(async () => {
    const api = boardApiRef.current;
    if (!api) return;
    const current = api.getBoardData();
    if (!current.nodes.length) return;
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("board-suggest", {
        body: { board: current },
      });
      if (error) {
        const msg = (error as any)?.message ?? "Erreur de suggestions";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés.");
        else toast.error(msg);
        return;
      }
      setInsights({
        summary: typeof (data as any)?.summary === "string" ? (data as any).summary : "",
        warning:
          typeof (data as any)?.warning === "string" && (data as any).warning.length
            ? (data as any).warning
            : null,
        suggestions: Array.isArray((data as any)?.suggestions)
          ? ((data as any).suggestions as any[]).map((s) => ({
              id: String(s.id),
              category: s.category,
              label: String(s.label),
              why: typeof s.why === "string" ? s.why : "",
              level: s.level === 2 ? 2 : 3,
              parentHint: s.parent_id ?? null,
            }))
          : [],
      });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const autoImprove = useCallback(async () => {
    const api = boardApiRef.current;
    if (!api) return;
    const current = api.getBoardData();
    if (!current.nodes.length) return;
    setImproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("board-improve", {
        body: { board: current },
      });
      if (error) {
        const msg = (error as any)?.message ?? "Erreur Auto-améliorer";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés.");
        else toast.error(msg);
        return;
      }
      const nodes = (data as any)?.nodes;
      if (!Array.isArray(nodes) || !nodes.length) {
        toast.error("L'IA n'a pas pu restructurer le board.");
        return;
      }
      api.replaceBoard({ nodes });
      setBoard({ nodes });
      toast.success("Board restructuré par l'IA");
      // refresh suggestions on the new board
      setTimeout(() => refreshSuggestions(), 200);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    } finally {
      setImproving(false);
    }
  }, [refreshSuggestions]);

  const acceptSuggestion = useCallback((s: Suggestion) => {
    boardApiRef.current?.addSuggestionNode({
      label: s.label,
      level: s.level,
      shape: s.shape,
      parentHint: s.parentHint ?? null,
    });
    setInsights((prev) =>
      prev
        ? { ...prev, suggestions: prev.suggestions.filter((x) => x.id !== s.id) }
        : prev,
    );
    // Re-run hierarchical layout so the new node lands cleanly under its parent
    setTimeout(() => boardApiRef.current?.relayout(), 50);
    toast.success("Ajouté au board");
  }, []);

  const rejectSuggestion = useCallback((id: string) => {
    setInsights((prev) =>
      prev ? { ...prev, suggestions: prev.suggestions.filter((x) => x.id !== id) } : prev,
    );
  }, []);

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

  const runAnalysis = useCallback(async (payload: { image?: string; text?: string; pdf?: string }) => {
    setProcessing(true);
    setBoard(null);
    setInsights(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-notes", {
        body: payload,
      });

      if (error) {
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
        toast.error("L'IA n'a pas renvoyé un diagramme valide. Essaie un contenu plus clair.");
        return;
      }

      setBoard(parsedBoard);
      setInsights(null);
      toast.success(`${parsedBoard.nodes.length} nœuds extraits !`);
      setTimeout(() => refreshSuggestions(), 400);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    } finally {
      setProcessing(false);
    }
  }, [refreshSuggestions]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast.error("Format non supporté. Utilise JPG, PNG ou HEIC.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image trop lourde (max 25 MB).");
      return;
    }
    try {
      const normalizedFile = await normalizeImageFile(file);
      const dataUrl = await fileToBase64(normalizedFile);
      setPreview(dataUrl);
      await runAnalysis({ image: dataUrl });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    }
  }, [runAnalysis]);

  const handlePdfFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Format non supporté. Choisis un fichier PDF.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("PDF trop lourd (max 25 MB).");
      return;
    }
    try {
      setPreview(null);
      const dataUrl = await fileToBase64(file);
      await runAnalysis({ pdf: dataUrl });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    }
  }, [runAnalysis]);

  const handleTextSubmit = useCallback(async () => {
    const value = textInput.trim();
    if (!value) {
      toast.error("Écris un peu de texte d'abord.");
      return;
    }
    setTextDialogOpen(false);
    setPreview(null);
    await runAnalysis({ text: value });
    setTextInput("");
  }, [runAnalysis, textInput]);

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
    setInsights(null);
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
        <div className="container flex items-center justify-between py-3 sm:py-4 gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-gradient-primary shadow-glow" />
            <span className="font-semibold tracking-tight">gribouille</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {board && (
              <>
                <Button variant="outline" size="sm" onClick={reset} className="px-2 sm:px-3">
                  <RefreshCcw className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Nouvelle photo</span>
                </Button>
                <Button size="sm" onClick={exportPDF} className="bg-gradient-primary shadow-glow hover:opacity-90 px-2 sm:px-3">
                  <FileDown className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exporter PDF</span>
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-4 sm:py-8">
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
               <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, HEIC · max 25 MB</p>
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

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTextDialogOpen(true)}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-card p-4 text-left shadow-elegant transition hover:border-primary/60"
              >
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-glow">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">✏️ Écrire un texte</p>
                  <p className="text-xs text-muted-foreground">Colle ou tape ton contenu</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-card p-4 text-left shadow-elegant transition hover:border-primary/60"
              >
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-glow">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">📄 Choisir un document</p>
                  <p className="text-xs text-muted-foreground">PDF · max 25 MB</p>
                </div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePdfFile(f);
                    e.target.value = "";
                  }}
                />
              </button>
            </div>
          </div>
        )}

        <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Écrire un texte</DialogTitle>
              <DialogDescription>
                Colle ou tape ton contenu. L'IA en fera un board hiérarchique.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Tape ou colle ton texte ici…"
              className="min-h-[220px]"
            />
            <div className="flex justify-end">
              <Button onClick={handleTextSubmit} className="bg-gradient-primary shadow-glow hover:opacity-90">
                Transformer en board →
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {board.nodes.length} nœuds ·{" "}
                {board.nodes.filter((n) => n.level === 2).length} idées ·{" "}
                {board.nodes.filter((n) => n.level === 3).length} détails
              </span>
            </div>
            <div
              className={
                panelFullscreen && !isMobile
                  ? "fixed inset-0 z-40 flex w-full gap-0 bg-background"
                  : "relative flex h-[calc(100vh-180px)] sm:h-[calc(100vh-220px)] w-full gap-4"
              }
            >
              <div
                ref={boardRef}
                className={
                  panelFullscreen && !isMobile
                    ? "relative flex-1 min-w-0 overflow-hidden"
                    : "relative flex-1 min-w-0 rounded-2xl border border-border shadow-elegant overflow-hidden"
                }
              >
                <TldrawBoard data={board} apiRef={boardApiRef} />

                {/* Bouton agrandir / réduire — ancré dans le board, en haut à droite */}
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setPanelFullscreen((v) => !v)}
                    className="absolute top-3 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-background/95 backdrop-blur border border-border shadow-md hover:bg-accent transition"
                    aria-label={panelFullscreen ? "Réduire le board" : "Agrandir le board"}
                    title={panelFullscreen ? "Réduire le board" : "Agrandir le board"}
                  >
                    {panelFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>

              {/* Desktop : panneau latéral (mode normal) */}
              {!isMobile && !panelFullscreen && (
                <SuggestionsPanel
                  insights={insights}
                  loading={suggestionsLoading}
                  improving={improving}
                  onAccept={acceptSuggestion}
                  onReject={rejectSuggestion}
                  onRefresh={refreshSuggestions}
                  onAutoImprove={autoImprove}
                />
              )}

              {/* Desktop : agent en bulle quand le board est en plein écran */}
              {!isMobile && panelFullscreen && (
                <Sheet open={bubbleOpen} onOpenChange={setBubbleOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="absolute bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-white shadow-glow transition hover:scale-105 active:scale-95"
                      aria-label="Ouvrir l'agent IA"
                    >
                      <Sparkles className="h-6 w-6" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-md p-0">
                    <div className="h-full pt-2">
                      <SuggestionsPanel
                        insights={insights}
                        loading={suggestionsLoading}
                        improving={improving}
                        onAccept={acceptSuggestion}
                        onReject={rejectSuggestion}
                        onRefresh={refreshSuggestions}
                        onAutoImprove={autoImprove}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              )}

              {/* Mobile : bouton flottant + bottom sheet */}
              {isMobile && (
                <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-primary text-white shadow-glow transition active:scale-95"
                      aria-label="Ouvrir l'agent IA"
                    >
                      <Sparkles className="h-5 w-5" />
                    </button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[85vh] p-0 rounded-t-2xl">
                    <div className="h-full pt-2">
                      <SuggestionsPanel
                        insights={insights}
                        loading={suggestionsLoading}
                        improving={improving}
                        onAccept={acceptSuggestion}
                        onReject={rejectSuggestion}
                        onRefresh={refreshSuggestions}
                        onAutoImprove={autoImprove}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
