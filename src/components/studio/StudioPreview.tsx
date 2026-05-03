import { forwardRef, useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import type { StudioFormat } from "@/lib/studio-recorder";
import type { WebcamBubble } from "@/hooks/useStudioRecorder";

type Props = {
  format: StudioFormat;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraOn: boolean;
  screenOn: boolean;
  swapped?: boolean;
  bubble: WebcamBubble;
  onBubbleChange: (b: WebcamBubble) => void;
};

const CameraPlaceholder = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-900 to-zinc-800 text-white/60 animate-fade-in">
    <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
      <CameraOff className="h-7 w-7" />
    </div>
    <span className="text-xs">Caméra désactivée</span>
  </div>
);

const StudioPreview = forwardRef<HTMLDivElement, Props>(function StudioPreview({
  format,
  cameraStream,
  screenStream,
  cameraOn,
  screenOn,
  swapped = false,
  bubble,
  onBubbleChange,
}, forwardedRef) {
  const camRef = useRef<HTMLVideoElement>(null);
  const bubbleCamRef = useRef<HTMLVideoElement>(null);
  const scrRef = useRef<HTMLVideoElement>(null);
  const bubbleScrRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const bind = (el: HTMLVideoElement | null, stream: MediaStream | null) => {
      if (!el) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      if (!stream) return;
      const start = () => el.play().catch(() => {});
      el.addEventListener("loadedmetadata", start, { once: true });
      start();
    };
    bind(camRef.current, cameraStream);
    bind(bubbleCamRef.current, cameraStream);
  }, [cameraStream]);

  useEffect(() => {
    const bind = (el: HTMLVideoElement | null, stream: MediaStream | null) => {
      if (!el) return;
      if (el.srcObject !== stream) el.srcObject = stream;
      if (!stream) return;
      const start = () => el.play().catch(() => {});
      el.addEventListener("loadedmetadata", start, { once: true });
      start();
    };
    bind(scrRef.current, screenStream);
    bind(bubbleScrRef.current, screenStream);
  }, [screenStream]);

  useEffect(() => {
    if (format !== "16:9" || !screenOn || !cameraOn) return;
    if (!dragging) return;
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
  }, [dragging, bubble, format, screenOn, cameraOn, onBubbleChange]);

  const aspect = format === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const isSplit = format === "9:16" && screenOn && cameraOn;
  const isPip = format === "16:9" && screenOn && cameraOn;
  const showCameraFull = cameraOn && !isSplit && !isPip;
  const showScreenFull = screenOn && !cameraOn;
  const nothing = !cameraOn && !screenOn;

  // For split: position by swapped flag
  const camSplitClass = isSplit
    ? swapped
      ? "inset-x-0 bottom-0 h-1/2 w-full object-cover z-10"
      : "inset-x-0 top-0 h-1/2 w-full object-cover z-10"
    : "";
  const scrSplitClass = isSplit
    ? swapped
      ? "inset-x-0 top-0 h-1/2 w-full object-contain z-0"
      : "inset-x-0 bottom-0 h-1/2 w-full object-contain z-0"
    : "";

  // For PiP: when swapped, camera is bg, screen in bubble
  const pipBgIsCamera = isPip && swapped;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={`relative ${aspect} bg-black rounded-xl overflow-hidden shadow-elegant transition-all duration-300 ${
          format === "9:16" ? "h-full max-h-full" : "w-full max-w-full"
        }`}
        style={format === "9:16" ? { width: "auto" } : { height: "auto" }}
      >
        {/* Camera full */}
        <video
          ref={camRef}
          autoPlay
          muted
          playsInline
          className={`absolute bg-black transition-opacity duration-200 ${
            isSplit
              ? `${camSplitClass} opacity-100`
              : isPip && !pipBgIsCamera
                ? "opacity-0 pointer-events-none"
                : isPip && pipBgIsCamera
                  ? "inset-0 h-full w-full object-cover z-0 opacity-100"
                  : showCameraFull
                    ? "inset-0 h-full w-full object-cover z-10 opacity-100"
                    : "opacity-0 pointer-events-none"
          }`}
        />

        {/* Camera placeholder when off but no screen */}
        {!cameraOn && !screenOn && <CameraPlaceholder />}

        {/* Screen full */}
        <video
          ref={scrRef}
          autoPlay
          muted
          playsInline
          className={`absolute bg-black transition-opacity duration-200 ${
            isSplit
              ? `${scrSplitClass} opacity-100`
              : isPip && !pipBgIsCamera
                ? "inset-0 h-full w-full object-contain z-0 opacity-100"
                : isPip && pipBgIsCamera
                  ? "opacity-0 pointer-events-none"
                  : showScreenFull
                    ? "inset-0 h-full w-full object-contain z-0 opacity-100"
                    : "opacity-0 pointer-events-none"
          }`}
        />

        {/* Camera off overlay when in split/pip with camera disabled but screen on */}
        {!cameraOn && screenOn && isSplit === false && isPip === false && null}

        {isSplit && <div className="absolute inset-x-0 top-1/2 h-px bg-white/20 pointer-events-none z-20" />}

        {isPip && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            className="absolute rounded-full overflow-hidden border-2 border-white shadow-lg cursor-grab active:cursor-grabbing z-20 transition-transform hover:scale-105"
            style={{
              left: `${bubble.xPct * 100}%`,
              top: `${bubble.yPct * 100}%`,
              width: `${bubble.rPct * 200}%`,
              aspectRatio: "1 / 1",
              touchAction: "none",
            }}
          >
            {pipBgIsCamera ? (
              <video
                ref={bubbleScrRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover pointer-events-none"
              />
            ) : (
              <video
                ref={bubbleCamRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover pointer-events-none"
              />
            )}
          </div>
        )}

        {nothing && false && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
            Aucun flux actif
          </div>
        )}
      </div>
    </div>
  );
});

export default StudioPreview;
