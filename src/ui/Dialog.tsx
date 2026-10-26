import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  closeLabel: string;
  children: ReactNode;
}

/** Modal with focus trap, Esc to close and focus restoration (Radix). */
export function Dialog({ open, onOpenChange, title, description, closeLabel, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-line bg-panel p-6 text-fg shadow-2xl focus:outline-none">
          <RadixDialog.Title className="pr-8 text-lg font-bold">{title}</RadixDialog.Title>
          <RadixDialog.Description className={description ? "mt-1 text-sm text-fg-muted" : "sr-only"}>
            {description ?? title}
          </RadixDialog.Description>
          <div className="mt-4">{children}</div>
          <RadixDialog.Close
            aria-label={closeLabel}
            className="absolute right-4 top-4 rounded-control p-1.5 text-fg-subtle hover:bg-surface-hover hover:text-fg focus-ring cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
