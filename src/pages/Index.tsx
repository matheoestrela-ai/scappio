import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, FormEvent } from "react";
import { Mic, ArrowRight, Loader2 } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "Mon idée de business sur la livraison locale...",
  "Les notes de ma réunion avec mon client ce matin...",
  "Mon plan de contenu pour les 30 prochains jours...",
  "J'ai une idée de startup mais je sais pas par où commencer...",
  "Le résumé de la conférence à laquelle j'ai assisté...",
];

const HEADLINE_LINE_1 = ["Transforme", "tes"];
const HEADLINE_LINE_3 = ["en", "board", "visuel", "en", "10", "secondes"];

const AVATAR_COLORS = [
  "from-orange-400 to-red-500",
  "from-amber-300 to-orange-500",
  "from-rose-400 to-orange-400",
  "from-yellow-300 to-orange-400",
];

const Index = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate example prompts every 3s
  useEffect(() => {
    const id = setInterval(() => {
      setExampleIdx((i) => (i + 1) % EXAMPLE_PROMPTS.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Scroll detection for navbar
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = prompt.trim();
    if (!value) {
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem("scappio_initial_prompt", value);
    } catch {}
    setTimeout(() => navigate("/auth"), 300);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0D0D0D] text-[#FAFAF0] font-[Inter,sans-serif]">
      {/* Animated radial background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 animate-bg-shift"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, #100800 0%, #0D0D0D 55%), radial-gradient(ellipse at 70% 80%, #1a0a00 0%, transparent 60%)",
        }}
      />

      {/* Floating particles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-[#F97316] opacity-[0.05] animate-float"
            style={{
              width: `${1 + Math.random() * 1.5}px`,
              height: `${1 + Math.random() * 1.5}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDuration: `${15 + Math.random() * 20}s`,
              animationDelay: `${Math.random() * 10}s`,
            }}
          />
        ))}
      </div>

      {/* NAVBAR */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 opacity-0 animate-nav-in ${
          scrolled
            ? "backdrop-blur-xl bg-[#0D0D0D]/70 border-b border-[#2A2A2A]"
            : "bg-transparent"
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <Link
            to="/"
            className="text-[16px] font-medium text-[#FAFAF0] tracking-tight"
          >
            Scappio
          </Link>
          <div className="flex items-center gap-3 md:gap-5">
            <Link
              to="/auth"
              className="hidden sm:inline-block text-sm text-[#6B7280] hover:text-[#FAFAF0] transition-colors story-underline"
            >
              Se connecter
            </Link>
            <Link
              to="/auth"
              className="rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-medium text-black hover:brightness-110 transition-all hover:-translate-y-px"
            >
              Commencer gratuitement
            </Link>
          </div>
        </nav>
      </header>

      {/* MAIN */}
      <main className="relative mx-auto flex min-h-[calc(100vh-72px)] max-w-5xl flex-col items-center justify-center px-4 py-8 text-center md:py-12">
        {/* Badge */}
        <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0.3s" }}>
          <span
            className="inline-flex items-center rounded-full border border-[#F97316]/40 bg-[#1A0A00] px-4 py-1.5 text-[12px] font-medium tracking-[1px] text-[#F97316]"
          >
            ✨ PROPULSÉ PAR L'IA VISION
          </span>
        </div>

        {/* Headline */}
        <h1
          className="mt-8 font-[\'Playfair_Display\',serif] font-semibold leading-[1.05] tracking-tight"
          style={{ wordSpacing: "0.05em" }}
        >
          {/* Line 1 */}
          <div className="text-[36px] md:text-[64px] text-[#FAFAF0]">
            {HEADLINE_LINE_1.map((w, i) => (
              <span
                key={`l1-${i}`}
                className="inline-block opacity-0 animate-word-rise mr-[0.25em]"
                style={{ animationDelay: `${0.5 + i * 0.08}s` }}
              >
                {w}
              </span>
            ))}
          </div>
          {/* Line 2 — handwritten "idées" */}
          <div className="my-1 md:my-2">
            <span
              className="inline-block opacity-0 animate-idees text-[#F97316]"
              style={{
                animationDelay: `${0.5 + HEADLINE_LINE_1.length * 0.08}s`,
                fontFamily: "'Caveat', cursive",
                fontSize: "clamp(42px, 9vw, 72px)",
                transform: "rotate(-2deg)",
                lineHeight: 1,
              }}
            >
              idées
            </span>
          </div>
          {/* Line 3 */}
          <div className="text-[36px] md:text-[64px] text-[#FAFAF0]">
            {HEADLINE_LINE_3.map((w, i) => (
              <span
                key={`l3-${i}`}
                className="inline-block opacity-0 animate-word-rise mr-[0.25em]"
                style={{
                  animationDelay: `${
                    0.5 + (HEADLINE_LINE_1.length + 1 + i) * 0.08
                  }s`,
                }}
              >
                {w}
              </span>
            ))}
          </div>
        </h1>

        {/* Subtitle */}
        <p
          className="mt-6 max-w-2xl text-[16px] md:text-[18px] font-normal text-[#6B7280] opacity-0 animate-fade-in"
          style={{ animationDelay: "1.6s" }}
        >
          Parle, prends une photo, ou colle tes notes. L'IA comprend et structure tout. Zéro effort.
        </p>

        {/* Chat bar */}
        <form
          onSubmit={handleSubmit}
          className="mt-10 w-full max-w-[680px] opacity-0 animate-bar-in px-0"
          style={{ animationDelay: "1.9s" }}
        >
          <div className="group relative flex h-16 items-center gap-2 rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] px-3 transition-all duration-200 focus-within:border-[#F97316] focus-within:shadow-[0_0_0_4px_rgba(249,115,22,0.18)]">
            <button
              type="button"
              aria-label="Entrée vocale"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#6B7280] hover:text-[#FAFAF0] hover:bg-white/5 transition-colors"
            >
              <Mic size={20} />
            </button>
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris ton idée, ton projet, ou colle tes notes..."
              className="h-full flex-1 bg-transparent text-[16px] text-[#FAFAF0] placeholder:text-[#4B5563] outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Envoyer"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F97316] text-white transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-70"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          </div>
        </form>

        {/* Rotating example prompts */}
        <div
          className="relative mt-4 h-5 w-full max-w-[680px] opacity-0 animate-fade-in"
          style={{ animationDelay: "2.1s" }}
        >
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <p
              key={i}
              className={`absolute inset-0 text-[13px] text-[#4B5563] transition-opacity duration-700 ${
                i === exampleIdx ? "opacity-100" : "opacity-0"
              }`}
            >
              {ex}
            </p>
          ))}
        </div>

        {/* Social proof */}
        <div
          className="mt-6 flex flex-col items-center gap-4 opacity-0 animate-fade-in"
          style={{ animationDelay: "2.3s" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {AVATAR_COLORS.map((c, i) => (
                <div
                  key={i}
                  className={`h-7 w-7 rounded-full border-2 border-[#0D0D0D] bg-gradient-to-br ${c}`}
                />
              ))}
            </div>
            <span className="text-[13px] text-[#6B7280]">
              +847 créateurs et entrepreneurs ont déjà rejoint
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-[#6B7280]">
            <span className="rounded-full border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1 transition-transform duration-150 hover:-translate-y-0.5">
              ✏️ Plus simple que Miro
            </span>
            <span className="text-[#2A2A2A]">•</span>
            <span className="rounded-full border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1 transition-transform duration-150 hover:-translate-y-0.5">
              ⚡ Plus rapide que tout
            </span>
            <span className="text-[#2A2A2A]">•</span>
            <span className="rounded-full border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1 transition-transform duration-150 hover:-translate-y-0.5">
              🧠 Propulsé par l'IA
            </span>
          </div>
        </div>
      </main>

      {/* Local styles for animations */}
      <style>{`
        @keyframes bg-shift {
          0%, 100% { background-position: 0% 0%, 100% 100%; }
          50% { background-position: 20% 10%, 80% 90%; }
        }
        .animate-bg-shift {
          background-size: 200% 200%, 200% 200%;
          animation: bg-shift 10s ease-in-out infinite;
        }
        @keyframes float {
          0% { transform: translate(0,0); }
          50% { transform: translate(30px, -40px); }
          100% { transform: translate(-20px, 20px); }
        }
        .animate-float { animation: float linear infinite; }
        @keyframes nav-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-nav-in { animation: nav-in 0.4s ease-out 0.2s forwards; }
        @keyframes word-rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          @keyframes word-rise {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        }
        .animate-word-rise { animation: word-rise 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes idees-in {
          0%   { opacity: 0; transform: rotate(-2deg) scale(0.85); filter: blur(4px); }
          100% { opacity: 1; transform: rotate(-2deg) scale(1); filter: blur(0); }
        }
        .animate-idees { animation: idees-in 0.6s ease-out forwards; }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.6s ease-in forwards; }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fade-up 0.4s ease-out forwards; }
        @keyframes bar-in {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-bar-in { animation: bar-in 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        .story-underline {
          position: relative;
        }
        .story-underline::after {
          content: '';
          position: absolute;
          left: 0; bottom: -2px;
          width: 100%; height: 1px;
          background: #FAFAF0;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 200ms ease;
        }
        .story-underline:hover::after { transform: scaleX(1); }
      `}</style>
    </div>
  );
};

export default Index;
