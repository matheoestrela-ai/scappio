import { useEffect, useRef, useState } from "react";
import { Camera, Square } from "lucide-react";
import { toast } from "sonner";

type Mode = "standard" | "tiktok";

export default function BoardRecorder() {
  const [recording, setRecording] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  };

  useEffect(() => () => cleanup(), []);

  const startTimer = () => {
    const start = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
  };

  const downloadBlob = (chunks: Blob[], filename: string) => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Enregistrement sauvegardé ✓");
  };

  const startStandard = async () => {
    const chunks: Blob[] = [];

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      // @ts-expect-error chromium hint
      preferCurrentTab: true,
    });
    streamsRef.current.push(displayStream);

    let audioStream: MediaStream | null = null;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamsRef.current.push(audioStream);
    } catch {
      toast.warning("Micro refusé — enregistrement sans audio");
    }

    const combinedStream = new MediaStream([
      ...displayStream.getTracks(),
      ...(audioStream ? audioStream.getTracks() : []),
    ]);

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      downloadBlob(chunks, `scappio-${Date.now()}.webm`);
      cleanup();
    };

    displayStream.getVideoTracks()[0].addEventListener("ended", () => {
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    });

    mediaRecorder.start(1000);
    recorderRef.current = mediaRecorder;
    setRecording(true);
    startTimer();
  };

  const startTikTok = async () => {
    const chunks: Blob[] = [];

    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 1080, height: 608 },
      audio: true,
    });
    streamsRef.current.push(cameraStream);

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1080, height: 1344 },
      audio: false,
      // @ts-expect-error chromium hint
      preferCurrentTab: true,
    });
    streamsRef.current.push(displayStream);

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d")!;

    const cameraVideo = document.createElement("video");
    cameraVideo.srcObject = cameraStream;
    cameraVideo.muted = true;
    await cameraVideo.play();

    const displayVideo = document.createElement("video");
    displayVideo.srcObject = displayStream;
    displayVideo.muted = true;
    await displayVideo.play();

    const drawFrame = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.drawImage(displayVideo, 0, 0, 1080, 1344);
      ctx.drawImage(cameraVideo, 0, 1344, 1080, 576);
      rafRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const canvasStream = canvas.captureStream(30);
    const audioTrack = cameraStream.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);

    const mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType: "video/webm;codecs=vp9",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      downloadBlob(chunks, `scappio-tiktok-${Date.now()}.webm`);
      cleanup();
    };

    displayStream.getVideoTracks()[0].addEventListener("ended", () => {
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    });

    mediaRecorder.start(1000);
    recorderRef.current = mediaRecorder;
    setRecording(true);
    startTimer();
  };

  const start = async (mode: Mode) => {
    setShowModal(false);
    try {
      if (mode === "standard") await startStandard();
      else await startTikTok();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Impossible de démarrer l'enregistrement");
      cleanup();
    }
  };

  const handleClick = () => {
    if (recording) {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      } else {
        cleanup();
      }
    } else {
      setShowModal(true);
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <button
        onClick={handleClick}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium shadow-lg transition-all ${
          recording ? "bg-red-600 animate-pulse" : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {recording ? (
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

      {showModal && (
        <div
          style={{ zIndex: 10000 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-2xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Choisir le format
            </h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => start("standard")}
                className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90"
              >
                🖥️ Standard 16:9
              </button>
              <button
                onClick={() => start("tiktok")}
                className="w-full px-4 py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:opacity-90"
              >
                📱 TikTok 9:16 — facecam en bas
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2 rounded-xl text-muted-foreground hover:bg-muted text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
