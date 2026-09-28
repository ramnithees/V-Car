/**
 * @react-pdf/renderer's browser build calls Node's `Buffer` inside its
 * `fetchImage` helper when resolving image assets (including data URLs).
 * Vite does not shim Node globals for app code, so `Buffer` is undefined and
 * image resolution throws inside `Promise.all(...)` during `resolveAssets`,
 * producing the "Buffer is not defined" warnings we saw in the console.
 *
 * Import this module once before invoking `pdf(...).toBlob()` to install
 * the `buffer` package on `globalThis`.
 */
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export {};
