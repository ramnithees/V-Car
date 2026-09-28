import { supabase } from "@/integrations/supabase/client";

/**
 * Shared demo / test-lab account.
 *
 * Intentionally a normal Supabase user (not anonymous auth), so every RLS
 * policy, insert and delete path behaves exactly as it does for real users.
 * Anyone using it sees the same sandbox, so treat its data as disposable.
 */
export const DEMO_EMAIL = "demo@virtudrive.ai";
export const DEMO_PASSWORD = "VirtuDrive#Demo2026!lab";
export const DEMO_NAME = "Demo Engineer";

/**
 * Signs into the demo account, provisioning it on first use.
 * Resolves once a session exists; the auth listener handles navigation.
 */
export async function signInDemo(): Promise<void> {
  const first = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (!first.error && first.data.session) return;

  // Account does not exist yet — create it, then sign in.
  const signUp = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    options: {
      emailRedirectTo: window.location.origin,
      data: { full_name: DEMO_NAME },
    },
  });

  if (signUp.data.session) return;

  const retry = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (retry.error) throw signUp.error ?? retry.error;
  if (!retry.data.session) throw new Error("Demo session unavailable");
}
