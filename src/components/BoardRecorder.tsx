import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square, Monitor, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { toCanvas } from "html-to-image";
import { cn } from "@/lib/utils";
import { saveRecording, type Recording, type RecordingFormat } from "@/lib/recordings-db";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";

type Corner = "tl" | "tr" | "bl" | "br";

const CAM_SIZE = 140;
const CAM_PAD = 16;
const TIKTOK_W = 1080;
const TIKTOK_H = 1920;
const TIKTOK_TOP_RATIO = 0.4;

const FORMAT_KEY = "scappio.recordFormat";
const SILENCE_KEY = "scappio.cutSilence";

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
  containerRef: React.RefObject<HTMLDivElement>;
  boardName?: string;
};

// ─────────────────────────────────────────────────────────────
// Silence-cutting (audio post-process)
// Strategy: decode audio from recorded blob, find non-silent segments
// (>=1.5s of silence is cut), then re-encode by playing the original
// video into a new MediaRecorder, skipping silent windows.
// ─────────────────────────────────────────────────────────────
type Segment = { start: number; end: number };

const detectVoicedSegments = async (
  blob: Blob,
  opts: { silenceMs?: number; thresholdDb?: number } = {},
): Promise<Segment[] | null> => {
  const silenceMs = opts.silenceMs ?? 1500;
  const thresholdDb = opts.thresholdDb ?? -45;
  const threshold = Math.pow(10, thresholdDb / 20);

  try {
    const arrayBuf = await blob.arrayBuffer();
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ac = new Ctor();
    let audio: AudioBuffer;
    try {
      audio = await ac.decodeAudioData(arrayBuf.slice(0));
    } catch {
      ac.close();
      return null;
    }
    const sr = audio.sampleRate;
    const ch0 = audio.getChannelData(0);
    const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;

    const winSize = Math.max(1, Math.floor(sr * 0.02)); // 20ms windows
    const winSec = winSize / sr;
    const silenceWindows = Math.ceil(silenceMs / 1000 / winSec);

    const voiced: boolean[] = [];
    for (let i = 0; i < ch0.length; i += winSize) {
      let sum = 0;
      const end = Math.min(ch0.length, i + winSize);
      for (let j = i; j < end; j++) {
        const a = ch0[j];
        const b = ch1 ? ch1[j] : 0;
        const v = ch1 ? (a + b) * 0.5 : a;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / (end - i));
      voiced.push(rms > threshold);
    }
    ac.close();

    // Build voiced segments, merging gaps shorter than silenceWindows.
    const segs: Segment[] = [];
    let i = 0;
    while (i < voiced.length) {
      if (!voiced[i]) { i++; continue; }
      let j = i;
      while (j < voiced.length) {
        if (voiced[j]) { j++; continue; }
        // count silence run
        let k = j;
        while (k < voiced.length && !voiced[k]) k++;
        if (k - j >= silenceWindows) break; // real silence cut
        j = k; // gap too short, keep going
      }
      const startSec = Math.max(0, i * winSec - 0.15);
      const endSec = Math.min(audio.duration, j * winSec + 0.15);
      if (segs.length && startSec - segs[segs.length - 1].end < 0.05) {
        segs[segs.length - 1].end = endSec;
      } else {
        segs.push({ start: startSec, end: endSec });
      }
      i = j;
    }
    if (!segs.length) return null;
    return segs;
  } catch {
    return null;
  }
};

