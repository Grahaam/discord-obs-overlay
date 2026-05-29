import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// StrictMode intentionally omitted — double-invocation of effects in dev mode
// would break the WebSocket lifecycle and video playback timing on the overlay route.

// Suppress noisy-but-harmless Vite HMR / Socket.io connection noise so it
// doesn't pollute the browser console or trigger the Vite error overlay.
// IMPORTANT: keep this list narrow — swallowing broad categories like
// "unhandled rejection" hides real bugs.
if (typeof window !== "undefined") {
  const BENIGN_PATTERNS = [
    "[vite] failed to connect to websocket",
    "[vite] server connection lost",
    "websocket closed without opened handshake",
    "socket.io connect_error",
    "ns_error_websocket_connection_refused",
    "websocket closed without opened",
    "connection refused",
    "failed to fetch",
  ];

  const globalExceptionHandler = (event: ErrorEvent | PromiseRejectionEvent) => {
    try {
      const msg =
        "message" in event ? event.message : (event.reason && (event.reason.message || String(event.reason))) || "";
      const lower = String(msg).toLowerCase();
      if (BENIGN_PATTERNS.some((p) => lower.includes(p))) {
        event.preventDefault();
        event.stopPropagation();
      }
    } catch (_) {
      // Never let the handler itself throw
    }
  };

  window.addEventListener("error", globalExceptionHandler, true);
  window.addEventListener("unhandledrejection", globalExceptionHandler, true);
}

const root = document.getElementById("root");
if (!root) {
  console.error("FATAL: Root element #root not found in index.html");
} else {
  console.log("[App] Mounting React root...");
  createRoot(root).render(<App />);
}
