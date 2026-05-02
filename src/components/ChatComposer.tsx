import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Paperclip, Mic, ArrowUp, Image as ImageIcon, FileText, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  onSendText: (text: string) => void;
  onPickImage: (file: File) => void;
  onPickPdf: (file: File) => void;
  onVoiceRecorded: (audioDataUrl: string, mimeType: string) => void;
};

const ChatComposer = ({ disabled, onSendText, onPickImage, onPickPdf, onVoiceRecorded }: Props) => {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [levels, setLevels] = useState<number[]>(Array(18).fill(0.1));

  const taRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recogRef = useRef<any>(null);

  // autoresize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  const cleanupAudio = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch {}
      recogRef.current = null;
    }
  };

  useEffect(() => () => cleanupAudio(), []);

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
      const bars = 18;
      const step = Math.floor(data.length / bars) || 1;
      const next: number[] = [];
      for (let i = 0; i < bars; i++) next.push(Math.max(0.08, data[i * step] / 255));
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startLiveTranscript = () => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "fr-FR";
      r.onresult = (event: any) => {
        let txt = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          txt += event.results[i][0].transcript;
        }
        setInterim(txt);
      };
      r.onerror = () => {};
      r.start();
      recogRef.current = r;
    } catch {}
  };

  const startRecording = async () => {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = mimes.find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanupAudio();
        setRecording(false);
        setLevels(Array(18).fill(0.1));
        setInterim("");
        if (blob.size === 0) {
          toast.error("Aucun son capté.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => onVoiceRecorded(reader.result as string, type);
        reader.onerror = () => toast.error("Lecture audio impossible.");
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      startVisualizer(stream);
      startLiveTranscript();
    } catch (e: any) {
      toast.error(
        e?.name === "NotAllowedError"
          ? "Accès au micro refusé."
          : "Impossible d'accéder au micro.",
      );
      cleanupAudio();
      setRecording(false);
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const handleSend = () => {
    const v = value.trim();
    if (!v || disabled) return;
    setValue("");
    onSendText(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="w-full max-w-[760px] mx-auto px-3 sm:px-0">
      <div
        className={cn(
          "flex items-end gap-2 bg-card border border-border rounded-2xl px-2 py-2 transition",
          recording && "border-primary/60",
        )}
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.08)", minHeight: 52 }}
      >
        {/* Attach menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled || recording}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition disabled:opacity-50"
              aria-label="Joindre un fichier"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4 mr-2" /> Photo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => pdfInputRef.current?.click()}>
              <FileText className="h-4 w-4 mr-2" /> Document PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = "";
          }}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickPdf(f);
            e.target.value = "";
          }}
        />

        {/* Text area or recording visualizer */}
        {recording ? (
          <div className="flex-1 min-w-0 flex flex-col justify-center px-2 py-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-end gap-[2px] h-6">
                {levels.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-primary transition-[height] duration-75"
                    style={{ height: `${Math.round(v * 100)}%`, minHeight: 2 }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-primary shrink-0">Enregistrement…</span>
            </div>
            {interim && (
              <p className="mt-1 text-sm text-foreground/80 line-clamp-2">{interim}</p>
            )}
          </div>
        ) : (
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder="Décris ton idée, colle tes notes ou parle…"
            className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none text-sm sm:text-base placeholder:text-muted-foreground px-2 py-2 max-h-[200px] leading-relaxed"
          />
        )}

        {/* Mic */}
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition",
            recording
              ? "bg-primary text-primary-foreground animate-pulse"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-label={recording ? "Arrêter et envoyer" : "Démarrer l'enregistrement"}
        >
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
        </button>

        {/* Send */}
        {hasText && !recording && (
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
            aria-label="Envoyer"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground/70 text-center">
        Scappio peut faire des erreurs. Vérifie les informations importantes.
      </p>
    </div>
  );
};

export default ChatComposer;
