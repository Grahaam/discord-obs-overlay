import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true" ? { overlay: false } : false,
      // Ignore build output and runtime dirs — electron-builder writes the
      // packaged app into dist-electron/ and media downloads churn media_cache/,
      // both of which otherwise trigger a Vite full-page-reload storm in dev.
      watch:
        process.env.DISABLE_HMR === "true"
          ? null
          : { ignored: ["**/dist-electron/**", "**/media_cache/**", "**/.venv/**", "**/bin/**"] },
    },
  };
});
