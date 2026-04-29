import { useEffect, useRef, useState } from "react";
import { Camera, Monitor, Smartphone, Square, X } from "lucide-react";
import { toast } from "sonner";

type Mode = "standard" | "tiktok";
type Props = { containerRef?: React.RefObject<HTMLDivElement> };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pickMime = () =>
  ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

export default function BoardRecorder({ containerRef }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("standard");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    recorderRef.current = null;
  };

  useEffect(() => cleanup, []);

  const getBoardCanvas = () => {
    const root = containerRef.current ?? document.body;
    const boardElement =
      root.querySelector(".react-flow") ||
      root.querySelector("#board-container") ||
      root.querySelector(".tl-canvas") ||
      root.querySelector("canvas");
    if (boardElement instanceof HTMLCanvasElement) return boardElement;
    const nestedCanvas = boardElement?.querySelector("canvas");
    return nestedCanvas instanceof HTMLCanvasElement ? nestedCanvas : null;
  };

  const download = () => {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });
    chunksRef.current = [];
    cleanup();
    setRecording(false);
    setElapsed(0);
    if (!blob.size) return toast.error("Erreur lors de la capture du tableau");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scappio-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast.success("Enregistrement sauvegardé ✓");
  };

  const start = async (nextMode: Mode) => {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }
    const source = getBoardCanvas();
    if (!source) return toast.error("Erreur lors de la capture du tableau");

    let mic: MediaStream | null = null;
    let cam: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.warning("Microphone refusé — enregistrement sans audio");
    }
    if (nextMode === "tiktok") {
      try {
        cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      } catch {
        toast.error("Accès à la caméra refusé");
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = nextMode === "standard" ? 1920 : 1080;
    canvas.height = nextMode === "standard" ? 1080 : 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return toast.error("Erreur lors de la capture du tableau");

    const camVideo = document.createElement("video");
    if (cam) {
      camVideo.srcObject = cam;
      camVideo.muted = true;
      camVideo.playsInline = true;
      await camVideo.play().catch(() => {});
    }

    const draw = () => {
      const boardCanvas = getBoardCanvas();
      if (!boardCanvas) return;
      if (nextMode === "standard") {
        ctx.drawImage(boardCanvas, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(boardCanvas, 0, 0, 1080, 1344);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 1344, 1080, 576);
        if (camVideo.srcObject && camVideo.videoWidth) ctx.drawImage(camVideo, 0, 1344, 1080, 576);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
    tracksRef.current = [...canvasStream.getTracks(), ...(mic?.getTracks() ?? []), ...(cam?.getTracks() ?? [])];

    try {
      const recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 6_000_000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = download;
      recorder.start(1000);
      setMode(nextMode);
      setOpen(false);
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      cleanup();
      toast.error("Erreur lors de la capture du tableau");
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return cleanup();
    recorder.stop();
  };

  return (
    <>
      <div className="fixed top-4 right-4" style={{ zIndex: 9999 }}>
        <button
          type="button"
          onClick={recording ? stop : () => setOpen(true)}
          className="flex h-11 items-center gap-2 rounded-full bg-destructive px-4 text-destructive-foreground shadow-elegant transition hover:opacity-95"
          aria-label={recording ? "Arrêter" : "Enregistrer"}
        >
          {recording ? <Square className="h-4 w-4 fill-current animate-pulse" /> : <Camera className="h-4 w-4" />}
          <span className="text-sm font-medium">{recording ? "Arrêter" : "Enregistrer"}</span>
          {recording && <span className="font-mono text-sm tabular-nums">{fmt(elapsed)}</span>}
        </button>
      </div>

      {open && !recording && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
          <button type="button" className="absolute inset-0 bg-foreground/50" onClick={() => setOpen(false)} aria-label="Fermer" />
          <div className="relative w-full max-w-sm rounded-2xl border bg-card p-4 shadow-elegant">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 text-muted-foreground" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 text-sm font-semibold">Choisir le format</div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => start("standard")} className="rounded-xl border bg-background p-4 text-left hover:bg-muted">
                <Monitor className="mb-2 h-5 w-5 text-primary" />
                <div className="text-sm font-medium">Standard</div>
                <div className="text-xs text-muted-foreground">16:9</div>
              </button>
              <button type="button" onClick={() => start("tiktok")} className="rounded-xl border bg-background p-4 text-left hover:bg-muted">
                <Smartphone className="mb-2 h-5 w-5 text-primary" />
                <div className="text-sm font-medium">TikTok</div>
                <div className="text-xs text-muted-foreground">9:16 + caméra</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
