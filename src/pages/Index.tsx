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
  "Describe your idea, paste your notes...",
  "Summarize your last meeting...",
  "Say it aloud or take a photo...",
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
  const gridY = useTransform(scrollY, [0, 1000], [0, 80]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    toast.success("Signup confirmed — we'll keep you posted!");
    setEmail("");
  };

  const inViewProps = {
    initial: "hidden" as const,
    whileInView: "show" as const,
    viewport: { once: true, margin: "-100px" },
  };

  return (
    <div className="relative min-h-screen pb-24 md:pb-0 overflow-x-hidden" style={{ backgroundColor: "#faf7f4" }}>
      {/* FigJam-style fine grid background (static) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(232,224,216,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,224,216,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative z-10">
      {/* Nav */}
      <header className="container flex items-center justify-between py-5 md:py-6">
        <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)} aria-label="Home">
          <span className="text-xl md:text-2xl font-bold tracking-tight"><span className="text-primary">scapp</span>io</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-4">
          <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition">How it works</a>
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition">Features</a>
          <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition">Testimonials</a>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition">Sign in</Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground shadow-glow hover:opacity-90 btn-shimmer">
            <Link to="/auth">Get started free</Link>
          </Button>
        </nav>

        {/* Mobile/Tablet actions */}
        <div className="lg:hidden flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="h-10">
            <Link to="/auth">Sign in</Link>
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
        <div className="lg:hidden container pb-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-elegant flex flex-col gap-1 text-base">
            <a href="#how" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">How it works</a>
            <a href="#problem" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">The problem</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Features</a>
            <a href="#testimonials" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Testimonials</a>
            <Link to="/auth" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-muted transition">Sign in</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="container pt-8 md:pt-12 pb-12 md:pb-20 text-center">
        <motion.div initial="hidden" animate="show" variants={heroContainer}>
          <motion.h1 variants={fadeUp} className="mx-auto max-w-4xl text-[2rem] font-bold tracking-tight leading-[1.08] sm:text-5xl sm:leading-[1.05] md:text-7xl md:leading-[1.02]" style={{ color: "#1a1a1a" }}>
            <span className="block">
              Turn your{" "}
              <span className="relative inline-block">
                <span
                  className="inline-flex whitespace-nowrap align-baseline text-primary font-medium italic leading-none -rotate-[4deg] translate-y-[0.08em] text-[1.16em] sm:text-[1.14em] md:text-[1.18em]"
                  style={{ fontFamily: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Caveat', cursive" }}
                >
                  ideas
                </span>
              </span>
              {" "}into published videos.
            </span>
            <span className="block mt-1 sm:mt-1.5 md:mt-2">In <span style={{ color: "#e8732a", fontWeight: 900 }}>15 minutes</span>.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-5 md:mt-6 max-w-2xl text-base md:text-lg text-muted-foreground">
            You speak your idea, Scappio structures your board and handles the rest — you just need to film.
          </motion.p>

          {/* Chat-style prompt bar */}
          <motion.form
            variants={fadeUp}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const value = String(fd.get("prompt") || "").trim();
              if (!value) {
                toast.error("Write something to get started");
                return;
              }
              toast.success("Taking you to create your board!");
              window.location.href = "/auth";
            }}
            className="mx-auto mt-8 md:mt-10 flex w-full max-w-2xl items-center gap-1 sm:gap-2 rounded-2xl border border-border bg-card/80 backdrop-blur p-1.5 sm:p-2 shadow-elegant focus-within:ring-2 focus-within:ring-ring"
          >
            <PenLine className="ml-1 sm:ml-2 h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
            <button
              type="button"
              aria-label="Drag and drop a file"
              onClick={() => toast.info("Drop a file or image here")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition shrink-0"
            >
              <Upload className="h-5 w-5" />
            </button>
            <input
              name="prompt"
              type="text"
              placeholder={placeholder}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm sm:text-base placeholder:text-muted-foreground px-1 sm:px-2 py-2"
            />
            <button
              type="button"
              aria-label="Voice message"
              onClick={() => toast.info("Voice recording coming soon")}
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
                Get started free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#how">See how it works</a>
            </Button>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-5 text-center text-muted-foreground"
            style={{ fontSize: "14px" }}
          >
            Unlimited content. <span className="text-primary">Without</span> working more.
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
            Used by teams from
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
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">From idea to published video. Without switching tabs.</h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            No more wasted time.
          </p>
        </div>

        <div className="relative mt-10 md:mt-12">
          {(() => {
            const steps = [
              { num: "01", title: "Capture", desc: <>Voice, text, photo or PDF. Capture an idea in under 10 seconds, from your phone, without friction.</> },
              { num: "02", title: "AI Structure", desc: <>In 10 seconds, your idea becomes a structured board. The AI agent detects strong angles, fills the gaps and writes your script automatically.</> },
              { num: "03", title: "Record", desc: <>Hit record. Your script scrolls live, invisible in the video. You speak naturally, facing the camera, in front of your board. In <span style={{ color: "#f97316", fontWeight: 600 }}>TikTok</span> or YouTube format.</> },
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
      <motion.section {...inViewProps} variants={sectionFade} className="pt-16 md:pt-20 pb-0" style={{ backgroundColor: "#f97316" }}>
        <div className="container text-center">
          <div className="font-black text-white whitespace-nowrap" style={{ fontSize: "clamp(28px, 8.5vw, 96px)", fontWeight: 900, lineHeight: 1.05 }}>
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
            per video. That's 9× faster.
          </p>
          <p className="mt-6 max-w-2xl mx-auto text-white" style={{ fontSize: "18px", letterSpacing: "0.01em", opacity: 0.8 }}>
            At 5 videos a week: you get back{" "}
            <span className="relative inline-block whitespace-nowrap">
              10 hours
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
          className="pointer-events-none mt-8 md:mt-10 h-24 md:h-32 w-full"
          style={{
            background:
              "linear-gradient(to bottom, #f97316 0%, #fbb070 35%, #fde0c4 70%, #faf7f4 100%)",
          }}
        />
      </motion.section>

      {/* Problem — emojis instead of icon squares */}
      <motion.section {...inViewProps} variants={sectionFade} id="problem" className="container py-16 md:py-20">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            You lose 2h15 per video. <span className="text-primary">Every week.</span>
          </h2>
          <p className="mt-3 text-base text-muted-foreground" style={{ fontSize: "16px" }}>
            It's not a lack of ideas. It's a production problem.
          </p>
        </div>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-6 md:grid-cols-3">
          {[
            { emoji: "⏱️", title: "2h15 for 1 video", desc: "Miro to structure. Loom to film. CapCut to edit. 3 tools. 3 tabs. 3× the friction for every video you publish." },
            { emoji: "💨", title: "Ideas that vanish", desc: "Your best content is born in the shower or in the car. Between idea and recording, it disappears. Forever." },
            { emoji: "🧱", title: "The ceiling blocking your growth", desc: "You have ideas for 30 videos. You publish 4 a week. Meanwhile, other creators ship 2× more with half your ideas." },
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
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight">Everything you need to publish without limits.</h2>
        <p className="mt-3 text-center text-muted-foreground">What Miro, Loom and CapCut should have been, in one tool.</p>

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
            <h3 className="mt-4 text-lg font-semibold text-foreground">Recorder + teleprompter</h3>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Film in front of your board. Your script scrolls overlaid, invisible in the capture. Export TikTok, Reels or YouTube.
            </p>
          </motion.div>

          {/* Small card */}
          <motion.div
            variants={cardItem}
            className="card-lift rounded-2xl border border-border bg-card p-6 shadow-elegant"
          >
            <Sparkles className="card-icon" style={{ color: "#1a1a1a", width: 24, height: 24 }} />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Advanced Vision AI</h3>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">Detects words, arrows and hierarchy even on messy handwriting.</p>
          </motion.div>

          {/* Row 2: 3 equal cards */}
          {[
            { Icon: Mic, title: "Voice → Board", desc: "Speak freely for 30 seconds. AI transcribes, structures and generates your board. The most viral before/after on the market." },
            { Icon: Wand2, title: "AI Script", desc: "The agent turns your mindmap into a ready-to-read script. Natural, structured, in your own logic." },
            { Icon: Pencil, title: "Full editing", desc: "Edit, move, resize, change colors and shapes live." },
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
            { Icon: MousePointer2, title: "Intuitive drag & drop", desc: "Create links by dragging. Multi-select, undo/redo, shortcuts." },
            { Icon: Download, title: "Multi-format export", desc: "TikTok, Reels, YouTube. One board. Every platform. In 1 click." },
            { Icon: Zap, title: "Lightning fast", desc: "10 seconds from capture to a clean mindmap, ready to present." },
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
        <h2 className="text-center text-3xl md:text-4xl font-bold tracking-tight text-white">They stopped choosing between their ideas.</h2>
        <p className="mt-3 text-center text-white/70">Now they publish them all.</p>
        <motion.div {...inViewProps} variants={gridContainer} className="mt-10 md:mt-12 grid gap-6 md:grid-cols-2">
          {[
            { name: "Camille D.", role: "Product Manager, Paris", text: "I leave a workshop with 4 flipchart photos. Before, I spent an hour copying them into Miro. Now it's done before I get to the office." },
            { name: "Thomas R.", role: "Founder, Lyon", text: "I tried every mindmap tool. scappio is the only one that understands my terrible handwriting. Mind-blowing." },
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
            Stop choosing between your ideas.<br />
            <span className="text-primary">Publish them all.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Your first board in 10 seconds. Free. No credit card. No install.
          </p>
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex flex-col sm:flex-row gap-3 max-w-md"
          >
            <Input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              aria-label="Email address"
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 bg-primary text-primary-foreground shadow-glow hover:opacity-90 shrink-0 btn-shimmer"
            >
              Get started free
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">No spam. Free during beta.</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Join creators who publish without limits, without working more.
          </p>
        </div>
      </motion.section>

      {/* Enriched footer */}
      <footer className="border-t border-border" style={{ backgroundColor: "#f0ebe4" }}>
        <div className="container pt-10 md:pt-12 pb-4 md:pb-6 grid gap-8 md:grid-cols-3 items-start">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label="Home">
              <span className="text-xl font-bold tracking-tight"><span className="text-primary">scapp</span>io</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
              Unlimited content. Never run out of ideas.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm md:items-center">
            <a href="/privacy" className="text-muted-foreground hover:text-foreground transition">Privacy Policy</a>
            <a href="/terms" className="text-muted-foreground hover:text-foreground transition">Terms</a>
            <a href="mailto:hello@scappio.com" className="text-muted-foreground hover:text-foreground transition">Contact</a>
          </nav>
          <div className="text-sm text-muted-foreground md:text-right">
            © 2026 scappio · <a href="/privacy" className="hover:text-foreground transition">Privacy</a> · <a href="/terms" className="hover:text-foreground transition">Terms</a>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-elegant">
        <Button asChild size="lg" className="w-full h-12 bg-primary text-primary-foreground shadow-glow hover:opacity-90 text-base btn-shimmer">
          <Link to="/auth">
            Get started free <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      </div>
    </div>
  );
};

export default Index;
