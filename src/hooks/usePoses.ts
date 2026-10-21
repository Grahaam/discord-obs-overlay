import { useCallback, useEffect, useRef, useState } from "react";
import type { PosesFile } from "../types";
import { useQueueStore } from "../store/queueStore";

const SAVE_DEBOUNCE_MS = 400;

/**
 * Poses file shared by the dashboard: edits apply locally at once and are saved
 * 400 ms after the last change, so typing in a field doesn't PUT on every key.
 */
export function usePoses() {
  const [file, setFile] = useState<PosesFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socket = useQueueStore((state) => state.socket);
  const pendingRef = useRef<PosesFile | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch("/api/poses")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PosesFile;
      })
      .then(setFile)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!socket) return;
    // Ignore broadcasts while a local edit waits to be saved: they would undo what is being typed
    const onUpdate = (next: PosesFile) => {
      if (!pendingRef.current) setFile(next);
    };
    socket.on("poses_updated", onUpdate);
    return () => {
      socket.off("poses_updated", onUpdate);
    };
  }, [socket]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const next = pendingRef.current;
    if (!next) return;
    try {
      const response = await fetch("/api/poses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error((body as { error?: string } | null)?.error || `HTTP ${response.status}`);
      setError(null);
      // A newer edit may have arrived during the request: keep it, it saves next
      if (pendingRef.current === next) {
        pendingRef.current = null;
        setFile(body as PosesFile);
      }
    } catch (err) {
      if (pendingRef.current === next) pendingRef.current = null;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const update = useCallback(
    (next: PosesFile) => {
      pendingRef.current = next;
      setFile(next);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  // Leaving the tab must not drop the last edit
  useEffect(() => () => void flush(), [flush]);

  return { file, update, flush, error };
}
