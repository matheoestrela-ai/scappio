import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square, Monitor, Smartphone, X } from "lucide-react";
import { toast } from "sonner";

type Format = "standard" | "tiktok";
type Props = { containerRef?: React.RefObject<HTMLDivElement> };

const W = 1080, H = 1920, TOP_H = Math.round(H * 0.7); // 1344
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const pickMime = () =>
  ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "";

const BoardRecorder = (_: Props) => {
  const [picker, setPicker] = useState(false);
  const [format, setFormat] = useState<Format>("standard");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    tracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
    tracksRef.current = [];
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  const finalize = (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    cleanup();
    setRecording(false);
    setElapsed(0);
    if (!blob.size) { toast.error("Enregistrement vide."); return; }
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `scappio-${date}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success("Enregistrement sauvegardé ✓");
  };

  const startTimer = () => {
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 500);
  };

  const buildRecorder = (stream: MediaStream) => {
    const mime = pickMime();
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => finalize(rec.mimeType || mime || "video/webm");
    recRef.current = rec;
    rec.start(1000);
    setRecording(true);
    startTimer();
  };

  // Must be called SYNCHRONOUSLY from a click handler.
  const launchStandard = async () => {
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as any, audio: false,
        // @ts-ignore
        preferCurrentTab: true,
      });
    } catch { toast.error("Accès à l'onglet refusé"); return; }
    let mic: MediaStream | null = null;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch { toast.warning("Microphone refusé — sans son"); }
    const tracks = [...display.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])];
    tracksRef.current = tracks;
    display.getVideoTracks()[0]?.addEventListener("ended", () => {
      const r = recRef.current; if (r && r.state !== "inactive") { try { r.stop(); } catch {} }
    });
    try { buildRecorder(new MediaStream(tracks)); }
    catch { cleanup(); toast.error("Enregistrement impossible"); }
  };

  const launchTikTok = async () => {
    let cam: MediaStream | null = null;
    try { cam = await navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 720, facingMode: "user" }, audio: true }); }
    catch { toast.error("Caméra/Micro refusé"); return; }
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as any, audio: false,
        // @ts-ignore
        preferCurrentTab: true,
      });
    } catch { cam.getTracks().forEach((t) => t.stop()); toast.error("Accès à l'onglet refusé"); return; }

    const dispVideo = document.createElement("video");
    dispVideo.srcObject = new MediaStream(display.getVideoTracks()); dispVideo.muted = true; dispVideo.playsInline = true;
    await dispVideo.play().catch(() => {});
    const camVideo = document.createElement("video");
    camVideo.srcObject = new MediaStream(cam.getVideoTracks()); camVideo.muted = true; camVideo.playsInline = true;
    await camVideo.play().catch(() => {});

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const drawCover = (v: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
      if (!v.videoWidth) return;
      const s = Math.max(w / v.videoWidth, h / v.videoHeight);
      const dw = v.videoWidth * s, dh = v.videoHeight * s;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    };
    const draw = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      drawCover(dispVideo, 0, 0, W, TOP_H);
      drawCover(camVideo, 0, TOP_H, W, H - TOP_H);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    const canvasStream = (canvas as any).captureStream(30) as MediaStream;
    const tracks = [...canvasStream.getVideoTracks(), ...cam.getAudioTracks(), ...display.getVideoTracks()];
    tracksRef.current = tracks;
    display.getVideoTracks()[0]?.addEventListener("ended", () => {
      const r = recRef.current; if (r && r.state !== "inactive") { try { r.stop(); } catch {} }
    });
    try {
      buildRecorder(new MediaStream([...canvasStream.getVideoTracks(), ...cam.getAudioTracks()]));
    } catch { cleanup(); toast.error("Enregistrement impossible"); }
  };

  const handleConfirm = () => {
    setPicker(false);
    if (format === "tiktok") void launchTikTok(); else void launchStandard();
  };

  const handleStop = () => {
    const r = recRef.current;
    if (r && r.state !== "inactive") { try { r.stop(); } catch { cleanup(); setRecording(false); setElapsed(0); } }
    else { cleanup(); setRecording(false); setElapsed(0); }
  };

  return (
    <>
      <div data-record-hide="true" className="fixed top-4 right-4" style={{ zIndex: 9999 }}>
        <button
          type="button"
          onClick={recording ? handleStop : () => setPicker(true)}
          aria-label={recording ? "Arrêter" : "Enregistrer"}
          className={`flex items-center gap-2 rounded-full pl-3 pr-4 h-11 text-white font-medium shadow-xl transition ${
            recording ? "bg-red-600 hover:bg-red-500 ring-2 ring-red-400/60 animate-pulse" : "bg-red-600 hover:bg-red-500"
          }`}
        >
          {recording ? (
            <><Square className="h-4 w-4 fill-white" /><span className="text-sm">Arrêter</span><span className="ml-1 font-mono text-sm tabular-nums">{fmt(elapsed)}</span></>
          ) : (
            <><Camera className="h-4 w-4" /><span className="text-sm">Enregistrer</span></>
          )}
        </button>
      </div>

      {picker && (
        <div data-record-hide="true" className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setPicker(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
            <button type="button" onClick={() => setPicker(false)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold">Choisir le format</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {([
                { id: "standard", icon: Monitor, label: "🖥️ Standard", sub: "16:9" },
                { id: "tiktok", icon: Smartphone, label: "📱 TikTok", sub: "9:16 + caméra" },
              ] as const).map((o) => {
                const active = format === o.id;
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setFormat(o.id)}
                    className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition ${
                      active ? "border-[#F97316] bg-[#fff3eb]" : "border-border bg-card hover:border-[#F97316]/50"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: "#F97316" }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{o.label}</div>
                      <div className="text-xs text-muted-foreground">{o.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              className="mt-5 w-full rounded-full h-11 text-white font-medium shadow-md"
              style={{ background: "#F97316" }}
            >
              Démarrer l'enregistrement
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
