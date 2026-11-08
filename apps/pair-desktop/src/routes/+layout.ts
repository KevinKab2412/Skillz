// Tauri has no Node server, so the app is a static SPA (adapter-static with an index.html fallback).
export const ssr = false;

// In a plain browser during development, stand in for the Rust backend so the UI can be checked.
if (import.meta.env.DEV && typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  const { installMock } = await import("$lib/dev/mock");
  installMock();
}
