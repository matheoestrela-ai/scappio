import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onRecorded: (audioBase64DataUrl: string, mimeType: string) => void;
  disabled?: boolean;
};

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const VoiceRecorder = ({ onRecorded, disabled }: Props) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0.1));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  };

  const startVisualizer = (stream: MediaStream) => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bars = 24;
      const step = Math.floor(data.length / bars) || 1;
      const next: number[] = [];
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        next.push(Math.max(0.08, v));
      }
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const start = async () => {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        setRecording(false);
        setSeconds(0);
        setLevels(Array(24).fill(0.1));
        if (blob.size === 0) {
          toast.error("Aucun son capté.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => onRecorded(reader.result as string, type);
        reader.onerror = () => toast.error("Lecture audio impossible.");
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      startVisualizer(stream);
    } catch (e: any) {
      toast.error(
        e?.name === "NotAllowedError"
          ? "Accès au micro refusé. Autorise-le dans ton navigateur."
          : "Impossible d'accéder au micro.",
      );
      cleanup();
      setRecording(false);
    }
  };

  const stop = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  if (recording) {
    return (
      <button
        type="button"
        onClick={stop}
        className="w-full flex items-center gap-3 rounded-2xl border-2 border-dashed border-destructive/40 bg-destructive/5 p-4 text-left shadow-elegant transition"
      >
        <div className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-glow">
          <span className="absolute inset-0 rounded-xl bg-destructive opacity-40 animate-ping" />
          <Square className="h-4 w-4 fill-current relative" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-destructive">Enregistrement…</p>
            <span className="text-sm font-mono tabular-nums text-destructive">
              {formatTime(seconds)}
            </span>
          </div>
          <div className="mt-2 flex items-end gap-[2px] h-6">
            {levels.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-destructive transition-[height] duration-75"
                style={{ height: `${Math.round(v * 100)}%`, minHeight: 2 }}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Touche pour arrêter</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-card p-4 text-left shadow-elegant transition hover:border-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-glow">
        <Mic className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium">🎙️ Parler</p>
        <p className="text-xs text-muted-foreground">Enregistre ta voix · transcription auto</p>
      </div>
    </button>
  );
};

export default VoiceRecorder;
