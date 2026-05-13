import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { saveRecording } from "@/lib/recordings-db";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePlan } from "@/hooks/usePlan";
import { isPaidPlan, FREE_RECORDING_LIMIT } from "@/lib/plans";
import { supabase } from "@/integrations/supabase/client";

type Corner = "tl" | "tr" | "bl" | "br";
type Format = "16:9" | "9:16";

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
  const { plan, recordingsUsed, refresh: refreshPlan } = usePlan();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [corner, setCorner] = useState<Corner>("bl");
  const [camReady, setCamReady] = useState(false);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<Format>("16:9");

  const planRef = useRef(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);

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

  const startRecording = async (format: Format) => {
    setActiveFormat(format);
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
        video: { width: { ideal: 720 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
    } catch {
      try {
        cam = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast.warning("Camera denied — recording without webcam");
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
      // In 16:9 mode we render the bubble overlay so it's captured by screen stream.
      // In 9:16 mode we draw the camera directly on canvas — no bubble overlay needed.
      if (format === "16:9") setCamReady(true);
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
    const SW = sv.videoWidth || sTrackSettings.width || 1920;
    const SH = sv.videoHeight || sTrackSettings.height || 1080;

    // Output canvas dimensions
    const W = format === "9:16" ? 1080 : SW;
    const H = format === "9:16" ? 1920 : SH;

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // Helper: draw "cover" (center-crop) of source into target rect
    const drawCover = (
      src: CanvasImageSource,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      if (!sw || !sh) return;
      const srcRatio = sw / sh;
      const dstRatio = dw / dh;
      let cx = 0, cy = 0, cw = sw, ch = sh;
      if (srcRatio > dstRatio) {
        // source wider -> crop sides
        cw = sh * dstRatio;
        cx = (sw - cw) / 2;
      } else {
        ch = sw / dstRatio;
        cy = (sh - ch) / 2;
      }
      try { ctx.drawImage(src, cx, cy, cw, ch, dx, dy, dw, dh); } catch {}
    };

    // Helper: draw "contain" (fit) of source into target rect (letterboxed)
    const drawContain = (
      src: CanvasImageSource,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      if (!sw || !sh) return;
      const srcRatio = sw / sh;
      const dstRatio = dw / dh;
      let tw = dw, th = dh;
      if (srcRatio > dstRatio) {
        th = dw / srcRatio;
      } else {
        tw = dh * srcRatio;
      }
      const tx = dx + (dw - tw) / 2;
      const ty = dy + (dh - th) / 2;
      try { ctx.drawImage(src, 0, 0, sw, sh, tx, ty, tw, th); } catch {}
    };

    const drawWatermark = () => {
      if (isPaidPlan(planRef.current)) return;
      const text = "✦ Scappio";
      ctx.save();
      ctx.font = "bold 36px Inter, system-ui, sans-serif";
      ctx.textBaseline = "alphabetic";
      const padX = 18, padY = 12, radius = 10;
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const textH = 36;
      const boxW = textW + padX * 2;
      const boxH = textH + padY * 2;
      const x = W - 28 - boxW;
      const y = H - 28 - boxH;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + boxW - radius, y);
      ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + radius);
      ctx.lineTo(x + boxW, y + boxH - radius);
      ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - radius, y + boxH);
      ctx.lineTo(x + radius, y + boxH);
      ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(text, x + padX, y + padY + textH - 6);
      ctx.restore();
    };

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (format === "9:16") {
        // top half = board (screen), bottom half = camera
        const halfH = H / 2;
        drawContain(sv, SW, SH, 0, 0, W, halfH);
        const cv = camVideoElRef.current;
        if (cv && cv.videoWidth) {
          drawCover(cv, cv.videoWidth, cv.videoHeight, 0, halfH, W, halfH);
        }
      } else {
        try { ctx.drawImage(sv, 0, 0, W, H); } catch {}
        // Camera bubble is captured by the screen stream (DOM overlay), no redraw.
      }
      drawWatermark();
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
          format,
          blob,
        });
        toast.success("Recording saved");
        if (!isPaidPlan(planRef.current)) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.rpc("consume_recording_quota", {
                _user: user.id,
                _free_limit: FREE_RECORDING_LIMIT,
              });
              refreshPlan();
            }
          } catch (e) { console.warn("quota increment failed", e); }
        }
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

  // Mount cam <video> into the visible bubble (16:9 mode only)
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

  const handleRecordClick = () => {
    if (!isPaidPlan(plan) && recordingsUsed >= FREE_RECORDING_LIMIT) {
      setPaywallOpen(true);
      return;
    }
    setFormatDialogOpen(true);
  };

  const handleSelectFormat = async (format: Format) => {
    setFormatDialogOpen(false);
    // Slight delay so dialog close doesn't swallow the user gesture for getDisplayMedia
    await new Promise((r) => setTimeout(r, 50));
    await startRecording(format);
  };

  return (
    <>
      {recording && (
        <div data-recorder-ui="true" className="pointer-events-none absolute inset-0 z-40 ring-2 ring-red-500 rounded-2xl" />
      )}

      <div data-recorder-ui="true" className="absolute top-2 left-1/2 translate-x-[230px] z-[201] flex items-center gap-2">
        {recording && (
          <span className="text-xs font-mono text-white bg-black/70 backdrop-blur px-2 py-1 rounded">
            {fmt(elapsed)}
          </span>
        )}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={recording ? stopRecording : handleRecordClick}
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

      {camReady && activeFormat === "16:9" && (
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

      <Dialog open={formatDialogOpen} onOpenChange={setFormatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choisir le format d'enregistrement</DialogTitle>
            <DialogDescription>
              Sélectionne l'orientation de la vidéo finale.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              onClick={() => handleSelectFormat("16:9")}
              className="group flex flex-col items-center gap-3 rounded-xl border border-border p-4 hover:border-primary hover:bg-accent transition"
            >
              <div className="flex items-center justify-center w-full aspect-video rounded-md bg-muted group-hover:bg-background border border-border">
                <Monitor className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="text-center">
                <div className="font-medium">16:9</div>
                <div className="text-xs text-muted-foreground">Paysage — écran + bulle caméra</div>
              </div>
            </button>
            <button
              onClick={() => handleSelectFormat("9:16")}
              className="group flex flex-col items-center gap-3 rounded-xl border border-border p-4 hover:border-primary hover:bg-accent transition"
            >
              <div className="flex items-center justify-center w-full rounded-md bg-muted group-hover:bg-background border border-border" style={{ aspectRatio: "9 / 16", maxHeight: 140 }}>
                <Smartphone className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="text-center">
                <div className="font-medium">9:16</div>
                <div className="text-xs text-muted-foreground">Portrait — board en haut, caméra en bas</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-center">
              Tu as atteint ta limite de 10 enregistrements ce mois-ci.
            </DialogTitle>
            <DialogDescription className="text-center">
              Passe en Creator pour enregistrer sans limite.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => { setPaywallOpen(false); navigate("/upgrade"); }}
              className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 transition"
            >
              Passer en Creator →
            </button>
            <button
              onClick={() => setPaywallOpen(false)}
              className="w-full rounded-lg bg-muted hover:bg-muted/80 text-foreground font-medium py-2.5 transition"
            >
              Annuler
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BoardRecorder;
