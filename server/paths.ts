import path from "path";

const appDir = process.env.APP_PATH ?? process.cwd();

export const APP_PATHS = {
  distDir: path.join(appDir, "dist"),
  packageJson: path.join(appDir, "package.json"),
};
