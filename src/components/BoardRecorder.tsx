import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square, Monitor, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { toCanvas } from "html-to-image";

type Format = "standard" | "tiktok";

type Props = {
  /** Ref to the board DOM element to capture in TikTok mode. */
  containerRef: React.RefObject<HTMLDivElement>;
};

const TIKTOK_W = 1080;
const TIKTOK_H = 1920;
const TIKTOK_TOP_H = Math.round(TIKTOK_H * 0.4); // 768
const TIKTOK_BOT_H = TIKTOK_H - TIKTOK_TOP_H; // 1152
const ORANGE = "#F97316";

// CSS selectors for elements that must be hidden during TikTok capture.
const HIDE_SELECTORS = [
  "[data-record-hide='true']",
  ".recording-hidden",
  "[data-transcription]",
  ".voice-transcription",
];

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString();
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
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const formatRef = useRef<Format>("standard");
  const hiddenStylesRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);

  const cleanup = useCallback(() => {
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

  useEffect(() => () => cleanup(), [cleanup]);

  const hideOverlayUI = () => {
    const seen = new Set<HTMLElement>();
    HIDE_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          hiddenStylesRef.current.push({ el, prev: el.style.display });
          el.style.display = "none";
        });
      } catch {}
    });
  };

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };

  // ───────────────────────── STANDARD 16:9 ─────────────────────────
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
        // @ts-ignore — Chromium-only hint
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Accès à l'écran refusé");
      return;
    }

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro refusé — enregistrement sans audio.");
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
      cleanup();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => finalize(rec.mimeType || mime || "video/webm");

    // Auto-stop if user revokes screen share from the browser bar
    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (rec.state !== "inactive") rec.stop();
    });

    recorderRef.current = rec;
    rec.start(1000);
    formatRef.current = "standard";
    setRecording(true);
    startTimer();
  };

  // ───────────────────────── TIKTOK 9:16 ─────────────────────────
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
      toast.warning("Caméra refusée — zone du haut vide.");
    }

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Micro refusé — enregistrement muet.");
    }

    // Hide overlays BEFORE first snapshot
    hideOverlayUI();

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

    const canvas = document.createElement("canvas");
    canvas.width = TIKTOK_W;
    canvas.height = TIKTOK_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Canvas indisponible.");
      cleanup();
      return;
    }

    // Snapshot the board only (~10fps) and cache the result.
    let boardSnap: HTMLCanvasElement | null = null;
    let snapInFlight = false;

    const snap = async () => {
      if (!snapInFlight && containerRef.current) {
        snapInFlight = true;
        try {
          boardSnap = await toCanvas(containerRef.current, {
            cacheBust: false,
            pixelRatio: 1,
            skipFonts: true,
            backgroundColor: "#faf7f4",
            filter: (n: HTMLElement) => {
              if (!n || !(n as any).getAttribute) return true;
              return (n as any).getAttribute?.("data-record-hide") !== "true";
            },
          });
        } catch {
          // keep last good snap
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
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, TIKTOK_W, TIKTOK_TOP_H);
      ctx.clip();
      if (cv && cv.readyState >= 2 && cv.videoWidth) {
        const vw = cv.videoWidth;
        const vh = cv.videoHeight;
        const scale = Math.max(TIKTOK_W / vw, TIKTOK_TOP_H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (TIKTOK_W - dw) / 2;
        const dy = (TIKTOK_TOP_H - dh) / 2;
        ctx.translate(TIKTOK_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, TIKTOK_W - dx - dw, dy, dw, dh);
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, TIKTOK_W, TIKTOK_TOP_H);
        ctx.fillStyle = "#666";
        ctx.font = "80px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📷", TIKTOK_W / 2, TIKTOK_TOP_H / 2);
      }
      ctx.restore();

      // BOTTOM — board snapshot (contain)
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
      cleanup();
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
  };

  const finalize = (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    const fmt = formatRef.current;
    const date = new Date().toISOString().slice(0, 10);
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const fname = `scappio-${fmt}-${date}.${ext}`;
    cleanup();
    setRecording(false);
    setElapsed(0);
    if (blob.size > 0) {
      downloadBlob(blob, fname);
      toast.success("Enregistrement terminé ✓");
    } else {
      toast.error("Enregistrement vide.");
    }
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      cleanup();
      setRecording(false);
    }
  };

  const launch = (fmt: Format) => {
    setShowPicker(false);
    if (fmt === "tiktok") void startTikTok();
    else void startStandard();
  };

  return (
    <>
      {/* ── Floating record/stop button — always visible (z 9999) ── */}
      <div
        data-record-hide="true"
        className="fixed top-4 right-4 flex items-center gap-2"
        style={{ zIndex: 9999 }}
      >
        {recording && (
          <div className="flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-white text-xs font-mono shadow-lg">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {formatTime(elapsed)}
          </div>
        )}
        <button
          type="button"
          onClick={recording ? handleStop : () => setShowPicker(true)}
          aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
          title={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
          className={`flex items-center gap-2 rounded-full pl-3 pr-4 h-10 text-white font-medium shadow-xl transition ${
            recording
              ? "bg-red-600 hover:bg-red-500 animate-pulse ring-2 ring-red-400/50"
              : "bg-red-600 hover:bg-red-500"
          }`}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4 fill-white" />
              <span className="text-sm">Stop</span>
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              <span className="text-sm">Enregistrer</span>
            </>
          )}
        </button>
      </div>

      {/* ── Format picker modal ── */}
      {showPicker && (
        <div
          data-record-hide="true"
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowPicker(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold">Choisir le format</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Le format choisi démarre l'enregistrement immédiatement.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => launch("standard")}
                className="flex flex-col items-start gap-2 rounded-xl border-2 border-border bg-card p-4 text-left transition hover:border-[#F97316] hover:bg-[#fff3eb]"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ background: ORANGE }}
                >
                  <Monitor className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">🖥️ Standard</div>
                  <div className="text-xs text-muted-foreground">16:9 horizontal</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => launch("tiktok")}
                className="flex flex-col items-start gap-2 rounded-xl border-2 border-border bg-card p-4 text-left transition hover:border-[#F97316] hover:bg-[#fff3eb]"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ background: ORANGE }}
                >
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">📱 TikTok / Reels</div>
                  <div className="text-xs text-muted-foreground">9:16 avec facecam</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BoardRecorder;
