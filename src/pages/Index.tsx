import { Link } from "react-router-dom";
import { useState, useEffect, FormEvent } from "react";
import { motion, useScroll, useTransform, useReducedMotion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Mic,
  Image as ImageIcon,
  PenLine,
  Quote,
  Lightbulb,
  Wand2,
  Pencil,
  MousePointer2,
  Download,
  Zap,
  Upload,
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
    let typing = false;
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

// Brand SVG logos for social proof — neutral grey
const BRAND_LOGOS: { name: string; svg: JSX.Element }[] = [
  {
    name: "Notion",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747L1.309 21.43c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.42-1.632z"/>
      </svg>
    ),
  },
  {
    name: "Figma",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.015-4.49-4.491s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.491 4.49-4.491h4.588v4.441c0 2.503-2.039 4.54-4.563 4.54zm-.024-7.51c-1.652 0-2.995 1.355-3.019 3.005-.012 1.677 1.342 3.043 3.019 3.043 1.714 0 3.105-1.378 3.105-3.068v-2.98H8.148zm7.704 0h-.098c-2.476 0-4.49-2.015-4.49-4.49s2.014-4.491 4.49-4.491h.098c2.476 0 4.49 2.015 4.49 4.491s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z"/>
      </svg>
    ),
  },
  {
    name: "Linear",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M.403 13.795a11.945 11.945 0 0 0 9.802 9.802L.402 13.795zM.008 8.838 15.16 23.992c.83-.156 1.633-.395 2.394-.71L.718 6.444a11.94 11.94 0 0 0-.71 2.394zm2.273-5.336L20.49 21.71a12.067 12.067 0 0 0 1.86-1.595L3.876 1.642a12.106 12.106 0 0 0-1.595 1.86zM6.86.488A11.945 11.945 0 0 1 23.512 17.14L6.86.488z"/>
      </svg>
    ),
  },
  {
    name: "Slack",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.522H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.522h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.522 2.527 2.527 0 0 1-2.52-2.522V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
      </svg>
    ),
  },
  {
    name: "Trello",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21.147 0H2.853A2.86 2.86 0 0 0 0 2.853v18.294A2.86 2.86 0 0 0 2.853 24h18.294A2.86 2.86 0 0 0 24 21.147V2.853A2.86 2.86 0 0 0 21.147 0zM10.34 18.13a.953.953 0 0 1-.953.953h-4.21a.954.954 0 0 1-.954-.953V5.43a.954.954 0 0 1 .954-.953h4.21a.954.954 0 0 1 .953.953zm9.431-5.962a.953.953 0 0 1-.953.954h-4.21a.954.954 0 0 1-.953-.954V5.43a.953.953 0 0 1 .953-.953h4.21a.953.953 0 0 1 .953.953z"/>
      </svg>
    ),
  },
  {
    name: "Asana",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.78 12.653c-2.882 0-5.22 2.336-5.22 5.22 0 2.882 2.338 5.22 5.22 5.22 2.884 0 5.22-2.338 5.22-5.22 0-2.884-2.336-5.22-5.22-5.22zm-13.56.001C2.337 12.654 0 14.991 0 17.874c.001 2.882 2.338 5.22 5.22 5.22 2.884 0 5.22-2.338 5.22-5.22 0-2.883-2.336-5.22-5.22-5.22zM17.22 6.126c0 2.883-2.337 5.22-5.22 5.22-2.883 0-5.22-2.337-5.22-5.22S9.117.906 12 .906c2.883 0 5.22 2.337 5.22 5.22z"/>
      </svg>
    ),
  },
  {
    name: "Whimsical",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="12" r="3.5" />
        <circle cx="18" cy="12" r="3.5" />
        <circle cx="12" cy="6" r="3.5" />
        <circle cx="12" cy="18" r="3.5" />
      </svg>
    ),
  },
  {
    name: "FigJam",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h10V8H7zm0 4v2h7v-2H7z"/>
      </svg>
    ),
  },
];

