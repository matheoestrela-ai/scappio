import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  FileDown,
  Image as ImageIcon,
  Sparkles,
  Pencil,
  FileText,
  Maximize2,
  Minimize2,
  Share2,
  
  Lightbulb,
  ClipboardList,
  Rocket,
  Target,
} from "lucide-react";

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
import {
  createBoard,
  getBoard,
  updateBoard,
  titleFromBoard,
  type BoardMethod,
} from "@/lib/boards-history";
import ChatSidebar, { SidebarToggleButton } from "@/components/ChatSidebar";
import ChatComposer from "@/components/ChatComposer";
import ScreenRecorder from "@/components/ScreenRecorder";

const MAX_SIZE = 25 * 1024 * 1024;

const normalizeImageFile = async (file: File): Promise<File> => {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const output = Array.isArray(converted) ? converted[0] : converted;
    if (!(output instanceof Blob)) throw new Error("Conversion HEIC impossible");
    const safeName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([output], safeName, { type: "image/jpeg" });
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "");
    if (msg.includes("ERR_LIBHEIF") || msg.toLowerCase().includes("format not supported")) {
      throw new Error(
        "Ce fichier HEIC n'est pas lisible. Sur iPhone : Réglages > Appareil photo > Formats > « Le plus compatible », ou exporte en JPG/PNG.",
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
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes: nodes.map((n) => (n.parent && !ids.has(n.parent) ? { ...n, parent: null } : n)) };
};

