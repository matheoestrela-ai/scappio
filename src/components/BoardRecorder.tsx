import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";
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

  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const cornerRef = useRef<Corner>("bl");
  const startTimeRef = useRef(0);

  useEffect(() => { cornerRef.current = corner; }, [corner]);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = timerRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current = null;
    setCamReady(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast.error("Your browser does not support recording");
      return;
    }
    if (!(navigator.mediaDevices as any).getDisplayMedia) {
      toast.error("Screen recording is not supported on this device");
      return;
    }

    // 1) Screen first (must be from user gesture)
    let screen: MediaStream;
    try {
      screen = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
    } catch (e: any) {
      if (e?.name === "NotAllowedError") toast.error("Screen sharing denied");
      else toast.error("Could not start screen capture: " + (e?.message || e));
      return;
    }
    screenStreamRef.current = screen;

    // 2) Camera + mic (best-effort)
    let cam: MediaStream | null = null;
    try {
      cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 480 }, facingMode: "user" },
        audio: true,
      });
    } catch {
      try {
        cam = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast.warning("Camera denied — recording without webcam bubble");
      } catch {
        toast.warning("Camera & mic denied — recording screen only");
      }
    }
    camStreamRef.current = cam;

    const camHasVideo = !!cam && cam.getVideoTracks().length > 0;
    if (camHasVideo) {
      const v = document.createElement("video");
      v.srcObject = new MediaStream(cam!.getVideoTracks());
      v.muted = true; v.playsInline = true; v.autoplay = true;
      try { await v.play(); } catch {}
      camVideoElRef.current = v;
      setCamReady(true);
    }

    // Screen video element to feed canvas
    const sv = document.createElement("video");
    sv.srcObject = new MediaStream(screen.getVideoTracks());
    sv.muted = true; sv.playsInline = true; sv.autoplay = true;
    try { await sv.play(); } catch {}
    screenVideoElRef.current = sv;

    // wait one frame so videoWidth is populated
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const sTrackSettings = screen.getVideoTracks()[0].getSettings();
    const W = sv.videoWidth || sTrackSettings.width || 1920;
    const H = sv.videoHeight || sTrackSettings.height || 1080;

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      try { ctx.drawImage(sv, 0, 0, W, H); } catch {}
      // Camera bubble is rendered as a DOM overlay and already captured by the screen stream.
      // Do NOT redraw it here, otherwise the face appears twice in the final video.
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    // Mix audio: system (if any) + mic
    const composed = (canvas as any).captureStream(30) as MediaStream;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    let hasAudio = false;
    if (screen.getAudioTracks().length) {
      try { audioCtx.createMediaStreamSource(new MediaStream(screen.getAudioTracks())).connect(dest); hasAudio = true; } catch {}
    }
    if (cam && cam.getAudioTracks().length) {
      try { audioCtx.createMediaStreamSource(new MediaStream(cam.getAudioTracks())).connect(dest); hasAudio = true; } catch {}
    }
    if (hasAudio) dest.stream.getAudioTracks().forEach((t) => composed.addTrack(t));

    // If user stops sharing via browser UI, finalize
    screen.getVideoTracks()[0].addEventListener("ended", () => stopRecording());

    const mimeType = pickMime();
    const rec = new MediaRecorder(composed, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
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
          title: boardTitle || "Screen recording",
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
      try { audioCtx.close(); } catch {}
      cleanup();
    };
    rec.start(250);
    recorderRef.current = rec;
    startTimeRef.current = Date.now();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch {}
    }
  };

  // Mount cam <video> into the visible bubble
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

  // Drag bubble between corners
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
                aria-label={recording ? "Stop recording" : "Record screen"}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-full shadow-md transition text-white ${
                  recording ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {recording ? <Square className="h-4 w-4" fill="currentColor" /> : <Camera className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {recording ? "Arrêter l'enregistrement" : "Enregistrer l'écran"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

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
