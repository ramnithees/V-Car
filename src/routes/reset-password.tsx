import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { toast } from "sonner";
import { Gauge, Loader2 } from "lucide-react";
import { AUTH_MESSAGES, isStrongPassword, mapAuthError } from "@/lib/auth/errors";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — VirtuDrive AI" },
      {
        name: "description",
        content: "Choose a new password for your VirtuDrive AI test-lab account.",
      },
      { property: "og:title", content: "Reset Password — VirtuDrive AI" },
      {
        property: "og:description",
        content: "Choose a new password for your VirtuDrive AI test-lab account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase delivers the recovery session via the URL hash on first load.
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session || isRecovery) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(password)) {
      toast.error(AUTH_MESSAGES.weakPassword);
      return;
    }
    if (password !== confirmPw) {
      toast.error(AUTH_MESSAGES.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
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
            <h1 className="font-semibold">Set a new password</h1>
            <p className="text-xs text-muted-foreground">VirtuDrive AI account recovery</p>
          </div>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">
            Open this page from the password-reset link in your email to continue.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="np">New password</Label>
              <PasswordInput
                id="np"
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
              <Label htmlFor="ncp">Confirm new password</Label>
              <PasswordInput
                id="ncp"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
