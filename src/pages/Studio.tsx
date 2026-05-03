import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  CameraOff,
  Circle,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Pause,
  Play,
  Smartphone,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import StudioPreview from "@/components/studio/StudioPreview";
import Teleprompter from "@/components/studio/Teleprompter";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useStudioRecorder, type WebcamBubble } from "@/hooks/useStudioRecorder";
import { fmtTime, type StudioFormat } from "@/lib/studio-recorder";
import type { LucideIcon } from "lucide-react";

const FORMAT_KEY = "scappio:studio:format";

type ControlTone = "primary" | "secondary" | "destructive";

const toneClasses: Record<ControlTone, string> = {
  primary:
    "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20 shadow-[0_0_22px_-10px_hsl(var(--primary)/0.7)]",
  secondary:
    "border-accent/40 bg-accent/15 text-accent hover:bg-accent/20 shadow-[0_0_22px_-10px_hsl(var(--accent)/0.6)]",
  destructive:
    "border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/20 shadow-[0_0_22px_-10px_hsl(var(--destructive)/0.55)]",
};

const ControlToggle = ({
  active,
  onClick,
  activeLabel,
  inactiveLabel,
  ActiveIcon,
  InactiveIcon,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  activeLabel: string;
  inactiveLabel: string;
  ActiveIcon: LucideIcon;
  InactiveIcon: LucideIcon;
  tone: ControlTone;
}) => {
  const Icon = active ? ActiveIcon : InactiveIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-medium transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] ${
        active
          ? toneClasses[tone]
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted/70"
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
      const value = localStorage.getItem(FORMAT_KEY);
      return value === "16:9" ? "16:9" : "9:16";
    } catch {
      return "9:16";
    }
  });
  const [scriptVisible, setScriptVisible] = useState(!isMobile);
  const [bubble, setBubble] = useState<WebcamBubble>({ xPct: 0.78, yPct: 0.7, rPct: 0.12 });

  const onFinished = useCallback(() => {
    navigate("/mon-enregistrement");
  }, [navigate]);

  const studio = useStudioRecorder({ format, onFinished });

  useEffect(() => {
    studio.setBubble(bubble);
  }, [bubble, studio]);

  const changeFormat = (nextFormat: StudioFormat) => {
    if (studio.recording) {
      toast.error("Arrête l'enregistrement avant de changer de format");
      return;
    }
    setFormat(nextFormat);
    try {
      localStorage.setItem(FORMAT_KEY, nextFormat);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="container flex items-center justify-between gap-3 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            disabled={studio.recording}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Quitter
          </Button>

          <h1 className="text-sm font-semibold sm:text-base">Studio d&apos;enregistrement</h1>

          <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => changeFormat("9:16")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                format === "9:16"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              9:16
            </button>
            <button
              type="button"
              onClick={() => changeFormat("16:9")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                format === "16:9"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              16:9
            </button>
          </div>
        </div>
      </header>

      <main className="container grid flex-1 gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-6">
        <section className="flex min-h-[55vh] items-center justify-center lg:min-h-[calc(100vh-13rem)]">
          <StudioPreview
            format={format}
            cameraOn={studio.cameraOn}
            screenOn={studio.screenOn}
            swapped={studio.swapped}
            bubble={bubble}
            onBubbleChange={setBubble}
            attachCanvas={studio.attachPreviewCanvas}
          />
        </section>

        <aside className="h-[50vh] lg:h-auto">
          {scriptVisible ? (
            <Teleprompter
              visible={scriptVisible}
              onToggleVisible={() => setScriptVisible(false)}
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

      <footer className="sticky bottom-0 border-t border-border/60 bg-background/92 backdrop-blur-xl">
        <div className="container flex flex-wrap items-center justify-center gap-2 py-3 sm:gap-3">
          <ControlToggle
            active={studio.cameraOn}
            onClick={() => {
              void studio.toggleCamera();
            }}
            activeLabel="Caméra"
            inactiveLabel="Activer caméra"
            ActiveIcon={Camera}
            InactiveIcon={CameraOff}
            tone="primary"
          />

          <ControlToggle
            active={studio.micOn}
            onClick={() => {
              void studio.toggleMic();
            }}
            activeLabel="Micro"
            inactiveLabel="Activer micro"
            ActiveIcon={Mic}
            InactiveIcon={MicOff}
            tone="secondary"
          />

          {studio.screenSupported && (
            <ControlToggle
              active={studio.screenOn}
              onClick={() => {
                void studio.toggleScreen();
              }}
              activeLabel="Écran partagé"
              inactiveLabel="Partager l'écran"
              ActiveIcon={Monitor}
              InactiveIcon={MonitorOff}
              tone="secondary"
            />
          )}

          {studio.cameraOn && studio.screenOn && (
            <Button
              variant="outline"
              size="sm"
              onClick={studio.swapStreams}
              className="gap-2 rounded-full"
              title="Inverser la caméra et l'écran"
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Inverser</span>
            </Button>
          )}

          <div className="hidden h-8 w-px bg-border sm:block" />

          {!studio.recording ? (
            <Button
              size="lg"
              onClick={() => {
                void studio.start();
              }}
              className="gap-2 rounded-full px-5"
              variant="destructive"
            >
              <Circle className="h-4 w-4 fill-current" />
              Lancer l&apos;enregistrement
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={studio.togglePause}
                className="gap-2 rounded-full"
              >
                {studio.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {studio.paused ? "Reprendre" : "Pause"}
              </Button>

              <Button
                size="lg"
                onClick={studio.stop}
                variant="destructive"
                className="gap-2 rounded-full px-5"
              >
                <Square className="h-4 w-4 fill-current" />
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
