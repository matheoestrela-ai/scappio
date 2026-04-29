import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";

type Props = {
  /** Ref to the board DOM element to capture. */
  containerRef: React.RefObject<HTMLDivElement>;
};

// Selectors for UI elements that should be hidden in the recording.
const HIDE_SELECTORS = [
  "[data-record-hide='true']",
  ".recording-hidden",
  "[data-transcription]",
  ".voice-transcription",
  "[data-suggestions]",
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
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const hiddenStylesRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);
  const stoppingRef = useRef(false);

  const restoreHidden = () => {
    hiddenStylesRef.current.forEach(({ el, prev }) => {
      el.style.visibility = prev;
    });
    hiddenStylesRef.current = [];
  };

  const hideOverlays = () => {
    const seen = new Set<HTMLElement>();
    HIDE_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          hiddenStylesRef.current.push({ el, prev: el.style.visibility });
          el.style.visibility = "hidden";
        });
      } catch {}
    });
  };

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;

    try {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    audioStreamRef.current = null;

    try {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    } catch {}

    restoreHidden();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };

  const handleStart = async () => {
    const boardEl = containerRef.current;
    if (!boardEl) {
      toast.error("Tableau introuvable.");
      return;
    }

    // Audio (optional)
    let audioStream: MediaStream | null = null;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = audioStream;
    } catch {
      toast.warning("Micro refusé — enregistrement sans audio.");
    }

    // Hide overlays before first capture
    hideOverlays();

    // Setup canvas matching board size
    const rect = boardEl.getBoundingClientRect();
    const W = Math.max(2, Math.floor(rect.width));
    const H = Math.max(2, Math.floor(rect.height));

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      restoreHidden();
      toast.error("Canvas indisponible.");
      return;
    }
    ctx.fillStyle = "#faf7f4";
    ctx.fillRect(0, 0, W, H);

    // Snapshot loop — html2canvas at ~10fps, drawn into canvas via RAF
    let lastSnap: HTMLCanvasElement | null = null;
    let snapInFlight = false;
    let lastSnapTime = 0;

    const tick = (now: number) => {
      if (stoppingRef.current) return;

      // Snap every ~100ms
      if (!snapInFlight && now - lastSnapTime > 100 && containerRef.current) {
        snapInFlight = true;
        lastSnapTime = now;
        html2canvas(containerRef.current, {
          backgroundColor: "#faf7f4",
          logging: false,
          useCORS: true,
          scale: 1,
          ignoreElements: (el) => {
            try {
              if (!(el instanceof HTMLElement)) return false;
              if (el.getAttribute?.("data-record-hide") === "true") return true;
              if (el.classList?.contains("recording-hidden")) return true;
              if (el.hasAttribute?.("data-transcription")) return true;
              if (el.hasAttribute?.("data-suggestions")) return true;
            } catch {}
            return false;
          },
        })
          .then((c) => { lastSnap = c; })
          .catch(() => {})
          .finally(() => { snapInFlight = false; });
      }

      // Draw last snap
      ctx.fillStyle = "#faf7f4";
      ctx.fillRect(0, 0, W, H);
      if (lastSnap) {
        try { ctx.drawImage(lastSnap, 0, 0, W, H); } catch {}
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Build stream
    const videoStream = (canvas as any).captureStream(30) as MediaStream;
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
    if (audioStream) tracks.push(...audioStream.getAudioTracks());
    const finalStream = new MediaStream(tracks);

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(finalStream);
    } catch {
      cleanup();
      toast.error("Erreur lors de la capture du tableau");
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const usedMime = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: usedMime });
      chunksRef.current = [];
      const date = new Date().toISOString().slice(0, 10);
      const ext = usedMime.includes("mp4") ? "mp4" : "webm";
      const fname = `scappio-board-${date}.${ext}`;

      stoppingRef.current = false;
      cleanup();
      setRecording(false);
      setElapsed(0);

      if (blob.size > 0) {
        downloadBlob(blob, fname);
        toast.success("Enregistrement sauvegardé ✓");
      } else {
        toast.error("Enregistrement vide.");
      }
    };

    recorderRef.current = rec;
    try {
      rec.start(1000);
    } catch {
      cleanup();
      toast.error("Erreur lors de la capture du tableau");
      return;
    }

    setRecording(true);
    startTimer();
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    stoppingRef.current = true;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { cleanup(); setRecording(false); setElapsed(0); }
    } else {
      cleanup();
      setRecording(false);
      setElapsed(0);
    }
  };

  return (
    <div
      data-record-hide="true"
      className="fixed top-4 right-4"
      style={{ zIndex: 9999 }}
    >
      <button
        type="button"
        onClick={recording ? handleStop : handleStart}
        aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        title={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        className={`flex items-center gap-2 rounded-full pl-3 pr-4 h-11 text-white font-medium shadow-xl transition ${
          recording
            ? "bg-red-600 hover:bg-red-500 ring-2 ring-red-400/60 animate-pulse"
            : "bg-red-600 hover:bg-red-500"
        }`}
      >
        {recording ? (
          <>
            <Square className="h-4 w-4 fill-white" />
            <span className="text-sm">Arrêter</span>
            <span className="ml-1 font-mono text-sm tabular-nums">{formatTime(elapsed)}</span>
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" />
            <span className="text-sm">Enregistrer</span>
          </>
        )}
      </button>
    </div>
  );
};

export default BoardRecorder;
