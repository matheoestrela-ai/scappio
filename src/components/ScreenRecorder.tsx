import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Square, X, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";

type Format = "standard" | "tiktok";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const ts = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ScreenRecorder() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [format, setFormat] = useState<Format | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiktokCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    recorderRef.current = null;
    chunksRef.current = [];
    tiktokCanvasRef.current = null;
    setRecording(false);
    setElapsed(0);
    setFormat(null);
  }, []);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    else cleanup();
  }, [cleanup]);

  const startStandard = useCallback(async () => {
    if (!window.MediaRecorder) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        // @ts-ignore - non-standard but supported in Chromium
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Partage d'écran annulé");
      return;
    }

    let micTrack: MediaStreamTrack | null = null;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micTrack = mic.getAudioTracks()[0] ?? null;
    } catch {
      toast.warning("Microphone non disponible — enregistrement sans son");
    }

    const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
    if (micTrack) tracks.push(micTrack);
    tracksRef.current = tracks;

    const stream = new MediaStream(tracks);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      download(blob, `scappio-standard-${ts()}.webm`);
      toast.success("Enregistrement sauvegardé ✓");
      cleanup();
    };
    display.getVideoTracks()[0].addEventListener("ended", () => stopRecording());
    recorderRef.current = rec;
    setFormat("standard");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    rec.start(1000);
  }, [cleanup, stopRecording]);

  const startTikTok = useCallback(async () => {
    if (!window.MediaRecorder) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        // @ts-ignore
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Partage d'écran annulé");
      return;
    }

    let camStream: MediaStream | null = null;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
    } catch {
      toast.warning("Caméra non disponible — enregistrement sans facecam");
    }

    if (camStream && camStream.getAudioTracks().length === 0) {
      toast.warning("Microphone non disponible — enregistrement sans son");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;
    tiktokCanvasRef.current = canvas;

    const tabVideo = document.createElement("video");
    tabVideo.srcObject = display;
    tabVideo.muted = true;
    tabVideo.autoplay = true;
    tabVideo.playsInline = true;
    await tabVideo.play().catch(() => {});

    let camVideo: HTMLVideoElement | null = null;
    if (camStream) {
      camVideo = document.createElement("video");
      camVideo.srcObject = camStream;
      camVideo.muted = true;
      camVideo.autoplay = true;
      camVideo.playsInline = true;
      await camVideo.play().catch(() => {});
    }

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1080, 1920);
      try {
        if (tabVideo.readyState >= 2) ctx.drawImage(tabVideo, 0, 0, 1080, 1344);
        if (camVideo && camVideo.readyState >= 2) ctx.drawImage(camVideo, 0, 1344, 1080, 576);
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
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (camStream) {
      camStream.getAudioTracks().forEach((t) => {
        canvasStream.addTrack(t);
        tracks.push(t);
      });
    }
    tracksRef.current = [
      ...display.getTracks(),
      ...(camStream ? camStream.getTracks() : []),
      ...canvasStream.getVideoTracks(),
    ];

    const rec = new MediaRecorder(canvasStream, { mimeType: "video/webm" });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      download(blob, `scappio-tiktok-${ts()}.webm`);
      toast.success("Enregistrement TikTok sauvegardé ✓");
      cleanup();
    };
    display.getVideoTracks()[0].addEventListener("ended", () => stopRecording());
    recorderRef.current = rec;
    setFormat("tiktok");
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    rec.start(1000);
  }, [cleanup, stopRecording]);

  useEffect(() => () => cleanup(), [cleanup]);

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
