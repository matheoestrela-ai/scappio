import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Smartphone,
  Pause,
  Play,
  Square,
  Circle,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStudioRecorder, type WebcamBubble } from "@/hooks/useStudioRecorder";
import StudioPreview from "@/components/studio/StudioPreview";
import Teleprompter from "@/components/studio/Teleprompter";
import { fmtTime, type StudioFormat } from "@/lib/studio-recorder";
import type { LucideIcon } from "lucide-react";

const FORMAT_KEY = "scappio:studio:format";

type ToneTone = "emerald" | "blue";
const toneClasses: Record<ToneTone, string> = {
  emerald: "bg-emerald-500/90 hover:bg-emerald-500 border-emerald-400 text-white shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)]",
  blue: "bg-blue-500/90 hover:bg-blue-500 border-blue-400 text-white shadow-[0_0_20px_-4px_rgba(59,130,246,0.6)]",
};

const ControlToggle = ({
  active, onClick, activeLabel, inactiveLabel, ActiveIcon, InactiveIcon, tone,
}: {
  active: boolean;
  onClick: () => void;
  activeLabel: string;
  inactiveLabel: string;
  ActiveIcon: LucideIcon;
  InactiveIcon: LucideIcon;
  tone: ToneTone;
}) => {
  const Icon = active ? ActiveIcon : InactiveIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
        active
          ? toneClasses[tone]
          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{active ? activeLabel : inactiveLabel}</span>
    </button>
  );
};

const Studio = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [format, setFormat] = useState<StudioFormat>(() => {
    try {
      const v = localStorage.getItem(FORMAT_KEY);
      return v === "16:9" ? "16:9" : "9:16";
    } catch {
      return "9:16";
    }
  });
  const [scriptVisible, setScriptVisible] = useState(!isMobile);
  const [bubble, setBubble] = useState<WebcamBubble>({
    xPct: 0.78, yPct: 0.7, rPct: 0.12,
  });

  const onFinished = useCallback(() => {
    navigate("/mon-enregistrement");
  }, [navigate]);

  const studio = useStudioRecorder({ format, onFinished });

  // Keep recorder bubble synced.
  useEffect(() => {
    studio.setBubble(bubble);
  }, [bubble, studio]);

  const changeFormat = (f: StudioFormat) => {
    if (studio.recording) {
      toast.error("Arrête l'enregistrement avant de changer de format");
      return;
    }
    setFormat(f);
    try { localStorage.setItem(FORMAT_KEY, f); } catch {}
  };

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-20">
        <div className="container py-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="text-white hover:bg-white/10"
            disabled={studio.recording}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Quitter
          </Button>
          <h1 className="text-sm sm:text-base font-semibold">Studio d'enregistrement</h1>
          <div className="flex items-center bg-white/10 rounded-full p-1">
            <button
              onClick={() => changeFormat("9:16")}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                format === "9:16" ? "bg-orange-500 text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" /> 9:16
            </button>
            <button
              onClick={() => changeFormat("16:9")}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                format === "16:9" ? "bg-blue-600 text-white" : "text-white/70 hover:bg-white/10"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" /> 16:9
            </button>
          </div>
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 container py-4 lg:py-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="flex items-center justify-center min-h-[55vh] lg:min-h-0">
          <StudioPreview
            format={format}
            cameraStream={studio.cameraStream}
            screenStream={studio.screenStream}
            cameraOn={studio.cameraOn}
            screenOn={studio.screenOn}
            swapped={studio.swapped}
            bubble={bubble}
            onBubbleChange={setBubble}
          />
        </section>

        <aside className="h-[50vh] lg:h-auto">
          {scriptVisible ? (
            <Teleprompter
              visible={scriptVisible}
              onToggleVisible={() => setScriptVisible((v) => !v)}
            />
          ) : (
            <div className="flex justify-end">
              <Teleprompter
                visible={false}
                onToggleVisible={() => setScriptVisible(true)}
              />
            </div>
          )}
        </aside>
      </main>

      {/* Controls bar */}
      <footer className="sticky bottom-0 border-t border-white/10 bg-black/70 backdrop-blur">
        <div className="container py-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <ControlToggle
            active={studio.cameraOn}
            onClick={studio.toggleCamera}
            activeLabel="Caméra"
            inactiveLabel="Caméra off"
            ActiveIcon={Camera}
            InactiveIcon={CameraOff}
            tone="emerald"
          />
          <ControlToggle
            active={studio.micOn}
            onClick={studio.toggleMic}
            activeLabel="Micro"
            inactiveLabel="Micro off"
            ActiveIcon={Mic}
            InactiveIcon={MicOff}
            tone="emerald"
          />
          {studio.screenSupported && (
            <ControlToggle
              active={studio.screenOn}
              onClick={studio.toggleScreen}
              activeLabel="Écran partagé"
              inactiveLabel="Partager l'écran"
              ActiveIcon={Monitor}
              InactiveIcon={MonitorOff}
              tone="blue"
            />
          )}
          {studio.cameraOn && studio.screenOn && (
            <Button
              variant="outline"
              size="sm"
              onClick={studio.swapStreams}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 gap-2 transition-transform hover:scale-105"
              title="Inverser caméra et écran"
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Inverser</span>
            </Button>
          )}

          <div className="w-px h-8 bg-white/10 mx-1 hidden sm:block" />

          {!studio.recording ? (
            <Button
              size="lg"
              onClick={studio.start}
              className="bg-red-500 hover:bg-red-600 text-white gap-2 rounded-full px-5 transition-transform hover:scale-105"
            >
              <Circle className="h-4 w-4 fill-white" />
              Lancer l'enregistrement
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={studio.togglePause}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10 gap-2 rounded-full"
              >
                {studio.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {studio.paused ? "Reprendre" : "Pause"}
              </Button>
              <Button
                size="lg"
                onClick={studio.stop}
                className="bg-red-600 hover:bg-red-700 text-white gap-2 rounded-full px-5 animate-pulse"
              >
                <Square className="h-4 w-4 fill-white" />
                <span className="tabular-nums">{fmtTime(studio.elapsed)}</span>
                Stop
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
};

export default Studio;
