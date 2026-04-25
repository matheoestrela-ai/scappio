import { Link } from "react-router-dom";
import { useState, useEffect, useRef, FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Mic, Sparkles, Share2, ArrowRight, Menu, X, Brain,
  PenLine, Wand2, FileDown, Eye, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------- helpers ------------------------------- */

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && (setShown(true), io.disconnect()),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

const Reveal = ({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) => {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </div>
  );
};

/* ----------------------------- handwriting ----------------------------- */

const HandwrittenIdees = () => (
  <span className="relative inline-block align-baseline px-1">
    <span className="font-hand text-[1.15em] leading-none text-secondary inline-block" style={{ transform: "rotate(-2deg)" }}>
      idées
    </span>
    {/* underline scribble */}
    <svg
      viewBox="0 0 220 24" className="absolute left-0 -bottom-2 w-full h-3"
      fill="none" stroke="currentColor"
      style={{ color: "hsl(var(--secondary))" }}
    >
      <path
        d="M4 14 C 50 4, 110 22, 216 8"
        strokeWidth="3" strokeLinecap="round"
        style={{ strokeDasharray: 300, animation: "draw-stroke 1.4s 0.8s ease-out forwards", strokeDashoffset: 300 }}
      />
    </svg>
  </span>
);

/* ------------------------------- mockup -------------------------------- */

const HeroMockup = () => (
  <div className="relative w-full max-w-[520px] mx-auto animate-float-slow">
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-3 shadow-elegant border border-border/60">
      {/* notebook */}
      <div className="rounded-xl bg-[hsl(var(--paper))] p-4 relative overflow-hidden border border-border/50">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: "repeating-linear-gradient(0deg, hsl(var(--ink)/0.06) 0 1px, transparent 1px 22px)"
        }} />
        <div className="relative space-y-2 font-hand text-ink text-xl leading-tight">
          <div>Lancer Gribouille</div>
          <div className="pl-3">→ landing</div>
          <div className="pl-3">→ onboarding</div>
          <div className="mt-2">Marketing ?</div>
          <div className="pl-3">tiktok · twitter</div>
          <div className="mt-2 underline decoration-secondary/60">objectif: 1k users</div>
        </div>
      </div>
      {/* board */}
      <div className="rounded-xl bg-gradient-board p-3 relative border border-border/50">
        <div className="flex flex-col items-center gap-3 h-full justify-center">
          <div className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-node animate-fade-up">
            Lancer Gribouille
          </div>
          <div className="flex gap-2 w-full justify-center">
            <div className="px-2.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] font-medium shadow-node animate-fade-up" style={{ animationDelay: "0.2s" }}>
              Landing
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] font-medium shadow-node animate-fade-up" style={{ animationDelay: "0.35s" }}>
              Onboarding
            </div>
          </div>
          <div className="flex gap-2 w-full justify-center">
            <div className="px-2 py-1 rounded-md bg-card text-foreground text-[10px] border border-border shadow-node animate-fade-up" style={{ animationDelay: "0.55s" }}>
              TikTok
            </div>
            <div className="px-2 py-1 rounded-md bg-card text-foreground text-[10px] border border-border shadow-node animate-fade-up" style={{ animationDelay: "0.7s" }}>
              Twitter
            </div>
            <div className="px-2 py-1 rounded-md bg-accent text-accent-foreground text-[10px] shadow-node animate-fade-up" style={{ animationDelay: "0.85s" }}>
              1k users
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="absolute -top-3 -right-3 rotate-3 bg-[hsl(var(--postit))] text-ink text-xs font-medium px-3 py-1.5 rounded-md postit-shadow font-hand text-base">
      en 10s ✨
    </div>
  </div>
);

/* -------------------------------- page -------------------------------- */

