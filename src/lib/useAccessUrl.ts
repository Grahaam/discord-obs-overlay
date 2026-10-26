import { useEffect, useState } from "react";

let tokenPromise: Promise<string | null> | null = null;

/** The per-install API token. The request itself is authenticated, so only a signed-in page gets it. */
function fetchAccessToken(): Promise<string | null> {
  tokenPromise ??= fetch("/api/access")
    .then((res) => (res.ok ? (res.json() as Promise<{ token?: string }>) : null))
    .then((body) => body?.token ?? null)
    .catch(() => null);
  return tokenPromise;
}

/**
 * Full URL of one of this instance's pages (`/overlay`, `/dock`) as OBS needs it: the page load carries
 * `?k=` so the server plants its auth cookie. The port is dynamic under Electron, hence the origin.
 */
export function useAccessUrl(path: string): string {
  const base = `${window.location.origin}${path}`;
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAccessToken().then((value) => {
      if (!cancelled) setToken(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return token ? `${base}?k=${token}` : base;
}
