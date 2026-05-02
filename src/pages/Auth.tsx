import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";

type Mode = "signin" | "signup";

const signinSchema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "6 caractères minimum").max(72),
});

const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis").max(60),
    lastName: z.string().trim().min(1, "Nom requis").max(60),
    email: z.string().trim().email("Email invalide").max(255),
    password: z.string().min(6, "6 caractères minimum").max(72),
    confirmPassword: z.string().min(6).max(72),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/dashboard", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const passwordMatch = useMemo(
    () => mode === "signup" && password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
    [password, confirmPassword, mode],
  );

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ firstName, lastName, email, password, confirmPassword });
        if (!parsed.success) {
          const fe: Record<string, string> = {};
          parsed.error.errors.forEach((er) => (fe[er.path[0] as string] = er.message));
          setErrors(fe);
          toast.error(parsed.error.errors[0].message);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              first_name: parsed.data.firstName,
              last_name: parsed.data.lastName,
              full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
            },
          },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vérifie ton email.");
      } else {
        const parsed = signinSchema.safeParse({ email, password });
        if (!parsed.success) {
          const fe: Record<string, string> = {};
          parsed.error.errors.forEach((er) => (fe[er.path[0] as string] = er.message));
          setErrors(fe);
          toast.error(parsed.error.errors[0].message);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      toast.error("Entre ton email d'abord");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast.error(error.message);
    else toast.success("Email de réinitialisation envoyé");
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background overflow-hidden">
      {/* LEFT — Form */}
      <div className="relative flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link to="/" className="flex items-center gap-2 w-fit group">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary shadow-glow transition-transform group-hover:scale-110 group-hover:rotate-6" />
          <span className="text-xl font-semibold tracking-tight">scappio</span>
        </Link>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md">
            {/* Tabs switch */}
            <div className="relative mb-8 grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-medium">
              <span
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-elegant transition-transform duration-300 ease-out"
                style={{ transform: mode === "signup" ? "translateX(100%)" : "translateX(0)" }}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`relative z-10 py-2.5 rounded-full transition-colors ${mode === "signin" ? "text-foreground" : "text-muted-foreground"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`relative z-10 py-2.5 rounded-full transition-colors ${mode === "signup" ? "text-foreground" : "text-muted-foreground"}`}
              >
                Inscription
              </button>
            </div>

            <div key={mode} className="animate-fade-in">
              <h1 className="text-3xl font-bold tracking-tight">
                {mode === "signin" ? "Bon retour 👋" : "Crée ton compte"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Connecte-toi pour reprendre tes mindmaps."
                  : "Quelques secondes pour démarrer gratuitement."}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-3 animate-fade-in">
                    <FieldWrap label="Prénom" htmlFor="firstName" error={errors.firstName}>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-9 h-11 rounded-xl transition-all focus-visible:ring-primary/40"
                          placeholder="Marie"
                          maxLength={60}
                        />
                      </div>
                    </FieldWrap>
                    <FieldWrap label="Nom" htmlFor="lastName" error={errors.lastName}>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="pl-9 h-11 rounded-xl transition-all focus-visible:ring-primary/40"
                          placeholder="Curie"
                          maxLength={60}
                        />
                      </div>
                    </FieldWrap>
                  </div>
                )}

                <FieldWrap label="Email" htmlFor="email" error={errors.email}>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 h-11 rounded-xl transition-all focus-visible:ring-primary/40"
                      placeholder="toi@exemple.com"
                      maxLength={255}
                      autoComplete="email"
                    />
                  </div>
                </FieldWrap>

                <FieldWrap label="Mot de passe" htmlFor="password" error={errors.password}>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-10 h-11 rounded-xl transition-all focus-visible:ring-primary/40"
                      placeholder="••••••••"
                      maxLength={72}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label="Afficher le mot de passe"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FieldWrap>

                {mode === "signup" && (
                  <FieldWrap label="Confirmer le mot de passe" htmlFor="confirmPassword" error={errors.confirmPassword}>
                    <div className="relative animate-fade-in">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showPw2 ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`pl-9 pr-10 h-11 rounded-xl transition-all focus-visible:ring-primary/40 ${
                          confirmPassword.length > 0 && !passwordMatch ? "border-destructive" : ""
                        } ${passwordMatch ? "border-primary" : ""}`}
                        placeholder="••••••••"
                        maxLength={72}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw2((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label="Afficher le mot de passe"
                      >
                        {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && !passwordMatch && !errors.confirmPassword && (
                      <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                    )}
                  </FieldWrap>
                )}

                {mode === "signin" && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={handleForgot}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-gradient-primary shadow-glow hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] transition-all btn-shimmer group"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "signin" ? "Se connecter" : "Créer mon compte"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground pt-2">
                  {mode === "signin" ? "Pas encore de compte ?" : "Déjà inscrit ?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                    className="text-primary font-medium hover:underline"
                  >
                    {mode === "signin" ? "Inscris-toi" : "Connecte-toi"}
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} scappio. Tous droits réservés.
        </p>
      </div>

      {/* RIGHT — Visual */}
      <div className="relative hidden lg:block overflow-hidden bg-gradient-primary">
        <div className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(800px 500px at 20% 20%, hsl(24 95% 65% / 0.7), transparent 60%), radial-gradient(700px 500px at 80% 80%, hsl(14 90% 50% / 0.6), transparent 60%), linear-gradient(135deg, hsl(24 95% 53%), hsl(20 90% 45%))",
          }}
        />
        {/* Floating shapes */}
        <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-white/15 blur-3xl animate-blob-2" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-2xl animate-blob-3" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 text-sm font-medium opacity-90">
            <Sparkles className="h-4 w-4 animate-sparkle-spin" />
            Propulsé par scappio
          </div>

          <div className="space-y-6 max-w-lg">
            <h2 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
              Transforme tes idées en{" "}
              <span className="relative inline-block">
                mindmaps
                <svg className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 200 10">
                  <path
                    d="M2 6 Q 50 1, 100 6 T 198 6"
                    stroke="white"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    className="animate-underline-draw"
                  />
                </svg>
              </span>{" "}
              en quelques secondes.
            </h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Capture, organise et partage tes notes avec l'IA. Une expérience pensée pour les créateurs.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-9 w-9 rounded-full border-2 border-white/80 bg-white/20 backdrop-blur"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
              <p className="text-sm text-white/80">+ 1000 créateurs nous font confiance</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { v: "10x", l: "Plus rapide" },
              { v: "0€", l: "Pour démarrer" },
              { v: "24/7", l: "Disponible" },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4 transition-transform hover:-translate-y-1"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="text-2xl font-bold">{s.v}</div>
                <div className="text-xs text-white/80">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob { 0%,100% { transform: translate(0,0) scale(1);} 33% { transform: translate(30px,-40px) scale(1.1);} 66% { transform: translate(-20px,30px) scale(0.95);} }
        @keyframes blob-2 { 0%,100% { transform: translate(0,0) scale(1);} 33% { transform: translate(-40px,30px) scale(1.05);} 66% { transform: translate(30px,-30px) scale(1.1);} }
        @keyframes blob-3 { 0%,100% { transform: translate(-50%,-50%) scale(1);} 50% { transform: translate(-50%,-50%) scale(1.2);} }
        .animate-blob { animation: blob 14s ease-in-out infinite; }
        .animate-blob-2 { animation: blob-2 16s ease-in-out infinite; }
        .animate-blob-3 { animation: blob-3 10s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

const FieldWrap = ({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {label}
    </Label>
    {children}
    {error && <p className="text-xs text-destructive animate-fade-in">{error}</p>}
  </div>
);

export default Auth;
