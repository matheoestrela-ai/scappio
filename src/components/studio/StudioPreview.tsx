import { useEffect, useRef, useState } from "react";
import type { StudioFormat } from "@/lib/studio-recorder";
import type { WebcamBubble } from "@/hooks/useStudioRecorder";

type Props = {
  format: StudioFormat;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraOn: boolean;
  screenOn: boolean;
  bubble: WebcamBubble;
  onBubbleChange: (b: WebcamBubble) => void;
};

// Live preview of the studio composition (mirrors the recorder canvas layout).
export default function StudioPreview({
  format,
  cameraStream,
  screenStream,
  cameraOn,
  screenOn,
  bubble,
  onBubbleChange,
}: Props) {
  const camRef = useRef<HTMLVideoElement>(null);
  const scrRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = camRef.current;
    if (!el) return;
    el.srcObject = cameraStream;
    if (cameraStream) el.play().catch(() => {});
  }, [cameraStream, cameraOn]);

  useEffect(() => {
    const el = scrRef.current;
    if (!el) return;
    el.srcObject = screenStream;
    if (screenStream) el.play().catch(() => {});
  }, [screenStream, screenOn]);

  // Drag bubble within container (16:9 + screen on only).
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

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        ref={containerRef}
        className={`relative ${aspect} bg-black rounded-xl overflow-hidden shadow-elegant ${
          format === "9:16" ? "h-full max-h-full" : "w-full max-w-full"
        }`}
        style={format === "9:16" ? { width: "auto" } : { height: "auto" }}
      >
        {/* Layer A: full / top / background */}
        {isSplit ? (
          <>
            <div className="absolute inset-x-0 top-0 h-1/2 overflow-hidden bg-black">
              {cameraOn && (
                <video
                  ref={camRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden bg-black flex items-center justify-center">
              {screenOn && (
                <video
                  ref={scrRef}
                  autoPlay
                  muted
                  playsInline
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/20 pointer-events-none" />
          </>
        ) : isPip ? (
          <>
            <video
              ref={scrRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              className="absolute rounded-full overflow-hidden border-2 border-white shadow-lg cursor-grab active:cursor-grabbing"
              style={{
                left: `${bubble.xPct * 100}%`,
                top: `${bubble.yPct * 100}%`,
                width: `${bubble.rPct * 200}%`,
                aspectRatio: "1 / 1",
                touchAction: "none",
              }}
            >
              {cameraOn && (
                <video
                  ref={camRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
            </div>
          </>
        ) : (
          <>
            {cameraOn && (
              <video
                ref={camRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {!cameraOn && screenOn && (
              <video
                ref={scrRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            )}
            {!cameraOn && !screenOn && (
              <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                Aucun flux actif
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