const QUICK_SUGGESTIONS = [
  { icon: Lightbulb, label: "Une idée de vidéo", text: "J'ai une idée de vidéo : " },
  { icon: ClipboardList, label: "Mes notes de réunion", text: "Voici mes notes de réunion : " },
  { icon: Rocket, label: "Mon plan de lancement", text: "Voici mon plan de lancement : " },
  { icon: Target, label: "Ma stratégie de contenu", text: "Ma stratégie de contenu : " },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [authChecked, setAuthChecked] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [composerPrefill, setComposerPrefill] = useState(0);

  const boardRef = useRef<HTMLDivElement>(null);
  const boardApiRef = useRef<BoardApi | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [creationMethod, setCreationMethod] = useState<BoardMethod>("manual");
  const lastSerializedRef = useRef<string>("");
  const lastVersionAtRef = useRef<number>(0);
  const debounceRef = useRef<number | null>(null);
  const periodicRef = useRef<number | null>(null);
  const watcherRef = useRef<number | null>(null);

  const refreshSuggestions = useCallback(async () => {
    const api = boardApiRef.current;
    if (!api) return;
    const current = api.getBoardData();
    if (!current.nodes.length) return;
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("board-suggest", { body: { board: current } });
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
      const { data, error } = await supabase.functions.invoke("board-improve", { body: { board: current } });
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
      prev ? { ...prev, suggestions: prev.suggestions.filter((x) => x.id !== s.id) } : prev,
    );
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

  const generateThumbnail = useCallback(async (): Promise<string | null> => {
    if (!boardRef.current) return null;
    try {
      const url = await toPng(boardRef.current, { cacheBust: true, backgroundColor: "#ffffff", pixelRatio: 0.5 });
      return url;
    } catch {
      return null;
    }
  }, []);

  const saveNow = useCallback(async (snapshotVersion = false) => {
    const id = currentBoardId;
    const api = boardApiRef.current;
    if (!id || !api) return;
    const data = api.getBoardData();
    const serialized = JSON.stringify(data);
    if (serialized === lastSerializedRef.current && !snapshotVersion) return;
    try {
      const thumbnail = await generateThumbnail();
      await updateBoard({ id, data, title: titleFromBoard(data), thumbnail, snapshotVersion });
      lastSerializedRef.current = serialized;
      if (snapshotVersion) lastVersionAtRef.current = Date.now();
      setSidebarRefreshKey((k) => k + 1);
    } catch (e: any) {
      console.warn("Auto-save échouée:", e?.message);
    }
  }, [currentBoardId, generateThumbnail]);

  // Load board from URL
  useEffect(() => {
    const id = searchParams.get("board");
    if (!id || id === currentBoardId || !authChecked) return;
    (async () => {
      try {
        const row = await getBoard(id);
        if (!row) {
          toast.error("Tableau introuvable");
          setSearchParams({}, { replace: true });
          return;
        }
        setBoard(row.data);
        setUserMessage(row.title);
        setCurrentBoardId(row.id);
        setCreationMethod(row.method);
        setInsights(null);
        lastSerializedRef.current = JSON.stringify(row.data);
      } catch {
        toast.error("Impossible d'ouvrir ce tableau");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authChecked]);

  // Auto-save watchers
  useEffect(() => {
    if (!currentBoardId || !board) return;
    watcherRef.current = window.setInterval(() => {
      const api = boardApiRef.current;
      if (!api) return;
      const serialized = JSON.stringify(api.getBoardData());
      if (serialized !== lastSerializedRef.current) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          const snap = Date.now() - lastVersionAtRef.current > 5 * 60 * 1000;
          saveNow(snap);
        }, 3000);
      }
    }, 1000);
    periodicRef.current = window.setInterval(() => saveNow(false), 30000);
    return () => {
      if (watcherRef.current) clearInterval(watcherRef.current);
      if (periodicRef.current) clearInterval(periodicRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentBoardId, board, saveNow]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const runAnalysis = useCallback(async (
    payload: { image?: string; text?: string; pdf?: string },
    method: BoardMethod,
    displayMessage: string,
  ) => {
    setProcessing(true);
    setBoard(null);
    setInsights(null);
    setCurrentBoardId(null);
    setUserMessage(displayMessage);
    lastSerializedRef.current = "";
    try {
      const { data, error } = await supabase.functions.invoke("analyze-notes", { body: payload });
      if (error) {
        const msg = (error as any)?.message ?? "Erreur d'analyse";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés.");
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
      setCreationMethod(method);
      try {
        const created = await createBoard({ data: parsedBoard, method, title: titleFromBoard(parsedBoard) });
        setCurrentBoardId(created.id);
        lastSerializedRef.current = JSON.stringify(parsedBoard);
        setSearchParams({ board: created.id }, { replace: true });
        setSidebarRefreshKey((k) => k + 1);
      } catch (e: any) {
        console.warn("Auto-save initial échouée:", e?.message);
      }
      toast.success(`${parsedBoard.nodes.length} nœuds extraits !`);
      setTimeout(() => refreshSuggestions(), 400);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    } finally {
      setProcessing(false);
    }
  }, [refreshSuggestions, setSearchParams]);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast.error("Format non supporté. Utilise JPG, PNG ou HEIC.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image trop lourde (max 25 MB).");
      return;
    }
    try {
      const normalized = await normalizeImageFile(file);
      const dataUrl = await fileToBase64(normalized);
      await runAnalysis({ image: dataUrl }, "photo", `📸 Photo : ${file.name}`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    }
  }, [runAnalysis]);

  const handlePdfFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Format non supporté. Choisis un PDF.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("PDF trop lourd (max 25 MB).");
      return;
    }
    try {
      const dataUrl = await fileToBase64(file);
      await runAnalysis({ pdf: dataUrl }, "pdf", `📄 PDF : ${file.name}`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
    }
  }, [runAnalysis]);

  const handleTextSend = useCallback(async (text: string) => {
    await runAnalysis({ text }, "text", text);
  }, [runAnalysis]);

  const handleVoiceRecorded = useCallback(async (audioDataUrl: string) => {
    setProcessing(true);
    setBoard(null);
    setInsights(null);
    setUserMessage("🎙️ Message vocal en cours de transcription…");
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-audio", { body: { audio: audioDataUrl } });
      if (error) {
        const msg = (error as any)?.message ?? "Erreur de transcription";
        if (msg.includes("429")) toast.error("Trop de requêtes, réessaie dans un instant.");
        else if (msg.includes("402")) toast.error("Crédits IA épuisés.");
        else toast.error(msg);
        setProcessing(false);
        return;
      }
      const transcript = (data as any)?.transcript;
      if (typeof transcript !== "string" || !transcript.trim()) {
        toast.error("Aucun texte détecté dans l'audio.");
        setProcessing(false);
        return;
      }
      toast.success("Transcription terminée, analyse…");
      await runAnalysis({ text: transcript }, "voice", `🎙️ ${transcript}`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur inattendue");
      setProcessing(false);
    }
  }, [runAnalysis]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) handlePdfFile(f);
    else handleImageFile(f);
  };

  const exportPDF = async () => {
    if (!boardRef.current) return;
    toast.info("Génération du PDF…");
    try {
      const dataUrl = await toPng(boardRef.current, { backgroundColor: "#F5F3FF", pixelRatio: 2 });
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1600, 1000] });
      pdf.addImage(dataUrl, "PNG", 0, 0, 1600, 1000);
      pdf.save("scappio-board.pdf");
      toast.success("PDF exporté !");
    } catch (e: any) {
      toast.error("Erreur d'export: " + e.message);
    }
  };

  const handleNewBoard = () => {
    setBoard(null);
    setInsights(null);
    setUserMessage(null);
    setCurrentBoardId(null);
    lastSerializedRef.current = "";
    if (searchParams.get("board")) setSearchParams({}, { replace: true });
  };

  const handleSelectBoard = (id: string) => {
    setSearchParams({ board: id }, { replace: true });
  };

  const handleQuickSuggestion = (text: string) => {
    handleTextSend(text);
  };

  const handleShare = async () => {
    if (!currentBoardId) return;
    const url = `${window.location.origin}/dashboard?board=${currentBoardId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié !");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#FAFAF8" }}>
      <ScreenRecorder />
      <ChatSidebar
        currentBoardId={currentBoardId}
        onNewBoard={handleNewBoard}
        onSelectBoard={handleSelectBoard}
        refreshKey={sidebarRefreshKey}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />

      {/* Main chat area */}
      <main
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => {
          // only deactivate when truly leaving the main area
          if (e.currentTarget === e.target) setDragActive(false);
        }}
        onDrop={onDrop}
      >
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-3 py-2 border-b border-border/60 bg-[#FAFAF8]/90 backdrop-blur">
          <SidebarToggleButton onClick={() => setSidebarOpen(true)} />
          <span className="font-bold text-sm"><span className="text-primary">scapp</span>io</span>
          <div className="w-9" />
        </div>

        {/* Drag overlay */}
        {dragActive && (
          <div className="absolute inset-0 z-30 m-4 rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <p className="text-lg font-semibold text-primary">Dépose ici</p>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {!board && !processing ? (
            <WelcomeScreen onSuggestion={handleQuickSuggestion} />
          ) : (
            <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-4">
              {/* User message bubble */}
              {userMessage && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-sm">
                    {userMessage}
                  </div>
                </div>
              )}

              {processing && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-primary text-white flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    L'IA structure ton board…
                  </div>
                </div>
              )}

              {board && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-primary text-white flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {board.nodes.length} nœuds · {board.nodes.filter((n) => n.level === 2).length} idées · {board.nodes.filter((n) => n.level === 3).length} détails
                    </div>

                    <div
                      className={
                        panelFullscreen && !isMobile
                          ? "fixed inset-0 z-40 flex w-full gap-0 bg-background"
                          : "relative flex h-[60vh] sm:h-[65vh] w-full gap-4"
                      }
                    >
                      <div
                        ref={boardRef}
                        className={
                          panelFullscreen && !isMobile
                            ? "relative flex-1 min-w-0 overflow-hidden"
                            : "relative flex-1 min-w-0 rounded-2xl border border-border shadow-elegant overflow-hidden bg-card"
                        }
                      >
                        <TldrawBoard data={board} apiRef={boardApiRef} />
                        {!isMobile && (
                          <button
                            type="button"
                            onClick={() => setPanelFullscreen((v) => !v)}
                            className="absolute top-3 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-background/95 backdrop-blur border border-border shadow-md hover:bg-accent transition"
                            aria-label={panelFullscreen ? "Réduire" : "Agrandir"}
                          >
                            {panelFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                          </button>
                        )}
                      </div>

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

                      {!isMobile && panelFullscreen && (
                        <Sheet open={bubbleOpen} onOpenChange={setBubbleOpen}>
                          <SheetTrigger asChild>
                            <button
                              type="button"
                              className="absolute bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-white shadow-glow transition hover:scale-105"
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

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => boardApiRef.current?.relayout()}>
                        <Pencil className="h-4 w-4 mr-1.5" /> Éditer
                      </Button>
                      <Button size="sm" variant="outline" onClick={exportPDF}>
                        <FileDown className="h-4 w-4 mr-1.5" /> Exporter PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleShare}>
                        <Share2 className="h-4 w-4 mr-1.5" /> Partager
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer pinned at bottom */}
        <div className="shrink-0 border-t border-border/40 bg-[#FAFAF8]/95 backdrop-blur py-3 sm:py-4 px-2">
          <ChatComposer
            disabled={processing}
            onSendText={handleTextSend}
            onPickImage={handleImageFile}
            onPickPdf={handlePdfFile}
            onVoiceRecorded={handleVoiceRecorded}
          />
        </div>
      </main>
    </div>
  );
};

const WelcomeScreen = ({ onSuggestion }: { onSuggestion: (t: string) => void }) => (
  <div className="min-h-full flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-[760px] text-center">
      <div className="inline-flex h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-primary text-white items-center justify-center shadow-glow mb-6">
        <Sparkles className="h-7 w-7 sm:h-8 sm:w-8" />
      </div>
      <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
        Que veux-tu structurer aujourd'hui ?
      </h1>
      <p className="mt-3 text-sm sm:text-base text-muted-foreground">
        Parle, écris, prends une photo ou importe un document
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestion(s.text)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card hover:bg-muted hover:border-primary/40 transition px-4 py-2 text-sm"
          >
            <s.icon className="h-4 w-4 text-primary" />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default Dashboard;