const reencodeWithSegments = (
  srcBlob: Blob,
  segments: Segment[],
  mimeType: string,
  onProgress?: (p: number) => void,
): Promise<Blob> =>
  new Promise(async (resolve, reject) => {
    try {
      const url = URL.createObjectURL(srcBlob);
      const video = document.createElement("video");
      video.src = url;
      video.muted = false;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error("video load failed"));
      });

      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const ac = new Ctor();
      const srcNode = ac.createMediaElementSource(video);
      const dest = ac.createMediaStreamDestination();
      srcNode.connect(dest);
      // Also play through speakers? No — keep silent during processing.

      const videoStream = (canvas as any).captureStream(30) as MediaStream;
      const tracks = [...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
      const finalStream = new MediaStream(tracks);

      const candidates = [
        "video/mp4;codecs=h264,aac",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || mimeType;
      const rec = new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 4_500_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      const totalDuration = segments.reduce((acc, s) => acc + (s.end - s.start), 0);
      let processed = 0;

      const drawLoop = () => {
        if (rec.state === "recording") {
          ctx.drawImage(video, 0, 0, w, h);
          requestAnimationFrame(drawLoop);
        }
      };

      rec.onstop = () => {
        try { ac.close(); } catch {}
        URL.revokeObjectURL(url);
        const out = new Blob(chunks, { type: mime });
        resolve(out);
      };
      rec.onerror = (e) => reject((e as any).error || new Error("recorder error"));

      rec.start(500);
      drawLoop();

      for (const seg of segments) {
        await new Promise<void>((res) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            res();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = seg.start;
        });
        await video.play().catch(() => {});
        await new Promise<void>((res) => {
          const tick = () => {
            if (video.currentTime >= seg.end - 0.02 || video.ended) {
              video.pause();
              processed += seg.end - seg.start;
              onProgress?.(Math.min(1, processed / totalDuration));
              res();
            } else {
              requestAnimationFrame(tick);
            }
          };
          tick();
        });
      }
      rec.stop();
    } catch (e) {
      reject(e as Error);
    }
  });

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

