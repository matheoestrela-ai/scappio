import { Link } from "react-router-dom";
import { useState, useEffect, FormEvent } from "react";
import { motion, useScroll, useTransform, useReducedMotion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Sparkles,
  Share2,
  ArrowRight,
  Workflow,
  FileDown,
  Menu,
  X,
  Clock,
  Layers,
  Frown,
  Zap,
  Mic,
  Image as ImageIcon,
  PenLine,
  MousePointerClick,
  Wand2,
  Download,
  Quote,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

// Typewriter hook
const PLACEHOLDERS = [
  "Décris ton idée, colle tes notes...",
  "Résume ta dernière réunion...",
  "Dis-le à voix haute ou en photo...",
];

function useTypewriter(reducedMotion: boolean) {
  const [text, setText] = useState(PLACEHOLDERS[0]);
  useEffect(() => {
    if (reducedMotion) {
      setText(PLACEHOLDERS[0]);
      return;
    }
    let phraseIdx = 0;
    let charIdx = PLACEHOLDERS[0].length;
    let typing = false; // start by deleting after pause
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = PLACEHOLDERS[phraseIdx];
      if (typing) {
        charIdx += 1;
        setText(phrase.slice(0, charIdx));
        if (charIdx >= phrase.length) {
          typing = false;
          timeout = setTimeout(tick, 2000);
          return;
        }
        timeout = setTimeout(tick, 60);
      } else {
        charIdx -= 1;
        setText(phrase.slice(0, Math.max(0, charIdx)));
        if (charIdx <= 0) {
          typing = true;
          phraseIdx = (phraseIdx + 1) % PLACEHOLDERS.length;
          timeout = setTimeout(tick, 200);
          return;
        }
        timeout = setTimeout(tick, 30);
      }
    };
    timeout = setTimeout(tick, 2000);
    return () => clearTimeout(timeout);
  }, [reducedMotion]);
  return text;
}

// Variants
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const sectionFade: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const gridContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const cardItem: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

