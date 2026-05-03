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

const FORMAT_KEY = "scappio:studio:format";

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
          <Button
            variant="outline"
            size="sm"
            onClick={studio.toggleCamera}
            className="bg-white/5 border-white/10 text-white hover:bg-white/10 gap-2"
          >
            {studio.cameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            <span className="hidden sm:inline">Caméra</span>
          </Button>

          {studio.screenSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={studio.screenOn ? studio.stopScreen : studio.enableScreen}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 gap-2"
            >
              {studio.screenOn ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              <span className="hidden sm:inline">{studio.screenOn ? "Stop écran" : "Partager l'écran"}</span>
            </Button>
          )}

          {!studio.recording ? (
            <Button
              size="lg"
              onClick={studio.start}
              className="bg-red-500 hover:bg-red-600 text-white gap-2 rounded-full px-5"
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
