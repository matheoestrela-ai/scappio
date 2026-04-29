import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** Kept for API compatibility — not used in this implementation. */
  containerRef?: React.RefObject<HTMLDivElement>;
};

const HIDE_SELECTORS = [
  "[data-record-hide='true']",
  ".recording-hidden",
  "[data-transcription]",
  ".voice-transcription",
  "[data-suggestions]",
];

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

const pickMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
};

const BoardRecorder = (_: Props) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const hiddenRef = useRef<Array<{ el: HTMLElement; prev: string }>>([]);

  const restoreHidden = () => {
    hiddenRef.current.forEach(({ el, prev }) => { el.style.display = prev; });
    hiddenRef.current = [];
  };

  const hideOverlays = () => {
    const seen = new Set<HTMLElement>();
    HIDE_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          hiddenRef.current.push({ el, prev: el.style.display });
          el.style.display = "none";
        });
      } catch {}
    });
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    tracksRef.current.forEach((t) => { try { t.stop(); } catch {} });
    tracksRef.current = [];
    restoreHidden();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleStart = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as any,
        audio: false,
        // @ts-ignore — Chromium-only hint
        preferCurrentTab: true,
      });
    } catch {
      toast.error("Accès à l'onglet refusé — autorise le partage dans ton navigateur");
      return;
    }

    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      toast.warning("Microphone non disponible — enregistrement sans son");
    }

    hideOverlays();

    const tracks: MediaStreamTrack[] = [];
    displayStream.getVideoTracks().forEach((t) => tracks.push(t));
    micStream?.getAudioTracks().forEach((t) => tracks.push(t));
    tracksRef.current = tracks;
    const stream = new MediaStream(tracks);

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream);
    } catch {
      cleanup();
      toast.error("Ton navigateur ne supporte pas l'enregistrement");
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const usedMime = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type: usedMime });
      chunksRef.current = [];
      cleanup();
      setRecording(false);
      setElapsed(0);
      if (!blob.size) { toast.error("Enregistrement vide."); return; }

      const ext = usedMime.includes("mp4") ? "mp4" : "webm";
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scappio-board-${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Enregistrement sauvegardé ✓");
    };

    // Auto-stop if user revokes the share from the browser bar
    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (rec.state !== "inactive") { try { rec.stop(); } catch {} }
    });

    recorderRef.current = rec;
    rec.start(1000);
    setRecording(true);
    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { cleanup(); setRecording(false); setElapsed(0); } }
    else { cleanup(); setRecording(false); setElapsed(0); }
  };

  return (
    <div data-record-hide="true" className="fixed top-4 right-4" style={{ zIndex: 9999 }}>
      <button
        type="button"
        onClick={recording ? handleStop : handleStart}
        aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        title={recording ? "Arrêter l'enregistrement" : "Enregistrer"}
        className={`flex items-center gap-2 rounded-full pl-3 pr-4 h-11 text-white font-medium shadow-xl transition ${
          recording ? "bg-red-600 hover:bg-red-500 ring-2 ring-red-400/60 animate-pulse" : "bg-red-600 hover:bg-red-500"
        }`}
      >
        {recording ? (
          <>
            <Square className="h-4 w-4 fill-white" />
            <span className="text-sm">Arrêter</span>
            <span className="ml-1 font-mono text-sm tabular-nums">{fmt(elapsed)}</span>
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
