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

const cornerStyle = (c: Corner): React.CSSProperties => {
  const base: React.CSSProperties = { position: "absolute" };
  if (c === "tl") return { ...base, top: 16, left: 16 };
  if (c === "tr") return { ...base, top: 16, right: 16 };
  if (c === "bl") return { ...base, bottom: 16, left: 16 };
  return { ...base, bottom: 16, right: 16 };
};

const BoardRecorder = ({ targetRef, boardId, boardTitle }: Props) => {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corner, setCorner] = useState<Corner>("bl");
  const [camReady, setCamReady] = useState(false);

  const camStreamRef = useRef<MediaStream | null>(null);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const captureLoopRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFrameImgRef = useRef<HTMLImageElement | null>(null);
  const captureBusyRef = useRef(false);
  const cornerRef = useRef<Corner>("bl");
  const startTimeRef = useRef(0);
  const stoppingRef = useRef(false);

  useEffect(() => { cornerRef.current = corner; }, [corner]);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (captureLoopRef.current) clearInterval(captureLoopRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = captureLoopRef.current = timerRef.current = null;
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    setCamReady(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Your browser does not support recording");
      return;
    }
    const target = targetRef.current;
    if (!target) return;

    // Request cam + mic in a single user-gesture call
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: "user" },
        audio: true,
      });
    } catch (err: any) {
      // Try without camera (mic only)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast.warning("Camera denied — recording board without webcam");
      } catch {
        toast.error("Camera & microphone denied. Allow them in browser settings.");
        return;
      }
    }

    const hasVideo = stream.getVideoTracks().length > 0;
    camStreamRef.current = stream;

    if (hasVideo) {
      const v = document.createElement("video");
      v.srcObject = new MediaStream(stream.getVideoTracks());
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      try { await v.play(); } catch {}
      camVideoElRef.current = v;
      setCamReady(true);
    }

    const rect = target.getBoundingClientRect();
    const W = Math.max(640, Math.floor(rect.width));
    const H = Math.max(360, Math.floor(rect.height));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Capture board frames into a cached image (sequential — never overlap)
    const captureFrame = async () => {
      if (stoppingRef.current || captureBusyRef.current) return;
      captureBusyRef.current = true;
      try {
        const dataUrl = await toPng(target, {
          cacheBust: false,
          pixelRatio: 1,
          skipFonts: true,
          backgroundColor: "#ffffff",
          filter: (node) => {
            // exclude the recorder UI itself from capture
            if (!(node instanceof HTMLElement)) return true;
            return node.dataset?.recorderUi !== "true";
          },
        });
        await new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => { lastFrameImgRef.current = img; res(); };
          img.onerror = () => res();
          img.src = dataUrl;
        });
      } catch {/* ignore */}
      captureBusyRef.current = false;
    };
    await captureFrame();
    captureLoopRef.current = window.setInterval(captureFrame, 200); // ~5fps board

    // Compose at 30fps
    const draw = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      const img = lastFrameImgRef.current;
      if (img) { try { ctx.drawImage(img, 0, 0, W, H); } catch {} }

      const camV = camVideoElRef.current;
      if (camV && camV.readyState >= 2) {
        const r = BUBBLE / 2;
        const c = cornerRef.current;
        let cx = W - r - 24, cy = H - r - 24;
        if (c === "tl") { cx = r + 24; cy = r + 24; }
        else if (c === "tr") { cx = W - r - 24; cy = r + 24; }
        else if (c === "bl") { cx = r + 24; cy = H - r - 24; }
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try { ctx.drawImage(camV, cx - r, cy - r, BUBBLE, BUBBLE); } catch {}
        ctx.restore();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    // Build composed stream (canvas video + mic audio)
    const composed = (canvas as any).captureStream(30) as MediaStream;
    stream.getAudioTracks().forEach((t) => composed.addTrack(t));

    const mimeType = pickMime();
    const rec = new MediaRecorder(composed, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      let thumb: string | null = null;
      try { thumb = canvas.toDataURL("image/jpeg", 0.7); } catch {}
      try {
        await saveRecording({
          id: crypto.randomUUID(),
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
        toast.error("Save failed: " + (e?.message || e));
      }
      cleanup();
      stoppingRef.current = false;
    };
    rec.start(250);
    recorderRef.current = rec;
    startTimeRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    stoppingRef.current = true;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current.stop(); } catch {}
  };

  // Attach the cam video element to the JSX bubble container
  const bubbleHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!camReady) return;
    const v = camVideoElRef.current;
    const host = bubbleHostRef.current;
    if (!v || !host) return;
    v.style.width = "100%";
    v.style.height = "100%";
    v.style.objectFit = "cover";
    v.style.borderRadius = "9999px";
    v.style.display = "block";
    host.appendChild(v);
    return () => { try { v.remove(); } catch {} };
  }, [camReady]);

  // Drag bubble to nearest corner
  const dragRef = useRef(false);
  const onBubbleDown = (e: React.PointerEvent) => {
    dragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBubbleUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = false;
    const t = targetRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const left = cx < r.width / 2;
    const top = cy < r.height / 2;
    setCorner(`${top ? "t" : "b"}${left ? "l" : "r"}` as Corner);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <>
      {recording && (
        <div data-recorder-ui="true" className="pointer-events-none absolute inset-0 z-40 ring-2 ring-red-500 rounded-2xl" />
      )}

      <div data-recorder-ui="true" className="absolute top-3 right-16 z-50 flex items-center gap-2">
        {recording && (
          <span className="text-xs font-mono text-white bg-black/70 backdrop-blur px-2 py-1 rounded">
            {fmt(elapsed)}
          </span>
        )}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? "Stop recording" : "Record board"}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-full shadow-md transition text-white ${
                  recording ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Camera className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {recording ? "Arrêter l'enregistrement" : "Enregistrer le tableau"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Camera bubble overlay (also drawn into the recorded canvas) */}
      {camReady && (
        <div
          data-recorder-ui="true"
          ref={bubbleHostRef}
          onPointerDown={onBubbleDown}
          onPointerUp={onBubbleUp}
          style={{
            ...cornerStyle(corner),
            width: BUBBLE,
            height: BUBBLE,
            zIndex: 60,
            cursor: "grab",
            touchAction: "none",
            borderRadius: "9999px",
            border: "3px solid white",
            boxShadow: "0 8px 28px rgba(0,0,0,.35)",
            overflow: "hidden",
            background: "#000",
          }}
        />
      )}
    </>
  );
};

export default BoardRecorder;
