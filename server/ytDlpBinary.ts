const ASSET_BY_PLATFORM: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

export function standaloneBinaryName(platform: NodeJS.Platform = process.platform): string {
  const name = ASSET_BY_PLATFORM[platform];
  if (!name) throw new Error(`unsupported platform: ${platform}`);
  return name;
}
