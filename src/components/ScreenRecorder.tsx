import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Camera, Monitor, Smartphone, Square } from "lucide-react";
import { toast } from "sonner";
import { setLastRecording, type RecordingFormat } from "@/lib/recording-store";

type Format = RecordingFormat; // "youtube" (16:9) | "tiktok" (9:16)

const FORMAT_STORAGE_KEY = "scappio:lastFormat";

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
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeFormat, setActiveFormat] = useState<Format>(() => {
    if (typeof window === "undefined") return "tiktok";
    const stored = window.localStorage.getItem(FORMAT_STORAGE_KEY);
    return stored === "youtube" ? "youtube" : "tiktok";
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenOverlaysRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);
  const formatRef = useRef<Format>(activeFormat);

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
    restoreOverlays(hiddenOverlaysRef.current);
    hiddenOverlaysRef.current = [];
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setElapsed(0);
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

  const setupCanvasRecorder = useCallback(
    (canvas: HTMLCanvasElement, micStream: MediaStream | null, kind: Format) => {
      const canvasStream = canvas.captureStream(60);
      const audioTrack = micStream?.getAudioTracks()[0] ?? null;
      if (audioTrack) canvasStream.addTrack(audioTrack);
      stopTracksRef.current.push(...canvasStream.getVideoTracks());

      const preferredMime = "video/webm;codecs=vp9,opus";
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferredMime)
          ? preferredMime
          : pickMime();
      let rec: MediaRecorder;
      try {
        rec = mime
          ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
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
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
      rec.start(1000);
    },
    [finalize, reset],
  );

  // ---------- 16:9 (YouTube): screen + webcam circle overlay ----------
  // First await MUST be getDisplayMedia. No state updates / modals before it.
  const startYoutube = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Navigateur non supporté");
      return;
    }
    formatRef.current = "youtube";
    try {
      // 1) Caméra + micro D'ABORD (un seul prompt, geste utilisateur intact).
      let camAndMic: MediaStream | null = null;
      try {
        camAndMic = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        // On essaie au moins le micro
        try {
          camAndMic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          toast.warning("Caméra non disponible");
        } catch {
          toast.warning("Caméra et microphone non disponibles");
        }
      }

      const micStream: MediaStream | null =
        camAndMic && camAndMic.getAudioTracks().length > 0
          ? new MediaStream(camAndMic.getAudioTracks())
          : null;
      const cameraStream: MediaStream | null =
        camAndMic && camAndMic.getVideoTracks().length > 0
          ? new MediaStream(camAndMic.getVideoTracks())
          : null;

      // 2) Écran ENSUITE — la permission précédente garde le geste valide.
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
        // @ts-ignore — Chromium hint
        preferCurrentTab: true,
      });

      hiddenOverlaysRef.current = hideOverlays();

      const screenVideo = document.createElement("video");
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      screenVideo.playsInline = true;
      await new Promise<void>((resolve) => {
        screenVideo.onloadedmetadata = () => {
          screenVideo.play().catch(() => {});
          resolve();
        };
      });

      let cameraVideo: HTMLVideoElement | null = null;
      if (cameraStream && cameraStream.getVideoTracks().length > 0) {
        cameraVideo = document.createElement("video");
        cameraVideo.srcObject = cameraStream;
        cameraVideo.muted = true;
        cameraVideo.playsInline = true;
        await new Promise<void>((resolve) => {
          cameraVideo!.onloadedmetadata = () => {
            cameraVideo!.play().catch(() => {});
            resolve();
          };
        });
      }

      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.style.position = "fixed";
      canvas.style.left = "-99999px";
      canvas.style.top = "0";
      document.body.appendChild(canvas);
      offscreenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

      screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        const r = recorderRef.current;
        if (r && r.state !== "inactive") r.stop();
        else reset();
      });

      const drawContain = (
        v: HTMLVideoElement,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) => {
        const sw = v.videoWidth || dw;
        const sh = v.videoHeight || dh;
        const scale = Math.min(dw / sw, dh / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = dx + (dw - w) / 2;
        const y = dy + (dh - h) / 2;
        ctx.drawImage(v, x, y, w, h);
      };

      const drawCameraCircle = () => {
        if (!cameraVideo || cameraVideo.readyState < 2) return;
        const cx = 110, cy = 970, r = 90;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const sw = cameraVideo.videoWidth || 180;
        const sh = cameraVideo.videoHeight || 180;
        const scale = Math.max(180 / sw, 180 / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = 20 + (180 - w) / 2;
        const y = 880 + (180 - h) / 2;
        ctx.drawImage(cameraVideo, x, y, w, h);
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      };

      const draw = () => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (screenVideo.readyState >= 2) drawContain(screenVideo, 0, 0, 1920, 1080);
        drawCameraCircle();
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      stopTracksRef.current = [
        ...screenStream.getTracks(),
        ...(cameraStream ? cameraStream.getTracks() : []),
        ...(micStream ? micStream.getTracks() : []),
      ];

      setupCanvasRecorder(canvas, micStream, "youtube");
    } catch (err: any) {
      if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) return;
      console.error(err);
      toast.error("Erreur lors du démarrage de l'enregistrement");
      reset();
    }
  };

  // ---------- 9:16 (TikTok): webcam only, vertical 720x1280 ----------
  // First await MUST be getUserMedia.
  const startTiktok = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Navigateur non supporté");
      return;
    }
    formatRef.current = "tiktok";
    try {
      const camAndMic = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: true,
      });

      // Split audio (mic) for the recorder; keep video for compositing.
      const micStream = new MediaStream(camAndMic.getAudioTracks());
      const cameraStream = new MediaStream(camAndMic.getVideoTracks());

      hiddenOverlaysRef.current = hideOverlays();

      const cameraVideo = document.createElement("video");
      cameraVideo.srcObject = cameraStream;
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      await new Promise<void>((resolve) => {
        cameraVideo.onloadedmetadata = () => {
          cameraVideo.play().catch(() => {});
          resolve();
        };
      });

      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      canvas.style.position = "fixed";
      canvas.style.left = "-99999px";
      canvas.style.top = "0";
      document.body.appendChild(canvas);
      offscreenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

      // cover (fill 720x1280, crop overflow) so portrait webcam isn't letterboxed.
      const drawCover = (v: HTMLVideoElement) => {
        const sw = v.videoWidth || 720;
        const sh = v.videoHeight || 1280;
        const scale = Math.max(canvas.width / sw, canvas.height / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(v, x, y, w, h);
      };

      const draw = () => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (cameraVideo.readyState >= 2) drawCover(cameraVideo);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      stopTracksRef.current = [...camAndMic.getTracks()];

      setupCanvasRecorder(canvas, micStream, "tiktok");
    } catch (err: any) {
      if (err && err.name === "NotAllowedError") {
        toast.error("Caméra non disponible");
        reset();
        return;
      }
      if (err && err.name === "AbortError") return;
      console.error(err);
      toast.error("Erreur lors du démarrage de l'enregistrement");
      reset();
    }
  };

  // Format selector — pure state change, NO permission calls. Safe.
  const selectFormat = (f: Format) => {
    setActiveFormat(f);
    formatRef.current = f;
    try { window.localStorage.setItem(FORMAT_STORAGE_KEY, f); } catch {}
  };

  // Record button binds DIRECTLY to the right permission API per format.
  // This preserves the user-gesture chain.
  const handleRecordClick = activeFormat === "youtube" ? startYoutube : startTiktok;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
      restoreOverlays(hiddenOverlaysRef.current);
    };
  }, []);

  return createPortal(
    <div
      className="fixed top-4 right-4 flex items-center gap-2"
      style={{ zIndex: 9999 }}
    >
      {!recording && (
        <div className="flex items-center bg-white/95 backdrop-blur rounded-full shadow-md p-1 border border-black/5">
          <button
            onClick={() => selectFormat("tiktok")}
            aria-pressed={activeFormat === "tiktok"}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium transition-colors ${
              activeFormat === "tiktok"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>9:16</span>
          </button>
          <button
            onClick={() => selectFormat("youtube")}
            aria-pressed={activeFormat === "youtube"}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium transition-colors ${
              activeFormat === "youtube"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>16:9</span>
          </button>
        </div>
      )}

      <button
        onClick={recording ? stopRecording : handleRecordClick}
        aria-label={recording ? "Arrêter" : "Enregistrer"}
        className={`flex items-center gap-2 px-4 h-12 rounded-full shadow-lg text-white font-semibold transition-transform hover:scale-105 active:scale-95 ${
          recording ? "bg-red-600 animate-pulse" : "bg-red-500"
        }`}
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
    </div>,
    document.body,
  );
}
