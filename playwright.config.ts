import { defineConfig } from "@playwright/test";
import path from "path";

const venvBin = path.join(process.cwd(), ".venv", process.platform === "win32" ? "Scripts" : "bin");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      PATH: `${venvBin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  },
});
