// src/hooks/useLeaderElection.ts
import { useState, useEffect } from "react";

/**
 * Returns true when this tab holds the "overlay-leader" Web Lock.
 * The browser automatically transfers leadership when the current leader tab closes.
 * Falls back to true if navigator.locks is unavailable (non-secure context / old browser).
 */
export function useLeaderElection(): boolean {
  const [isLeader, setIsLeader] = useState(() => !navigator.locks);

  useEffect(() => {
    if (!navigator.locks) return; // fallback: always leader (single-tab mode)

    const ac = new AbortController();

    navigator.locks
      .request("overlay-leader", { signal: ac.signal }, async () => {
        setIsLeader(true);
        // Hold the lock until this component unmounts (ac.abort() below)
        await new Promise<void>((_, reject) =>
          ac.signal.addEventListener("abort", () => reject(new Error("aborted")))
        );
      })
      .catch(() => {
        // AbortError on unmount — normal, ignore
      });

    return () => {
      ac.abort();
      setIsLeader(false);
    };
  }, []);

  return isLeader;
}
