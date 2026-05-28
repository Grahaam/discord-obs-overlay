import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
if (!root) throw new Error("Root element #root not found in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