const Index = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const reducedMotion = useReducedMotion() ?? false;
  const placeholder = useTypewriter(reducedMotion);

  const { scrollY } = useScroll();
  const dotsY = useTransform(scrollY, [0, 1000], [0, 200]); // 20% of scroll

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Entre un email valide");
      return;
    }
    toast.success("Inscription confirmée — on te tient au courant !");
    setEmail("");
  };

  const inViewProps = {
    initial: "hidden" as const,
    whileInView: "show" as const,
    viewport: { once: true, margin: "-100px" },
  };

  return (
    <div className="relative min-h-screen bg-hero pb-24 md:pb-0">
      {/* Dotted background pattern (parallax) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          y: reducedMotion ? 0 : dotsY,
          backgroundImage: "radial-gradient(hsl(var(--primary) / 0.18) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, black, black 85%, transparent)",
          WebkitMaskImage: "linear-gradient(180deg, black, black 85%, transparent)",
        }}
      />
      <div className="relative z-10">
      {/* Nav */}
      <header className="container flex items-center justify-between py-5 md:py-6">
        <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)} aria-label="Accueil">
          <span className="text-xl md:text-2xl font-bold tracking-tight"><span className="text-primary">scapp</span>io</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-3">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition">Comment ça marche</a>
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition">Fonctionnalités</a>
          <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition">Témoignages</a>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition">Connexion</Link>
          <Button asChild size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90 btn-shimmer">
            <Link to="/auth">Commencer gratuitement</Link>
          </Button>
        </nav>

        {/* Mobile actions */}
        <div className="md:hidden flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="h-10">
            <Link to="/auth">Connexion</Link>
          </Button>
          <button
            aria-label="Menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="md:hidden container pb-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant flex flex-col gap-1 text-base">
            <a href="#how" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Comment ça marche</a>
            <a href="#problem" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Le problème</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Fonctionnalités</a>
            <a href="#testimonials" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Témoignages</a>
            <Link to="/auth" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Connexion</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="container pt-8 md:pt-16 pb-16 md:pb-24 text-center">
        <motion.div initial="hidden" animate="show" variants={heroContainer}>
          <motion.div variants={fadeUp} className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary animate-sparkle-spin" />
            Propulsé par l'IA Vision
          </motion.div>
          <motion.h1 variants={fadeUp} className="mx-auto mt-6 max-w-4xl text-[2rem] font-bold tracking-tight leading-[1.08] sm:text-5xl sm:leading-[1.05] md:text-7xl md:leading-[1.02]">
            <span className="block">
              Transforme tes{" "}
              <span className="relative inline-block">
                <span
                  className="inline-flex whitespace-nowrap align-baseline text-primary font-medium italic leading-none -rotate-[4deg] translate-y-[0.08em] text-[1.16em] sm:text-[1.14em] md:text-[1.18em]"
                  style={{ fontFamily: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Caveat', cursive" }}
                >
                  idées
                </span>
                {/* Underline draw */}
                <svg
                  aria-hidden
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                  className="absolute left-0 right-0 -bottom-2 w-full h-3 pointer-events-none"
                >
                  <path
                    d="M2 8 C 50 2, 150 2, 198 8"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="animate-underline-draw"
                  />
                </svg>
              </span>
            </span>
            <span className="block mt-1 sm:mt-1.5 md:mt-2">en board visuel en 10 secondes</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 md:mt-6 max-w-2xl text-base md:text-lg text-muted-foreground">
            Parle, prends une photo, ou colle tes notes, puis l'IA fait le reste.
          </motion.p>

          {/* Chat-style prompt bar */}
          <motion.form
            variants={fadeUp}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const value = String(fd.get("prompt") || "").trim();
              if (!value) {
                toast.error("Écris quelque chose pour commencer");
                return;
              }
              toast.success("On t'emmène créer ton board !");
              window.location.href = "/auth";
            }}
            className="mx-auto mt-8 md:mt-10 flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card/80 backdrop-blur p-2 shadow-elegant focus-within:ring-2 focus-within:ring-ring"
          >
            <PenLine className="ml-2 h-5 w-5 text-muted-foreground shrink-0" />
            <input
              name="prompt"
              type="text"
              placeholder={placeholder}
              className="flex-1 bg-transparent border-0 outline-none text-base placeholder:text-muted-foreground px-2 py-2"
            />
            <Button type="submit" size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.form>

          <motion.div variants={fadeUp} className="mt-5 md:mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto bg-gradient-primary shadow-glow hover:opacity-90 btn-shimmer">
              <Link to="/auth">
                Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#how">Voir comment ça marche</a>
            </Button>
          </motion.div>
        </motion.div>

        {/* Mockup transformation — animated demo */}
        <motion.div
          {...inViewProps}
          variants={sectionFade}
          className="mx-auto mt-12 md:mt-20 max-w-5xl rounded-2xl md:rounded-3xl border border-border bg-gradient-card p-2 md:p-3 shadow-elegant"
        >
          <div className="rounded-xl md:rounded-2xl bg-gradient-board p-4 md:p-10">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.4fr] items-center gap-6 md:gap-8">
              {/* Inputs côté gauche : voix + photo */}
              <div className="flex flex-col gap-3">
                <motion.div
                  initial={{ opacity: 0, x: -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.3 }}
                  className="rounded-2xl bg-card border border-border p-4 md:p-5 text-left shadow-node"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                    <Mic className="h-3.5 w-3.5 text-primary" /> Note vocale · 0:08
                  </div>
                  <div className="flex items-end gap-1 h-8">
                    {[6, 12, 20, 14, 28, 22, 16, 24, 10, 18, 26, 14, 8, 20, 12].map((h, i) => (
                      <span key={i} className="w-1.5 rounded-full bg-gradient-to-t from-primary to-secondary" style={{ height: `${h}px` }} />
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="rounded-2xl bg-card border border-border p-4 md:p-5 text-left shadow-node"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-primary" /> Photo de tes notes
                  </div>
                  <div className="space-y-1 text-sm text-foreground/80" style={{ fontFamily: "'Comic Sans MS', 'Bradley Hand', cursive" }}>
                    <p>→ Lancer beta</p>
                    <p>· landing fr</p>
                    <p>· waitlist · témoins</p>
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="flex md:flex-col items-center justify-center gap-2 text-primary"
              >
                <Sparkles className="h-5 w-5 animate-sparkle-spin" />
                <ArrowRight className="h-5 w-5 md:rotate-90" />
              </motion.div>

              {/* Board côté droit — hiérarchie claire */}
              <motion.div
                {...inViewProps}
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.15, delayChildren: 0.8 } },
                }}
                className="flex flex-col items-center gap-4 md:gap-5"
              >
                <motion.div
                  variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { duration: 0.4, ease: "easeOut" } } }}
                  className="rounded-2xl px-6 py-3 text-white text-sm md:text-lg font-semibold shadow-node"
                  style={{ background: "linear-gradient(135deg, #F97316, #F97316)" }}
                >
                  Lancer la beta
                </motion.div>
                <motion.div
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }}
                  className="flex gap-10 md:gap-16 -my-1"
                >
                  <span className="block h-4 w-px bg-primary/40" />
                  <span className="block h-4 w-px bg-primary/40" />
                  <span className="block h-4 w-px bg-primary/40" />
                </motion.div>
                <div className="flex items-center justify-center gap-3 md:gap-5">
                  <motion.div
                    variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { duration: 0.4 } } }}
                    className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full text-white text-[11px] md:text-sm font-semibold text-center px-1 shadow-node"
                    style={{ background: "linear-gradient(135deg, #F97316, #FB923C)" }}
                  >
                    Landing FR
                  </motion.div>
                  <motion.div
                    variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { duration: 0.4 } } }}
                    className="relative h-16 w-16 md:h-20 md:w-20"
                  >
                    <div className="absolute inset-1.5 rounded-xl shadow-node" style={{ transform: "rotate(45deg)", background: "linear-gradient(135deg, #F97316, #FB923C)" }} />
                    <div className="absolute inset-0 flex items-center justify-center text-white text-[11px] md:text-sm font-semibold">
                      Waitlist
                    </div>
                  </motion.div>
                  <motion.div
                    variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { duration: 0.4 } } }}
                    className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-full text-white text-[11px] md:text-sm font-semibold text-center px-1 shadow-node"
                    style={{ background: "linear-gradient(135deg, #F97316, #FB923C)" }}
                  >
                    Témoins
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Description */}
      <motion.section {...inViewProps} variants={sectionFade} className="container pb-10 md:pb-14">
        <p className="mx-auto max-w-2xl text-center text-base md:text-lg text-muted-foreground">
          Enregistre tes gribouillis en <span className="font-semibold text-foreground">vocal</span> ou en <span className="font-semibold text-foreground">photo</span>.
          L'IA extrait les idées, les priorités et les connexions, puis te suggère ce qui manque.
          Tu obtiens un mindmap propre et éditable, sans rien retaper.
        </p>
      </motion.section>

      {/* Social proof */}
      <motion.section {...inViewProps} variants={sectionFade} className="container pb-16 md:pb-20">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur py-6 md:py-7 text-center shadow-elegant overflow-hidden">
          <p className="px-6 text-xs md:text-sm uppercase tracking-widest text-muted-foreground">
            Utilisé par des équipes qui viennent de
          </p>
          <div
            className="mt-5 relative w-full overflow-hidden"
            style={{
              maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
            }}
          >
            <div className="flex w-max animate-marquee gap-12 text-muted-foreground/70 text-base md:text-lg font-semibold tracking-wide whitespace-nowrap">
              {Array.from({ length: 2 }).map((_, dup) => (
                <div key={dup} className="flex items-center gap-12 pr-12" aria-hidden={dup === 1}>
                  {["Notion", "Figma", "Linear", "Slack", "FigJam", "Whimsical", "Trello", "Asana"].map((name) => (
                    <span key={`${dup}-${name}`} className="flex items-center gap-12">
                      {name}
                      <span className="text-muted-foreground/40">•</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section {...inViewProps} variants={sectionFade} id="how" className="container py-16 md:py-24">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Workflow className="h-3.5 w-3.5 text-primary" /> Le process
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">Comment ça marche</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Capture en vocal ou en photo. L'IA structure. Tu gardes la main.
          </p>
        </div>
        <motion.div
          {...inViewProps}
          variants={gridContainer}
          className="mt-10 md:mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4"
        >
          {[
            { icon: Mic, title: "1. Vocal", desc: "Dicte tes idées à voix haute. Le micro capte et l'IA transcrit, même quand tu penses à voix haute." },
            { icon: Camera, title: "2. Photo", desc: "Ou prends une photo de tes notes manuscrites — JPG ou PNG, écriture brouillonne acceptée." },
            { icon: Workflow, title: "3. IA structure", desc: "L'IA détecte le sujet principal, les idées, la hiérarchie et les connexions." },
            { icon: FileDown, title: "4. Board", desc: "Visualise un mindmap clair, modifie-le et exporte-le en PDF ou PNG." },
          ].map((f, i) => (
            <motion.div key={i} variants={cardItem} className="card-lift relative rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant">
              <div className="card-icon inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-glow">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Problem */}
      <motion.section {...inViewProps} variants={sectionFade} id="problem" className="container py-16 md:py-24">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Retaper tes notes te fait <span className="text-gradient">perdre du temps</span>.
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
            Tes meilleures idées naissent sur papier ou à voix haute. Mais entre la capture et un board propre, tout le monde abandonne.
          </p>
        </div>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-5 md:grid-cols-3">
          {[
            { icon: Clock, title: "30 minutes perdues", desc: "Recopier chaque note dans un outil de mindmap à la main, c'est une demi-heure à chaque réunion." },
            { icon: Layers, title: "Outils trop lourds", desc: "Les whiteboards classiques : 200 fonctions, 1000 raccourcis, et toujours pas de structure." },
            { icon: Frown, title: "Les idées disparaissent", desc: "Les carnets s'empilent, les mémos vocaux et les photos restent dans le téléphone. Personne n'y revient." },
          ].map((f, i) => (
            <motion.div key={i} variants={cardItem} className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="card-icon inline-flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Features */}
      <motion.section {...inViewProps} variants={sectionFade} id="features" className="container py-16 md:py-24">
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight">Tout ce qu'il te faut. Rien de plus.</h2>
        <p className="mt-3 text-center text-muted-foreground">Une vraie alternative légère aux outils de whiteboard.</p>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Mic, title: "Capture vocale", desc: "Dicte tes idées au micro. L'IA transcrit et structure, parfait pour penser à voix haute." },
            { icon: Sparkles, title: "IA Vision avancée", desc: "Détecte mots, flèches et hiérarchie même sur une écriture brouillonne." },
            { icon: Lightbulb, title: "Suggestions IA", desc: "L'IA propose des idées qui manquent, des connexions logiques et des sous-thèmes pertinents." },
            { icon: Wand2, title: "Auto-improve", desc: "Un clic et l'IA restructure ton board, ajoute les liens manquants." },
            { icon: PenLine, title: "Édition complète", desc: "Édite, déplace, redimensionne, change couleurs et formes en direct." },
            { icon: MousePointerClick, title: "Drag & drop intuitif", desc: "Crée des liens en glissant. Multi-sélection, undo/redo, raccourcis." },
            { icon: Download, title: "Export PDF & PNG", desc: "Exporte ton board en haute qualité ou partage un lien public." },
            { icon: Zap, title: "Rapide comme l'éclair", desc: "10 secondes entre la capture et un mindmap propre, prêt à présenter." },
          ].map((f, i) => (
            <motion.div key={i} variants={cardItem} className="card-lift rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant">
              <div className="card-icon inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Testimonials */}
      <motion.section {...inViewProps} variants={sectionFade} id="testimonials" className="container py-16 md:py-24">
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight">Ils ont arrêté de retaper</h2>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-5 md:grid-cols-3">
          {[
            { name: "Camille D.", role: "Product Manager, Paris", text: "Je sors d'atelier avec 4 photos de paperboard. Avant je passais 1h à recopier dans Miro. Maintenant c'est fait avant que j'arrive au bureau." },
            { name: "Thomas R.", role: "Fondateur, Lyon", text: "J'ai testé tous les outils de mindmap. scappio c'est le seul qui comprend mon écriture pourrie. Bluffant." },
            { name: "Sarah M.", role: "Designer UX, Bordeaux", text: "L'auto-improve est dingue. Il rajoute les connexions logiques que j'avais oubliées sur le papier. Comme un co-pilote." },
          ].map((t, i) => (
            <motion.div key={i} variants={cardItem} className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant flex flex-col">
              <Quote className="card-icon h-6 w-6 text-primary/60" />
              <p className="mt-4 text-sm md:text-base text-foreground/90 flex-1">"{t.text}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-primary text-white flex items-center justify-center text-sm font-semibold shadow-glow">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Final CTA */}
      <motion.section {...inViewProps} variants={sectionFade} className="container pb-16 md:pb-24">
        <div className="rounded-3xl border border-border bg-gradient-card p-8 md:p-12 text-center shadow-elegant">
          <Share2 className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
            Arrête de retaper.<br />
            <span className="text-gradient">Commence à penser.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Rejoins la beta gratuite. Crée ton premier board en moins d'une minute.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex flex-col sm:flex-row gap-3 max-w-md"
          >
            <Input
              type="email"
              required
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              aria-label="Adresse email"
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 bg-gradient-primary shadow-glow hover:opacity-90 shrink-0 btn-shimmer"
            >
              Commencer gratuitement
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Aucun spam. Gratuit pendant la bêta.</p>
        </div>
      </motion.section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} scappio — Construit avec Lovable
      </footer>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-elegant">
        <Button asChild size="lg" className="w-full h-12 bg-gradient-primary shadow-glow hover:opacity-90 text-base btn-shimmer">
          <Link to="/auth">
            Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      </div>
    </div>
  );
};

export default Index;
