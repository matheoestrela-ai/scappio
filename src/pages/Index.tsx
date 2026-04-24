import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, Share2, ArrowRight, Workflow, FileDown } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-hero">
      {/* Nav */}
      <header className="container flex items-center justify-between py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="text-xl font-semibold tracking-tight">gribouille</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition">
            Connexion
          </Link>
          <Button asChild size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90">
            <Link to="/auth">Essayer gratuitement</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="container pt-16 pb-24 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Propulsé par l'IA Vision
        </div>
        <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          Tes notes manuscrites,
          <br />
          <span className="text-gradient">en tableau visuel.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Prends une photo de tes gribouillis. gribouille extrait les idées, les
          priorités et les connexions, puis te livre un mindmap propre en quelques secondes.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="bg-gradient-primary shadow-glow hover:opacity-90">
            <Link to="/auth">
              Essayer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how">Voir comment ça marche</a>
          </Button>
        </div>

        {/* Mock preview */}
        <div className="mx-auto mt-20 max-w-5xl rounded-3xl border border-border bg-gradient-card p-3 shadow-elegant">
          <div className="rounded-2xl bg-gradient-board p-10">
            <div className="flex flex-col items-center gap-10">
              {/* Top: main idea (rectangle indigo) */}
              <div className="rounded-2xl px-6 py-4 text-white font-semibold shadow-node"
                style={{ background: "linear-gradient(135deg, #4F46E5, #6366F1)" }}>
                Idée principale
              </div>
              {/* Middle: 3 children */}
              <div className="flex flex-wrap items-center justify-center gap-10">
                <div className="flex h-28 w-28 items-center justify-center rounded-full text-white text-sm font-semibold text-center shadow-node"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)" }}>
                  Concept A
                </div>
                <div className="relative h-28 w-28">
                  <div className="absolute inset-2 rounded-xl shadow-node"
                    style={{ transform: "rotate(45deg)", background: "linear-gradient(135deg, #F59E0B, #FBBF24)" }} />
                  <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-semibold">
                    Décision
                  </div>
                </div>
                <div className="flex h-28 w-28 items-center justify-center rounded-full text-white text-sm font-semibold text-center shadow-node"
                  style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)" }}>
                  Concept B
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container py-24">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
          Comment ça marche
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Trois étapes, zéro friction.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Camera, title: "1. Prends en photo", desc: "Drag & drop ou upload une photo JPG/PNG de tes notes manuscrites." },
            { icon: Workflow, title: "2. L'IA structure", desc: "Notre IA Vision détecte titres, idées, priorités et connexions." },
            { icon: FileDown, title: "3. Exporte & partage", desc: "Visualise ton tableau, exporte-le en PDF, partage le lien." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="rounded-3xl border border-border bg-gradient-card p-12 text-center shadow-elegant">
          <Share2 className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Prêt à transformer tes notes ?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Crée ton compte gratuitement et upload ta première photo en moins d'une minute.
          </p>
          <Button asChild size="lg" className="mt-8 bg-gradient-primary shadow-glow hover:opacity-90">
            <Link to="/auth">
              Commencer maintenant <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} gribouille — Construit avec Lovable
      </footer>
    </div>
  );
};

export default Index;
