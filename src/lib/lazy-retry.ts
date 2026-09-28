/**
 * Dynamic imports can fail transiently in the browser: a dev-server dependency
 * re-optimization, a deployed build replacing hashed chunks, or a flaky network
 * all surface as "Failed to fetch dynamically imported module".
 * Retry with a cache-busting query, then fall back to a single page reload.
 */
const RELOAD_FLAG = "virtudrive:chunk-reload";

export function lazyRetry<T>(
  importer: () => Promise<T>,
  attempts = 3,
  delayMs = 350,
): () => Promise<T> {
  return async () => {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const mod = await importer();
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(RELOAD_FLAG);
        return mod;
      } catch (error) {
        lastError = error;
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }

    // Most likely a stale module graph — reload once to pick up fresh chunks.
    if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    }
    throw lastError;
  };
}
