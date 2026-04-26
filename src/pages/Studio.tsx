import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Monitor,
  Layers,
  Mic,
  MicOff,
  Settings as SettingsIcon,
  X,
  Play,
  Pause,
  Square,
  Sparkles,
  AlertCircle,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "screen" | "camera" | "both";
type Quality = "720" | "1080";

const QUALITY_MAP: Record<Quality, { width: number; height: number }> = {
  "720": { width: 1280, height: 720 },
  "1080": { width: 1920, height: 1080 },
};

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const Studio = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mode, setMode] = useState<Mode>(isMobile ? "camera" : "camera");
  const [quality, setQuality] = useState<Quality>("1080");

  // streams
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // video refs
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const bubbleVideoRef = useRef<HTMLVideoElement>(null);

  // recording
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // teleprompter
  const [script, setScript] = useState("");
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [scrolling, setScrolling] = useState(true);
  const teleContentRef = useRef<HTMLDivElement>(null);
  const teleScrollRef = useRef<HTMLDivElement>(null);
  const teleRafRef = useRef<number | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);

  // bubble drag
  const [bubblePos, setBubblePos] = useState({ x: 24, y: 24 });
  const draggingRef = useRef<{ ox: number; oy: number } | null>(null);

  // ---------- Fullscreen ----------
  const requestFs = useCallback(async () => {
    try {
      if (!document.documentElement.requestFullscreen) {
        toast.error("Le mode plein écran n'est pas supporté par ton navigateur.");
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (e) {
      toast.error("Impossible de passer en plein écran.");
    }
  }, []);

  useEffect(() => {
    requestFs();
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [requestFs]);

  // ---------- Devices ----------
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devs) => {
      const mics = devs.filter((d) => d.kind === "audioinput");
      setMicDevices(mics);
      if (mics[0] && !micId) setMicId(mics[0].deviceId);
    });
  }, [micId]);

  // ---------- Mic ----------
  const startMic = useCallback(async () => {
    try {
      stopMic();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setMicLevel(sum / data.length / 255);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      toast.error("Permission micro refusée. Active l'accès au micro dans les paramètres du navigateur.");
    }
  }, [micId]);

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  useEffect(() => {
    startMic();
    return () => stopMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId]);

  useEffect(() => {
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  // ---------- Camera / Screen sources ----------
  const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

  const startCamera = useCallback(async () => {
    try {
      stopStream(cameraStreamRef.current);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: QUALITY_MAP[quality].width },
          height: { ideal: QUALITY_MAP[quality].height },
          facingMode: "user",
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
    } catch (e: any) {
      toast.error("Permission caméra refusée. Active l'accès à la caméra dans les paramètres du navigateur.");
      throw e;
    }
  }, [quality]);

  const startScreen = useCallback(async () => {
    try {
      stopStream(screenStreamRef.current);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 9999 }, height: { ideal: 9999 } } as any,
        audio: false,
      });
      screenStreamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => {
        if (mode === "screen" || mode === "both") {
          screenStreamRef.current = null;
          if (mainVideoRef.current) mainVideoRef.current.srcObject = null;
        }
      };
    } catch (e: any) {
      toast.error("Capture d'écran refusée ou non supportée.");
      throw e;
    }
  }, [mode]);

  // setup preview based on mode
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isMobile && mode !== "camera") {
          setMode("camera");
          return;
        }
        if (mode === "camera") {
          stopStream(screenStreamRef.current);
          screenStreamRef.current = null;
          await startCamera();
          if (cancelled) return;
          if (mainVideoRef.current) mainVideoRef.current.srcObject = cameraStreamRef.current;
        } else if (mode === "screen") {
          stopStream(cameraStreamRef.current);
          cameraStreamRef.current = null;
          await startScreen();
          if (cancelled) return;
          if (mainVideoRef.current) mainVideoRef.current.srcObject = screenStreamRef.current;
        } else {
          await startScreen();
          await startCamera();
          if (cancelled) return;
          if (mainVideoRef.current) mainVideoRef.current.srcObject = screenStreamRef.current;
          if (bubbleVideoRef.current) bubbleVideoRef.current.srcObject = cameraStreamRef.current;
        }
      } catch {
        /* handled */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isMobile]);

  useEffect(() => {
    return () => {
      stopStream(screenStreamRef.current);
      stopStream(cameraStreamRef.current);
    };
  }, []);

  // ---------- Recording ----------
  const buildRecordStream = async (): Promise<MediaStream> => {
    // We use a canvas to composite if "both" mode, otherwise use direct stream.
    const tracks: MediaStreamTrack[] = [];

    if (mode === "both" && screenStreamRef.current && cameraStreamRef.current) {
      const screen = screenStreamRef.current;
      const cam = cameraStreamRef.current;
      const settings = screen.getVideoTracks()[0].getSettings();
      const w = settings.width || 1280;
      const h = settings.height || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const sv = document.createElement("video");
      sv.srcObject = screen;
      sv.muted = true;
      await sv.play();
      const cv = document.createElement("video");
      cv.srcObject = cam;
      cv.muted = true;
      await cv.play();
      const draw = () => {
        ctx.drawImage(sv, 0, 0, w, h);
        const bubW = Math.round(w * 0.18);
        const bubH = Math.round(bubW * (cv.videoHeight / cv.videoWidth || 9 / 16));
        const x = w - bubW - 32;
        const y = h - bubH - 32;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + bubW / 2, y + bubH / 2, Math.min(bubW, bubH) / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(cv, x, y, bubW, bubH);
        ctx.restore();
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          requestAnimationFrame(draw);
        }
      };
      requestAnimationFrame(draw);
      const cstream = (canvas as any).captureStream(30) as MediaStream;
      cstream.getVideoTracks().forEach((t) => tracks.push(t));
    } else {
      const src = mode === "screen" ? screenStreamRef.current : cameraStreamRef.current;
      src?.getVideoTracks().forEach((t) => tracks.push(t));
    }

    micStreamRef.current?.getAudioTracks().forEach((t) => tracks.push(t));
    return new MediaStream(tracks);
  };

  const startRecording = async () => {
    try {
      const stream = await buildRecordStream();
      if (stream.getVideoTracks().length === 0) {
        toast.error("Aucune source vidéo prête. Sélectionne un mode et autorise l'accès.");
        return;
      }
      const mime = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm;codecs=vp9,opus";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality === "1080" ? 6_000_000 : 3_000_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        a.download = `studio-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      };
      rec.onerror = () => {
        toast.error("Erreur d'enregistrement.", {
          action: { label: "Réessayer", onClick: () => startRecording() },
        });
      };
      recorderRef.current = rec;
      rec.start(1000);
      setRecording(true);
      setPaused(false);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e: any) {
      toast.error("Impossible de démarrer l'enregistrement.", {
        action: { label: "Réessayer", onClick: () => startRecording() },
      });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setPaused(false);
  };

  const togglePause = () => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      setPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (r.state === "paused") {
      r.resume();
      setPaused(false);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    }
  };

  // ---------- Teleprompter scroll ----------
  useEffect(() => {
    const tick = () => {
      const el = teleScrollRef.current;
      if (el && scrolling) {
        el.scrollTop += scrollSpeed * 0.5;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
          el.scrollTop = 0;
        }
      }
      teleRafRef.current = requestAnimationFrame(tick);
    };
    teleRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (teleRafRef.current) cancelAnimationFrame(teleRafRef.current);
    };
  }, [scrolling, scrollSpeed]);

  const generateScript = async () => {
    setGeneratingScript(true);
    try {
      // simple placeholder: produce a script from any saved board in localStorage
      const raw = localStorage.getItem("lastBoard");
      if (!raw) {
        toast.message("Crée d'abord un board pour générer un script automatique.");
        return;
      }
      const data = JSON.parse(raw);
      const points: string[] = (data.nodes || []).map((n: any) => n.label).filter(Boolean);
      const text = points.length
        ? `Bonjour ! Aujourd'hui je vais te parler de ${points[0]}. ` +
          points.slice(1).map((p) => `Premier point clé : ${p}.`).join(" ")
        : "Aucun contenu disponible.";
      setScript(text);
      toast.success("Script généré.");
    } catch {
      toast.error("Impossible de générer le script.");
    } finally {
      setGeneratingScript(false);
    }
  };

  // ---------- Bubble drag ----------
  const onBubbleDown = (e: React.PointerEvent) => {
    draggingRef.current = { ox: e.clientX - bubblePos.x, oy: e.clientY - bubblePos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBubbleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setBubblePos({ x: e.clientX - draggingRef.current.ox, y: e.clientY - draggingRef.current.oy });
  };
  const onBubbleUp = () => (draggingRef.current = null);

  // ---------- Exit ----------
  const exitStudio = async () => {
    if (recording) stopRecording();
    stopStream(screenStreamRef.current);
    stopStream(cameraStreamRef.current);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    navigate("/dashboard");
  };

  // Fullscreen prompt
  if (!isFullscreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A] text-white p-6">
        <div className="max-w-md text-center space-y-4">
          <Maximize2 className="h-12 w-12 mx-auto opacity-70" />
          <h1 className="text-2xl font-semibold">Repasse en plein écran pour utiliser le Studio</h1>
          <p className="text-white/60">Le Studio fonctionne uniquement en plein écran.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={requestFs} className="bg-indigo-600 hover:bg-indigo-500">
              Passer en plein écran
            </Button>
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-white hover:bg-white/10">
              Retour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const modes: { id: Mode; label: string; icon: any; mobileOk: boolean }[] = [
    { id: "screen", label: "Écran", icon: Monitor, mobileOk: false },
    { id: "camera", label: "Caméra", icon: Camera, mobileOk: true },
    { id: "both", label: "Écran + Caméra", icon: Layers, mobileOk: false },
  ];

  return (
    <div className="fixed inset-0 bg-[#1A1A1A] text-white flex flex-col z-50">
      {/* TOP BAR */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={exitStudio}
          className="text-white hover:bg-white/10"
        >
          <X className="h-4 w-4 mr-2" /> Quitter le Studio
        </Button>

        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {modes.map((m) => {
            const disabled = isMobile && !m.mobileOk;
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                disabled={disabled}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
                  active ? "bg-indigo-600 text-white" : "text-white/70 hover:bg-white/10",
                  disabled && "opacity-30 cursor-not-allowed",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Mic level */}
          <div className="flex items-end gap-0.5 h-5 w-12">
            {[0.2, 0.4, 0.6, 0.8, 1].map((th, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-sm transition-colors",
                  micLevel > th ? "bg-emerald-400" : "bg-white/15",
                )}
                style={{ height: `${(i + 1) * 18}%` }}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMuted((m) => !m)}
            className="text-white hover:bg-white/10 h-9 w-9"
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          {recording && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-red-500/15 border border-red-500/30">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono">{formatTime(elapsed)}</span>
            </div>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-9 w-9">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 bg-[#222] border-white/10 text-white">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/60">Microphone</label>
                  <Select value={micId} onValueChange={setMicId}>
                    <SelectTrigger className="bg-white/5 border-white/10 mt-1">
                      <SelectValue placeholder="Choisir un micro" />
                    </SelectTrigger>
                    <SelectContent>
                      {micDevices
                        .filter((d) => d.deviceId)
                        .map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label || `Micro ${d.deviceId.slice(0, 6)}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-white/60">Qualité</label>
                  <Select value={quality} onValueChange={(v) => setQuality(v as Quality)}>
                    <SelectTrigger className="bg-white/5 border-white/10 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720">720p</SelectItem>
                      <SelectItem value="1080">1080p</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* CENTER CANVAS */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={mainVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        {mode === "both" && (
          <div
            onPointerDown={onBubbleDown}
            onPointerMove={onBubbleMove}
            onPointerUp={onBubbleUp}
            style={{
              right: bubblePos.x,
              bottom: bubblePos.y,
              width: 150,
              height: 150,
            }}
            className="absolute rounded-full overflow-hidden border-2 border-white/30 shadow-2xl cursor-grab active:cursor-grabbing"
          >
            <video
              ref={bubbleVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>
        )}

        {!mainVideoRef.current?.srcObject && (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>Préparation de la source…</span>
          </div>
        )}
      </div>

      {/* TELEPROMPTER */}
      <div className="border-t border-white/10 bg-black/60 backdrop-blur" style={{ height: 120 }}>
        <div className="h-full flex">
          <div className="flex-1 flex">
            <div
              ref={teleScrollRef}
              className="flex-1 overflow-hidden px-6 py-3"
              style={{ maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)" }}
            >
              {script ? (
                <div ref={teleContentRef} className="text-white" style={{ fontSize: 22, lineHeight: 1.5 }}>
                  {script}
                  <div style={{ height: 80 }} />
                </div>
              ) : (
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Écris ou colle ton script ici…"
                  className="w-full h-full bg-transparent border-white/10 text-white placeholder:text-white/40 resize-none"
                  style={{ fontSize: 18 }}
                />
              )}
            </div>
          </div>
          <div className="w-72 border-l border-white/10 px-4 py-3 flex flex-col justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setScrolling((s) => !s)}
                className="text-white hover:bg-white/10"
              >
                {scrolling ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[scrollSpeed]}
                  onValueChange={(v) => setScrollSpeed(v[0])}
                />
              </div>
              <span className="text-xs text-white/60 w-6 text-right">{scrollSpeed}</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setScript("")}
                className="text-white/70 hover:bg-white/10 flex-1"
              >
                Effacer
              </Button>
              <Button
                size="sm"
                onClick={generateScript}
                disabled={generatingScript}
                className="bg-indigo-600 hover:bg-indigo-500 flex-1"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> IA
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLS */}
      <div className="h-20 border-t border-white/10 flex items-center justify-center gap-4">
        {recording && (
          <Button
            size="lg"
            variant="ghost"
            onClick={togglePause}
            className="text-white hover:bg-white/10"
          >
            {paused ? <Play className="h-5 w-5 mr-2" /> : <Pause className="h-5 w-5 mr-2" />}
            {paused ? "Reprendre" : "Pause"}
          </Button>
        )}
        <button
          onClick={recording ? stopRecording : startRecording}
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center transition-all shadow-lg",
            recording
              ? "bg-red-600 animate-pulse ring-4 ring-red-500/30"
              : "bg-red-600 hover:bg-red-500 ring-4 ring-red-500/20",
          )}
          aria-label={recording ? "Arrêter" : "Enregistrer"}
        >
          {recording ? <Square className="h-6 w-6 text-white fill-white" /> : <span className="h-5 w-5 rounded-full bg-white" />}
        </button>
        <div className="text-xs text-white/50 hidden sm:block">
          {recording ? "Enregistrement en cours" : "Prêt à enregistrer"}
        </div>
      </div>
    </div>
  );
};

export default Studio;
