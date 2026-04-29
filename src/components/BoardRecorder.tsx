import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square, Monitor, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { toCanvas } from "html-to-image";

type Format = "standard" | "tiktok";

type Props = {
  containerRef: React.RefObject<HTMLDivElement>;
  boardName?: string;
};

const TIKTOK_W = 1080;
const TIKTOK_H = 1920;
const TIKTOK_TOP_H = Math.round(TIKTOK_H * 0.4); // 768
const TIKTOK_BOT_H = TIKTOK_H - TIKTOK_TOP_H; // 1152

const ORANGE = "#F97316";

const HIDE_SELECTORS = [
  "[data-record-hide='true']",
  ".recording-hidden",
  "[data-transcription]",
  ".voice-transcription",
];

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const pickMime = () => {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
};

const BoardRecorder = ({ containerRef }: Props) => {
  const [showPicker, setShowPicker] = useState(false);
  const [format, setFormat] = useState<Format>("standard");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const rafRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenStylesRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);
  const startTimeRef = useRef<number>(0);
  const formatRef = useRef<Format>("standard");

  const cleanupResources = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    snapTimerRef.current = null;
    timerRef.current = null;

    tracksRef.current.forEach((t) => {
      try { t.stop(); } catch {}
    });
    tracksRef.current = [];

    if (camVideoRef.current) {
      try {
        const s = camVideoRef.current.srcObject as MediaStream | null;
        s?.getTracks().forEach((t) => t.stop());
      } catch {}
      camVideoRef.current = null;
    }

    // Restore hidden UI
    hiddenStylesRef.current.forEach(({ el, prev }) => {
      el.style.display = prev;
    });
    hiddenStylesRef.current = [];
  }, []);

  useEffect(() => () => cleanupResources(), [cleanupResources]);

  const hideOverlayUI = () => {
    const seen = new Set<HTMLElement>();
    HIDE_SELECTORS.forEach((sel) => {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        hiddenStylesRef.current.push({ el, prev: el.style.display });
        el.style.display = "none";
      });
    });
  };

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };

  // ─────────────────────────────────────────
  // Standard 16:9 — record current tab directly
  // ─────────────────────────────────────────
  const startStandard = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement.");
      return;
    }

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
        // @ts-ignore
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Partage d'écran refusé.");
      return;
    }

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro indisponible — enregistrement sans audio.");
    }

    const tracks: MediaStreamTrack[] = [];
    displayStream.getTracks().forEach((t) => tracks.push(t));
    micStream?.getAudioTracks().forEach((t) => tracks.push(t));
    tracksRef.current = tracks;

    const finalStream = new MediaStream(tracks);

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
        : new MediaRecorder(finalStream);
    } catch {
      toast.error("Impossible de démarrer l'enregistrement.");
      cleanupResources();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => finalize(rec.mimeType || mime || "video/webm");

    // Auto stop when user revokes screen share
    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (rec.state !== "inactive") rec.stop();
    });

    recorderRef.current = rec;
    rec.start(1000);
    formatRef.current = "standard";
    setRecording(true);
    startTimer();
    toast.success("Enregistrement démarré");
  };

  // ─────────────────────────────────────────
  // TikTok 9:16 — composite camera + board snapshot
  // ─────────────────────────────────────────
  const startTikTok = async () => {
    const boardEl = containerRef.current;
    if (!boardEl) {
      toast.error("Tableau introuvable.");
      return;
    }

    let camStream: MediaStream | null = null;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 720, height: 720, facingMode: "user" },
        audio: false,
      });
    } catch {
      toast.warning("Caméra indisponible — zone du haut vide.");
    }

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro indisponible — enregistrement muet.");
    }

    // Hide overlay UI BEFORE first snapshot
    hideOverlayUI();

    // Camera <video>
    if (camStream) {
      const v = document.createElement("video");
      v.srcObject = camStream;
      v.muted = true;
      v.playsInline = true;
      await v.play().catch(() => {});
      camVideoRef.current = v;
      camStream.getTracks().forEach((t) => tracksRef.current.push(t));
    }
    if (micStream) micStream.getAudioTracks().forEach((t) => tracksRef.current.push(t));

    // Composite canvas
    const canvas = document.createElement("canvas");
    canvas.width = TIKTOK_W;
    canvas.height = TIKTOK_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Canvas indisponible.");
      cleanupResources();
      return;
    }

    // Board snapshot loop (~10 fps)
    let boardSnap: HTMLCanvasElement | null = null;
    let snapInFlight = false;

    const snap = async () => {
      if (!snapInFlight) {
        snapInFlight = true;
        try {
          const c = await toCanvas(boardEl, {
            cacheBust: false,
            pixelRatio: 1,
            skipFonts: true,
            backgroundColor: "#faf7f4",
            filter: (n: HTMLElement) => {
              if (!n || !(n as any).getAttribute) return true;
              const v = (n as any).getAttribute?.("data-record-hide");
              return v !== "true";
            },
          });
          boardSnap = c;
        } catch {
          // ignore — keep last snapshot
        } finally {
          snapInFlight = false;
        }
      }
      snapTimerRef.current = window.setTimeout(snap, 100);
    };
    snap();

    const drawFrame = () => {
      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, TIKTOK_W, TIKTOK_H);

      // TOP — camera (cover, mirrored)
      const cv = camVideoRef.current;
      if (cv && cv.readyState >= 2 && cv.videoWidth) {
        const vw = cv.videoWidth;
        const vh = cv.videoHeight;
        const scale = Math.max(TIKTOK_W / vw, TIKTOK_TOP_H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (TIKTOK_W - dw) / 2;
        const dy = (TIKTOK_TOP_H - dh) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, TIKTOK_W, TIKTOK_TOP_H);
        ctx.clip();
        ctx.translate(TIKTOK_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, TIKTOK_W - dx - dw, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, TIKTOK_W, TIKTOK_TOP_H);
        ctx.fillStyle = "#555";
        ctx.font = "80px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📷", TIKTOK_W / 2, TIKTOK_TOP_H / 2);
      }

      // BOTTOM — board snapshot (contain, centered)
      ctx.fillStyle = "#faf7f4";
      ctx.fillRect(0, TIKTOK_TOP_H, TIKTOK_W, TIKTOK_BOT_H);
      if (boardSnap && boardSnap.width && boardSnap.height) {
        const vw = boardSnap.width;
        const vh = boardSnap.height;
        const scale = Math.min(TIKTOK_W / vw, TIKTOK_BOT_H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (TIKTOK_W - dw) / 2;
        const dy = TIKTOK_TOP_H + (TIKTOK_BOT_H - dh) / 2;
        try { ctx.drawImage(boardSnap, dx, dy, dw, dh); } catch {}
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };
    rafRef.current = requestAnimationFrame(drawFrame);

    // Build recording stream
    const videoStream = (canvas as any).captureStream(30) as MediaStream;
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
    if (micStream) tracks.push(...micStream.getAudioTracks());
    const finalStream = new MediaStream(tracks);

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 5_000_000 })
        : new MediaRecorder(finalStream);
    } catch {
      toast.error("Impossible de démarrer l'enregistrement.");
      cleanupResources();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => finalize(rec.mimeType || mime || "video/webm");

    recorderRef.current = rec;
    rec.start(1000);
    formatRef.current = "tiktok";
    setRecording(true);
    startTimer();
    toast.success("Enregistrement TikTok démarré");
  };

  const finalize = (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    const fmt = formatRef.current;
    const date = new Date().toISOString().slice(0, 10);
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const fname =
      fmt === "tiktok"
        ? `scappio-tiktok-${date}.${ext}`
        : `scappio-recording-${date}.${ext}`;
    cleanupResources();
    setRecording(false);
    setElapsed(0);
    if (blob.size > 0) {
      downloadBlob(blob, fname);
      toast.success("Enregistrement sauvegardé");
    } else {
      toast.error("Enregistrement vide.");
    }
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      cleanupResources();
      setRecording(false);
    }
  };

  const handleStart = () => {
    setShowPicker(true);
  };

  const launch = () => {
    setShowPicker(false);
    if (format === "tiktok") void startTikTok();
    else void startStandard();
  };

  return (
    <>
      {/* Recording outline */}
      {recording && (
        <div
          data-record-hide="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-red-500/80 animate-pulse"
        />
      )}

      {/* Timer */}
      {recording && (
        <div
          data-record-hide="true"
          className="absolute top-3 right-24 z-30 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 text-white text-xs font-mono"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          {formatTime(elapsed)}
        </div>
      )}

      {/* Record / Stop button */}
      <button
        type="button"
        data-record-hide="true"
        onClick={recording ? handleStop : handleStart}
        title={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        className={`absolute top-3 right-14 z-30 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition ${
          recording
            ? "bg-red-600 animate-pulse ring-2 ring-red-400/50"
            : "bg-red-600 hover:bg-red-500"
        }`}
      >
        {recording ? <Square className="h-4 w-4 fill-white" /> : <Camera className="h-4 w-4" />}
      </button>

      {/* Format picker */}
      {showPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPicker(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-base font-semibold">Format d'enregistrement</h3>
            <p className="text-xs text-muted-foreground">Choisis un format puis lance l'enregistrement.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("standard")}
                className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition ${
                  format === "standard"
                    ? "border-[#F97316] bg-[#fff3eb]"
                    : "border-border bg-card hover:border-[#F97316]/50"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    format === "standard" ? "bg-[#F97316] text-white" : "bg-muted"
                  }`}
                >
                  <Monitor className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">🖥️ Standard 16:9</div>
                  <div className="text-xs text-muted-foreground">Capture l'onglet courant</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("tiktok")}
                className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition ${
                  format === "tiktok"
                    ? "border-[#F97316] bg-[#fff3eb]"
                    : "border-border bg-card hover:border-[#F97316]/50"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    format === "tiktok" ? "bg-[#F97316] text-white" : "bg-muted"
                  }`}
                >
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">📱 TikTok 9:16</div>
                  <div className="text-xs text-muted-foreground">Caméra + board vertical</div>
                </div>
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={launch}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                style={{ background: ORANGE }}
              >
                Démarrer l'enregistrement
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
