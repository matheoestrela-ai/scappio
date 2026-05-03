import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  canvasSize,
  drawCircle,
  drawContain,
  drawCover,
  formatToRecordingFormat,
  getDisplayMediaSafely,
  isLikelyMobile,
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
  const [micOn, setMicOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [screenSupported, setScreenSupported] = useState(false);
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
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
  const swappedRef = useRef(false);
  const cameraOnRef = useRef(true);

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => { swappedRef.current = swapped; }, [swapped]);
  useEffect(() => { cameraOnRef.current = cameraOn; }, [cameraOn]);

  useEffect(() => {
    setScreenSupported(!!getDisplayMediaSafely() && !isLikelyMobile());
  }, []);

  const createPlaybackVideo = useCallback(async (stream: MediaStream) => {
    const v = document.createElement("video");
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        v.play().catch(() => {});
        resolve();
      };

      if (v.readyState >= 2) {
        finish();
        return;
      }

      v.addEventListener("loadedmetadata", finish, { once: true });
      v.addEventListener("canplay", finish, { once: true });
      window.setTimeout(finish, 500);
    });

    return v;
  }, []);

  // ----- Stream helpers -----
  const ensureCamera = useCallback(async () => {
    if (cameraStreamRef.current && micStreamRef.current) {
      cameraStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = true));
      micStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = micOn));
      setCameraOn(true);
      return cameraStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    const video = stream.getVideoTracks();
    const audio = stream.getAudioTracks();
    cameraStreamRef.current = video.length ? new MediaStream(video) : null;
    micStreamRef.current = audio.length ? new MediaStream(audio) : null;
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = micOn));
    }

    if (cameraStreamRef.current) {
      cameraVideoRef.current = await createPlaybackVideo(cameraStreamRef.current);
    }
    setCameraPreviewStream(cameraStreamRef.current);
    setCameraOn(!!cameraStreamRef.current);
    return cameraStreamRef.current;
  }, [createPlaybackVideo, micOn]);

  const disableCamera = useCallback(() => {
    cameraStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = false));
    setCameraOn(false);
  }, []);

  const stopScreen = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    screenStreamRef.current = null;
    screenVideoRef.current = null;
    setScreenPreviewStream(null);
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
      const v = await createPlaybackVideo(screen);
      screenStreamRef.current = screen;
      screenVideoRef.current = v;
      setScreenPreviewStream(screen);
      setScreenOn(true);
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        stopScreen();
      });
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        toast.message("Partage d'écran annulé", { description: "Tu peux réessayer à tout moment." });
        return;
      }
      console.error(err);
      toast.error("Partage d'écran indisponible");
    }
  }, [createPlaybackVideo, stopScreen]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      disableCamera();
    } else {
      try {
        await ensureCamera();
      } catch {
        toast.error("Caméra refusée. Vérifie les autorisations du navigateur.");
      }
    }
  }, [cameraOn, ensureCamera, disableCamera]);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      const next = !on;
      micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const toggleScreen = useCallback(async () => {
    if (screenOn) stopScreen();
    else await enableScreen();
  }, [screenOn, stopScreen, enableScreen]);

  const swapStreams = useCallback(() => {
    if (!screenOn || !cameraOn) return;
    setSwapped((s) => !s);
  }, [screenOn, cameraOn]);

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
      const camReady = !!(cam && cam.readyState >= 2 && cameraOnRef.current);
      const scrReady = !!(scr && scr.readyState >= 2);
      const swapped = swappedRef.current;

      if (fmt === "9:16") {
        if (scrReady && camReady) {
          const top = swapped ? scr! : cam!;
          const bot = swapped ? cam! : scr!;
          if (swapped) drawContain(ctx, top, 0, 0, w, h / 2);
          else drawCover(ctx, top, 0, 0, w, h / 2);
          if (swapped) drawCover(ctx, bot, 0, h / 2, w, h / 2);
          else drawContain(ctx, bot, 0, h / 2, w, h / 2);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(0, h / 2 - 1, w, 2);
        } else if (camReady) {
          drawCover(ctx, cam!, 0, 0, w, h);
        } else if (scrReady) {
          drawContain(ctx, scr!, 0, 0, w, h);
        }
      } else {
        if (scrReady && camReady) {
          const bg = swapped ? cam! : scr!;
          const pip = swapped ? scr! : cam!;
          if (swapped) drawCover(ctx, bg, 0, 0, w, h);
          else drawContain(ctx, bg, 0, 0, w, h);
          const b = bubbleRef.current;
          const r = b.rPct * h;
          const cx = b.xPct * w + r;
          const cy = b.yPct * h + r;
          drawCircle(ctx, pip, cx, cy, r);
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
    recording,
    paused,
    elapsed,
    cameraOn,
    micOn,
    screenOn,
    swapped,
    screenSupported,
    previewUrl,
    cameraStream: cameraPreviewStream,
    screenStream: screenPreviewStream,
    start,
    stop,
    togglePause,
    toggleCamera,
    toggleMic,
    toggleScreen,
    swapStreams,
    enableScreen,
    stopScreen,
    setBubble,
    getBubble,
  };
}
