import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  canvasSize,
  drawCircle,
  drawContain,
  drawCover,
  formatToRecordingFormat,
  getDisplayMediaSafely,
  isLikelyMobile,
  pickMime,
  type StudioFormat,
} from "@/lib/studio-recorder";
import { setLastRecording } from "@/lib/recording-store";

export type WebcamBubble = {
  xPct: number;
  yPct: number;
  rPct: number;
};

type Options = {
  format: StudioFormat;
  onFinished: (url: string) => void;
};

type StopScreenOptions = {
  notify?: boolean;
};

const TARGET_FPS = 30;
const VIDEO_BITS_PER_SECOND = 2_500_000;
const TIMER_INTERVAL_MS = 250;

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
};

const disconnectAudioNode = (node: AudioNode | null | undefined) => {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // ignore
  }
};

const isTrackLive = (track: MediaStreamTrack | null | undefined) =>
  !!track && track.readyState === "live";

export function useStudioRecorder({ format, onFinished }: Options) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [screenSupported, setScreenSupported] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraCaptureRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenCaptureRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef(0);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const bubbleRef = useRef<WebcamBubble>({ xPct: 0.78, yPct: 0.7, rPct: 0.12 });
  const formatRef = useRef<StudioFormat>(format);
  const swappedRef = useRef(false);
  const cameraOnRef = useRef(true);
  const micOnRef = useRef(true);
  const screenOnRef = useRef(false);
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const screenAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenGainRef = useRef<GainNode | null>(null);
  const connectedMicTrackIdRef = useRef<string | null>(null);
  const connectedScreenTrackIdRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    formatRef.current = format;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const { w, h } = canvasSize(format);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, [format]);

  useEffect(() => {
    swappedRef.current = swapped;
  }, [swapped]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    screenOnRef.current = screenOn;
  }, [screenOn]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    setScreenSupported(!!getDisplayMediaSafely() && !isLikelyMobile());
  }, []);

  const updateElapsed = useCallback(() => {
    if (!startedAtRef.current || pausedRef.current) return;
    const next = Math.max(
      0,
      Math.floor((performance.now() - startedAtRef.current - pausedDurationRef.current) / 1000),
    );
    setElapsed(next);
  }, []);

  const startElapsedTimer = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(updateElapsed, TIMER_INTERVAL_MS);
  }, [updateElapsed]);

  const stopElapsedTimer = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const createPlaybackVideo = useCallback(async (stream: MediaStream) => {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.play().catch(() => {});
        resolve();
      };

      if (video.readyState >= 2) {
        finish();
        return;
      }

      video.addEventListener("loadedmetadata", finish, { once: true });
      video.addEventListener("canplay", finish, { once: true });
      window.setTimeout(finish, 600);
    });

    return video;
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioContextRef.current = new Ctx();
      audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
    }
    return audioContextRef.current;
  }, []);

  const syncAudioGraph = useCallback(async () => {
    const ctx = ensureAudioContext();
    const destination = audioDestinationRef.current;
    if (!ctx || !destination) return;

    const connectTrack = (
      track: MediaStreamTrack | null,
      kind: "mic" | "screen",
      active: boolean,
    ) => {
      const trackIdRef = kind === "mic" ? connectedMicTrackIdRef : connectedScreenTrackIdRef;
      const sourceRef = kind === "mic" ? micAudioSourceRef : screenAudioSourceRef;
      const gainRef = kind === "mic" ? micGainRef : screenGainRef;

      if (!isTrackLive(track)) {
        disconnectAudioNode(sourceRef.current);
        disconnectAudioNode(gainRef.current);
        sourceRef.current = null;
        gainRef.current = null;
        trackIdRef.current = null;
        return;
      }

      if (trackIdRef.current !== track.id) {
        disconnectAudioNode(sourceRef.current);
        disconnectAudioNode(gainRef.current);
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(destination);
        sourceRef.current = source;
        gainRef.current = gain;
        trackIdRef.current = track.id;
      }

      if (gainRef.current) {
        gainRef.current.gain.value = active ? 1 : 0;
      }
    };

    connectTrack(micTrackRef.current, "mic", micOnRef.current && isTrackLive(micTrackRef.current));
    connectTrack(
      screenAudioTrackRef.current,
      "screen",
      screenOnRef.current && isTrackLive(screenAudioTrackRef.current),
    );

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
  }, [ensureAudioContext]);

  const attachPreviewCanvas = useCallback((node: HTMLCanvasElement | null) => {
    previewCanvasRef.current = node;
    if (!node) return;
    const { w, h } = canvasSize(formatRef.current);
    node.width = w;
    node.height = h;
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fmt = formatRef.current;
    const { w, h } = canvasSize(fmt);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const camVideo = cameraVideoRef.current;
    const screenVideo = screenVideoRef.current;
    const camReady = !!(camVideo && camVideo.readyState >= 2 && cameraOnRef.current);
    const screenReady = !!(screenVideo && screenVideo.readyState >= 2 && screenOnRef.current);

    if (fmt === "9:16") {
      if (camReady && screenReady) {
        const top = swappedRef.current ? screenVideo! : camVideo!;
        const bottom = swappedRef.current ? camVideo! : screenVideo!;
        const topUsesContain = swappedRef.current;
        if (topUsesContain) drawContain(ctx, top, 0, 0, w, h / 2);
        else drawCover(ctx, top, 0, 0, w, h / 2);
        if (topUsesContain) drawCover(ctx, bottom, 0, h / 2, w, h / 2);
        else drawContain(ctx, bottom, 0, h / 2, w, h / 2);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(0, h / 2 - 1, w, 2);
        return;
      }

      if (camReady) {
        drawCover(ctx, camVideo!, 0, 0, w, h);
        return;
      }

      if (screenReady) {
        drawContain(ctx, screenVideo!, 0, 0, w, h);
      }
      return;
    }

    if (camReady && screenReady) {
      const backgroundVideo = swappedRef.current ? camVideo! : screenVideo!;
      const bubbleVideo = swappedRef.current ? screenVideo! : camVideo!;
      if (swappedRef.current) drawCover(ctx, backgroundVideo, 0, 0, w, h);
      else drawContain(ctx, backgroundVideo, 0, 0, w, h);

      const bubble = bubbleRef.current;
      const radius = bubble.rPct * h;
      const centerX = bubble.xPct * w + radius;
      const centerY = bubble.yPct * h + radius;
      drawCircle(ctx, bubbleVideo, centerX, centerY, radius);
      return;
    }

    if (camReady) {
      drawCover(ctx, camVideo!, 0, 0, w, h);
      return;
    }

    if (screenReady) {
      drawContain(ctx, screenVideo!, 0, 0, w, h);
    }
  }, []);

  const startRenderLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastFrameTsRef.current = 0;

    const frameDuration = 1000 / TARGET_FPS;
    const loop = (timestamp: number) => {
      if (!lastFrameTsRef.current || timestamp - lastFrameTsRef.current >= frameDuration - 1) {
        drawFrame();
        lastFrameTsRef.current = timestamp;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  const stopCombinedStream = useCallback(() => {
    stopStream(combinedStreamRef.current);
    combinedStreamRef.current = null;
  }, []);

  const buildCombinedStream = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;

    stopCombinedStream();
    drawFrame();
    const stream = canvas.captureStream(TARGET_FPS);

    await syncAudioGraph();
    const mixedTrack = audioDestinationRef.current?.stream.getAudioTracks()[0]?.clone();
    if (mixedTrack) {
      mixedTrack.enabled = true;
      stream.addTrack(mixedTrack);
    }

    combinedStreamRef.current = stream;
    return stream;
  }, [drawFrame, stopCombinedStream, syncAudioGraph]);

  const ensureCamera = useCallback(async () => {
    const existingTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
    if (isTrackLive(existingTrack)) {
      existingTrack.enabled = true;
      cameraOnRef.current = true;
      if (micTrackRef.current && isTrackLive(micTrackRef.current)) {
        micTrackRef.current.enabled = micOnRef.current;
      }
      setCameraOn(true);
      await syncAudioGraph();
      return cameraStreamRef.current;
    }

    stopStream(cameraCaptureRef.current);
    cameraCaptureRef.current = null;
    cameraStreamRef.current = null;
    micTrackRef.current = null;
    cameraVideoRef.current = null;

    const capture = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: TARGET_FPS, max: TARGET_FPS },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    cameraCaptureRef.current = capture;
    const [videoTrack] = capture.getVideoTracks();
    const [audioTrack] = capture.getAudioTracks();

    if (videoTrack) {
      videoTrack.contentHint = "motion";
      videoTrack.enabled = true;
      videoTrack.onended = () => {
        cameraOnRef.current = false;
        setCameraOn(false);
        toast.error("Caméra interrompue", {
          description: "Le studio continue sans caméra.",
        });
      };
      cameraStreamRef.current = new MediaStream([videoTrack]);
      cameraVideoRef.current = await createPlaybackVideo(cameraStreamRef.current);
    }

    if (audioTrack) {
      audioTrack.enabled = micOnRef.current;
      audioTrack.onended = () => {
        micOnRef.current = false;
        setMicOn(false);
      };
      micTrackRef.current = audioTrack;
    }

    cameraOnRef.current = !!videoTrack;
    setCameraOn(!!videoTrack);
    await syncAudioGraph();
    return cameraStreamRef.current;
  }, [createPlaybackVideo, syncAudioGraph]);

  const disableCamera = useCallback(async () => {
    cameraStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
    cameraOnRef.current = false;
    setCameraOn(false);
    await syncAudioGraph();
  }, [syncAudioGraph]);

  const stopScreen = useCallback(async ({ notify = false }: StopScreenOptions = {}) => {
    stopStream(screenCaptureRef.current);
    screenCaptureRef.current = null;
    screenStreamRef.current = null;
    screenAudioTrackRef.current = null;
    screenVideoRef.current = null;
    screenOnRef.current = false;
    setScreenOn(false);
    if (notify) {
      toast.message("Partage d'écran arrêté", {
        description: "Le studio repasse automatiquement sur la caméra.",
      });
    }
    await syncAudioGraph();
  }, [syncAudioGraph]);

  const enableScreen = useCallback(async () => {
    const requestDisplayMedia = getDisplayMediaSafely();
    if (!requestDisplayMedia || isLikelyMobile()) {
      toast.error("Le partage d'écran n'est pas disponible sur cet appareil");
      return null;
    }

    try {
      const capture = await requestDisplayMedia({
        video: {
          frameRate: { ideal: TARGET_FPS, max: TARGET_FPS },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });

      const [videoTrack] = capture.getVideoTracks();
      const [audioTrack] = capture.getAudioTracks();

      if (!videoTrack) {
        stopStream(capture);
        toast.error("Aucun flux écran détecté");
        return null;
      }

      videoTrack.contentHint = "detail";
      videoTrack.onended = () => {
        void stopScreen({ notify: true });
      };

      screenCaptureRef.current = capture;
      screenStreamRef.current = new MediaStream([videoTrack]);
      screenVideoRef.current = await createPlaybackVideo(screenStreamRef.current);
      screenAudioTrackRef.current = audioTrack ?? null;
      screenOnRef.current = true;
      setScreenOn(true);
      await syncAudioGraph();
      return screenStreamRef.current;
    } catch (error: any) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
        toast.message("Partage d'écran annulé", {
          description: "Tu peux continuer avec la caméra seule.",
        });
        return null;
      }

      console.error(error);
      toast.error("Impossible d'activer le partage d'écran");
      return null;
    }
  }, [createPlaybackVideo, stopScreen, syncAudioGraph]);

  const toggleCamera = useCallback(async () => {
    if (cameraOnRef.current) {
      await disableCamera();
      return;
    }

    try {
      await ensureCamera();
    } catch {
      toast.error("Accès caméra refusé", {
        description: "Le studio continue, mais sans flux caméra.",
      });
    }
  }, [disableCamera, ensureCamera]);

  const toggleMic = useCallback(async () => {
    const next = !micOnRef.current;
    micOnRef.current = next;
    if (micTrackRef.current && isTrackLive(micTrackRef.current)) {
      micTrackRef.current.enabled = next;
    }
    setMicOn(next);
    await syncAudioGraph();
  }, [syncAudioGraph]);

  const toggleScreen = useCallback(async () => {
    if (screenOnRef.current) {
      await stopScreen();
      return;
    }

    await enableScreen();
  }, [enableScreen, stopScreen]);

  const swapStreams = useCallback(() => {
    if (!cameraOnRef.current || !screenOnRef.current) return;
    setSwapped((current) => !current);
  }, []);

  const setBubble = useCallback((bubble: WebcamBubble) => {
    bubbleRef.current = bubble;
  }, []);

  const getBubble = useCallback(() => bubbleRef.current, []);

  const start = useCallback(async () => {
    if (recordingRef.current) return;
    if (typeof MediaRecorder === "undefined") {
      toast.error("Navigateur non supporté");
      return;
    }

    if (!cameraOnRef.current && !screenOnRef.current) {
      try {
        await ensureCamera();
      } catch {
        toast.error("Aucune source vidéo active");
        return;
      }
    }

    try {
      const stream = await buildCombinedStream();
      if (!stream) {
        toast.error("Aperçu indisponible");
        return;
      }

      const mime = pickMime();
      const recorder = mime
        ? new MediaRecorder(stream, {
            mimeType: mime,
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
          })
        : new MediaRecorder(stream, {
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
          });

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        console.error("Recorder error", event);
        toast.error("Erreur pendant l'enregistrement");
      };
      recorder.onstop = () => {
        stopElapsedTimer();
        stopCombinedStream();
        recorderRef.current = null;
        setRecording(false);
        setPaused(false);
        const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
        if (blob.size === 0) {
          toast.error("Enregistrement vide");
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setLastRecording({ url, format: formatToRecordingFormat(formatRef.current) });
        onFinished(url);
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = performance.now();
      pausedDurationRef.current = 0;
      pausedAtRef.current = 0;
      setElapsed(0);
      setPaused(false);
      setRecording(true);
      startElapsedTimer();
    } catch (error) {
      console.error(error);
      stopCombinedStream();
      toast.error("Impossible de démarrer l'enregistrement");
    }
  }, [buildCombinedStream, ensureCamera, onFinished, previewUrl, startElapsedTimer, stopCombinedStream, stopElapsedTimer]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    updateElapsed();
    stopElapsedTimer();
    setPaused(false);
    setRecording(false);
    pausedAtRef.current = 0;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopCombinedStream();
    }
  }, [stopCombinedStream, stopElapsedTimer, updateElapsed]);

  const togglePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (recorder.state === "recording") {
      recorder.pause();
      pausedAtRef.current = performance.now();
      setPaused(true);
      stopElapsedTimer();
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      if (pausedAtRef.current) {
        pausedDurationRef.current += performance.now() - pausedAtRef.current;
      }
      pausedAtRef.current = 0;
      setPaused(false);
      startElapsedTimer();
    }
  }, [startElapsedTimer, stopElapsedTimer]);

  useEffect(() => {
    startRenderLoop();
    ensureCamera().catch(() => {
      setCameraOn(false);
      toast.warning("Autorise la caméra pour profiter du studio complet");
    });

    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopElapsedTimer();
      stopCombinedStream();
      stopStream(cameraCaptureRef.current);
      stopStream(screenCaptureRef.current);
      disconnectAudioNode(micAudioSourceRef.current);
      disconnectAudioNode(micGainRef.current);
      disconnectAudioNode(screenAudioSourceRef.current);
      disconnectAudioNode(screenGainRef.current);
      audioContextRef.current?.close().catch(() => {});
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, [ensureCamera, startRenderLoop, stopCombinedStream, stopElapsedTimer]);

  return {
    recording,
    paused,
    elapsed,
    cameraOn,
    micOn,
    screenOn,
    swapped,
    screenSupported,
    previewUrl,
    attachPreviewCanvas,
    start,
    stop,
    togglePause,
    toggleCamera,
    toggleMic,
    toggleScreen,
    swapStreams,
    enableScreen,
    stopScreen,
    setBubble,
    getBubble,
  };
}
