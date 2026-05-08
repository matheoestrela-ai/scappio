import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

type Shared = {
  id: string;
  video_url: string;
  format: string;
  created_at: string;
  expires_at: string;
};

const SharedVideo = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Shared | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) { setLoading(false); return; }
      const { data, error } = await supabase
        .from("shared_videos")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) { setExpired(true); setLoading(false); return; }
      if (new Date(data.expires_at).getTime() < Date.now()) {
        setExpired(true);
      } else {
        setData(data as Shared);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (expired || !data) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold mb-3">Cette vidéo a expiré ou n'existe plus</h1>
        <p className="text-muted-foreground mb-6">Les vidéos partagées sont disponibles 7 jours.</p>
        <Link to="/" className="text-orange-600 underline underline-offset-4">Retour à l'accueil</Link>
      </div>
    );
  }

  const isTikTok = data.format === "tiktok" || data.format === "9:16";
  const playerStyle = isTikTok
    ? { maxWidth: 400, aspectRatio: "9 / 16" as const }
    : { maxWidth: 800, aspectRatio: "16 / 9" as const };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center px-4 py-8">
      <div className="w-full flex flex-col items-center gap-4">
        <div className="relative w-full" style={playerStyle}>
          <video
            src={data.video_url}
            controls
            autoPlay
            playsInline
            className="w-full h-full bg-black rounded-2xl object-contain shadow-lg"
          />
          {/* Viral watermark */}
          <a
            href="https://scappio.fr"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-orange-500/95 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 shadow-md backdrop-blur-sm transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Créé avec Scappio — Essaie gratuitement
          </a>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <span className="text-orange-500 text-xl font-bold">scappio</span>
          <span className="text-orange-500 text-sm">— Créé avec Scappio</span>
        </div>

        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-medium px-5 py-2.5 transition-colors"
        >
          Créer mes propres vidéos gratuitement →
        </Link>
      </div>
    </div>
  );
};

export default SharedVideo;
