import { useEffect, useRef, useState } from "react";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";

export default function BoardRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
    setElapsed(0);
  };

  useEffect(() => () => cleanup(), []);

  const start = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Enregistrement non supporté par ce navigateur");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        // @ts-expect-error chromium hint
        preferCurrentTab: true,
      });
    } catch {
      return;
    }
    streamRef.current = stream;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (chunks.length) {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scappio-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Enregistrement sauvegardé");
      }
      cleanup();
    };
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (recorder.state !== "inactive") recorder.stop();
    });

    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <button
      onClick={isRecording ? stop : start}
      style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium shadow-lg ${
        isRecording ? "bg-red-600 animate-pulse" : "bg-red-600 hover:bg-red-700"
      }`}
    >
      {isRecording ? (
        <>
          <Square className="w-4 h-4 fill-white" />
          <span className="tabular-nums">{fmt(elapsed)}</span>
          <span>Arrêter</span>
        </>
      ) : (
        <>
          <Camera className="w-4 h-4" />
          <span>Enregistrer</span>
        </>
      )}
    </button>
  );
}
