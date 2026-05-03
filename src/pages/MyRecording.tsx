import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Scissors, Play, Pause, RotateCcw, Volume2, Sparkles } from "lucide-react";
import { consumeLastRecording, type RecordingFormat } from "@/lib/recording-store";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const formatLabel = (f: RecordingFormat) => (f === "tiktok" ? "TikTok 9:16" : "YouTube 16:9");

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const MyRecording = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ url: string; format: RecordingFormat } | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const outputNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const noiseReductionRef = useRef(false);

  useEffect(() => {
    const rec = consumeLastRecording();
    if (!rec) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setData(rec);
    // Note: do NOT revoke the blob URL on unmount — it's needed for playback
    // and the download link. StrictMode would otherwise revoke it instantly.
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (trimmedUrl) try { URL.revokeObjectURL(trimmedUrl); } catch {}
    };
  }, [trimmedUrl]);

  useEffect(() => {
    return () => {
      if (processedUrl) try { URL.revokeObjectURL(processedUrl); } catch {}
    };
  }, [processedUrl]);

  useEffect(() => {
    noiseReductionRef.current = noiseReduction;
  }, [noiseReduction]);

  // Force webm duration to be computed (MediaRecorder webm has no header).
  useEffect(() => {
    if (!data) return;
    const v = videoRef.current;
    if (!v) return;
    let done = false;
    const finalize = (d: number) => {
      if (done) return;
      done = true;
      setDuration(d);
      setTrimStart(0);
      setTrimEnd(d);
      try { v.currentTime = 0; } catch {}
    };
    const onLoaded = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          finalize(v.duration);
        };
        v.addEventListener("seeked", onSeeked);
        try { v.currentTime = 1e101; } catch {}
      } else {
        finalize(v.duration);
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [data]);

  // Clamp playback to the trim window.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setPlayhead(v.currentTime);
      if (v.currentTime > trimEnd) {
        v.pause();
        v.currentTime = trimEnd;
        setPlaying(false);
      } else if (v.currentTime < trimStart) {
        v.currentTime = trimStart;
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    v.addEventListener("play", onPlay);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("play", onPlay);
    };
  }, [trimStart, trimEnd]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) v.currentTime = trimStart;
      v.play().catch(() => {
        toast.error("Playback failed");
      });
    } else {
      v.pause();
    }
  };

  const connectNoiseReductionChain = async () => {
    const v = videoRef.current;
    if (!v) return null;

    const AudioCtx = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

    if (!AudioCtx) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(v);
    }

    const source = sourceNodeRef.current;
    const destination = ctx.createMediaStreamDestination();
    outputNodeRef.current = destination;

    const inputGain = ctx.createGain();
    inputGain.gain.value = noiseReductionRef.current ? 1.08 : 1;

    if (noiseReductionRef.current) {
      const highPass = ctx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 100;
      highPass.Q.value = 0.8;

      const lowPass = ctx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.value = 7800;
      lowPass.Q.value = 0.8;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -32;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;

      const outputGain = ctx.createGain();
      outputGain.gain.value = 1.05;

      source.connect(inputGain);
      inputGain.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(compressor);
      compressor.connect(outputGain);
      outputGain.connect(ctx.destination);
      outputGain.connect(destination);
    } else {
      source.connect(inputGain);
      inputGain.connect(ctx.destination);
      inputGain.connect(destination);
    }

    return destination.stream;
  };

  // Lightweight client-side trim: re-record the played segment via captureStream
  // into a fresh MediaRecorder. Works in all modern browsers without ffmpeg.
  const trimClip = async () => {
    const v = videoRef.current;
    if (!v || !data) return;
    if (trimEnd - trimStart < 0.2) {
      toast.error("Selection too short");
      return;
    }
    setTrimming(true);
    try {
      sourceNodeRef.current?.disconnect();
      outputNodeRef.current?.disconnect();

      // @ts-ignore captureStream is widely supported on <video>
      const stream: MediaStream = (v as any).captureStream
        ? (v as any).captureStream()
        : (v as any).mozCaptureStream();
      const processedAudioStream = await connectNoiseReductionChain();
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = processedAudioStream?.getAudioTracks()[0] ?? stream.getAudioTracks()[0];
      const exportStream = new MediaStream();
      if (videoTrack) exportStream.addTrack(videoTrack);
      if (audioTrack) exportStream.addTrack(audioTrack);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(exportStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const done = new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });

      v.muted = true;
      v.currentTime = trimStart;
      await new Promise<void>((res) => {
        const onSeek = () => { v.removeEventListener("seeked", onSeek); res(); };
        v.addEventListener("seeked", onSeek);
      });

      rec.start(250);
      await v.play();

      await new Promise<void>((res) => {
        const onTime = () => {
          if (v.currentTime >= trimEnd) {
            v.removeEventListener("timeupdate", onTime);
            v.pause();
            res();
          }
        };
        v.addEventListener("timeupdate", onTime);
      });

      rec.stop();
      const blob = await done;
      if (trimmedUrl) try { URL.revokeObjectURL(trimmedUrl); } catch {}
      const url = URL.createObjectURL(blob);
      setTrimmedUrl(url);
      setProcessedUrl((current) => {
        if (current) {
          try { URL.revokeObjectURL(current); } catch {}
        }
        return url;
      });
      toast.success("Clip ready to download");
    } catch (e: any) {
      console.error(e);
      toast.error("Trim not supported in this browser");
    } finally {
      sourceNodeRef.current?.disconnect();
      outputNodeRef.current?.disconnect();
      setTrimming(false);
    }
  };

  if (!data) return null;

  const filename = `scappio-${data.format}-${new Date().toISOString().slice(0, 10)}.webm`;
  const trimmedFilename = `scappio-${data.format}-clip-${new Date().toISOString().slice(0, 10)}.webm`;
  const currentExportUrl = processedUrl ?? trimmedUrl;

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to board
          </Button>
          <h1 className="text-base sm:text-lg font-semibold">My recording</h1>
          <span
            className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
              data.format === "tiktok"
                ? "bg-orange-100 text-orange-600"
                : "bg-primary/10 text-primary"
            }`}
          >
            {formatLabel(data.format)}
          </span>
        </div>
      </header>

      <main className="flex-1 container py-6 sm:py-10 flex flex-col items-center gap-6">
        <div
          className={`w-full ${
            data.format === "tiktok" ? "max-w-sm" : "max-w-4xl"
          } rounded-xl overflow-hidden shadow-elegant bg-black`}
        >
          <video
            ref={videoRef}
            src={data.url}
            playsInline
            preload="auto"
            className="w-full h-auto block"
          />
        </div>

        {/* Timeline / trim */}
        <div className="w-full max-w-3xl bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Scissors className="h-4 w-4" /> Trim
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {fmt(trimStart)} → {fmt(trimEnd)} ({fmt(trimEnd - trimStart)})
            </div>
          </div>

          <div className="relative h-12 bg-muted rounded-md overflow-hidden border border-border/60">
            <div className="absolute inset-y-0 left-0 right-0 flex items-center px-2">
              <div className="h-1.5 w-full rounded-full bg-secondary" />
            </div>
            <div
              className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary"
              style={{
                left: duration > 0 ? `${(trimStart / duration) * 100}%` : "0%",
                width: duration > 0 ? `${((trimEnd - trimStart) / duration) * 100}%` : "100%",
              }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground/80"
              style={{ left: duration > 0 ? `${(Math.min(playhead, duration) / duration) * 100}%` : "0%" }}
            />
          </div>

          <div className="space-y-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center justify-between"><span>Start</span><span>{fmt(trimStart)}</span></span>
              <Slider
                min={0}
                max={duration || 0}
                step={0.05}
                value={[trimStart]}
                onValueChange={([value]) => {
                  const v = Math.min(value ?? 0, trimEnd - 0.1);
                  setTrimStart(Math.max(0, v));
                  if (videoRef.current) videoRef.current.currentTime = v;
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center justify-between"><span>End</span><span>{fmt(trimEnd)}</span></span>
              <Slider
                min={0}
                max={duration || 0}
                step={0.05}
                value={[trimEnd]}
                onValueChange={([value]) => {
                  const v = Math.max(value ?? duration, trimStart + 0.1);
                  setTrimEnd(Math.min(duration, v));
                  if (videoRef.current) videoRef.current.currentTime = Math.max(trimStart, v - 0.5);
                }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Volume2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Reduce background noise</div>
                <div className="text-xs text-muted-foreground">Audio cleanup applied to the exported clip.</div>
              </div>
            </div>
            <Switch checked={noiseReduction} onCheckedChange={setNoiseReduction} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={togglePlay} className="gap-2">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              Preview selection
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setTrimStart(0); setTrimEnd(duration); setTrimmedUrl(null); }}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                setProcessingAudio(noiseReduction);
                await trimClip();
                setProcessingAudio(false);
              }}
              disabled={trimming || processingAudio}
              className="gap-2 bg-primary text-primary-foreground"
            >
              {noiseReduction ? <Sparkles className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
              {trimming || processingAudio ? "Exporting…" : "Generate clip"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg" className="bg-primary text-primary-foreground">
            <a href={data.url} download={filename}>
              <Download className="h-4 w-4 mr-2" /> Full video
            </a>
          </Button>
          {currentExportUrl && (
            <Button asChild size="lg" variant="default">
              <a href={currentExportUrl} download={trimmedFilename}>
                <Download className="h-4 w-4 mr-2" /> Trimmed clip
              </a>
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={() => navigate("/dashboard")}>
            Back to board
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{filename}</p>
      </main>
    </div>
  );
};

export default MyRecording;
