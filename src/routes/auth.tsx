import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Gauge, Loader2, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { AUTH_MESSAGES, isStrongPassword, isValidEmail, mapAuthError } from "@/lib/auth/errors";
import { signInDemo } from "@/lib/auth/demo";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — VirtuDrive AI" },
      {
        name: "description",
        content:
          "Sign in to VirtuDrive AI to run virtual vehicle performance tests and road simulations.",
      },
      { property: "og:title", content: "Sign In — VirtuDrive AI" },
      {
        property: "og:description",
        content:
          "Sign in to VirtuDrive AI to run virtual vehicle performance tests and road simulations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { next?: string; demo?: boolean } => {
    const n =
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : undefined;
    const demo = s.demo === true || s.demo === "true" ? true : undefined;
    return { ...(n ? { next: n } : {}), ...(demo ? { demo } : {}) };
  },

  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      if (search.next) throw redirect({ href: search.next });
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AuthPage,
});

/** Same-origin relative path to return to after sign-in, if any. */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.5 14.7 2.6 12 2.6 6.8 2.6 2.6 6.8 2.6 12s4.2 9.4 9.4 9.4c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const next = safeNext(search.next);
  const autoDemo = search.demo === true;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(autoDemo);

  async function handleDemo() {
    setDemoLoading(true);
    try {
      await signInDemo();
      toast.success("Demo lab ready — exploring as Demo Engineer");
    } catch (err) {
      toast.error(mapAuthError(err));
    } finally {
      setDemoLoading(false);
    }
  }

  const demoStarted = useRef(false);
  useEffect(() => {
    if (!autoDemo || demoStarted.current) return;
    demoStarted.current = true;
    void handleDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);






  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        if (next) {
          window.location.replace(next);
          return;
        }
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, next]);

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: next ? `${window.location.origin}${next}` : window.location.origin,
      });
      if (result?.error) {
        toast.error(AUTH_MESSAGES.oauth);
        return;
      }
      // If redirected: browser is navigating; nothing to do.
      // If tokens set: onAuthStateChange redirects to /dashboard.
    } catch (err) {
      toast.error(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function sendReset() {
    if (!isValidEmail(email)) {
      toast.error(AUTH_MESSAGES.invalidEmail);
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your inbox.");
    } catch (err) {
      toast.error(mapAuthError(err));
    } finally {
      setResetting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      toast.error(AUTH_MESSAGES.invalidEmail);
      return;
    }
    if (mode === "signup") {
      if (!isStrongPassword(password)) {
        toast.error(AUTH_MESSAGES.weakPassword);
        return;
      }
      if (password !== confirmPw) {
        toast.error(AUTH_MESSAGES.passwordMismatch);
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: next ? `${window.location.origin}${next}` : window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        // Auto-confirm is enabled server-side, so a session is issued immediately.
        if (!data.session) {
          // Fallback: sign in explicitly.
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw siErr;
        }
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err) {
      toast.error(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid-bg grid place-items-center px-4 py-8">
      <div className="panel p-6 sm:p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
            <Gauge className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold">
              {mode === "signup" ? "Create your VirtuDrive AI account" : "Sign in to VirtuDrive AI"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {mode === "signup" ? "Create your test-lab account" : "Sign in to your test lab"}
            </p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-4">
            <Button
              type="button"
              className="w-full"
              onClick={handleDemo}
              disabled={demoLoading || googleLoading || loading}
            >
              {demoLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4 mr-2" />
              )}
              Enter demo test lab
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              No sign-up needed — explore vehicles, roads, 3D playback and reports instantly.
            </p>
          </div>


          <Button
            type="button"
            variant="outline"
            className="w-full mb-4"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <span className="mr-2">
                <GoogleIcon />
              </span>
            )}
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <TabsContent value="signin" className="mt-0">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="em-in">Email</Label>
                <Input
                  id="em-in"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pw-in">Password</Label>
                  <button
                    type="button"
                    onClick={sendReset}
                    disabled={resetting}
                    className="text-xs text-primary hover:underline disabled:opacity-60"
                  >
                    {resetting ? "Sending…" : "Forgot password?"}
                  </button>
                </div>
                <PasswordInput
                  id="pw-in"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-0">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="fn">Full name</Label>
                <Input
                  id="fn"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div>
                <Label htmlFor="em-up">Email</Label>
                <Input
                  id="em-up"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="pw-up">Password</Label>
                <PasswordInput
                  id="pw-up"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  At least 8 chars with uppercase, lowercase, number, and special character.
                </p>
              </div>
              <div>
                <Label htmlFor="cpw">Confirm password</Label>
                <PasswordInput
                  id="cpw"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
