import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Monitor,
  Camera,
  Layers,
  Mic,
  MicOff,
  Settings as SettingsIcon,
  X,
  Play,
  Pause,
  Square,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { getBoard } from "@/lib/boards-history";

type Mode = "screen" | "camera" | "both";
type Quality = "720p" | "1080p";

const QUALITY_MAP: Record<Quality, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

const pickMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "";
};

const formatTime = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const Studio = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();

  const [isFs, setIsFs] = useState(false);
  const [mode, setMode] = useState<Mode>(isMobile ? "camera" : "both");
  const [quality, setQuality] = useState<Quality>("1080p");
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");

  const [recState, setRecState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);

  const [scriptText, setScriptText] = useState("");
  const [scriptSpeed, setScriptSpeed] = useState(3);
  const [scriptPlaying, setScriptPlaying] = useState(true);
  const [scrollPos, setScrollPos] = useState(0);
  const [genLoading, setGenLoading] = useState(false);

  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, bx: 0, by: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const teleRef = useRef<HTMLDivElement>(null);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const composedStreamRef = useRef<MediaStream | null>(null);
  const composeRafRef = useRef<number | null>(null);

  // ---------- Fullscreen ----------
  const enterFs = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      setIsFs(true);
    } catch (e: any) {
      toast.error("Fullscreen not supported by your browser");
    }
  }, []);

  const exitFs = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
    setIsFs(false);
  }, []);

  useEffect(() => {
    enterFs();
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      cleanupAll();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Devices ----------
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((list) => {
      const m = list.filter((d) => d.kind === "audioinput");
      setMics(m);
      if (m[0] && !micId) setMicId(m[0].deviceId);
    }).catch(() => {});
  }, [micId]);

  // ---------- Streams ----------
  const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

  const cleanupAll = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (analyserRafRef.current) { cancelAnimationFrame(analyserRafRef.current); analyserRafRef.current = null; }
    if (composeRafRef.current) { cancelAnimationFrame(composeRafRef.current); composeRafRef.current = null; }
    stopStream(screenStreamRef.current); screenStreamRef.current = null;
    stopStream(camStreamRef.current); camStreamRef.current = null;
    stopStream(micStreamRef.current); micStreamRef.current = null;
    stopStream(composedStreamRef.current); composedStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null;
  };

  const setupMicAnalyser = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const v of data) sum += v;
        setMicLevel(sum / data.length / 255);
        analyserRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {}
  };

  const startPreview = useCallback(async () => {
    cleanupAll();
    try {
      // Mic
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      micStreamRef.current = mic;
      setupMicAnalyser(mic);

      if (mode === "screen" || mode === "both") {
        if (isMobile) {
          toast.error("Screen recording is not supported on mobile");
          return;
        }
        const display = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { width: { ideal: QUALITY_MAP[quality].width }, height: { ideal: QUALITY_MAP[quality].height } },
          audio: false,
        });
        screenStreamRef.current = display;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = display;
          await screenVideoRef.current.play().catch(() => {});
        }
        display.getVideoTracks()[0].addEventListener("ended", () => {
          if (recState !== "idle") stopRecording();
        });
      }

      if (mode === "camera" || mode === "both") {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        camStreamRef.current = cam;
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = cam;
          await camVideoRef.current.play().catch(() => {});
        }
      }
      toast.success("Preview ready");
    } catch (e: any) {
      const msg = String(e?.message || e?.name || "Permission denied");
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        toast.error("Camera or microphone access denied. Allow them in browser settings.");
      } else {
        toast.error("Unable to start preview: " + msg);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, quality, micId, isMobile]);

  // Auto preview on mode change
  useEffect(() => {
    if (!isFs) return;
    startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isFs]);

  // Mute toggle
  useEffect(() => {
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  // ---------- Composition for recording ----------
  const buildRecordingStream = async (): Promise<MediaStream> => {
    const mic = micStreamRef.current;
    const audioTracks = mic ? mic.getAudioTracks() : [];

    if (mode === "camera") {
      const cam = camStreamRef.current!;
      return new MediaStream([...cam.getVideoTracks(), ...audioTracks]);
    }

    if (mode === "screen") {
      const scr = screenStreamRef.current!;
      return new MediaStream([...scr.getVideoTracks(), ...audioTracks]);
    }

    // both: composite via canvas
    const scr = screenStreamRef.current!;
    const cam = camStreamRef.current!;
    const settings = scr.getVideoTracks()[0].getSettings();
    const W = settings.width || 1920;
    const H = settings.height || 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const sv = document.createElement("video");
    sv.srcObject = scr; sv.muted = true; await sv.play();
    const cv = document.createElement("video");
    cv.srcObject = cam; cv.muted = true; await cv.play();

    const bubbleSize = Math.round(H * 0.22);
    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      try { ctx.drawImage(sv, 0, 0, W, H); } catch {}
      // circular cam bubble bottom-right
      const x = W - bubbleSize - 24;
      const y = H - bubbleSize - 24;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + bubbleSize / 2, y + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      try { ctx.drawImage(cv, x, y, bubbleSize, bubbleSize); } catch {}
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x + bubbleSize / 2, y + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      composeRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    const out = (canvas as any).captureStream(30) as MediaStream;
    audioTracks.forEach((t) => out.addTrack(t));
    return out;
  };

  const startRecording = async () => {
    try {
      const stream = await buildRecordingStream();
      composedStreamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
        if (blob.size === 0) {
          toast.error("Recording failed: empty file");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ext = (mimeType.includes("mp4") ? "mp4" : "webm");
        a.href = url;
        a.download = `studio-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success("Recording saved");
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecState("recording");
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("Could not start recording: " + (e?.message || e));
    }
  };

  const pauseRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") { rec.pause(); setRecState("paused"); if (timerRef.current) clearInterval(timerRef.current); }
    else if (rec.state === "paused") {
      rec.resume();
      setRecState("recording");
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (composeRafRef.current) { cancelAnimationFrame(composeRafRef.current); composeRafRef.current = null; }
    setRecState("idle");
  };

  // ---------- Teleprompter scroll ----------
  useEffect(() => {
    if (!scriptPlaying) return;
    const el = teleRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setScrollPos((p) => {
        const next = p + dt * scriptSpeed * 20;
        const max = el.scrollHeight - el.clientHeight;
        if (next > max) return 0;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scriptPlaying, scriptSpeed]);

  useEffect(() => {
    if (teleRef.current) teleRef.current.scrollTop = scrollPos;
  }, [scrollPos]);

  const generateScript = async () => {
    const id = searchParams.get("board");
    if (!id) {
      toast.error("Open a board first to generate a script from it");
      return;
    }
    setGenLoading(true);
    try {
      const row = await getBoard(id);
      if (!row) throw new Error("Board not found");
      const labels = row.data.nodes.map((n) => n.label).join(" • ");
      const { data, error } = await supabase.functions.invoke("board-suggest", { body: { board: row.data, mode: "script" } });
      if (error) throw error;
      const text = (data as any)?.script || (data as any)?.summary || `Talk about: ${labels}`;
      setScriptText(text);
      setScrollPos(0);
      toast.success("Script generated");
    } catch (e: any) {
      toast.error("Could not generate script: " + (e?.message || e));
    } finally {
      setGenLoading(false);
    }
  };

  // ---------- Bubble drag ----------
  const onBubbleDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, bx: bubblePos.x, by: bubblePos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBubbleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setBubblePos({
      x: dragStartRef.current.bx + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.by + (e.clientY - dragStartRef.current.y),
    });
  };
  const onBubbleUp = () => { draggingRef.current = false; };

  // ---------- Render ----------
  if (!isFs) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] text-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Repasse en plein écran pour utiliser le Studio</h1>
          <p className="text-sm text-white/70 mb-6">The Studio requires fullscreen mode to work properly.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={enterFs}>Enter fullscreen</Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="bg-transparent text-white border-white/30 hover:bg-white/10">
              Quit Studio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#1A1A1A] text-white flex flex-col select-none">
      {/* Top bar */}
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-white/10 bg-[#141414]">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => { cleanupAll(); await exitFs(); navigate("/dashboard"); }}
          className="bg-transparent text-white border-white/20 hover:bg-white/10"
        >
          <X className="h-4 w-4 mr-1.5" /> Quitter le Studio
        </Button>

        {/* Mode selector */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {([
            { id: "screen", label: "Écran", icon: Monitor, mobile: false },
            { id: "camera", label: "Caméra", icon: Camera, mobile: true },
            { id: "both", label: "Écran + Caméra", icon: Layers, mobile: false },
          ] as const).map((m) => {
            const disabled = isMobile && !m.mobile;
            return (
              <button
                key={m.id}
                disabled={disabled || recState !== "idle"}
                onClick={() => setMode(m.id as Mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${
                  mode === m.id ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white hover:bg-white/5"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <m.icon className="h-4 w-4" /> {m.label}
              </button>
            );
          })}
        </div>

        {/* Right: timer, mic, settings */}
        <div className="flex items-center gap-3">
          {recState !== "idle" && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <span className={`h-2.5 w-2.5 rounded-full bg-red-500 ${recState === "recording" ? "animate-pulse" : ""}`} />
              {formatTime(elapsed)}
            </div>
          )}
          {/* mic level */}
          <div className="flex items-end gap-0.5 h-5">
            {[0, 1, 2, 3, 4].map((i) => {
              const active = micLevel * 5 > i;
              return <div key={i} className={`w-1 rounded-sm transition ${active ? "bg-primary" : "bg-white/15"}`} style={{ height: `${(i + 1) * 4}px` }} />;
            })}
          </div>
          <button
            onClick={() => setMuted((v) => !v)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/10 transition"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/10 transition">
                <SettingsIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 bg-[#1f1f1f] text-white border-white/10">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-white/70">Microphone</label>
                  <select
                    value={micId}
                    onChange={(e) => setMicId(e.target.value)}
                    className="mt-1 w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-sm"
                  >
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>{m.label || "Microphone"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/70">Quality</label>
                  <div className="mt-1 flex gap-2">
                    {(["720p", "1080p"] as Quality[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuality(q)}
                        className={`flex-1 py-1.5 rounded text-sm border ${quality === q ? "bg-primary text-primary-foreground border-primary" : "border-white/10 hover:bg-white/5"}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Center canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden bg-black">
        {(mode === "screen" || mode === "both") && (
          <video
            ref={screenVideoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
        {mode === "camera" && (
          <video
            ref={camVideoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {mode === "both" && (
          <video
            ref={camVideoRef}
            autoPlay
            muted
            playsInline
            onPointerDown={onBubbleDown}
            onPointerMove={onBubbleMove}
            onPointerUp={onBubbleUp}
            style={{
              right: 24 - bubblePos.x,
              bottom: 24 - bubblePos.y,
              width: 150,
              height: 150,
            }}
            className="absolute rounded-full object-cover border-2 border-white shadow-2xl cursor-grab active:cursor-grabbing"
          />
        )}

        {!screenStreamRef.current && !camStreamRef.current && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
            <Button variant="outline" onClick={startPreview} className="bg-transparent text-white border-white/30 hover:bg-white/10">
              <Play className="h-4 w-4 mr-1.5" /> Start preview
            </Button>
          </div>
        )}
      </div>

      {/* Teleprompter — overlay, NOT captured */}
      <div className="shrink-0 h-[120px] border-t border-white/10 bg-black/70 backdrop-blur px-4 py-2 flex gap-3 items-stretch">
        <div className="flex-1 min-w-0 relative">
          {scriptText ? (
            <div
              ref={teleRef}
              className="h-full overflow-hidden text-center"
              style={{ fontSize: 22, lineHeight: 1.5, color: "white" }}
            >
              <div style={{ paddingTop: 80, paddingBottom: 80, whiteSpace: "pre-wrap" }}>{scriptText}</div>
            </div>
          ) : (
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Type or paste your script here…"
              className="w-full h-full bg-transparent text-white placeholder-white/40 text-center resize-none outline-none"
              style={{ fontSize: 22, lineHeight: 1.5 }}
            />
          )}
        </div>
        <div className="w-56 flex flex-col gap-2 justify-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScriptPlaying((v) => !v)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/15 transition"
              aria-label={scriptPlaying ? "Pause scroll" : "Resume scroll"}
            >
              {scriptPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <Slider value={[scriptSpeed]} min={1} max={10} step={1} onValueChange={(v) => setScriptSpeed(v[0])} className="flex-1" />
            <span className="text-xs text-white/60 w-4">{scriptSpeed}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 bg-transparent text-white border-white/20 hover:bg-white/10" onClick={() => { setScriptText(""); setScrollPos(0); }}>
              Clear
            </Button>
            <Button size="sm" onClick={generateScript} disabled={genLoading} className="flex-1">
              {genLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" />AI</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom record bar */}
      <div className="h-20 shrink-0 border-t border-white/10 bg-[#141414] flex items-center justify-center gap-4">
        {recState === "idle" ? (
          <button
            onClick={startRecording}
            className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-500 transition shadow-lg flex items-center justify-center"
            aria-label="Start recording"
          >
            <span className="h-6 w-6 rounded-full bg-white" />
          </button>
        ) : (
          <>
            <button
              onClick={pauseRecording}
              className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/15 transition flex items-center justify-center"
              aria-label="Pause"
            >
              {recState === "paused" ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button
              onClick={stopRecording}
              className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-500 transition shadow-lg flex items-center justify-center animate-pulse"
              aria-label="Stop recording"
            >
              <Square className="h-6 w-6 text-white" fill="white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Studio;
