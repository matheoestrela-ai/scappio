import { forwardRef, useEffect, useRef, useState } from "react";
import { CameraOff, MonitorOff, Move } from "lucide-react";
import type { StudioFormat } from "@/lib/studio-recorder";
import type { WebcamBubble } from "@/hooks/useStudioRecorder";

type Props = {
  format: StudioFormat;
  cameraOn: boolean;
  screenOn: boolean;
  swapped?: boolean;
  bubble: WebcamBubble;
  onBubbleChange: (b: WebcamBubble) => void;
  attachCanvas: (node: HTMLCanvasElement | null) => void;
};

const StudioPreview = forwardRef<HTMLDivElement, Props>(function StudioPreview({
  format,
  cameraOn,
  screenOn,
  swapped = false,
  bubble,
  onBubbleChange,
  attachCanvas,
}, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (format !== "16:9" || !screenOn || !cameraOn || !dragging) return;

    const onMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const r = bubble.rPct * rect.height;
      const x = e.clientX - rect.left - r;
      const y = e.clientY - rect.top - r;
      const xPct = Math.max(0, Math.min(1 - (2 * r) / rect.width, x / rect.width));
      const yPct = Math.max(0, Math.min(1 - (2 * r) / rect.height, y / rect.height));
      onBubbleChange({ ...bubble, xPct, yPct });
    };

    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [bubble, cameraOn, dragging, format, onBubbleChange, screenOn]);

  const aspect = format === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const isSplit = format === "9:16" && cameraOn && screenOn;
  const isPip = format === "16:9" && cameraOn && screenOn;
  const bubbleLabel = swapped ? "Zone écran" : "Zone caméra";

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={`relative ${aspect} overflow-hidden rounded-xl border border-white/10 bg-black shadow-elegant transition-all duration-300 ${
          format === "9:16" ? "h-full max-h-full" : "w-full max-w-full"
        }`}
        style={format === "9:16" ? { width: "auto" } : { height: "auto" }}
      >
        <canvas
          ref={attachCanvas}
          className="absolute inset-0 h-full w-full"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
            {screenOn ? "Écran actif" : "Caméra active"}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/70 backdrop-blur">
            {format}
          </div>
        </div>

        {!cameraOn && !screenOn && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/65 text-white/75 backdrop-blur-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <CameraOff className="h-6 w-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Aucune source active</p>
              <p className="text-xs text-white/55">Active la caméra ou partage ton écran pour voir le live.</p>
            </div>
          </div>
        )}

        {!cameraOn && screenOn && (
          <div className="pointer-events-none absolute left-3 bottom-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/75 backdrop-blur">
            <CameraOff className="h-3.5 w-3.5" /> Caméra coupée
          </div>
        )}

        {cameraOn && !screenOn && format === "16:9" && (
          <div className="pointer-events-none absolute left-3 bottom-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] text-white/75 backdrop-blur">
            <MonitorOff className="h-3.5 w-3.5" /> Partage d'écran inactif
          </div>
        )}

        {isSplit && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px bg-white/20" />
        )}

        {isPip && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            className="absolute z-20 rounded-full border-2 border-white/70 bg-transparent shadow-lg outline-none transition-transform hover:scale-105 active:scale-100"
            style={{
              left: `${bubble.xPct * 100}%`,
              top: `${bubble.yPct * 100}%`,
              width: `${bubble.rPct * 200}%`,
              aspectRatio: "1 / 1",
              touchAction: "none",
            }}
            aria-label={bubbleLabel}
          >
            <span className="absolute inset-0 rounded-full border border-white/30" />
            <span className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1 text-[10px] text-white/85">
              <Move className="h-3 w-3" />
              {bubbleLabel}
            </span>
          </button>
        )}
      </div>
    </div>
  );
});

export default StudioPreview;
