import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";
import { saveRecording, type Recording } from "@/lib/recordings-db";

type Corner = "tl" | "tr" | "bl" | "br";

const CAM_SIZE = 140;
const CAM_PAD = 16;

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const cornerStyle = (corner: Corner): React.CSSProperties => {
  const s: React.CSSProperties = { position: "absolute", width: CAM_SIZE, height: CAM_SIZE };
  if (corner === "tl") return { ...s, top: CAM_PAD, left: CAM_PAD };
  if (corner === "tr") return { ...s, top: CAM_PAD, right: CAM_PAD };
  if (corner === "bl") return { ...s, bottom: CAM_PAD, left: CAM_PAD };
  return { ...s, bottom: CAM_PAD, right: CAM_PAD };
};

type Props = {
  /** Wrapper that contains the board (used to find the tldraw canvas + position the bubble). */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Optional name for the recording. */
  boardName?: string;
};

const BoardRecorder = ({ containerRef, boardName }: Props) => {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corner, setCorner] = useState<Corner>("br");
  const [hasCamera, setHasCamera] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null); // hidden video used by compositor
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const snapIntervalRef = useRef<number | null>(null);
  const stoppedRef = useRef<(() => void) | null>(null);
  const cornerRef = useRef<Corner>("br");
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    cornerRef.current = corner;
  }, [corner]);

  const stopAllStreams = () => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    micStreamRef.current = null;
  };

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    stopAllStreams();
    setPreviewActive(false);
    setHasCamera(false);
  };

  useEffect(() => () => cleanup(), []);

  const findBoardElement = (): HTMLElement | null => {
    const root = containerRef.current;
    if (!root) return null;
    // Prefer the tldraw root for cleaner snapshots
    return (root.querySelector(".tl-container") as HTMLElement) || root;
  };

  const startRecording = useCallback(async () => {
    if (!("MediaRecorder" in window)) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement vidéo.");
      return;
    }

    const boardEl = findBoardElement();
    if (!boardEl) {
      toast.error("Impossible de trouver le tableau.");
      return;
    }

    // Try to get camera + mic. Fall back gracefully if denied.
    let camStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: "user" },
        audio: false,
      });
    } catch {
      toast.warning("Caméra refusée — enregistrement du tableau sans bulle vidéo.");
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro refusé — enregistrement sans audio.");
    }

    camStreamRef.current = camStream;
    micStreamRef.current = micStream;

    // Wire camera preview (visible bubble) AND a hidden video for the compositor.
    if (camStream) {
      setHasCamera(true);
      setPreviewActive(true);
      requestAnimationFrame(() => {
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = camStream;
          previewVideoRef.current.play().catch(() => {});
        }
      });
      const hidden = document.createElement("video");
      hidden.srcObject = camStream;
      hidden.muted = true;
      hidden.playsInline = true;
      await hidden.play().catch(() => {});
      camVideoRef.current = hidden;
    }

    // Compositor canvas — match the displayed board size.
    const rect = boardEl.getBoundingClientRect();
    const w = Math.max(640, Math.round(rect.width));
    const h = Math.max(360, Math.round(rect.height));
    const composite = document.createElement("canvas");
    composite.width = w;
    composite.height = h;
    compositeCanvasRef.current = composite;
    const ctx = composite.getContext("2d");
    if (!ctx) {
      toast.error("Erreur de rendu — Canvas indisponible.");
      cleanup();
      return;
    }

    const bubblePx = Math.round(Math.min(w, h) * 0.18);
    const pad = Math.round(bubblePx * 0.12);

    // --- Async board snapshot loop (html-to-image is too slow for 30fps; we
    //     refresh the snapshot ~5x per second and reuse the latest one in the
    //     compositor draw loop running at requestAnimationFrame). ---
    let latestBoardImg: HTMLImageElement | null = null;
    let snapshotting = false;
    let stopped = false;

    const refreshSnapshot = async () => {
      if (snapshotting || stopped) return;
      snapshotting = true;
      try {
        const dataUrl = await toPng(boardEl, {
          cacheBust: false,
          pixelRatio: 1,
          width: w,
          height: h,
          skipFonts: true,
        });
        const img = new Image();
        img.src = dataUrl;
        await img.decode().catch(() => {});
        if (!stopped) latestBoardImg = img;
      } catch {
        /* keep previous frame */
      } finally {
        snapshotting = false;
      }
    };

    // First snapshot before starting the loop, then refresh on an interval.
    await refreshSnapshot();
    const snapInterval = window.setInterval(refreshSnapshot, 200);

    const drawFrame = () => {
      // Background fill in case snapshot isn't ready yet
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      if (latestBoardImg) {
        try { ctx.drawImage(latestBoardImg, 0, 0, w, h); } catch { /* noop */ }
      }

      const cv = camVideoRef.current;
      if (cv && cv.readyState >= 2) {
        const c = cornerRef.current;
        let x = w - bubblePx - pad;
        let y = h - bubblePx - pad;
        if (c === "tl") { x = pad; y = pad; }
        if (c === "tr") { x = w - bubblePx - pad; y = pad; }
        if (c === "bl") { x = pad; y = h - bubblePx - pad; }
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + bubblePx / 2, y + bubblePx / 2, bubblePx / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.clip();
        const vw = cv.videoWidth || 1;
        const vh = cv.videoHeight || 1;
        const scale = Math.max(bubblePx / vw, bubblePx / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(cv, x + (bubblePx - dw) / 2, y + (bubblePx - dh) / 2, dw, dh);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x + bubblePx / 2, y + bubblePx / 2, bubblePx / 2, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, bubblePx * 0.025);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };
    rafRef.current = requestAnimationFrame(drawFrame);

    // Stash the interval id on the ref-cleanup path
    snapIntervalRef.current = snapInterval;
    stoppedRef.current = () => { stopped = true; };


    // Build the recording stream.
    const videoStream = (composite as any).captureStream(30) as MediaStream;
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
    if (micStream) tracks.push(...micStream.getAudioTracks());
    const finalStream = new MediaStream(tracks);

    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";

    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
                 : new MediaRecorder(finalStream);
    } catch {
      toast.error("Impossible de démarrer l'enregistrement.");
      cleanup();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onerror = () => {
      toast.error("Erreur d'enregistrement.");
    };
    rec.onstop = async () => {
      const finalMime = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });
      const id = `rec-${Date.now()}`;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      const recItem: Recording = {
        id,
        name: boardName || `Enregistrement du ${new Date().toLocaleString("fr-FR")}`,
        createdAt: Date.now(),
        duration,
        mimeType: finalMime,
        size: blob.size,
        blob,
      };
      try {
        await saveRecording(recItem);
        toast.success("Enregistrement sauvegardé");
        navigate("/recordings");
      } catch (e) {
        toast.error("Impossible de sauvegarder l'enregistrement.");
      } finally {
        cleanup();
        setRecording(false);
        setElapsed(0);
      }
    };

    recorderRef.current = rec;
    rec.start(1000);
    startTimeRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [boardName, containerRef, navigate]);

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  // --- Bubble drag with corner snapping ---
  const draggingRef = useRef<{ ox: number; oy: number; el: HTMLDivElement } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const onBubbleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    draggingRef.current = {
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      el: e.currentTarget,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onBubbleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();
    const x = e.clientX - cont.left - draggingRef.current.ox;
    const y = e.clientY - cont.top - draggingRef.current.oy;
    setDragPos({ x, y });
  };

  const onBubbleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - cont.left;
    const cy = e.clientY - cont.top;
    const left = cx < cont.width / 2;
    const top = cy < cont.height / 2;
    const next: Corner = left ? (top ? "tl" : "bl") : top ? "tr" : "br";
    setCorner(next);
    setDragPos(null);
    draggingRef.current = null;
  };

  return (
    <>
      {/* Recording outline */}
      {recording && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-red-500/80 animate-pulse" />
      )}

      {/* Record / Stop button */}
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        title={recording ? "Arrêter l'enregistrement" : "Enregistrer le tableau"}
        aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer le tableau"}
        className={cn(
          "absolute top-3 right-14 z-30 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition group",
          recording
            ? "bg-red-600 animate-pulse ring-2 ring-red-400/50"
            : "bg-red-600 hover:bg-red-500",
        )}
      >
        {recording ? <Square className="h-4 w-4 fill-white" /> : <Camera className="h-4 w-4" />}
      </button>

      {/* Timer */}
      {recording && (
        <div className="absolute top-3 right-24 z-30 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 text-white text-xs font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          {formatTime(elapsed)}
        </div>
      )}

      {/* Camera bubble preview (rendered outside the board canvas → not in the captured tldraw canvas, only in the composite via hidden video) */}
      {previewActive && hasCamera && (
        <div
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onPointerUp={onBubbleUp}
          style={
            dragPos
              ? { position: "absolute", width: CAM_SIZE, height: CAM_SIZE, left: dragPos.x, top: dragPos.y }
              : cornerStyle(corner)
          }
          className="z-30 rounded-full overflow-hidden border-2 border-white/80 shadow-2xl cursor-grab active:cursor-grabbing bg-black"
        >
          <video
            ref={previewVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover pointer-events-none"
          />
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
