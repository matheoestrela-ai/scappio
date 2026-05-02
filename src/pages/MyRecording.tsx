import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { consumeLastRecording, type RecordingFormat } from "@/lib/recording-store";

const formatLabel = (f: RecordingFormat) => (f === "tiktok" ? "TikTok 9:16" : "YouTube 16:9");

const MyRecording = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ url: string; format: RecordingFormat } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const rec = consumeLastRecording();
    if (!rec) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setData(rec);
    return () => {
      try { URL.revokeObjectURL(rec.url); } catch {}
    };
  }, [navigate]);

  // Fix black preview: MediaRecorder webm blobs have no duration in their
  // metadata, so the <video> shows a black frame until the user seeks.
  // Seeking past the end then back to 0 forces the browser to compute the
  // real duration and render the first frame.
  useEffect(() => {
    if (!data) return;
    const v = videoRef.current;
    if (!v) return;
    let done = false;
    const onLoaded = () => {
      if (done) return;
      if (v.duration === Infinity || isNaN(v.duration)) {
        const onSeeked = () => {
          v.currentTime = 0;
          v.removeEventListener("seeked", onSeeked);
          done = true;
        };
        v.addEventListener("seeked", onSeeked);
        try { v.currentTime = 1e101; } catch {}
      } else {
        v.currentTime = 0;
        done = true;
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [data]);

  if (!data) return null;

  const filename = `scappio-${data.format}-${new Date().toISOString().slice(0, 10)}.webm`;

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour au board
          </Button>
          <h1 className="text-base sm:text-lg font-semibold">Mon enregistrement</h1>
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
          <video src={data.url} controls autoPlay playsInline className="w-full h-auto block" />
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg" className="bg-primary text-primary-foreground">
            <a href={data.url} download={filename}>
              <Download className="h-4 w-4 mr-2" /> Télécharger la vidéo
            </a>
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate("/dashboard")}>
            Retour au board
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{filename}</p>
      </main>
    </div>
  );
};

export default MyRecording;
