import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";

type Mode = "signin" | "signup";

const signinSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Minimum 6 characters").max(72),
});

const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name required").max(60),
    lastName: z.string().trim().min(1, "Last name required").max(60),
    email: z.string().trim().email("Invalid email").max(255),
    password: z.string().min(6, "Minimum 6 characters").max(72),
    confirmPassword: z.string().min(6).max(72),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
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
    const processedUsers = new Set<string>();
    const handleSession = async (session: any) => {
      if (!session?.user) return;
      const user = session.user;
      const provider = user.app_metadata?.provider;
      const alreadySynced = user.user_metadata?.scappio_synced === true;

      // Read intent stored before the OAuth redirect (signin vs signup tab)
      const intent =
        (typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem("scappio_google_intent")) || "signin";

      // Dedupe: handleSession fires from both getSession() and onAuthStateChange
      if (provider === "google" && processedUsers.has(user.id)) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (provider === "google") processedUsers.add(user.id);

      // Google SIGN-UP path: only when user clicked Google from the "Sign up" tab
      // AND the account hasn't been mirrored to Scappio yet
      if (provider === "google" && intent === "signup" && !alreadySynced) {
        try {
          const meta = user.user_metadata ?? {};
          const firstName: string =
            meta.given_name ?? meta.first_name ?? (meta.full_name ?? meta.name ?? "").split(" ")[0] ?? "";
          const lastName: string =
            meta.family_name ?? meta.last_name ??
            ((meta.full_name ?? meta.name ?? "").split(" ").slice(1).join(" ")) ?? "";

          // Generate a random password (user can change it later in their account settings)
          const generatedPassword =
            (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
            "Aa1!";

          // Persist password + names on the Lovable Cloud auth user, mark as synced
          const { error: updErr } = await supabase.auth.updateUser({
            password: generatedPassword,
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: meta.full_name ?? `${firstName} ${lastName}`.trim(),
              scappio_synced: true,
            },
          });
          if (updErr) throw updErr;

          const payload = {
            action: "sign up",
            mail: user.email,
            password: generatedPassword,
            user_gen_id: user.id,
            Name: firstName,
            Surname: lastName,
            Mail: user.email,
          };
          console.log("[ScappioAuth][google] POST payload:", payload);
          const resp = await fetch(
            "https://scappio-project-auth-part.onrender.com/ScappioAuth",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const text = await resp.text();
          console.log("[ScappioAuth][google] response", resp.status, text);
          let body: any = null;
          try { body = JSON.parse(text); } catch { /* not JSON */ }

          if (!resp.ok || !body || body.status !== true) {
            const msg =
              (body && typeof body.message === "string" && body.message) ||
              "Le serveur Scappio n'a pas validé l'inscription Google";
            // Roll back the just-created auth user to avoid an orphan
            try {
              await supabase.functions.invoke("delete-auth-user", {
                body: { user_id: user.id },
              });
            } catch (rbErr) {
              console.error("[ScappioAuth][google] rollback failed:", rbErr);
            }
            await supabase.auth.signOut();
            toast.error(msg);
            return;
          }
          toast.success("Compte Google connecté !");
        } catch (err: any) {
          console.error("[ScappioAuth][google] sync error:", err);
          try {
            await supabase.functions.invoke("delete-auth-user", {
              body: { user_id: user.id },
            });
          } catch {/* ignore */}
          await supabase.auth.signOut();
          toast.error(err?.message ?? "Erreur lors de la synchronisation Google");
          return;
        }
      } else if (provider === "google" && intent === "signin") {
        // Google SIGN-IN (returning user) — identify via mail + Name + Surname
        // (no password since it was auto-generated at sign-up)
        try {
          const meta = user.user_metadata ?? {};
          const firstName: string =
            meta.first_name ?? meta.given_name ?? (meta.full_name ?? meta.name ?? "").split(" ")[0] ?? "";
          const lastName: string =
            meta.last_name ?? meta.family_name ??
            ((meta.full_name ?? meta.name ?? "").split(" ").slice(1).join(" ")) ?? "";

          const payload = {
            action: "Google Sign In",
            mail: user.email,
            user_gen_id: user.id,
            Name: firstName,
            Surname: lastName,
            Mail: user.email,
            provider: "google",
          };
          console.log("[ScappioAuth][google][signin] POST payload:", payload);
          const resp = await fetch(
            "https://scappio-project-auth-part.onrender.com/ScappioAuth",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const text = await resp.text();
          console.log("[ScappioAuth][google][signin] response", resp.status, text);
          let body: any = null;
          try { body = JSON.parse(text); } catch { /* not JSON */ }

          if (!resp.ok || !body || body.status !== true) {
            const msg =
              (body && typeof body.message === "string" && body.message) ||
              "Le serveur Scappio n'a pas validé la connexion Google";
            await supabase.auth.signOut();
            toast.error(msg);
            return;
          }
        } catch (err: any) {
          console.error("[ScappioAuth][google][signin] error:", err);
          await supabase.auth.signOut();
          toast.error(err?.message ?? "Erreur lors de la connexion Google");
          return;
        }
      }

      if (provider === "google" && typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("scappio_google_intent");
      }

      navigate("/dashboard", { replace: true });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      handleSession(session);
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
        const { data: signUpData, error } = await supabase.auth.signUp({
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

        // Mirror the new user to the external Scappio Flask server
        // (Lovable Cloud reste la source de vérité ; ce POST permet de garder
        //  une copie sur ton propre serveur pour te détacher plus tard.)
        const generatedUserId = signUpData.user?.id;
        if (!generatedUserId) {
          throw new Error("Sign-up failed: no user id returned");
        }

        const payload = {
          action: "sign up",
          mail: parsed.data.email,
          password: parsed.data.password,
          user_gen_id: generatedUserId,
          Name: parsed.data.firstName,
          Surname: parsed.data.lastName,
          Mail: parsed.data.email,
        };

        // Mirror to Scappio Flask server. If it rejects, roll back the Supabase user.
        let flaskOk = false;
        let flaskMessage = "Le serveur Scappio n'a pas validé l'inscription";
        try {
          console.log("[ScappioAuth] POST payload:", payload);
          const resp = await fetch(
            "https://scappio-project-auth-part.onrender.com/ScappioAuth",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const text = await resp.text();
          console.log("[ScappioAuth] response", resp.status, text);
          let body: any = null;
          try { body = JSON.parse(text); } catch { /* not JSON */ }
          if (resp.ok && body && body.status === true) {
            flaskOk = true;
          } else if (body && typeof body.message === "string") {
            flaskMessage = body.message;
          }
        } catch (syncErr) {
          console.error("[ScappioAuth] network error:", syncErr);
          flaskMessage = "Impossible de joindre le serveur Scappio";
        }

        if (!flaskOk) {
          // Roll back: delete the just-created auth user to avoid an orphan.
          try {
            await supabase.functions.invoke("delete-auth-user", {
              body: { user_id: generatedUserId },
            });
          } catch (rollbackErr) {
            console.error("[ScappioAuth] rollback failed:", rollbackErr);
          }
          await supabase.auth.signOut();
          throw new Error(flaskMessage);
        }

        toast.success("Account created! Check your email.");
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
      toast.error(err.message ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background overflow-hidden">
      {/* LEFT — Form */}
      <div className="relative flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link to="/" className="flex items-center gap-2 w-fit group">
          <span className="text-xl font-semibold tracking-tight text-foreground">scappio</span>
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
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`relative z-10 py-2.5 rounded-full transition-colors ${mode === "signup" ? "text-foreground" : "text-muted-foreground"}`}
              >
                Sign up
              </button>
            </div>

            <div key={mode} className="animate-fade-in">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-4">
                <Sparkles className="h-3 w-3 text-primary" />
                {mode === "signin" ? "Welcome back" : "Get started for free"}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {mode === "signin" ? "Sign in to scappio" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Resume your mindmaps in one click."
                  : "Just a few seconds — no credit card required."}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {mode === "signup" && (
                  <div className="grid grid-cols-2 gap-3 animate-fade-in">
                    <FieldWrap label="First name" htmlFor="firstName" error={errors.firstName}>
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
                    <FieldWrap label="Last name" htmlFor="lastName" error={errors.lastName}>
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
                      placeholder="you@example.com"
                      maxLength={255}
                      autoComplete="email"
                    />
                  </div>
                </FieldWrap>

                <FieldWrap label="Password" htmlFor="password" error={errors.password}>
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
                      aria-label="Show password"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FieldWrap>

                {mode === "signup" && (
                  <FieldWrap label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}>
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
                        aria-label="Show password"
                      >
                        {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && !passwordMatch && !errors.confirmPassword && (
                      <p className="text-xs text-destructive mt-1">Passwords do not match</p>
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
                      Forgot password?
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
                      {mode === "signin" ? "Sign in" : "Create my account"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const result = await lovable.auth.signInWithOAuth("google", {
                        redirect_uri: `${window.location.origin}/auth`,
                      });
                      if (result.error) {
                        toast.error(result.error.message ?? "Google sign-in failed");
                      }
                    } catch (err: any) {
                      toast.error(err?.message ?? "Google sign-in failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="w-full h-11 rounded-xl"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                  </svg>
                  Continue with Google
                </Button>

                <p className="text-center text-sm text-muted-foreground pt-2">
                  {mode === "signin" ? "No account yet?" : "Already registered?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                    className="text-primary font-medium hover:underline"
                  >
                    {mode === "signin" ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} scappio. All rights reserved.
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
            Powered by scappio
          </div>

          <div className="space-y-6 max-w-lg">
            <h2 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
              Turn your ideas into{" "}
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
              in seconds.
            </h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Capture, organize and share your notes with AI. Built for creators.
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
              <p className="text-sm text-white/80">1000+ creators trust us</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { v: "10x", l: "Faster" },
              { v: "$0", l: "To get started" },
              { v: "24/7", l: "Available" },
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