const Index = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const reducedMotion = useReducedMotion() ?? false;
  const placeholder = useTypewriter(reducedMotion);

  const { scrollY } = useScroll();
  const gridY = useTransform(scrollY, [0, 1000], [0, 200]);

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
    <div className="relative min-h-screen pb-24 md:pb-0" style={{ backgroundColor: "#faf7f4" }}>
      {/* FigJam-style fine grid background (parallax) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          y: reducedMotion ? 0 : gridY,
          backgroundImage:
            "linear-gradient(to right, rgba(232,224,216,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,224,216,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
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
          <Button asChild size="sm" className="bg-primary text-primary-foreground shadow-glow hover:opacity-90 btn-shimmer">
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
      <section className="container pt-8 md:pt-12 pb-12 md:pb-20 text-center">
        <motion.div initial="hidden" animate="show" variants={heroContainer}>
          <motion.h1 variants={fadeUp} className="mx-auto max-w-4xl text-[2rem] font-bold tracking-tight leading-[1.08] sm:text-5xl sm:leading-[1.05] md:text-7xl md:leading-[1.02]" style={{ color: "#1a1a1a" }}>
            <span className="block">
              Transforme tes{" "}
              <span className="relative inline-block">
                <span
                  className="inline-flex whitespace-nowrap align-baseline text-primary font-medium italic leading-none -rotate-[4deg] translate-y-[0.08em] text-[1.16em] sm:text-[1.14em] md:text-[1.18em]"
                  style={{ fontFamily: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Caveat', cursive" }}
                >
                  idées
                </span>
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
              {" "}en vidéos publiées.
            </span>
            <span className="block mt-1 sm:mt-1.5 md:mt-2">En <span style={{ color: "#e8732a", fontWeight: 900 }}>15 minutes</span>.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 md:mt-6 max-w-2xl text-base md:text-lg text-muted-foreground">
            Tu parles de ton idée, Scappio structure ton board et s'occupe du reste, tu n'as plus qu'à filmer.
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
            <button
              type="button"
              aria-label="Glisser-déposer un fichier"
              onClick={() => toast.info("Glisse un fichier ou une image ici")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition shrink-0"
            >
              <Upload className="h-5 w-5" />
            </button>
            <input
              name="prompt"
              type="text"
              placeholder={placeholder}
              className="flex-1 bg-transparent border-0 outline-none text-base placeholder:text-muted-foreground px-2 py-2"
            />
            <button
              type="button"
              aria-label="Message vocal"
              onClick={() => toast.info("Enregistrement vocal bientôt disponible")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition shrink-0"
            >
              <Mic className="h-5 w-5" />
            </button>
            <Button type="submit" size="sm" className="bg-primary text-primary-foreground shadow-glow hover:opacity-90">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.form>

          <motion.div variants={fadeUp} className="mt-5 md:mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground shadow-glow hover:opacity-90 btn-shimmer">
              <Link to="/auth">
                Commencer gratuitement <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#how">Voir comment ça marche</a>
            </Button>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-5 text-center text-muted-foreground"
            style={{ fontSize: "14px" }}
          >
            Du contenu illimité. <span className="text-primary">Sans</span> travailler plus.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mx-auto mt-8 md:mt-10 w-full"
            style={{ maxWidth: "900px" }}
          >
            <div
              className="relative w-full overflow-hidden bg-black"
              style={{
                aspectRatio: "16 / 9",
                borderRadius: "16px",
                boxShadow: "0 24px 80px rgba(0,0,0,0.2), 0 0 60px rgba(249,115,22,0.15)",
              }}
            >
              {/* Subtle gradient backdrop */}
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />

              {/* Center play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 shadow-2xl md:h-24 md:w-24">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="ml-1 h-8 w-8 text-black md:h-10 md:w-10"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Bottom controls bar */}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 md:px-6 md:py-4">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white md:h-5 md:w-5">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                  <div className="h-full w-[35%] rounded-full bg-white" />
                </div>
                <span className="text-[11px] font-medium text-white tabular-nums md:text-xs">0:42 / 2:00</span>
              </div>
            </div>
          </motion.div>

        </motion.div>

      </section>


      {/* Social proof — real SVG logos in neutral grey */}
      <motion.section {...inViewProps} variants={sectionFade} className="container py-10">
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
            <div className="flex w-max animate-marquee gap-12 whitespace-nowrap" style={{ color: "#aaa" }}>
              {Array.from({ length: 2 }).map((_, dup) => (
                <div key={dup} className="flex items-center gap-12 pr-12" aria-hidden={dup === 1}>
                  {BRAND_LOGOS.map(({ name, svg }) => (
                    <span key={`${dup}-${name}`} className="inline-flex items-center" title={name}>
                      <span className="h-6 w-auto inline-flex items-center [&_svg]:h-6 [&_svg]:w-auto">
                        {svg}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* How it works — dark section */}
      <motion.section {...inViewProps} variants={sectionFade} id="how" className="py-16 md:py-20" style={{ backgroundColor: "#1c1917" }}>
        <div className="container">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">De l'idée à la vidéo publiée. Sans changer d'onglet.</h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            Fini la perte de temps.
          </p>
        </div>

        <div className="relative mt-10 md:mt-12">
          {(() => {
            const steps = [
              { num: "01", title: "Capture", desc: <>Vocal, texte, photo ou PDF. Tu captures une idée en moins de 10 secondes, depuis ton téléphone, sans friction.</> },
              { num: "02", title: "Structure IA", desc: <>En 10 secondes, ton idée devient un board structuré. L'agent IA détecte les angles forts, complète les manques et écrit ton script automatiquement.</> },
              { num: "03", title: "Enregistre", desc: <>Lance l'enregistrement. Ton script défile en direct, invisible dans la vidéo. Tu parles naturellement, face caméra, devant ton board. Sous format <span style={{ color: "#f97316", fontWeight: 600 }}>TikTok</span> ou YouTube.</> },
            ];
            return (
              <motion.div
                {...inViewProps}
                variants={gridContainer}
                className="grid gap-10 md:gap-10 md:grid-cols-3"
              >
                {steps.map((step, i) => (
                  <motion.div
                    key={i}
                    variants={cardItem}
                    className="text-center md:text-left"
                  >
                    <div
                      className="font-bold leading-none select-none"
                      style={{ color: "#f97316", fontSize: "48px" }}
                    >
                      {step.num}
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm md:text-base text-white/70">
                      {step.desc}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            );
          })()}
        </div>
        </div>
      </motion.section>

      {/* Stats — orange section */}
      <motion.section {...inViewProps} variants={sectionFade} className="py-16 md:py-20" style={{ backgroundColor: "#f97316" }}>
        <div className="container text-center">
          <div className="font-black text-white whitespace-nowrap" style={{ fontSize: "clamp(32px, 9vw, 96px)", fontWeight: 900, lineHeight: 1.05 }}>
            2h15 <span className="text-white mx-1 sm:mx-3">→</span>
            <span
              style={{
                fontFamily: "'Caveat', 'Bradley Hand', 'Segoe Print', cursive",
                fontStyle: "italic",
                fontWeight: 700,
                letterSpacing: "0.01em",
                fontSize: "1.4em",
                lineHeight: 0.9,
                display: "inline-block",
                verticalAlign: "middle",
              }}
            >
              12 min
            </span>
          </div>
          <p className="mt-4 text-white" style={{ fontSize: "20px", opacity: 0.8 }}>
            par vidéo. Soit 9 fois plus rapide.
          </p>
          <p className="mt-6 max-w-2xl mx-auto text-white" style={{ fontSize: "18px", letterSpacing: "0.01em", opacity: 0.8 }}>
            À 5 vidéos par semaine : tu récupères{" "}
            <span className="relative inline-block whitespace-nowrap">
              10 heures
              <motion.svg
                aria-hidden
                viewBox="0 0 200 14"
                preserveAspectRatio="none"
                className="absolute left-0 right-0 w-full h-3 pointer-events-none"
                style={{ bottom: "-10px" }}
              >
                <motion.path
                  d="M2 8 C 50 2, 150 2, 198 8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                />
              </motion.svg>
            </span>
            .
          </p>
        </div>
        {/* Smooth gradient transition to cream background */}
        <div
          aria-hidden
          className="pointer-events-none mt-12 md:mt-16 h-24 md:h-32 w-full"
          style={{ background: "linear-gradient(to bottom, #f97316 0%, #faf7f4 100%)" }}
        />
      </motion.section>

      {/* Problem — emojis instead of icon squares */}
      <motion.section {...inViewProps} variants={sectionFade} id="problem" className="container py-16 md:py-20">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Tu perds 2h15 par vidéo. <span className="text-primary">Toutes les semaines.</span>
          </h2>
          <p className="mt-3 text-base text-muted-foreground" style={{ fontSize: "16px" }}>
            Ce n'est pas un manque d'idées. C'est un problème de production.
          </p>
        </div>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-6 md:grid-cols-3">
          {[
            { emoji: "⏱️", title: "2h15 pour 1 vidéo", desc: "Miro pour structurer. Loom pour filmer. CapCut pour monter. 3 outils. 3 onglets. 3 fois plus de friction pour chaque vidéo que tu publies." },
            { emoji: "💨", title: "Des idées qui s'évaporent", desc: "Ton meilleur contenu naît sous la douche ou en voiture. Entre l'idée et l'enregistrement, il disparaît. Pour toujours." },
            { emoji: "🧱", title: "Le plafond qui bloque ta croissance", desc: "Tu as des idées pour 30 vidéos. Tu en publies 4 par semaine. Pendant ce temps, d'autres créateurs publient 2× plus avec la moitié de tes idées." },
          ].map((f, i) => (
            <motion.div
              key={i}
              variants={cardItem}
              className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant"
            >
              <div className="card-icon leading-none" style={{ fontSize: "32px" }}>{f.emoji}</div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Features — bento asymmetric grid, dark grey icons */}
      <motion.section {...inViewProps} variants={sectionFade} id="features" className="container py-16 md:py-20">
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight">Tout ce qu'il te faut pour publier sans limite.</h2>
        <p className="mt-3 text-center text-muted-foreground">Ce que Miro, Loom et CapCut auraient dû être en un seul.</p>

        <motion.div
          {...inViewProps}
          variants={gridContainer}
          className="mt-10 md:mt-12 grid gap-5 grid-cols-1 md:grid-cols-3"
        >
          {/* Featured card — Enregistreur + téléprompter (now a normal card) */}
          <motion.div
            variants={cardItem}
            className="card-lift relative rounded-2xl border border-border bg-card p-6 shadow-elegant"
          >
            <span
              className="absolute top-4 right-4 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
              style={{ backgroundColor: "#fff3eb", color: "#9a3a08" }}
            >
              UNIQUE
            </span>
            <Mic className="card-icon" style={{ color: "#1a1a1a", width: 24, height: 24 }} />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Enregistreur + téléprompter</h3>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Filme devant ton board. Ton script défile en surimpression, invisible dans la capture. Export TikTok, Reels ou YouTube.
            </p>
          </motion.div>

          {/* Small card */}
          <motion.div
            variants={cardItem}
            className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant"
          >
            <Sparkles className="card-icon" style={{ color: "#1a1a1a", width: 24, height: 24 }} />
            <h3 className="mt-4 text-lg font-semibold text-foreground">IA Vision avancée</h3>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">Détecte mots, flèches et hiérarchie même sur une écriture brouillonne.</p>
          </motion.div>

          {/* Row 2: 3 equal cards */}
          {[
            { Icon: Mic, title: "Vocal → Board", desc: "Parle librement 30 secondes. L'IA transcrit, hiérarchise et génère ton board. Le before/after le plus viral du marché." },
            { Icon: Wand2, title: "Script IA", desc: "L'agent transforme ta mindmap en script prêt à lire. Naturel, structuré, dans ta logique." },
            { Icon: Pencil, title: "Édition complète", desc: "Édite, déplace, redimensionne, change couleurs et formes en direct." },
          ].map(({ Icon, title, desc }, i) => (
            <motion.div
              key={i}
              variants={cardItem}
              className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant"
            >
              <Icon className="card-icon" style={{ color: "#1a1a1a", width: 24, height: 24 }} />
              <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{desc}</p>
            </motion.div>
          ))}

          {/* Row 3: remaining cards */}
          {[
            { Icon: MousePointer2, title: "Drag & drop intuitif", desc: "Crée des liens en glissant. Multi-sélection, undo/redo, raccourcis." },
            { Icon: Download, title: "Export multi-format", desc: "TikTok, Reels, YouTube. Un board. Toutes les plateformes. En 1 clic." },
            { Icon: Zap, title: "Rapide comme l'éclair", desc: "10 secondes entre la capture et un mindmap propre, prêt à présenter." },
          ].map(({ Icon, title, desc }, i) => (
            <motion.div
              key={`r3-${i}`}
              variants={cardItem}
              className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant"
            >
              <Icon className="card-icon" style={{ color: "#1a1a1a", width: 24, height: 24 }} />
              <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Testimonials — dark section */}
      <motion.section {...inViewProps} variants={sectionFade} id="testimonials" className="py-16 md:py-20" style={{ backgroundColor: "#1c1917" }}>
        <div className="container">
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight text-white">Ils ont arrêté de choisir entre leurs idées.</h2>
        <p className="mt-3 text-center text-white/70">Maintenant ils les publient toutes.</p>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-6 md:grid-cols-2">
          {[
            { name: "Camille D.", role: "Product Manager, Paris", text: "Je sors d'atelier avec 4 photos de paperboard. Avant je passais 1h à recopier dans Miro. Maintenant c'est fait avant que j'arrive au bureau." },
            { name: "Thomas R.", role: "Fondateur, Lyon", text: "J'ai testé tous les outils de mindmap. scappio c'est le seul qui comprend mon écriture pourrie. Bluffant." },
          ].map((t, i) => (
            <motion.div
              key={i}
              variants={cardItem}
              className="flex flex-col"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "16px",
                padding: "32px",
              }}
            >
              <div style={{ color: "#f97316", letterSpacing: "2px", fontSize: "18px" }}>★★★★★</div>
              <Quote className="mt-4 h-6 w-6" style={{ color: "#f97316" }} />
              <p className="mt-3 text-base text-white/90 flex-1">"{t.text}"</p>
              <div className="mt-6 flex items-center gap-3">
                <div
                  className="flex items-center justify-center text-sm font-semibold text-white"
                  style={{ height: 40, width: 40, borderRadius: "50%", backgroundColor: "#f97316" }}
                >
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-white/60">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        </div>
      </motion.section>

      {/* Final CTA */}
      <motion.section {...inViewProps} variants={sectionFade} className="container py-16 md:py-20">
        <div className="rounded-3xl border border-border bg-gradient-card p-8 md:p-12 text-center shadow-elegant">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Arrête de choisir entre tes idées.<br />
            <span className="text-primary">Publie-les toutes.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Ton premier board en 10 secondes. Gratuit. Sans carte bancaire. Sans installation.
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
              className="h-12 bg-primary text-primary-foreground shadow-glow hover:opacity-90 shrink-0 btn-shimmer"
            >
              Commencer gratuitement
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Aucun spam. Gratuit pendant la bêta.</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Rejoins les créateurs qui publient sans limite, sans travailler plus.
          </p>
        </div>
      </motion.section>

      {/* Enriched footer */}
      <footer className="border-t border-border" style={{ backgroundColor: "#f0ebe4" }}>
        <div className="container py-10 md:py-12 grid gap-8 md:grid-cols-3 items-start">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label="Accueil">
              <span className="text-xl font-bold tracking-tight"><span className="text-primary">scapp</span>io</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
              Du contenu illimité. Sans jamais manquer d'idées.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm md:items-center">
            <a href="/privacy" className="text-muted-foreground hover:text-foreground transition">Politique de confidentialité</a>
            <a href="/terms" className="text-muted-foreground hover:text-foreground transition">CGU</a>
            <a href="mailto:hello@scappio.com" className="text-muted-foreground hover:text-foreground transition">Contact</a>
          </nav>
          <div className="text-sm text-muted-foreground md:text-right">
            © 2026 scappio · <a href="/privacy" className="hover:text-foreground transition">Confidentialité</a> · <a href="/terms" className="hover:text-foreground transition">CGU</a>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-elegant">
        <Button asChild size="lg" className="w-full h-12 bg-primary text-primary-foreground shadow-glow hover:opacity-90 text-base btn-shimmer">
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
