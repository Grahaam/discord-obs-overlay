/// <reference types="vite/client" />

// Bridge exposed by electron/preload.cjs. Undefined when the dashboard is
// opened in a plain browser (npm run dev / npm start), so always check first.
interface Window {
  electronAPI?: {
    getPort: () => Promise<number | null>;
    openUserAssets: () => Promise<void>;
  };
}
