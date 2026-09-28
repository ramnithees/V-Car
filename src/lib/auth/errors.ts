// Standardized, user-facing auth error messages.
// Never surface raw Supabase errors to end users.

export const AUTH_MESSAGES = {
  invalidEmail: "Please enter a valid email address.",
  wrongPassword: "The password you entered is incorrect.",
  userNotFound: "No account exists with this email.",
  emailTaken: "An account with this email already exists.",
  weakPassword:
    "Password must contain at least 8 characters including uppercase, lowercase, number, and special character.",
  network: "Unable to connect. Please check your internet connection.",
  sessionExpired: "Your session has expired. Please log in again.",
  oauth: "Google Sign-In failed. Please try again.",
  unexpected: "Something went wrong. Please try again.",
  passwordMismatch: "Passwords do not match.",
} as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

// Strong password: >=8, upper, lower, number, special.
export function isStrongPassword(v: string): boolean {
  return (
    v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)
  );
}

export function mapAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.toLowerCase();

  if (!msg) return AUTH_MESSAGES.unexpected;
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("networkerror"))
    return AUTH_MESSAGES.network;
  if (
    msg.includes("invalid login") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid password")
  )
    return AUTH_MESSAGES.wrongPassword;
  if (msg.includes("user not found") || msg.includes("no user")) return AUTH_MESSAGES.userNotFound;
  if (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already")
  )
    return AUTH_MESSAGES.emailTaken;
  if (
    msg.includes("password") &&
    (msg.includes("weak") ||
      msg.includes("short") ||
      msg.includes("pwned") ||
      msg.includes("compromis"))
  )
    return AUTH_MESSAGES.weakPassword;
  if (msg.includes("email") && msg.includes("valid")) return AUTH_MESSAGES.invalidEmail;
  if (msg.includes("jwt") || msg.includes("session") || msg.includes("expired"))
    return AUTH_MESSAGES.sessionExpired;
  if (msg.includes("oauth") || msg.includes("google")) return AUTH_MESSAGES.oauth;
  return AUTH_MESSAGES.unexpected;
}
