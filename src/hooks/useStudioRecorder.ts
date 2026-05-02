import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  canvasSize,
  drawCircle,
  drawContain,
  drawCover,
  formatToRecordingFormat,
  getDisplayMediaSafely,
  pickMime,
  type StudioFormat,
} from "@/lib/studio-recorder";
import { setLastRecording } from "@/lib/recording-store";

export type WebcamBubble = {
  // Normalised position [0..1] within the 16:9 canvas, top-left of bubble box.
  xPct: number;
  yPct: number;
  // Radius as a fraction of canvas height.
  rPct: number;
};

type Options = {
  format: StudioFormat;
  onFinished: (url: string) => void;
};

export function useStudioRecorder({ format, onFinished }: Options) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [screenSupported, setScreenSupported] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Streams
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Hidden <video> elements that feed the canvas.
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Compositing canvas (offscreen, attached to body).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const formatRef = useRef<StudioFormat>(format);
  const bubbleRef = useRef<WebcamBubble>({ xPct: 0.78, yPct: 0.7, rPct: 0.12 });

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    setScreenSupported(!!getDisplayMediaSafely());
  }, []);

  // ----- Stream helpers -----
  const ensureCamera = useCallback(async () => {
    if (cameraStreamRef.current) return cameraStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    const video = stream.getVideoTracks();
    const audio = stream.getAudioTracks();
    cameraStreamRef.current = video.length ? new MediaStream(video) : null;
    micStreamRef.current = audio.length ? new MediaStream(audio) : null;

    if (cameraStreamRef.current) {
      const v = document.createElement("video");
      v.srcObject = cameraStreamRef.current;
      v.muted = true;
      v.playsInline = true;
      await new Promise<void>((res) => {
        v.onloadedmetadata = () => {
          v.play().catch(() => {});
          res();
        };
      });
      cameraVideoRef.current = v;
    }
    setCameraOn(!!cameraStreamRef.current);
    return cameraStreamRef.current;
  }, []);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    cameraStreamRef.current = null;
    cameraVideoRef.current = null;
    setCameraOn(false);
  }, []);

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    screenStreamRef.current = null;
    screenVideoRef.current = null;
    setScreenOn(false);
  }, []);

  const enableScreen = useCallback(async () => {
    const req = getDisplayMediaSafely();
    if (!req) {
      toast.error("Le partage d'écran n'est pas supporté sur cet appareil");
      return;
    }
    try {
      const screen = await req({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      const v = document.createElement("video");
      v.srcObject = screen;
      v.muted = true;
      v.playsInline = true;
      await new Promise<void>((res) => {
        v.onloadedmetadata = () => {
          v.play().catch(() => {});
          res();
        };
      });
      screenStreamRef.current = screen;
      screenVideoRef.current = v;
      setScreenOn(true);
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        stopScreen();
      });
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") return;
      console.error(err);
      toast.error("Partage d'écran indisponible");
    }
  }, [stopScreen]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) stopCamera();
    else {
      try {
        await ensureCamera();
      } catch {
        toast.error("Caméra non disponible");
      }
    }
  }, [cameraOn, ensureCamera, stopCamera]);

  // Initialise camera on mount for live preview.
  useEffect(() => {
    ensureCamera().catch(() => {
      toast.warning("Autorise la caméra pour démarrer le studio");
    });
    return () => {
      // Cleanup on unmount.
      cameraStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      micStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      screenStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (canvasRef.current?.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Compositor -----
  const ensureCanvas = useCallback(() => {
    const { w, h } = canvasSize(formatRef.current);
    let c = canvasRef.current;
    if (!c) {
      c = document.createElement("canvas");
      c.style.position = "fixed";
      c.style.left = "-99999px";
      c.style.top = "0";
      document.body.appendChild(c);
      canvasRef.current = c;
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }, []);

  const startCompositor = useCallback((onCanvas: HTMLCanvasElement) => {
    const ctx = onCanvas.getContext("2d")!;
    const draw = () => {
      const fmt = formatRef.current;
      const { w, h } = canvasSize(fmt);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      const cam = cameraVideoRef.current;
      const scr = screenVideoRef.current;
      const camReady = cam && cam.readyState >= 2;
      const scrReady = scr && scr.readyState >= 2;

      if (fmt === "9:16") {
        if (scrReady && camReady) {
          // Camera top half, screen bottom half.
          drawCover(ctx, cam!, 0, 0, w, h / 2);
          drawContain(ctx, scr!, 0, h / 2, w, h / 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(0, h / 2 - 1, w, 2);
        } else if (camReady) {
          drawCover(ctx, cam!, 0, 0, w, h);
        } else if (scrReady) {
          drawContain(ctx, scr!, 0, 0, w, h);
        }
      } else {
        // 16:9
        if (scrReady && camReady) {
          drawContain(ctx, scr!, 0, 0, w, h);
          const b = bubbleRef.current;
          const r = b.rPct * h;
          const cx = b.xPct * w + r;
          const cy = b.yPct * h + r;
          drawCircle(ctx, cam!, cx, cy, r);
        } else if (camReady) {
          drawCover(ctx, cam!, 0, 0, w, h);
        } else if (scrReady) {
          drawContain(ctx, scr!, 0, 0, w, h);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const setBubble = useCallback((b: WebcamBubble) => {
    bubbleRef.current = b;
  }, []);

  const getBubble = useCallback(() => bubbleRef.current, []);

  // ----- Recording lifecycle -----
  const start = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Navigateur non supporté");
      return;
    }
    try {
      await ensureCamera();
    } catch {
      toast.error("Caméra non disponible");
      return;
    }
    const canvas = ensureCanvas();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startCompositor(canvas);

    const stream = canvas.captureStream(60);
    const audio = micStreamRef.current?.getAudioTracks()[0];
    if (audio) stream.addTrack(audio);

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 8_000_000 });
    } catch (e) {
      console.error(e);
      toast.error("Impossible de démarrer l'enregistrement");
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) {
        toast.error("Enregistrement vide");
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setLastRecording({ url, format: formatToRecordingFormat(formatRef.current) });
      onFinished(url);
    };
    rec.onerror = (e) => {
      console.error("Recorder error", e);
      toast.error("Erreur d'enregistrement");
    };
    recorderRef.current = rec;
    rec.start(1000);
    setRecording(true);
    setPaused(false);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  }, [ensureCamera, ensureCanvas, onFinished, startCompositor]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      setPaused(true);
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    } else if (r.state === "paused") {
      r.resume();
      setPaused(false);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    }
  }, []);

  return {
    // state
    recording,
    paused,
    elapsed,
    cameraOn,
    screenOn,
    screenSupported,
    previewUrl,
    // streams (for the live preview)
    cameraStream: cameraStreamRef,
    screenStream: screenStreamRef,
    // controls
    start,
    stop,
    togglePause,
    toggleCamera,
    enableScreen,
    stopScreen,
    setBubble,
    getBubble,
  };
}
