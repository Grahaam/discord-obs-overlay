import { defineConfig } from "@playwright/test";
import path from "path";

const venvBin = path.join(process.cwd(), ".venv", process.platform === "win32" ? "Scripts" : "bin");
const port = Number(process.env.PORT ?? 3000);
// The dev server requires an API key (server/apiGuard.ts): give it a fixed one and send it with every request.
const apiToken = "playwright-api-token-".padEnd(48, "0");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    extraHTTPHeaders: { "X-LiveChat-Token": apiToken },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    port,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      LIVECHAT_API_TOKEN: apiToken,
      PATH: `${venvBin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  },
});
