import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Sparkles, Crown, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_PRICES, type PriceKey } from "@/lib/plans";
import { usePlan } from "@/hooks/usePlan";

type Cycle = "monthly" | "annual";

const Upgrade = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [loadingKey, setLoadingKey] = useState<PriceKey | null>(null);
  const { plan, refresh } = usePlan();

  useEffect(() => {
    if (params.get("canceled") === "1") toast.message("Paiement annulé");
  }, [params]);

  const goCheckout = async (key: PriceKey) => {
    setLoadingKey(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Connecte-toi pour passer en payant");
        navigate("/auth?signup=1");
        return;
      }
      const mode = key === "lifetime" ? "payment" : "subscription";
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: STRIPE_PRICES[key], mode },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("URL de checkout manquante");
      window.location.href = data.url as string;
    } catch (e: any) {
      toast.error(e.message ?? "Impossible d'ouvrir le paiement");
    } finally {
      setLoadingKey(null);
      // attempt to sync after returning
      refresh();
    }
  };

  const isOnCreator = plan === "creator";
  const isOnStudio = plan === "studio";
  const isLifetime = plan === "lifetime";

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <span className="text-lg font-semibold tracking-tight">scappio</span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Upgrade</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 sm:py-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-4">
            <Sparkles className="h-3 w-3 text-primary" /> Choisis ton plan
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
            Passe à la vitesse supérieure
          </h1>
          <p className="mt-3 text-muted-foreground">
            Boards illimités, enregistrements sans watermark, et l'agent IA pour t'accompagner.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex rounded-full border border-border bg-background p-1 text-sm">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-4 py-1.5 rounded-full transition ${cycle === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setCycle("annual")}
              className={`px-4 py-1.5 rounded-full transition ${cycle === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Annuel <span className="ml-1 text-[11px] text-orange-500 font-medium">2 mois offerts</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* FREE */}
          <article className="rounded-2xl border border-border bg-background p-6 flex flex-col">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Free</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-bold">0€</span>
              <span className="text-muted-foreground">/mois</span>
            </div>
            <Feature>4 boards IA par mois</Feature>
            <Feature>10 enregistrements par mois</Feature>
            <Feature muted>Exports avec watermark</Feature>
            <Feature muted>Sans agent IA</Feature>
            <Button
              variant="outline"
              className="mt-auto"
              onClick={() => navigate("/dashboard")}
            >
              {plan === "free" ? "Continuer en gratuit" : "Plan actuel"}
            </Button>
          </article>

          {/* CREATOR */}
          <article className="relative rounded-2xl border-2 border-orange-500 bg-background p-6 flex flex-col shadow-elegant">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 text-white text-[11px] font-semibold px-3 py-1 tracking-wide">
              RECOMMANDÉ
            </div>
            <div className="text-xs uppercase tracking-wider text-orange-600">Creator</div>
            <div className="mt-2 flex items-baseline gap-1">
              {cycle === "monthly" ? (
                <>
                  <span className="text-4xl font-bold">14€</span>
                  <span className="text-muted-foreground">/mois</span>
                </>
              ) : (
                <>
                  <span className="text-4xl font-bold">97€</span>
                  <span className="text-muted-foreground">/an</span>
                </>
              )}
            </div>
            <Feature>Boards illimités</Feature>
            <Feature>Enregistrements illimités, sans watermark</Feature>
            <Feature>Agent IA inclus — suggestions et auto-improve</Feature>
            <Feature>Export PDF sans watermark</Feature>
            <Button
              className="mt-auto bg-orange-500 hover:bg-orange-500/90 text-white"
              disabled={!!loadingKey || isOnCreator || isLifetime}
              onClick={() => goCheckout(cycle === "monthly" ? "creator_monthly" : "creator_annual")}
            >
              {loadingKey?.startsWith("creator")
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirection…</>
                : isOnCreator ? "Plan actuel"
                : isLifetime ? "Inclus dans Lifetime"
                : "Passer en Creator"}
            </Button>
          </article>

          {/* STUDIO */}
          <article className="rounded-2xl border-2 border-foreground bg-background p-6 flex flex-col">
            <div className="text-xs uppercase tracking-wider text-foreground">Studio</div>
            <div className="mt-2 flex items-baseline gap-1">
              {cycle === "monthly" ? (
                <>
                  <span className="text-4xl font-bold">29.99€</span>
                  <span className="text-muted-foreground">/mois</span>
                </>
              ) : (
                <>
                  <span className="text-4xl font-bold">197€</span>
                  <span className="text-muted-foreground">/an</span>
                </>
              )}
            </div>
            <Feature>Tout le plan Creator</Feature>
            <Feature>Jusqu'à 3 membres d'équipe</Feature>
            <Feature>Workspace partagé</Feature>
            <Feature>Toutes les futures fonctionnalités équipe</Feature>
            <Button
              className="mt-auto bg-foreground hover:bg-foreground/90 text-background"
              disabled={!!loadingKey || isOnStudio || isLifetime}
              onClick={() => goCheckout(cycle === "monthly" ? "studio_monthly" : "studio_annual")}
            >
              {loadingKey?.startsWith("studio")
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirection…</>
                : isOnStudio ? "Plan actuel"
                : isLifetime ? "Inclus dans Lifetime"
                : "Passer en Studio"}
            </Button>
          </article>
        </div>

        {/* Lifetime banner */}
        <div className="mt-10 rounded-2xl border-2 border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500 text-white inline-flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-semibold">
                Accès à vie — 49€ une seule fois
              </div>
              <div className="text-sm text-muted-foreground">
                Offre limitée aux 50 premiers · Toutes les features Creator, à vie.
              </div>
            </div>
          </div>
          <Button
            className="bg-orange-500 hover:bg-orange-500/90 text-white"
            disabled={!!loadingKey || isLifetime}
            onClick={() => goCheckout("lifetime")}
          >
            {loadingKey === "lifetime"
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirection…</>
              : isLifetime ? "Tu as déjà l'accès Lifetime ✦"
              : "Obtenir l'accès lifetime"}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Annulable en 1 clic · Sans engagement · Paiement sécurisé Stripe
        </p>
      </main>
    </div>
  );
};

const Feature = ({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) => (
  <div className={`flex items-start gap-2 mt-3 text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>
    <Check className={`h-4 w-4 mt-0.5 shrink-0 ${muted ? "text-muted-foreground" : "text-orange-500"}`} />
    <span>{children}</span>
  </div>
);

export default Upgrade;
