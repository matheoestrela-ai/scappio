import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { saveRecording } from "@/lib/recordings-db";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Corner = "tl" | "tr" | "bl" | "br";

type Props = {
  targetRef: React.RefObject<HTMLElement>;
  boardId: string | null;
  boardTitle?: string;
};

const BUBBLE = 140;
const FPS = 12;

const pickMime = () => {
  const list = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of list) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "";
};

const BoardRecorder = ({ targetRef, boardId, boardTitle }: Props) => {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corner, setCorner] = useState<Corner>("br");
  const [hasCam, setHasCam] = useState(false);

  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const captureLoopRef = useRef<number | null>(null);
  const lastFrameImgRef = useRef<HTMLImageElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const stoppingRef = useRef(false);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (captureLoopRef.current) clearInterval(captureLoopRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = captureLoopRef.current = timerRef.current = null;
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = micStreamRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Your browser does not support video recording");
      return;
    }
    const target = targetRef.current;
    if (!target) {
      toast.error("Board not ready");
      return;
    }

    // Try cam + mic, then mic alone, then none — independently
    let cam: MediaStream | null = null;
    let mic: MediaStream | null = null;
    try {
      cam = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320, facingMode: "user" } });
    } catch {
      toast.warning("Camera denied — recording board only");
    }
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.warning("Microphone denied — recording without audio");
    }

    camStreamRef.current = cam;
    micStreamRef.current = mic;
    setHasCam(!!cam);

    if (cam) {
      const v = document.createElement("video");
      v.srcObject = cam;
      v.muted = true;
      v.playsInline = true;
      await v.play().catch(() => {});
      camVideoRef.current = v;
    }

    const rect = target.getBoundingClientRect();
    const W = Math.max(640, Math.floor(rect.width));
    const H = Math.max(360, Math.floor(rect.height));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);

    // Capture board frames into an image periodically
    const captureFrame = async () => {
      if (stoppingRef.current) return;
      try {
        const dataUrl = await toPng(target, { cacheBust: false, pixelRatio: 1, skipFonts: true });
        const img = new Image();
        img.onload = () => { lastFrameImgRef.current = img; };
        img.src = dataUrl;
      } catch {/* ignore frame */}
    };
    await captureFrame();
    captureLoopRef.current = window.setInterval(captureFrame, 1000 / FPS);

    // Compose loop
    const draw = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      const img = lastFrameImgRef.current;
      if (img) {
        try { ctx.drawImage(img, 0, 0, W, H); } catch {}
      }
      const camV = camVideoRef.current;
      if (camV && camV.readyState >= 2) {
        const r = BUBBLE / 2;
        let cx = W - r - 24, cy = H - r - 24;
        if (corner === "tl") { cx = r + 24; cy = r + 24; }
        else if (corner === "tr") { cx = W - r - 24; cy = r + 24; }
        else if (corner === "bl") { cx = r + 24; cy = H - r - 24; }
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try { ctx.drawImage(camV, cx - r, cy - r, BUBBLE, BUBBLE); } catch {}
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    // Build stream
    const stream = (canvas as any).captureStream(30) as MediaStream;
    if (mic) mic.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      // thumbnail = current canvas frame
      let thumb: string | null = null;
      try { thumb = canvas.toDataURL("image/jpeg", 0.7); } catch {}
      const id = crypto.randomUUID();
      try {
        await saveRecording({
          id,
          title: boardTitle || "Board recording",
          boardId,
          durationSec: duration,
          createdAt: Date.now(),
          mimeType: blob.type,
          thumbnail: thumb,
          blob,
        });
        toast.success("Recording saved");
        navigate("/recordings");
      } catch (e: any) {
        toast.error("Could not save recording: " + (e?.message || e));
      }
      stopAll();
      stoppingRef.current = false;
    };
    rec.start(1000);
    recorderRef.current = rec;
    startTimeRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    stoppingRef.current = true;
    try { recorderRef.current.stop(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  };

  // Drag bubble between corners
  const bubbleDragRef = useRef<{ x: number; y: number } | null>(null);
  const onBubbleDown = (e: React.PointerEvent) => {
    bubbleDragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBubbleUp = (e: React.PointerEvent) => {
    if (!bubbleDragRef.current) return;
    const target = targetRef.current;
    if (!target) return;
    const r = target.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const left = cx < r.width / 2;
    const top = cy < r.height / 2;
    setCorner(`${top ? "t" : "b"}${left ? "l" : "r"}` as Corner);
    bubbleDragRef.current = null;
  };

  // Mount the camera preview node into the target so it sits inside the board
  useEffect(() => {
    const v = camVideoRef.current;
    const t = targetRef.current;
    if (!v || !t || !hasCam) return;
    v.style.position = "absolute";
    v.style.width = `${BUBBLE}px`;
    v.style.height = `${BUBBLE}px`;
    v.style.borderRadius = "9999px";
    v.style.objectFit = "cover";
    v.style.border = "3px solid white";
    v.style.boxShadow = "0 6px 24px rgba(0,0,0,.35)";
    v.style.zIndex = "60";
    v.style.cursor = "grab";
    v.style.touchAction = "none";
    if (corner === "tl") { v.style.top = "16px"; v.style.left = "16px"; v.style.right = "auto"; v.style.bottom = "auto"; }
    else if (corner === "tr") { v.style.top = "16px"; v.style.right = "16px"; v.style.left = "auto"; v.style.bottom = "auto"; }
    else if (corner === "bl") { v.style.bottom = "16px"; v.style.left = "16px"; v.style.right = "auto"; v.style.top = "auto"; }
    else { v.style.bottom = "16px"; v.style.right = "16px"; v.style.left = "auto"; v.style.top = "auto"; }
    v.onpointerdown = (e) => onBubbleDown(e as any);
    v.onpointerup = (e) => onBubbleUp(e as any);
    if (v.parentElement !== t) t.appendChild(v);
    return () => { try { v.remove(); } catch {} };
  }, [hasCam, corner, targetRef]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <>
      {/* Recording border */}
      {recording && (
        <div className="pointer-events-none absolute inset-0 z-40 ring-2 ring-red-500 rounded-2xl animate-pulse" />
      )}

      {/* Button + timer */}
      <div className="absolute top-3 right-16 z-50 flex items-center gap-2">
        {recording && (
          <span className="text-xs font-mono text-white bg-black/60 backdrop-blur px-2 py-1 rounded">
            {fmt(elapsed)}
          </span>
        )}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? "Stop recording" : "Record board"}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-full shadow-md transition ${
                  recording
                    ? "bg-red-600 hover:bg-red-500 animate-pulse text-white"
                    : "bg-red-600 hover:bg-red-500 text-white"
                }`}
              >
                {recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Camera className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{recording ? "Arrêter l'enregistrement" : "Enregistrer le tableau"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {typeof MediaRecorder === "undefined" && (
        <div className="absolute top-14 right-3 z-50 bg-red-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Recording not supported
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