const BoardRecorder = ({ containerRef, boardName }: Props) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [showPicker, setShowPicker] = useState(false);
  const [format, setFormat] = useState<RecordingFormat>(() => {
    if (typeof window === "undefined") return "standard";
    const saved = localStorage.getItem(FORMAT_KEY) as RecordingFormat | null;
    if (saved === "standard" || saved === "tiktok") return saved;
    // Default to TikTok on mobile.
    return window.matchMedia("(max-width: 767px)").matches ? "tiktok" : "standard";
  });
  const [cutSilence, setCutSilence] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem(SILENCE_KEY);
    return v === null ? true : v === "1";
  });

  useEffect(() => {
    try { localStorage.setItem(FORMAT_KEY, format); } catch {}
  }, [format]);
  useEffect(() => {
    try { localStorage.setItem(SILENCE_KEY, cutSilence ? "1" : "0"); } catch {}
  }, [cutSilence]);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corner, setCorner] = useState<Corner>("br");
  const [hasCamera, setHasCamera] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [activeFormat, setActiveFormat] = useState<RecordingFormat>("standard");
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const tiktokPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef<(() => void) | null>(null);
  const cornerRef = useRef<Corner>("br");
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    cornerRef.current = corner;
  }, [corner]);

  const stopAllStreams = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current = null;
    micStreamRef.current = null;
  };

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    stoppedRef.current?.();
    rafRef.current = null;
    previewRafRef.current = null;
    timerRef.current = null;
    stoppedRef.current = null;
    stopAllStreams();
    setPreviewActive(false);
    setHasCamera(false);
  };

  useEffect(() => () => cleanup(), []);

  // ── Auto-download helper for TikTok ──
  const triggerDownload = (blob: Blob, mime: string, fmt: RecordingFormat) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const date = new Date().toISOString().slice(0, 10);
    const fname =
      fmt === "tiktok"
        ? `scappio-tiktok-${date}.${ext}`
        : `scappio-${date}.${ext}`;
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // ── Finalize: optional silence cut → save → optional auto-download ──
  const finalize = async (rawBlob: Blob, recMime: string, fmt: RecordingFormat) => {
    let finalBlob = rawBlob;
    let finalMime = recMime;

    if (cutSilence) {
      setProcessing(true);
      setProcessingProgress(0);
      try {
        const segs = await detectVoicedSegments(rawBlob);
        if (segs && segs.length) {
          const trimmed = await reencodeWithSegments(rawBlob, segs, recMime, (p) =>
            setProcessingProgress(p),
          );
          if (trimmed.size > 0) {
            finalBlob = trimmed;
            finalMime = trimmed.type || recMime;
            toast.success("Silences supprimés");
          }
        }
      } catch (e) {
        console.warn("Silence cut failed", e);
        toast.message("Suppression des silences ignorée");
      } finally {
        setProcessing(false);
      }
    }

    const id = `rec-${Date.now()}`;
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const recItem: Recording = {
      id,
      name:
        boardName ||
        `${fmt === "tiktok" ? "TikTok" : "Enregistrement"} du ${new Date().toLocaleString("fr-FR")}`,
      createdAt: Date.now(),
      duration,
      mimeType: finalMime,
      size: finalBlob.size,
      blob: finalBlob,
      format: fmt,
    };
    try {
      await saveRecording(recItem);
      if (fmt === "tiktok") {
        triggerDownload(finalBlob, finalMime, fmt);
      }
      toast.success("Enregistrement sauvegardé");
      navigate("/recordings");
    } catch {
      toast.error("Impossible de sauvegarder l'enregistrement.");
    }
  };

  // ── Standard 16:9 recording (preserved logic) ──
  const startStandardRecording = useCallback(async () => {
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement vidéo.");
      return;
    }
    toast.message("Sélectionne cet onglet pour enregistrer ton tableau");

    let screenStream: MediaStream | null = null;
    let camStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        preferCurrentTab: true,
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });
    } catch {
      toast.error("Partage d'écran refusé ou indisponible.");
      return;
    }

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

    screenStreamRef.current = screenStream;
    camStreamRef.current = camStream;
    micStreamRef.current = micStream;

    const screenVideo = document.createElement("video");
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    await screenVideo.play().catch(() => {});
    screenVideoRef.current = screenVideo;

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

    const screenTrack = screenStream.getVideoTracks()[0];
    const settings = screenTrack?.getSettings?.() ?? {};
    const w = Math.max(1280, Math.round(settings.width ?? window.screen.width ?? 1280));
    const h = Math.max(720, Math.round(settings.height ?? window.screen.height ?? 720));
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

    const bubblePx = 140;
    const pad = 24;

    const drawFrame = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const sv = screenVideoRef.current;
      if (sv && sv.readyState >= 2) {
        try { ctx.drawImage(sv, 0, 0, w, h); } catch {}
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

    const handleScreenEnded = () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    };
    screenTrack?.addEventListener("ended", handleScreenEnded);
    stoppedRef.current = () => {
      screenTrack?.removeEventListener("ended", handleScreenEnded);
      screenVideoRef.current = null;
      camVideoRef.current = null;
    };

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
      rec = mime
        ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
        : new MediaRecorder(finalStream);
    } catch {
      toast.error("Impossible de démarrer l'enregistrement.");
      cleanup();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onerror = () => toast.error("Erreur d'enregistrement.");
    rec.onstop = async () => {
      const finalMime = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });
      cleanup();
      setRecording(false);
      setElapsed(0);
      await finalize(blob, finalMime, "standard");
    };

    recorderRef.current = rec;
    rec.start(1000);
    startTimeRef.current = Date.now();
    setActiveFormat("standard");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [boardName, navigate, cutSilence]);

  // ── TikTok 9:16 recording ──
  const startTikTokRecording = useCallback(async () => {
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement vidéo.");
      return;
    }
    toast.message("Sélectionne cet onglet pour capturer le tableau");

    let screenStream: MediaStream | null = null;
    let camStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        preferCurrentTab: true,
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });
    } catch {
      toast.error("Partage d'écran refusé ou indisponible.");
      return;
    }

    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 720, height: 720, facingMode: "user" },
        audio: false,
      });
    } catch {
      toast.warning("Caméra indisponible — la zone du haut sera vide.");
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro refusé — enregistrement sans audio.");
    }

    screenStreamRef.current = screenStream;
    camStreamRef.current = camStream;
    micStreamRef.current = micStream;

    const screenVideo = document.createElement("video");
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    await screenVideo.play().catch(() => {});
    screenVideoRef.current = screenVideo;

    if (camStream) {
      setHasCamera(true);
      const hidden = document.createElement("video");
      hidden.srcObject = camStream;
      hidden.muted = true;
      hidden.playsInline = true;
      await hidden.play().catch(() => {});
      camVideoRef.current = hidden;
    }

    // 1080×1920 composite canvas
    const composite = document.createElement("canvas");
    composite.width = TIKTOK_W;
    composite.height = TIKTOK_H;
    compositeCanvasRef.current = composite;
    const ctx = composite.getContext("2d");
    if (!ctx) {
      toast.error("Erreur de rendu — Canvas indisponible.");
      cleanup();
      return;
    }

    const topH = Math.round(TIKTOK_H * TIKTOK_TOP_RATIO); // 768
    const botH = TIKTOK_H - topH; // 1152

    const drawFrame = () => {
      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, TIKTOK_W, TIKTOK_H);

      // ── TOP: camera, full width, slight rounded corners, cover crop ──
      const cv = camVideoRef.current;
      const camRadius = 28;
      ctx.save();
      // rounded rect path
      const r = camRadius;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(TIKTOK_W - r, 0);
      ctx.quadraticCurveTo(TIKTOK_W, 0, TIKTOK_W, r);
      ctx.lineTo(TIKTOK_W, topH - r);
      ctx.quadraticCurveTo(TIKTOK_W, topH, TIKTOK_W - r, topH);
      ctx.lineTo(r, topH);
      ctx.quadraticCurveTo(0, topH, 0, topH - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();
      if (cv && cv.readyState >= 2 && cv.videoWidth) {
        const vw = cv.videoWidth;
        const vh = cv.videoHeight;
        const scale = Math.max(TIKTOK_W / vw, topH / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (TIKTOK_W - dw) / 2;
        const dy = (topH - dh) / 2;
        // Mirror selfie cam
        ctx.save();
        ctx.translate(TIKTOK_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, TIKTOK_W - dx - dw, dy, dw, dh);
        ctx.restore();
      } else {
        // Placeholder
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, TIKTOK_W, topH);
        ctx.fillStyle = "#444";
        ctx.font = "bold 80px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📷", TIKTOK_W / 2, topH / 2);
      }
      ctx.restore();

      // ── BOTTOM: board, full width, contain (centered) ──
      ctx.fillStyle = "#faf7f4";
      ctx.fillRect(0, topH, TIKTOK_W, botH);
      const sv = screenVideoRef.current;
      if (sv && sv.readyState >= 2 && sv.videoWidth) {
        const vw = sv.videoWidth;
        const vh = sv.videoHeight;
        const scale = Math.min(TIKTOK_W / vw, botH / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (TIKTOK_W - dw) / 2;
        const dy = topH + (botH - dh) / 2;
        try { ctx.drawImage(sv, dx, dy, dw, dh); } catch {}
      }

      // Subtle divider
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, topH - 1, TIKTOK_W, 2);

      rafRef.current = requestAnimationFrame(drawFrame);
    };
    rafRef.current = requestAnimationFrame(drawFrame);

    // Mirror composite into the visible preview canvas
    setPreviewActive(true);
    const drawPreview = () => {
      const pv = tiktokPreviewCanvasRef.current;
      if (pv) {
        const pctx = pv.getContext("2d");
        if (pctx) {
          pctx.fillStyle = "#000";
          pctx.fillRect(0, 0, pv.width, pv.height);
          try { pctx.drawImage(composite, 0, 0, pv.width, pv.height); } catch {}
        }
      }
      previewRafRef.current = requestAnimationFrame(drawPreview);
    };
    previewRafRef.current = requestAnimationFrame(drawPreview);

    const screenTrack = screenStream.getVideoTracks()[0];
    const handleScreenEnded = () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    };
    screenTrack?.addEventListener("ended", handleScreenEnded);
    stoppedRef.current = () => {
      screenTrack?.removeEventListener("ended", handleScreenEnded);
      screenVideoRef.current = null;
      camVideoRef.current = null;
    };

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
      rec = mime
        ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 5_000_000 })
        : new MediaRecorder(finalStream);
    } catch {
      toast.error("Impossible de démarrer l'enregistrement.");
      cleanup();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onerror = () => toast.error("Erreur d'enregistrement.");
    rec.onstop = async () => {
      const finalMime = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });
      cleanup();
      setRecording(false);
      setElapsed(0);
      await finalize(blob, finalMime, "tiktok");
    };

    recorderRef.current = rec;
    rec.start(1000);
    startTimeRef.current = Date.now();
    setActiveFormat("tiktok");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
  }, [boardName, navigate, cutSilence]);

  const handleStartClick = () => {
    if (recording) {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      return;
    }
    setShowPicker(true);
  };

  const launchSelected = (fmt: RecordingFormat) => {
    setFormat(fmt);
    setShowPicker(false);
    if (fmt === "tiktok") void startTikTokRecording();
    else void startStandardRecording();
  };

  // Drag for standard mode camera bubble
  const draggingRef = useRef<{ ox: number; oy: number; el: HTMLDivElement } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const onBubbleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    draggingRef.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top, el: e.currentTarget };
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

  // ── Format picker UI ──
  const FormatOption = ({
    value,
    icon,
    title,
    subtitle,
  }: {
    value: RecordingFormat;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
  }) => {
    const selected = format === value;
    return (
      <button
        type="button"
        onClick={() => setFormat(value)}
        className={cn(
          "flex-1 flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition",
          selected
            ? "border-[#F97316] bg-[#fff3eb]"
            : "border-border bg-card hover:border-[#F97316]/50",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            selected ? "bg-[#F97316] text-white" : "bg-muted text-foreground",
          )}
        >
          {icon}
        </div>
        <div>
          <div className={cn("text-sm font-semibold", selected && "text-[#9a3a08]")}>{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </button>
    );
  };

  const Picker = () => {
    const content = (
      <>
        <div className="mb-4">
          <h3 className="text-base font-semibold">Format d'enregistrement</h3>
          <p className="text-xs text-muted-foreground">Choisis le format de ta vidéo</p>
        </div>
        <div className="flex gap-3">
          <FormatOption
            value="standard"
            icon={<Monitor className="h-5 w-5" />}
            title="🖥️ Standard 16:9"
            subtitle="Présentation classique"
          />
          <FormatOption
            value="tiktok"
            icon={<Smartphone className="h-5 w-5" />}
            title="📱 TikTok / Reels 9:16"
            subtitle="Format vertical"
          />
        </div>
        <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div>
            <div className="text-sm font-medium">Couper les silences automatiquement</div>
            <div className="text-xs text-muted-foreground">Supprime les pauses &gt; 1,5s</div>
          </div>
          <Switch checked={cutSilence} onCheckedChange={setCutSilence} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => launchSelected(format)}
            className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea6a0e]"
          >
            Démarrer
          </button>
        </div>
      </>
    );

    if (isMobile) {
      return (
        <div className="fixed inset-0 z-[100] flex items-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowPicker(false)}
          />
          <div className="relative w-full rounded-t-2xl bg-background p-5 shadow-2xl animate-in slide-in-from-bottom">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
            {content}
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowPicker(false)} />
        <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
          {content}
        </div>
      </div>
    );
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
        onClick={handleStartClick}
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

      {/* Standard mode: floating circular cam preview */}
      {previewActive && hasCamera && activeFormat === "standard" && (
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

      {/* TikTok mode: vertical preview in corner */}
      {previewActive && activeFormat === "tiktok" && (
        <div
          className="absolute bottom-4 right-4 z-30 rounded-xl overflow-hidden bg-black shadow-2xl border border-white/30"
          style={{ width: 200, height: Math.round(200 * (TIKTOK_H / TIKTOK_W)) }}
        >
          <canvas
            ref={tiktokPreviewCanvasRef}
            width={200}
            height={Math.round(200 * (TIKTOK_H / TIKTOK_W))}
            className="block w-full h-full"
          />
          <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            REC · {formatTime(elapsed)}
          </div>
          <div className="pointer-events-none absolute bottom-1 right-1 rounded bg-[#F97316] px-1.5 py-0.5 text-[9px] font-bold text-white">
            9:16
          </div>
        </div>
      )}

      {/* Format picker modal */}
      {showPicker && <Picker />}

      {/* Silence cut progress overlay */}
      {processing && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">Suppression des silences…</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              On nettoie les pauses pour un rendu plus dynamique.
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-[#F97316] transition-all"
                style={{ width: `${Math.round(processingProgress * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-right text-xs font-mono text-muted-foreground">
              {Math.round(processingProgress * 100)}%
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
