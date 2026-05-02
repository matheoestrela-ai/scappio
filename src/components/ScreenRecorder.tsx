import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Camera, Square, X, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { setLastRecording } from "@/lib/recording-store";

type Format = "standard" | "tiktok";

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
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const formatRef = useRef<Format | null>(null);

  const resetUI = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    stopTracksRef.current.forEach((t) => {
      try { t.stop(); } catch {}
    });
    stopTracksRef.current = [];
    recorderRef.current = null;
    chunksRef.current = [];
    offscreenCanvasRef.current = null;
    formatRef.current = null;
    setRecording(false);
    setElapsed(0);
    setFormat(null);
  }, []);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      r.stop();
    } else {
      resetUI();
    }
  }, [resetUI]);

  const finalize = useCallback(
    (fmtKind: Format) => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) {
        toast.error("Enregistrement vide — réessaie");
        resetUI();
        return;
      }
      const url = URL.createObjectURL(blob);
      setLastRecording({ url, format: fmtKind });
      resetUI();
      navigate("/mon-enregistrement");
    },
    [navigate, resetUI],
  );

  // ---------------- Standard 16:9 ----------------
  const startStandard = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        // @ts-ignore — Chromium extension
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Partage d'écran annulé");
      return;
    }

    let micTrack: MediaStreamTrack | null = null;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      micTrack = mic.getAudioTracks()[0] ?? null;
    } catch {
      toast.warning("Microphone non disponible — enregistrement sans son");
    }

    const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
    if (micTrack) tracks.push(micTrack);
    const stream = new MediaStream(tracks);
    stopTracksRef.current = [...display.getTracks(), ...(micTrack ? [micTrack] : [])];

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de démarrer l'enregistrement");
      stopTracksRef.current.forEach((t) => t.stop());
      stopTracksRef.current = [];
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => finalize("standard");
    rec.onerror = (e) => {
      console.error("Recorder error", e);
      toast.error("Erreur d'enregistrement");
      resetUI();
    };

    display.getVideoTracks()[0].addEventListener("ended", () => stopRecording());

    recorderRef.current = rec;
    formatRef.current = "standard";
    setFormat("standard");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    rec.start(1000);
  }, [finalize, resetUI, stopRecording]);

  // ---------------- TikTok 9:16 ----------------
  const startTikTok = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }
    // Step 1 — Camera + microphone FIRST, so the user explicitly grants
    // camera access before the browser opens the screen-share picker.
    let cameraStream: MediaStream | null = null;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
    } catch {
      toast.warning("Caméra non disponible — enregistrement sans facecam");
    }

    // If camera failed entirely, still try to get the mic alone.
    if (!cameraStream) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch {
        toast.warning("Microphone non disponible — enregistrement sans son");
      }
    }

    // Step 2 — Screen share
    let screenStream: MediaStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        // @ts-ignore — Chromium extension
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Partage d'écran annulé");
      cameraStream?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      return;
    }

    // Step 3 — Hidden canvas
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    canvas.style.position = "fixed";
    canvas.style.left = "-99999px";
    canvas.style.top = "0";
    document.body.appendChild(canvas);
    offscreenCanvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;

    // Step 4 — Video elements (screen + camera)
    const screenVideo = document.createElement("video");
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    screenVideo.autoplay = true;
    screenVideo.playsInline = true;
    try { await screenVideo.play(); } catch {}

    let cameraVideo: HTMLVideoElement | null = null;
    if (cameraStream && cameraStream.getVideoTracks().length > 0) {
      cameraVideo = document.createElement("video");
      cameraVideo.srcObject = cameraStream;
      cameraVideo.muted = true;
      cameraVideo.autoplay = true;
      cameraVideo.playsInline = true;
      try { await cameraVideo.play(); } catch {}
    }

    // Aliases for the rest of the function (drawing, recorder setup, cleanup).
    const display = screenStream;
    const camStream = cameraStream;
    const tabVideo = screenVideo;
    const camVideo = cameraVideo;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1080, 1920);
      try {
        if (tabVideo.readyState >= 2) {
          // contain into 1080x1344
          const tw = tabVideo.videoWidth || 16;
          const th = tabVideo.videoHeight || 9;
          const targetW = 1080;
          const targetH = 1344;
          const scale = Math.min(targetW / tw, targetH / th);
          const w = tw * scale;
          const h = th * scale;
          const x = (targetW - w) / 2;
          const y = (targetH - h) / 2;
          ctx.drawImage(tabVideo, x, y, w, h);
        }
        if (camVideo && camVideo.readyState >= 2) {
          // cover into 1080x576
          const cw = camVideo.videoWidth || 16;
          const ch = camVideo.videoHeight || 9;
          const targetW = 1080;
          const targetH = 576;
          const scale = Math.max(targetW / cw, targetH / ch);
          const w = cw * scale;
          const h = ch * scale;
          const x = (targetW - w) / 2;
          const y = 1344 + (targetH - h) / 2;
          ctx.drawImage(camVideo, x, y, w, h);
        }
      } catch {}
      // mirror to preview
      const pc = previewCanvasRef.current;
      if (pc) {
        const pctx = pc.getContext("2d");
        if (pctx) pctx.drawImage(canvas, 0, 0, pc.width, pc.height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    const canvasStream = canvas.captureStream(30);
    const audioTrack = camStream?.getAudioTracks()[0] ?? null;
    if (audioTrack) canvasStream.addTrack(audioTrack);

    stopTracksRef.current = [
      ...display.getTracks(),
      ...(camStream ? camStream.getTracks() : []),
      ...canvasStream.getVideoTracks(),
    ];

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(canvasStream, { mimeType: mime })
        : new MediaRecorder(canvasStream);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de démarrer l'enregistrement");
      stopTracksRef.current.forEach((t) => t.stop());
      stopTracksRef.current = [];
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      finalize("tiktok");
    };
    rec.onerror = (e) => {
      console.error("Recorder error", e);
      toast.error("Erreur d'enregistrement");
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      resetUI();
    };

    display.getVideoTracks()[0].addEventListener("ended", () => stopRecording());

    recorderRef.current = rec;
    formatRef.current = "tiktok";
    setFormat("tiktok");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    rec.start(1000);
  }, [finalize, resetUI, stopRecording]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopTracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
    };
  }, []);

  const onMainClick = () => {
    if (recording) stopRecording();
    else setPickerOpen(true);
  };

  return createPortal(
    <>
      {/* Standard recording border */}
      {recording && format === "standard" && (
        <div
          className="pointer-events-none fixed inset-0 border-4 border-red-500"
          style={{ zIndex: 9990 }}
        />
      )}

      {/* TikTok preview */}
      {recording && format === "tiktok" && (
        <div
          className="fixed bottom-4 left-4 rounded-lg overflow-hidden shadow-2xl border border-border bg-black"
          style={{ zIndex: 9998, width: 200 }}
        >
          <canvas
            ref={previewCanvasRef}
            width={200}
            height={356}
            className="block w-full h-auto"
          />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-[10px] font-bold tracking-wide">REC</span>
          </div>
        </div>
      )}

      {/* Main button */}
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
              Le navigateur te demandera de partager l'onglet en cours.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setPickerOpen(false);
                  startStandard();
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-accent transition"
              >
                <Monitor className="h-10 w-10" />
                <span className="font-semibold">🖥️ Standard 16:9</span>
                <span className="text-xs text-muted-foreground">Onglet plein écran</span>
              </button>
              <button
                onClick={() => {
                  setPickerOpen(false);
                  startTikTok();
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-accent transition"
              >
                <Smartphone className="h-10 w-10" />
                <span className="font-semibold">📱 TikTok 9:16</span>
                <span className="text-xs text-muted-foreground">Vertical + facecam</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
