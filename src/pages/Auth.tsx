import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "6 caractères minimum").max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/dashboard", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handle = async (mode: "signin" | "signup") => {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Compte créé ! Tu peux te connecter.");
      } else {
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

  return (
    <div className="min-h-screen bg-hero flex flex-col">
      <header className="container py-6">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="text-xl font-semibold tracking-tight">gribouille</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-gradient-card p-8 shadow-elegant">
          <h1 className="text-2xl font-bold tracking-tight">Bienvenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connecte-toi pour transformer tes notes en mindmap.
          </p>

          <Tabs defaultValue="signup" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
              <TabsTrigger value="signin">Se connecter</TabsTrigger>
            </TabsList>

            {(["signup", "signin"] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`email-${mode}`}>Email</Label>
                  <Input
                    id={`email-${mode}`}
                    type="email"
                    placeholder="toi@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`pw-${mode}`}>Mot de passe</Label>
                  <Input
                    id={`pw-${mode}`}
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={72}
                  />
                </div>
                <Button
                  className="w-full bg-gradient-primary shadow-glow hover:opacity-90"
                  onClick={() => handle(mode)}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "signup" ? "Créer mon compte" : "Se connecter"}
                </Button>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Auth;
