import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Camera, Square } from "lucide-react";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const formatRef = useRef<Format>("youtube");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenOverlaysRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);

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

  // Sets up compositing + recorder once we have the streams.
  const startCompositing = useCallback(
    async (
      screenStream: MediaStream,
      cameraStream: MediaStream | null,
      micStream: MediaStream | null,
      kind: Format,
    ) => {
      hiddenOverlaysRef.current = hideOverlays();

      // Screen video
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

      // Camera video (optional)
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

      // Output canvas
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

      // User-ended share via browser UI
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

      const drawCameraBottom = () => {
        if (!cameraVideo || cameraVideo.readyState < 2) return;
        const sw = cameraVideo.videoWidth || 1080;
        const sh = cameraVideo.videoHeight || 669;
        const scale = Math.max(1080 / sw, 669 / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = (1080 - w) / 2;
        const y = 1251 + (669 - h) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 1251, 1080, 669);
        ctx.clip();
        ctx.drawImage(cameraVideo, x, y, w, h);
        ctx.restore();
      };

      const draw = () => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (kind === "youtube") {
          if (screenVideo.readyState >= 2) drawContain(screenVideo, 0, 0, 1920, 1080);
          drawCameraCircle();
        } else {
          if (screenVideo.readyState >= 2) drawContain(screenVideo, 0, 0, 1080, 1248);
          ctx.fillStyle = "#F97316";
          ctx.fillRect(0, 1248, 1080, 3);
          drawCameraBottom();
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      const canvasStream = canvas.captureStream(60);
      const audioTrack = micStream?.getAudioTracks()[0] ?? null;
      if (audioTrack) canvasStream.addTrack(audioTrack);

      stopTracksRef.current = [
        ...screenStream.getTracks(),
        ...(cameraStream ? cameraStream.getTracks() : []),
        ...(micStream ? micStream.getTracks() : []),
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

  // CRITICAL: the first await after the user click must be a permission API
  // (getDisplayMedia or getUserMedia). No state update / setTimeout / modal in
  // between, otherwise the browser drops the user gesture.
  const startYoutube = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Navigateur non supporté");
      return;
    }
    formatRef.current = "youtube";
    setPickerOpen(false);
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
        // @ts-ignore — Chromium hint
        preferCurrentTab: true,
      });

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        toast.warning("Microphone non disponible");
      }

      let cameraStream: MediaStream | null = null;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user" },
        });
      } catch {
        toast.warning("Caméra non disponible");
      }

      await startCompositing(screenStream, cameraStream, micStream, "youtube");
    } catch (err: any) {
      if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) return;
      console.error(err);
      toast.error("Erreur lors du démarrage de l'enregistrement");
    }
  };

  // Picker disabled — modal broke the user-gesture chain. Default to YouTube.

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
      restoreOverlays(hiddenOverlaysRef.current);
    };
  }, []);

  return createPortal(
    <button
      onClick={recording ? stopRecording : startYoutube}
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
    </button>,
    document.body,
  );
}
