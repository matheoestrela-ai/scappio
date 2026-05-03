import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Camera, Monitor, MonitorUp, Smartphone, Square } from "lucide-react";
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

const getDisplayMediaSafely = () => {
  if (typeof navigator === "undefined") return null;
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  if (mediaDevices?.getDisplayMedia) {
    return mediaDevices.getDisplayMedia.bind(mediaDevices);
  }
  const legacyNavigator = navigator as Navigator & {
    getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (legacyNavigator.getDisplayMedia) {
    return legacyNavigator.getDisplayMedia.bind(legacyNavigator);
  }
  return null;
};

const isLikelyMobile = () => {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
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
  const [screenSharingActive, setScreenSharingActive] = useState(false);
  const [screenShareSupported, setScreenShareSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenOverlaysRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);
  const formatRef = useRef<Format>(activeFormat);

  // Refs for live screen-share toggling during a 16:9 recording.
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setScreenShareSupported(!!getDisplayMediaSafely() && !isLikelyMobile());
  }, []);

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
    screenVideoRef.current = null;
    screenStreamRef.current = null;
    cameraVideoRef.current = null;
    setRecording(false);
    setScreenSharingActive(false);
    setElapsed(0);
  }, []);

  const finalize = useCallback(
    (kind: Format) => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) {
        toast.error("Empty recording — please retry");
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
        toast.error("Unable to start recording");
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
        toast.error("Recording error");
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

  // ---------- 16:9 (YouTube): camera-first, screen sharing optional ----------
  // Starts recording immediately with the webcam. Screen sharing is offered
  // afterwards via a separate button so we never block recording.
  const startYoutube = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Browser not supported");
      return;
    }

    formatRef.current = "youtube";
    try {
      // Camera + mic (single prompt, never throws on screen-share absence).
      let camAndMic: MediaStream | null = null;
      try {
        camAndMic = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      } catch {
        try {
          camAndMic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          toast.warning("Camera unavailable — audio only");
        } catch {
          toast.error("Camera and microphone unavailable");
          reset();
          return;
        }
      }

      const micStream: MediaStream | null =
        camAndMic.getAudioTracks().length > 0
          ? new MediaStream(camAndMic.getAudioTracks())
          : null;
      const cameraStream: MediaStream | null =
        camAndMic.getVideoTracks().length > 0
          ? new MediaStream(camAndMic.getVideoTracks())
          : null;

      hiddenOverlaysRef.current = hideOverlays();

      let cameraVideo: HTMLVideoElement | null = null;
      if (cameraStream) {
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
      cameraVideoRef.current = cameraVideo;

      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      canvas.style.position = "fixed";
      canvas.style.left = "-99999px";
      canvas.style.top = "0";
      document.body.appendChild(canvas);
      offscreenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

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

      const drawCover = (v: HTMLVideoElement, dw: number, dh: number) => {
        const sw = v.videoWidth || dw;
        const sh = v.videoHeight || dh;
        const scale = Math.max(dw / sw, dh / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = (dw - w) / 2;
        const y = (dh - h) / 2;
        ctx.drawImage(v, x, y, w, h);
      };

      const drawCameraCircle = () => {
        const cv = cameraVideoRef.current;
        if (!cv || cv.readyState < 2) return;
        const cx = 110, cy = 970, r = 90;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        const sw = cv.videoWidth || 180;
        const sh = cv.videoHeight || 180;
        const scale = Math.max(180 / sw, 180 / sh);
        const w = sw * scale;
        const h = sh * scale;
        const x = 20 + (180 - w) / 2;
        const y = 880 + (180 - h) / 2;
        ctx.drawImage(cv, x, y, w, h);
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
        const sv = screenVideoRef.current;
        if (sv && sv.readyState >= 2) {
          drawContain(sv, 0, 0, 1920, 1080);
          drawCameraCircle();
        } else if (cameraVideoRef.current && cameraVideoRef.current.readyState >= 2) {
          // No screen share yet → fill 16:9 with the camera.
          drawCover(cameraVideoRef.current, 1920, 1080);
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);

      stopTracksRef.current = [
        ...(cameraStream ? cameraStream.getTracks() : []),
        ...(micStream ? micStream.getTracks() : []),
      ];

      setupCanvasRecorder(canvas, micStream, "youtube");
    } catch (err: any) {
      if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) {
        reset();
        return;
      }
      console.error(err);
      toast.error("Failed to start the recording");
      reset();
    }
  };

  // Optional: enable screen sharing live, while recording is already running.
  const enableScreenSharing = async () => {
    const requestDisplayMedia = getDisplayMediaSafely();
    if (!requestDisplayMedia) {
      toast.error("Screen sharing is not supported on this device");
      return;
    }
    try {
      const screenStream = await requestDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
        // @ts-ignore — Chromium hint
        preferCurrentTab: true,
      });

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

      // Stop any previous screen stream cleanly.
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }

      screenVideoRef.current = screenVideo;
      screenStreamRef.current = screenStream;
      stopTracksRef.current.push(...screenStream.getTracks());
      setScreenSharingActive(true);

      screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        screenVideoRef.current = null;
        screenStreamRef.current = null;
        setScreenSharingActive(false);
      });
    } catch (err: any) {
      if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) return;
      console.error(err);
      toast.error("Screen sharing unavailable — recording continues");
    }
  };

  // ---------- 9:16 (TikTok): webcam only, vertical 720x1280 ----------
  const startTiktok = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Browser not supported");
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
        toast.error("Camera unavailable");
        reset();
        return;
      }
      if (err && err.name === "AbortError") return;
      console.error(err);
      toast.error("Failed to start the recording");
      reset();
    }
  };

  const selectFormat = (f: Format) => {
    setActiveFormat(f);
    formatRef.current = f;
    try { window.localStorage.setItem(FORMAT_STORAGE_KEY, f); } catch {}
  };

  const handleRecordClick = activeFormat === "youtube" ? startYoutube : startTiktok;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
      restoreOverlays(hiddenOverlaysRef.current);
    };
  }, []);

  const showScreenShareButton =
    recording &&
    formatRef.current === "youtube" &&
    screenShareSupported &&
    !screenSharingActive;

  return createPortal(
    <div
      className="fixed top-4 right-4 flex items-center gap-2"
      style={{ zIndex: 9999 }}
    >
      {!recording && (
        <button
          onClick={() => navigate("/studio")}
          className="flex items-center gap-2 px-4 h-12 rounded-full shadow-lg bg-red-500 hover:bg-red-600 text-white font-semibold transition-transform hover:scale-105 active:scale-95"
        >
          <Camera className="h-5 w-5" />
          <span>Open Studio</span>
        </button>
      )}

      {recording && (
        <button
          onClick={stopRecording}
          aria-label="Stop"
          className="flex items-center gap-2 px-4 h-12 rounded-full shadow-lg bg-red-600 animate-pulse text-white font-semibold"
        >
          <Square className="h-4 w-4 fill-white" />
          <span className="tabular-nums">{fmt(elapsed)}</span>
          <span>Stop</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