const Index = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Entre un email valide");
      return;
    }
    toast.success("C'est parti — bienvenue dans Gribouille !");
    setEmail("");
  };

  const heroTitle = ["Transforme", "tes"];
  const heroEnd = ["en", "board", "visuel."];

  return (
    <div className="min-h-screen bg-paper text-ink pb-24 md:pb-0">
      {/* NAV */}
      <header className={`sticky top-0 z-40 transition-all ${scrolled ? "backdrop-blur-md bg-[hsl(var(--paper))]/75 border-b border-border/60 shadow-sm" : ""}`}>
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
            <span className="text-2xl font-serif-display font-bold tracking-tight">Gribouille</span>
            <span className="text-xl">✏️</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-[15px]">
            <a href="#how" className="ink-underline text-ink/80 hover:text-ink">Comment ça marche</a>
            <a href="#features" className="ink-underline text-ink/80 hover:text-ink">Fonctionnalités</a>
            <a href="#testimonials" className="ink-underline text-ink/80 hover:text-ink">Témoignages</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/auth" className="text-[15px] text-ink/80 hover:text-ink ink-underline">Se connecter</Link>
            <Button asChild className="bg-primary hover:bg-primary/90 transition-transform duration-200 hover:scale-[1.03]">
              <Link to="/auth">Commencer gratuitement</Link>
            </Button>
          </div>

          <button className="md:hidden p-2 -mr-2" aria-label="Menu" onClick={() => setMenuOpen(v => !v)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-border/60 bg-[hsl(var(--paper))]/95 backdrop-blur">
            <div className="container py-4 flex flex-col gap-4 text-base">
              <a href="#how" onClick={() => setMenuOpen(false)} className="py-2">Comment ça marche</a>
              <a href="#features" onClick={() => setMenuOpen(false)} className="py-2">Fonctionnalités</a>
              <a href="#testimonials" onClick={() => setMenuOpen(false)} className="py-2">Témoignages</a>
              <Link to="/auth" onClick={() => setMenuOpen(false)} className="py-2">Se connecter</Link>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative bg-hero-warm overflow-hidden">
        <div className="container grid lg:grid-cols-2 gap-12 lg:gap-8 py-14 md:py-20 lg:py-24 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm shadow-sm animate-fade-up">
              <Sparkles className="size-4 text-secondary" />
              <span>Propulsé par l'IA · Gratuit pour commencer</span>
            </div>

            <h1 className="font-serif-display font-bold leading-[1.05] tracking-tight mt-6 text-[clamp(2.5rem,6vw,4.75rem)]">
              {heroTitle.map((w, i) => (
                <span key={i} className="inline-block mr-3 animate-word-in" style={{ animationDelay: `${i * 0.08}s` }}>
                  {w}
                </span>
              ))}
              <span className="inline-block mr-3 animate-word-in" style={{ animationDelay: `${heroTitle.length * 0.08}s` }}>
                <HandwrittenIdees />
              </span>
              <br className="hidden sm:block" />
              {heroEnd.map((w, i) => (
                <span key={i} className="inline-block mr-3 animate-word-in" style={{ animationDelay: `${(heroTitle.length + 1 + i) * 0.08}s` }}>
                  {w}
                </span>
              ))}
            </h1>

            <p className="mt-6 text-lg md:text-xl text-ink/70 max-w-xl leading-relaxed">
              Parle ou prends une photo — Gribouille structure tout en 10 secondes.
              Zéro Miro. Zéro effort. Zéro friction.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
              <Button asChild variant="outline" className="h-12 transition-transform duration-200 hover:scale-[1.03] border-ink/15 bg-card">
                <Link to="/auth"><Camera className="mr-1" /> Depuis une photo</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 transition-transform duration-200 hover:scale-[1.03] border-ink/15 bg-card">
                <Link to="/auth"><Mic className="mr-1" /> Depuis ta voix</Link>
              </Button>
            </div>

            <Button
              asChild
              size="lg"
              className="mt-4 w-full max-w-md h-14 text-base bg-primary hover:bg-primary/90 animate-pulse-glow transition-transform duration-200 hover:scale-[1.02]"
            >
              <Link to="/auth">Commencer gratuitement <ArrowRight /></Link>
            </Button>

            <p className="mt-3 text-sm text-ink/55 max-w-md">
              Aucune CB requise · Gratuit pour commencer · +847 utilisateurs actifs
            </p>
          </div>

          <div className="relative">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <section className="border-y border-border/60 bg-card">
        <div className="container py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {["#4F46E5", "#7C3AED", "#F59E0B", "#1A1A1A", "#FDE68A"].map((c, i) => (
                <div key={i} className="size-8 rounded-full border-2 border-card" style={{ background: c }} />
              ))}
            </div>
            <span className="text-sm md:text-[15px] font-medium">+847 personnes utilisent Gribouille</span>
          </div>
          <div className="flex gap-2 md:gap-3 overflow-x-auto md:overflow-visible w-full md:w-auto no-scrollbar">
            {["✏️ Plus simple que Miro", "🧠 Plus puissant que Notion", "⚡ Plus rapide que tout"].map((t) => (
              <span key={t} className="whitespace-nowrap px-3 py-1.5 rounded-full bg-muted text-ink/80 text-sm border border-border/60">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* TWO SUPER POWERS */}
      <section className="container py-20 md:py-28">
        <Reveal>
          <h2 className="font-serif-display text-4xl md:text-5xl font-bold text-center max-w-3xl mx-auto leading-tight">
            Deux façons de penser. <span className="text-handwritten text-[1.1em]">Un</span> seul résultat.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6 mt-12 md:mt-16">
          {/* VOCAL */}
          <Reveal>
            <div className="group rounded-2xl bg-ink text-white p-8 md:p-10 h-full border border-ink relative overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-glow">
              <span className="inline-block px-3 py-1 rounded-full bg-secondary/20 text-secondary-foreground text-xs font-semibold mb-6 border border-secondary/40">
                Le plus viral ✨
              </span>
              <div className="size-14 rounded-2xl bg-primary flex items-center justify-center mb-6">
                <Mic className="size-7" />
              </div>
              <h3 className="font-serif-display text-3xl font-bold mb-3">Tu parles. On structure.</h3>
              <p className="text-white/70 leading-relaxed mb-6">
                Parle librement pendant 30 secondes. Gribouille comprend ta pensée et construit ton board en temps réel.
              </p>
              {/* sound wave demo */}
              <div className="flex items-end gap-1 h-12 mb-2">
                {Array.from({ length: 22 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-primary/80 group-hover:bg-primary"
                    style={{
                      height: `${20 + ((i * 13) % 80)}%`,
                      animation: `wave 1s ease-in-out ${i * 0.06}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </Reveal>

          {/* PHOTO */}
          <Reveal delay={150}>
            <div className="group rounded-2xl bg-card p-8 md:p-10 h-full border-2 border-primary/40 relative overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-elegant">
              <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
                Le plus utilisé 📸
              </span>
              <div className="size-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-6">
                <Camera className="size-7" />
              </div>
              <h3 className="font-serif-display text-3xl font-bold mb-3">Tu cadres. On comprend.</h3>
              <p className="text-ink/70 leading-relaxed mb-6">
                Prends une photo de tes notes, post-its ou tableau blanc. L'IA analyse et reconstruit un board propre instantanément.
              </p>
              <div className="rounded-xl border border-border bg-paper p-3 grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-md bg-[hsl(var(--postit))]/80 font-hand text-ink text-xs flex items-center justify-center text-center p-1">notes</div>
                <div className="aspect-square rounded-md bg-card border border-border flex items-center justify-center"><ArrowRight className="text-primary" /></div>
                <div className="aspect-square rounded-md bg-gradient-primary flex items-center justify-center text-white text-xs font-semibold">board</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-paper-soft py-20 md:py-28 border-y border-border/60">
        <div className="container">
          <Reveal>
            <h2 className="font-serif-display text-4xl md:text-5xl font-bold text-center max-w-3xl mx-auto leading-tight">
              Simple comme écrire sur du <span className="text-handwritten text-[1.1em]">papier.</span>
            </h2>
          </Reveal>

          <div className="relative mt-16 grid md:grid-cols-3 gap-8 md:gap-4">
            {/* dotted line */}
            <svg className="hidden md:block absolute top-12 left-[16%] right-[16%] h-4" viewBox="0 0 800 16" preserveAspectRatio="none">
              <path d="M 0 8 Q 200 -10, 400 8 T 800 8" fill="none" stroke="hsl(var(--ink) / 0.25)" strokeWidth="2" strokeDasharray="4 8" strokeLinecap="round" />
            </svg>

            {[
              { ico: "📸", alt: "🎙️", title: "Tu captures ton idée", desc: "Photo ou vocal — 2 secondes, c'est tout." },
              { ico: "🧠", title: "Gribouille analyse", desc: "L'IA détecte chaque idée, chaque flèche, chaque lien." },
              { ico: "✨", title: "Ton board est prêt", desc: "Propre, structuré, modifiable, exportable." },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 200}>
                <div className="relative bg-card border border-border rounded-2xl p-6 text-center shadow-sm hover:shadow-elegant transition-shadow">
                  <div className="text-4xl mb-3">
                    {s.ico}{s.alt && <span className="ml-1">ou {s.alt}</span>}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-ink/50 mb-1">Étape {i + 1}</div>
                  <h3 className="font-serif-display text-2xl font-bold mb-2">{s.title}</h3>
                  <p className="text-ink/70">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* THE PROBLEM (dark) */}
      <section className="bg-ink text-white py-24 md:py-32 relative overflow-hidden">
        {/* drifting particles */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute size-1 rounded-full bg-white/30"
            style={{
              left: `${(i * 7.3) % 100}%`,
              top: `${(i * 13.7) % 100}%`,
              animation: `drift ${8 + (i % 5)}s linear ${i * 0.6}s infinite`,
            }}
          />
        ))}

        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center space-y-3">
            {[
              "Miro est trop complexe.",
              "Tes carnets finissent dans un tiroir.",
              "Tes idées vocales disparaissent.",
            ].map((line, i) => (
              <Reveal key={i} delay={i * 250}>
                <p className="font-serif-display text-3xl md:text-5xl font-bold leading-tight">{line}</p>
              </Reveal>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-5 mt-16 max-w-4xl mx-auto">
            {[
              { ico: <Lightbulb />, t: "Tu perds tes meilleures idées" },
              { ico: <PenLine />, t: "Tu retapes tout à la main" },
              { ico: <Eye />, t: "Tu n'utilises jamais vraiment Miro" },
            ].map((c, i) => (
              <Reveal key={i} delay={i * 150}>
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm h-full">
                  <div className="size-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">{c.ico}</div>
                  <p className="text-lg">{c.t}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container py-20 md:py-28">
        <Reveal>
          <h2 className="font-serif-display text-4xl md:text-5xl font-bold text-center max-w-3xl mx-auto leading-tight">
            Tout ce dont tu as besoin. <br className="hidden md:block" />
            <span className="text-ink/60">Rien de superflu.</span>
          </h2>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
          {[
            { ico: <Brain />, e: "🧠", t: "IA Vision", d: "Analyse ta photo en profondeur et détecte chaque idée." },
            { ico: <Mic />, e: "🎙️", t: "Vocal to Board", d: "Parle, le board se construit en temps réel." },
            { ico: <PenLine />, e: "✏️", t: "Éditeur intuitif", d: "Modifie, déplace, ajoute des nœuds librement." },
            { ico: <Wand2 />, e: "💡", t: "Suggestions IA", d: "L'agent détecte ce qui manque et te propose des idées." },
            { ico: <FileDown />, e: "📄", t: "Export PDF", d: "Exporte ton board en PDF propre en 1 clic." },
            { ico: <Share2 />, e: "🤝", t: "Partage instantané", d: "Partage un lien de ton board en 1 tap." },
          ].map((f, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:-translate-y-1 transition-all shadow-sm hover:shadow-elegant">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{f.ico}</div>
                  <span className="text-2xl">{f.e}</span>
                </div>
                <h3 className="font-serif-display text-xl font-bold mb-1.5">{f.t}</h3>
                <p className="text-ink/70 leading-relaxed">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS — postit */}
      <section id="testimonials" className="py-20 md:py-28" style={{ background: "hsl(var(--postit))" }}>
        <div className="container">
          <Reveal>
            <h2 className="font-serif-display text-4xl md:text-5xl font-bold text-center text-ink leading-tight">
              Ils ont arrêté de retaper leurs notes.
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8 mt-14">
            {[
              { name: "Marie", role: "étudiante ESCP", rot: "-rotate-2", quote: "Je prends mes notes en cours et j'ai mon board de révision en 10 secondes. Je ne retourne plus jamais sur Miro." },
              { name: "Thomas", role: "founder", rot: "rotate-1", quote: "Je parle de mon idée de startup pendant 1 minute et j'ai un board stratégique complet. C'est de la magie." },
              { name: "Camille", role: "consultante", rot: "-rotate-1", quote: "Mes notes de réunion deviennent un compte-rendu visuel avant même que je rentre chez moi." },
            ].map((t, i) => (
              <Reveal key={i} delay={i * 150}>
                <div className={`bg-card ${t.rot} hover:rotate-0 hover:-translate-y-2 transition-all duration-300 postit-shadow rounded-md p-6 h-full`}>
                  <p className="font-hand text-2xl text-ink leading-snug mb-6">"{t.quote}"</p>
                  <div>
                    <div className="font-semibold text-ink">{t.name}</div>
                    <div className="text-sm text-ink/60">{t.role}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-primary text-white py-20 md:py-28">
        <div className="container max-w-3xl text-center">
          <Reveal>
            <h2 className="font-serif-display text-4xl md:text-6xl font-bold leading-tight">
              Arrête de perdre tes <HandwrittenIdees />.
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-5 text-lg md:text-xl text-white/85">
              Rejoins les premiers à transformer leur façon de penser.
            </p>
          </Reveal>
          <Reveal delay={250}>
            <form onSubmit={handleSubmit} className="mt-10 flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.com"
                className="h-14 text-base bg-white text-ink border-0 focus-visible:ring-4 focus-visible:ring-white/40"
              />
              <Button
                type="submit"
                size="lg"
                className="h-14 px-7 bg-white text-primary hover:bg-white/95 font-semibold transition-transform duration-200 hover:scale-[1.03]"
              >
                Commencer gratuitement <ArrowRight />
              </Button>
            </form>
          </Reveal>
          <p className="mt-4 text-sm text-white/75">
            Aucune CB requise · Gratuit pour commencer · Annulable à tout moment
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-ink text-white/70">
        <div className="container py-12 grid md:grid-cols-2 gap-6 items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-serif-display font-bold text-white">Gribouille</span>
              <span>✏️</span>
            </div>
            <p className="mt-2 text-white/60">Tes idées méritent mieux.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end text-sm">
            <a href="#" className="hover:text-white">Mentions légales</a>
            <a href="#" className="hover:text-white">Confidentialité</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
        <div className="container border-t border-white/10 py-5 text-xs text-white/40">© 2026 Gribouille</div>
      </footer>

      {/* MOBILE STICKY CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-[hsl(var(--paper))]/95 backdrop-blur border-t border-border">
        <Button asChild size="lg" className="w-full h-12 bg-primary hover:bg-primary/90 animate-pulse-glow">
          <Link to="/auth">Commencer gratuitement <ArrowRight /></Link>
        </Button>
      </div>
    </div>
  );
};

export default Index;
