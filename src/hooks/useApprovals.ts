import { useCallback, useEffect, useState } from "react";
import type { PendingApproval } from "../types";
import { useQueueStore } from "../store/queueStore";

const send = async (url: string, body?: object): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/** Alerts held for approval, kept live over the socket. The server owns the list; actions return whether they worked. */
export function useApprovals() {
  const socket = useQueueStore((s) => s.socket);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);

  useEffect(() => {
    useQueueStore.getState().ensureSocketConnected();
  }, []);

  useEffect(() => {
    if (!socket) return;
    // The socket may have connected (and been answered) before these listeners existed, so read the list over
    // HTTP now and after every reconnect: nothing held in between is missed.
    const refetch = () =>
      fetch("/api/approvals")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: PendingApproval[]) => setApprovals(list))
        .catch(() => {});
    void refetch();
    socket.on("connect", refetch);
    const onInitial = (list: PendingApproval[]) => setApprovals(list);
    const onAdded = (item: PendingApproval) =>
      setApprovals((prev) => (prev.some((a) => a.id === item.id) ? prev : [...prev, item]));
    const onResolved = ({ id }: { id: string }) => setApprovals((prev) => prev.filter((a) => a.id !== id));
    socket.on("initial_approvals", onInitial);
    socket.on("approval_added", onAdded);
    socket.on("approval_resolved", onResolved);
    return () => {
      socket.off("connect", refetch);
      socket.off("initial_approvals", onInitial);
      socket.off("approval_added", onAdded);
      socket.off("approval_resolved", onResolved);
    };
  }, [socket]);

  const approve = useCallback((id: string, always = false) => send(`/api/approvals/${id}/approve`, { always }), []);
  const reject = useCallback((id: string) => send(`/api/approvals/${id}/reject`), []);

  return { approvals, approve, reject };
}
