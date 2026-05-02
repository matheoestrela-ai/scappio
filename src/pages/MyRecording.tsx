import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { consumeLastRecording } from "@/lib/recording-store";

const MyRecording = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<{ url: string; format: "standard" | "tiktok" } | null>(null);

  useEffect(() => {
    const rec = consumeLastRecording();
    if (!rec) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setData(rec);
    return () => {
      // Revoke when leaving
      try {
        URL.revokeObjectURL(rec.url);
      } catch {}
    };
  }, [navigate]);

  if (!data) return null;

  const filename = `scappio-${data.format}-${new Date().toISOString().slice(0, 10)}.webm`;

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="container py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour au board
          </Button>
          <h1 className="text-base sm:text-lg font-semibold">Mon enregistrement</h1>
          <div className="w-[120px]" />
        </div>
      </header>

      <main className="flex-1 container py-6 sm:py-10 flex flex-col items-center gap-6">
        <div
          className={`w-full ${
            data.format === "tiktok" ? "max-w-sm" : "max-w-4xl"
          } rounded-xl overflow-hidden shadow-elegant bg-black`}
        >
          <video
            src={data.url}
            controls
            autoPlay
            playsInline
            className="w-full h-auto block"
          />
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

        <p className="text-xs text-muted-foreground">
          Format : {data.format === "tiktok" ? "TikTok 9:16" : "Standard 16:9"} · {filename}
        </p>
      </main>
    </div>
  );
};

export default MyRecording;
