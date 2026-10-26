import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

/** `const toast = useToast(); toast("success", "Saved")` */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({
  children,
  closeLabel,
  regionLabel,
}: {
  children: ReactNode;
  closeLabel: string;
  regionLabel: string;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    setItems((prev) => [...prev.slice(-3), { id: Date.now() + Math.random(), kind, message }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      <RadixToast.Provider duration={2500} label={regionLabel}>
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            type={item.kind === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((i) => i.id !== item.id))}
            duration={item.kind === "error" ? 6000 : 2500}
            className="flex items-center gap-3 rounded-control border border-line bg-panel px-4 py-3 text-sm text-fg shadow-xl"
          >
            {item.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-ok-text" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger-text" aria-hidden />
            )}
            <RadixToast.Description className="flex-1">{item.message}</RadixToast.Description>
            <RadixToast.Close
              aria-label={closeLabel}
              className="rounded p-1 text-fg-subtle hover:text-fg focus-ring cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
