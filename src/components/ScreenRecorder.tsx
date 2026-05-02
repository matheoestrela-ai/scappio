import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Camera, Square, X, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { setLastRecording, type RecordingFormat } from "@/lib/recording-store";

type Format = RecordingFormat;

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

const pickMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
};

const findBoardElement = (): HTMLElement | null => {
  return (
    (document.querySelector("[data-board-capture]") as HTMLElement | null) ??
    (document.querySelector(".tl-container") as HTMLElement | null) ??
    (document.querySelector(".react-flow") as HTMLElement | null)
  );
};

// Selectors of UI to hide while recording.
const HIDE_SELECTORS = [
  "[data-teleprompter]",
  "[data-suggestions-panel]",
  "[data-overlay-text]",
];

const hideOverlays = (): Array<{ el: HTMLElement; prev: string }> => {
  const hidden: Array<{ el: HTMLElement; prev: string }> = [];
  HIDE_SELECTORS.forEach((sel) => {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      hidden.push({ el, prev: el.style.display });
      el.style.display = "none";
    });
  });
  return hidden;
};

const restoreOverlays = (hidden: Array<{ el: HTMLElement; prev: string }>) => {
  hidden.forEach(({ el, prev }) => { el.style.display = prev; });
};

export default function ScreenRecorder() {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [format, setFormat] = useState<Format | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenOverlaysRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);
  const cameraVideoElRef = useRef<HTMLVideoElement | null>(null);
  const latestBoardSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const snapshottingRef = useRef(false);
  const lastSnapshotAtRef = useRef(0);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
    stopTracksRef.current = [];
    if (offscreenCanvasRef.current?.parentNode) {
      offscreenCanvasRef.current.parentNode.removeChild(offscreenCanvasRef.current);
    }
    offscreenCanvasRef.current = null;
    cameraVideoElRef.current = null;
    latestBoardSnapshotRef.current = null;
    restoreOverlays(hiddenOverlaysRef.current);
    hiddenOverlaysRef.current = [];
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
    setFormat(null);
  }, []);

  const finalize = useCallback(
    (kind: Format) => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) {
        toast.error("Enregistrement vide — réessaie");
        reset();
        return;
      }
      const url = URL.createObjectURL(blob);
      setLastRecording({ url, format: kind });
      reset();
      navigate("/mon-enregistrement");
    },
    [navigate, reset],
  );

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    else reset();
  }, [reset]);

  const startCommon = useCallback(
    async (kind: Format) => {
      if (typeof MediaRecorder === "undefined") {
        toast.error("Navigateur non supporté");
        return;
      }
      const boardEl = findBoardElement();
      if (!boardEl) {
        toast.error("Aucun board à enregistrer");
        return;
      }

      // Step 1 — Camera + microphone
      let cameraStream: MediaStream;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
      } catch {
        toast.warning("Caméra non disponible");
        return;
      }

      if (cameraStream.getAudioTracks().length === 0) {
        toast.warning("Microphone non disponible");
      }

      // Hide overlays
      hiddenOverlaysRef.current = hideOverlays();

      // Camera <video>
      const cameraVideo = document.createElement("video");
      cameraVideo.srcObject = cameraStream;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.playsInline = true;
      try { await cameraVideo.play(); } catch {}
      cameraVideoElRef.current = cameraVideo;

      // Hidden output canvas
      const canvas = document.createElement("canvas");
      if (kind === "youtube") {
        canvas.width = 1920;
        canvas.height = 1080;
      } else {
        canvas.width = 1080;
        canvas.height = 1920;
      }
      canvas.style.position = "fixed";
      canvas.style.left = "-99999px";
      canvas.style.top = "0";
      document.body.appendChild(canvas);
      offscreenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

      // Find the native canvas the board renders to (tldraw / react-flow / fallback).
      const findBoardCanvas = (): HTMLCanvasElement | null => {
        return (
          (boardEl.querySelector(".react-flow__canvas") as HTMLCanvasElement | null) ??
          (boardEl.querySelector(".react-flow canvas") as HTMLCanvasElement | null) ??
          (boardEl.querySelector("canvas") as HTMLCanvasElement | null) ??
          (document.querySelector(".react-flow__canvas") as HTMLCanvasElement | null) ??
          (document.querySelector(".react-flow canvas") as HTMLCanvasElement | null) ??
          (document.querySelector("canvas") as HTMLCanvasElement | null)
        );
      };

      // Wait until camera video has dimensions before drawing it.
      cameraVideo.onloadedmetadata = () => {
        cameraVideo.play().catch(() => {});
      };

      const drawCameraCircle = () => {
        if (cameraVideo.readyState < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(110, 970, 90, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(cameraVideo, 20, 880, 180, 180);
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(110, 970, 90, 0, Math.PI * 2);
        ctx.stroke();
      };

      const draw = () => {
        const boardCanvas = findBoardCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (kind === "youtube") {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, 1920, 1080);
          if (boardCanvas) {
            try { ctx.drawImage(boardCanvas, 0, 0, 1920, 1080); } catch {}
          }
          drawCameraCircle();
        } else {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, 1080, 1920);
          if (boardCanvas) {
            try { ctx.drawImage(boardCanvas, 0, 0, 1080, 1248); } catch {}
          }
          ctx.fillStyle = "#F97316";
          ctx.fillRect(0, 1248, 1080, 3);
          if (cameraVideo.readyState >= 2) {
            try { ctx.drawImage(cameraVideo, 0, 1251, 1080, 669); } catch {}
          }
        }

        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      // Recorder — 60fps + vp9 + 8Mbps for high quality output
      const canvasStream = canvas.captureStream(60);
      const audioTrack = cameraStream.getAudioTracks()[0] ?? null;
      if (audioTrack) canvasStream.addTrack(audioTrack);

      stopTracksRef.current = [
        ...cameraStream.getTracks(),
        ...canvasStream.getVideoTracks(),
      ];

      const preferredMime = "video/webm;codecs=vp9,opus";
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferredMime)
          ? preferredMime
          : pickMime();
      let rec: MediaRecorder;
      try {
        rec = mime
          ? new MediaRecorder(canvasStream, {
              mimeType: mime,
              videoBitsPerSecond: 8_000_000,
            })
          : new MediaRecorder(canvasStream, { videoBitsPerSecond: 8_000_000 });
      } catch (e) {
        console.error(e);
        toast.error("Impossible de démarrer l'enregistrement");
        reset();
        return;
      }

      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => finalize(kind);
      rec.onerror = (e) => {
        console.error("Recorder error", e);
        toast.error("Erreur d'enregistrement");
        reset();
      };

      recorderRef.current = rec;
      setFormat(kind);
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
      rec.start(1000);
    },
    [finalize, reset],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
      restoreOverlays(hiddenOverlaysRef.current);
    };
  }, []);

  const onMainClick = () => {
    if (recording) stopRecording();
    else setPickerOpen(true);
  };

  return createPortal(
    <>
      {/* Main fixed button */}
      <button
        onClick={onMainClick}
        aria-label={recording ? "Arrêter" : "Enregistrer"}
        className={`fixed top-4 right-4 flex items-center gap-2 px-4 h-12 rounded-full shadow-lg text-white font-semibold transition-transform hover:scale-105 active:scale-95 ${
          recording ? "bg-red-600 animate-pulse" : "bg-red-500"
        }`}
        style={{ zIndex: 9999 }}
      >
        {recording ? (
          <>
            <Square className="h-4 w-4 fill-white" />
            <span className="tabular-nums">{fmt(elapsed)}</span>
            <span>Arrêter</span>
          </>
        ) : (
          <>
            <Camera className="h-5 w-5" />
            <span>Enregistrer</span>
          </>
        )}
      </button>

      {/* Format picker modal */}
      {pickerOpen && !recording && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="relative bg-card rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPickerOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-center mb-1">Choisis un format</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              On enregistre uniquement ton board avec ta caméra.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setPickerOpen(false);
                  startCommon("youtube");
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-accent transition"
              >
                <Monitor className="h-10 w-10" />
                <span className="font-semibold">🖥️ YouTube 16:9</span>
                <span className="text-xs text-muted-foreground">Caméra ronde en bas</span>
              </button>
              <button
                onClick={() => {
                  setPickerOpen(false);
                  startCommon("tiktok");
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-accent transition"
              >
                <Smartphone className="h-10 w-10" />
                <span className="font-semibold">📱 TikTok 9:16</span>
                <span className="text-xs text-muted-foreground">Board + facecam</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
