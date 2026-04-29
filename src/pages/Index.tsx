import { Link } from "react-router-dom";
import { useState, useEffect, FormEvent } from "react";
import { motion, useReducedMotion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Mic,
  Camera,
  FileText,
  Wand2,
  Video,
  Send,
  Smartphone,
  Layout,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────────
   Brand palette (per design brief — purple)
   ───────────────────────────────────────────────────────────── */
const PURPLE = "#6d28d9";
const PURPLE_DARK = "#5b21b6";
const INDIGO = "#4f46e5";
const TEXT_BODY = "#374151";
const TEXT_HEADING = "#0f172a";
const BORDER_SOFT = "rgba(109, 40, 217, 0.1)";
const CARD_SHADOW = "0 4px 32px rgba(109, 40, 217, 0.08)";
const CARD_SHADOW_HOVER = "0 12px 48px rgba(109, 40, 217, 0.16)";

/* ─────────────────────────────────────────────────────────────
   Motion variants
   ───────────────────────────────────────────────────────────── */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};
const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const sectionFade: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
const gridContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const cardItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

/* ─────────────────────────────────────────────────────────────
   Reusable bits
   ───────────────────────────────────────────────────────────── */
const SectionTitle = ({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) => (
  <div className="flex flex-col items-center text-center">
    <h2
      className="font-bold tracking-tight"
      style={{
        color: light ? "#ffffff" : TEXT_HEADING,
        fontSize: "clamp(28px, 4.2vw, 42px)",
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
      }}
    >
      {children}
    </h2>
    <span
      aria-hidden
      className="mt-5 block rounded-full"
      style={{
        width: 48,
        height: 4,
        backgroundColor: light ? "#ffffff" : PURPLE,
        opacity: light ? 0.9 : 1,
      }}
    />
  </div>
);

const PrimaryButton = ({
  children,
  onClick,
  type = "button",
  className = "",
  asLink,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  asLink?: string;
}) => {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.99]";
  const style: React.CSSProperties = {
    backgroundColor: PURPLE,
    padding: "14px 36px",
    borderRadius: 12,
    fontSize: 16,
    boxShadow: "0 8px 24px rgba(109, 40, 217, 0.32)",
  };
  if (asLink) {
    return (
      <Link
        to={asLink}
        className={`${base} ${className}`}
        style={style}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PURPLE_DARK)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PURPLE)}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} ${className}`}
      style={style}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PURPLE_DARK)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PURPLE)}
    >
      {children}
    </button>
  );
};

const GhostButton = ({
  children,
  asLink,
  href,
}: {
  children: React.ReactNode;
  asLink?: string;
  href?: string;
}) => {
  const style: React.CSSProperties = {
    border: `2px solid ${PURPLE}`,
    color: PURPLE,
    padding: "12px 32px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 600,
    backgroundColor: "transparent",
    transition: "all 0.2s ease",
  };
  const cls = "inline-flex items-center justify-center gap-2 hover:bg-[#6d28d9]/5";
  if (href) return <a href={href} className={cls} style={style}>{children}</a>;
  if (asLink) return <Link to={asLink} className={cls} style={style}>{children}</Link>;
  return <button className={cls} style={style}>{children}</button>;
};

/* Card component with hover lift */
const Card = ({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className={`transition-all duration-[250ms] ease-out hover:-translate-y-1 ${className}`}
    style={{
      backgroundColor: "#ffffff",
      border: `1px solid ${BORDER_SOFT}`,
      borderRadius: 20,
      boxShadow: CARD_SHADOW,
      padding: 32,
      ...style,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = CARD_SHADOW_HOVER)}
    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = CARD_SHADOW)}
  >
    {children}
  </div>
);

const IconBox = ({ children }: { children: React.ReactNode }) => (
  <div
    className="flex items-center justify-center"
    style={{
      width: 52,
      height: 52,
      backgroundColor: "rgba(109, 40, 217, 0.1)",
      borderRadius: 14,
      color: PURPLE,
    }}
  >
    {children}
  </div>
);

const MockBlock = ({
  icon,
  label,
  height = 260,
}: {
  icon: React.ReactNode;
  label: string;
  height?: number;
}) => (
  <div
    className="flex flex-col items-center justify-center gap-3 text-white"
    style={{
      background: `linear-gradient(135deg, ${PURPLE} 0%, ${INDIGO} 100%)`,
      borderRadius: 16,
      height,
      width: "100%",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 12px 36px rgba(109,40,217,0.28)",
    }}
  >
    <div
      className="flex items-center justify-center"
      style={{
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.18)",
      }}
    >
      {icon}
    </div>
    <div style={{ fontWeight: 500, fontSize: 15, opacity: 0.95 }}>{label}</div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
const Index = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    viewport: { once: true, margin: "-80px" },
  };

  // Section padding (104 desktop / 64 mobile)
  const sectionPad = "py-16 md:py-[104px]";

  return (
    <div className="relative min-h-screen pb-24 md:pb-0" style={{ backgroundColor: "#ffffff", color: TEXT_BODY }}>
      {/* ─── Sticky nav ─── */}
      <header
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)",
          backdropFilter: "saturate(180%) blur(14px)",
          WebkitBackdropFilter: "saturate(180%) blur(14px)",
          borderBottom: scrolled ? `1px solid ${BORDER_SOFT}` : "1px solid transparent",
        }}
      >
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)} aria-label="Accueil">
            <span className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: TEXT_HEADING }}>
              <span style={{ color: PURPLE }}>scapp</span>io
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            <a href="#how" className="text-sm font-medium hover:opacity-70 transition" style={{ color: TEXT_BODY }}>Comment ça marche</a>
            <a href="#features" className="text-sm font-medium hover:opacity-70 transition" style={{ color: TEXT_BODY }}>Fonctionnalités</a>
            <a href="#stats" className="text-sm font-medium hover:opacity-70 transition" style={{ color: TEXT_BODY }}>Gain de temps</a>
            <Link to="/auth" className="text-sm font-medium hover:opacity-70 transition" style={{ color: TEXT_BODY }}>Connexion</Link>
            <PrimaryButton asLink="/auth" className="!py-2.5 !px-5 !text-sm">
              Essayer gratuitement
            </PrimaryButton>
          </nav>

          <div className="md:hidden flex items-center gap-2">
            <PrimaryButton asLink="/auth" className="!py-2 !px-4 !text-sm">Essayer</PrimaryButton>
            <button
              aria-label="Menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ border: `1px solid ${BORDER_SOFT}`, backgroundColor: "#fff" }}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden container pb-4">
            <div className="rounded-2xl p-3 flex flex-col gap-1 text-base" style={{ border: `1px solid ${BORDER_SOFT}`, backgroundColor: "#fff", boxShadow: CARD_SHADOW }}>
              <a href="#how" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-[#faf8ff] transition">Comment ça marche</a>
              <a href="#features" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-[#faf8ff] transition">Fonctionnalités</a>
              <a href="#stats" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-[#faf8ff] transition">Gain de temps</a>
              <Link to="/auth" onClick={() => setMenuOpen(false)} className="px-3 py-3 rounded-lg hover:bg-[#faf8ff] transition">Connexion</Link>
            </div>
          </div>
        )}
      </header>

      {/* ─── HERO ─── */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(109,40,217,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(109,40,217,0.07) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 50% -10%, rgba(109,40,217,0.18), transparent 60%)",
          }}
        />
        <div className="container relative pt-16 md:pt-28 pb-16 md:pb-[104px] text-center">
          <motion.div initial="hidden" animate="show" variants={heroContainer}>
            <motion.h1
              variants={fadeUp}
              className="mx-auto max-w-4xl"
              style={{
                fontSize: "clamp(36px, 6vw, 58px)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                color: TEXT_HEADING,
              }}
            >
              Crée du contenu illimité.
              <br />
              <span style={{ color: PURPLE }}>Sans jamais manquer d'idées.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-2xl"
              style={{ fontSize: 18, lineHeight: 1.7, color: TEXT_BODY }}
            >
              Capture une idée en 10 secondes, transforme-la en vidéo prête à publier en 12 minutes.
              Scappio remplace Miro, Loom, CapCut — et ton blocage créatif.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <PrimaryButton asLink="/auth">
                Essayer gratuitement <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
              <GhostButton href="#how">Voir comment ça marche</GhostButton>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-4 text-sm" style={{ color: "#6b7280" }}>
              Pas de carte bancaire requise
            </motion.p>

            {/* Hero visual mock */}
            <motion.div variants={fadeUp} className="mx-auto mt-14 md:mt-16 max-w-3xl">
              <MockBlock
                icon={<Layout className="h-8 w-8 text-white" />}
                label="Aperçu de l'app Scappio"
                height={320}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── PAIN POINTS (immediately after hero) ─── */}
      <motion.section
        {...inViewProps}
        variants={sectionFade}
        id="pain"
        className={sectionPad}
        style={{ backgroundColor: "#faf8ff" }}
      >
        <div className="container">
          <SectionTitle>Tu perds 2h15 pour chaque vidéo. Et ça se voit.</SectionTitle>
          <motion.div {...inViewProps} variants={gridContainer} className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: "🪟",
                text: "Tu ouvres 4 outils différents avant de filmer la moindre seconde.",
              },
              {
                icon: "💨",
                text: "Tes meilleures idées disparaissent avant que tu les structures.",
              },
              {
                icon: "🧱",
                text: "Tu reportes la création parce que le setup te coûte plus d'énergie que le contenu lui-même.",
              },
            ].map((p, i) => (
              <motion.div key={i} variants={cardItem}>
                <Card>
                  <div style={{ fontSize: 32, lineHeight: 1 }}>{p.icon}</div>
                  <p
                    className="mt-4"
                    style={{ fontSize: 17, lineHeight: 1.7, color: TEXT_BODY, fontWeight: 500 }}
                  >
                    {p.text}
                  </p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ─── HOW IT WORKS ─── */}
      <motion.section
        {...inViewProps}
        variants={sectionFade}
        id="how"
        className={sectionPad}
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="container">
          <SectionTitle>De l'idée brute à la vidéo publiée. En 12 minutes.</SectionTitle>

          <div className="relative mt-16">
            {/* Dashed connector (desktop) */}
            <div
              aria-hidden
              className="hidden md:block absolute left-0 right-0"
              style={{
                top: 56,
                height: 1,
                borderTop: `2px dashed ${BORDER_SOFT}`,
                marginLeft: "12.5%",
                marginRight: "12.5%",
              }}
            />
            <motion.div
              {...inViewProps}
              variants={gridContainer}
              className="grid gap-8 md:gap-6 md:grid-cols-4 relative"
            >
              {[
                {
                  num: "01",
                  title: "Capture tout",
                  desc: "Photo, vocal, texte, PDF. Capture n'importe quelle idée en moins de 10 secondes, peu importe où tu es.",
                  icon: <Camera className="h-6 w-6" />,
                },
                {
                  num: "02",
                  title: "Structure avec l'IA",
                  desc: "Scappio transforme tes notes brutes en plan structuré, script optimisé et board visuel prêt à l'emploi.",
                  icon: <Wand2 className="h-6 w-6" />,
                },
                {
                  num: "03",
                  title: "Enregistre sans stress",
                  desc: "Enregistreur d'écran intégré + téléprompter. Tu lis, tu parles, tu filmes. Zéro montage préalable.",
                  icon: <Video className="h-6 w-6" />,
                },
                {
                  num: "04",
                  title: "Publie en avance",
                  desc: "Exporte, planifie, répète. 5 vidéos par semaine sans sacrifier ni ta créativité ni ton temps.",
                  icon: <Send className="h-6 w-6" />,
                },
              ].map((step, i) => (
                <motion.div key={i} variants={cardItem} className="relative">
                  <div
                    className="relative h-full"
                    style={{
                      backgroundColor: "#ffffff",
                      border: `1px solid ${BORDER_SOFT}`,
                      borderRadius: 20,
                      padding: 28,
                      boxShadow: CARD_SHADOW,
                      overflow: "hidden",
                    }}
                  >
                    <span
                      aria-hidden
                      className="absolute select-none font-extrabold leading-none"
                      style={{
                        top: 12,
                        right: 18,
                        fontSize: 64,
                        color: PURPLE,
                        opacity: 0.12,
                        letterSpacing: "-0.04em",
                      }}
                    >
                      {step.num}
                    </span>
                    <IconBox>{step.icon}</IconBox>
                    <h3
                      className="mt-5"
                      style={{ fontSize: 22, fontWeight: 600, color: TEXT_HEADING, lineHeight: 1.3 }}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.7, color: TEXT_BODY }}>
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* ─── FEATURES ─── */}
      <motion.section
        {...inViewProps}
        variants={sectionFade}
        id="features"
        className={sectionPad}
        style={{ backgroundColor: "#f9fafb" }}
      >
        <div className="container">
          <SectionTitle>Tout ce dont tu as besoin. Dans un seul outil.</SectionTitle>

          <motion.div
            {...inViewProps}
            variants={gridContainer}
            className="mt-14 grid gap-6 md:grid-cols-2"
          >
            {[
              {
                icon: <Camera className="h-6 w-6" />,
                title: "Capture universelle",
                desc: "Photo, vocal, texte, PDF. Chaque idée capturée instantanément, organisée automatiquement.",
              },
              {
                icon: <Sparkles className="h-6 w-6" />,
                title: "Board + Script IA",
                desc: "Tes notes deviennent un board visuel structuré et un script prêt à lire. L'IA fait le travail ingrat.",
              },
              {
                icon: <Video className="h-6 w-6" />,
                title: "Enregistreur + Téléprompter",
                desc: "La seule app qui combine enregistrement d'écran et téléprompter. Aucun concurrent ne propose ça.",
              },
              {
                icon: <Smartphone className="h-6 w-6" />,
                title: "Mobile-first",
                desc: "Conçu pour filmer depuis ton téléphone. Pas de setup, pas d'ordinateur obligatoire.",
              },
            ].map((f, i) => (
              <motion.div key={i} variants={cardItem}>
                <Card>
                  <IconBox>{f.icon}</IconBox>
                  <h3
                    className="mt-5"
                    style={{ fontSize: 22, fontWeight: 600, color: TEXT_HEADING, lineHeight: 1.3 }}
                  >
                    {f.title}
                  </h3>
                  <p className="mt-3" style={{ fontSize: 16, lineHeight: 1.75, color: TEXT_BODY }}>
                    {f.desc}
                  </p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ─── STATS / BENEFITS (dark) ─── */}
      <motion.section
        {...inViewProps}
        variants={sectionFade}
        id="stats"
        className={sectionPad}
        style={{ backgroundColor: "#120a2a", color: "#ffffff" }}
      >
        <div className="container">
          <SectionTitle light>9× plus rapide. Vraiment.</SectionTitle>

          <motion.div
            {...inViewProps}
            variants={gridContainer}
            className="mt-14 grid gap-6 md:grid-cols-3"
          >
            {[
              { value: "12 min", label: "pour créer une vidéo complète avec Scappio" },
              { value: "2h15", label: "ce que ça prend sans Scappio (Miro + script + Loom + CapCut)" },
              { value: "10h", label: "économisées par semaine à 5 vidéos" },
            ].map((s, i) => (
              <motion.div
                key={i}
                variants={cardItem}
                className="text-center"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  padding: 32,
                }}
              >
                <div
                  style={{
                    fontSize: "clamp(48px, 6vw, 64px)",
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    background: `linear-gradient(135deg, #c4b5fd 0%, #ffffff 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </div>
                <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>
                  {s.label}
                </p>
              </motion.div>
            ))}
          </motion.div>

          <p
            className="mt-10 text-center mx-auto max-w-2xl"
            style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}
          >
            Ce ne sont pas des estimations. C'est le calcul réel, outil par outil.
          </p>
        </div>
      </motion.section>

      {/* ─── FINAL CTA ─── */}
      <motion.section
        {...inViewProps}
        variants={sectionFade}
        className={`relative overflow-hidden ${sectionPad}`}
        style={{
          background: `linear-gradient(135deg, ${PURPLE} 0%, ${INDIGO} 100%)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 300px at 50% 50%, rgba(255,255,255,0.18), transparent 70%)",
          }}
        />
        <div className="container relative">
          <div className="mx-auto text-center" style={{ maxWidth: 640 }}>
            <h2
              style={{
                fontSize: "clamp(28px, 4.2vw, 42px)",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                color: "#ffffff",
              }}
            >
              Arrête de reporter. Commence à créer.
            </h2>
            <p
              className="mx-auto mt-5"
              style={{
                fontSize: 18,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.85)",
                maxWidth: 560,
              }}
            >
              Rejoint les créateurs qui produisent 5× plus de contenu sans travailler 5× plus.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-9 flex flex-col sm:flex-row gap-3"
              style={{ maxWidth: 480 }}
            >
              <Input
                type="email"
                required
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[52px] text-base bg-white border-0"
                aria-label="Adresse email"
                style={{ borderRadius: 12 }}
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.99] shrink-0"
                style={{
                  backgroundColor: "#ffffff",
                  color: PURPLE,
                  padding: "14px 28px",
                  borderRadius: 12,
                  fontSize: 16,
                  height: 52,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                }}
              >
                Créer mon compte gratuit <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-5" style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
              Accès immédiat · Aucune carte requise
            </p>
          </div>
        </div>
      </motion.section>

      {/* ─── FOOTER ─── */}
      <footer style={{ backgroundColor: "#0b0618", color: "rgba(255,255,255,0.7)" }}>
        <div className="container py-12 grid gap-8 md:grid-cols-3 items-start">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label="Accueil">
              <span className="text-xl font-extrabold tracking-tight" style={{ color: "#fff" }}>
                <span style={{ color: "#a78bfa" }}>scapp</span>io
              </span>
            </Link>
            <p className="mt-3 text-sm max-w-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              Du contenu illimité. Sans jamais manquer d'idées.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm md:items-center">
            <a href="/privacy" className="hover:text-white transition" style={{ color: "rgba(255,255,255,0.7)" }}>Politique de confidentialité</a>
            <a href="/terms" className="hover:text-white transition" style={{ color: "rgba(255,255,255,0.7)" }}>CGU</a>
            <a href="mailto:hello@scappio.com" className="hover:text-white transition" style={{ color: "rgba(255,255,255,0.7)" }}>Contact</a>
          </nav>
          <div className="text-sm md:text-right" style={{ color: "rgba(255,255,255,0.5)" }}>
            © 2026 scappio
            <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Propulsé par GPT-Vision
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-40 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: `1px solid ${BORDER_SOFT}`,
          boxShadow: "0 -8px 24px rgba(109,40,217,0.08)",
        }}
      >
        <PrimaryButton asLink="/auth" className="!w-full !flex">
          Essayer gratuitement <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );
};

export default Index;
