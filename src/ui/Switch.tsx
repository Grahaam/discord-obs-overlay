import * as RadixSwitch from "@radix-ui/react-switch";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name: pass `aria-labelledby` (preferred, from SettingRow) or `aria-label`. */
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, ...aria }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-line-strong bg-surface-hover transition-colors focus-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      {...aria}
    >
      <RadixSwitch.Thumb className="block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-fg-muted shadow transition-transform data-[state=checked]:translate-x-5.5 data-[state=checked]:bg-on-accent" />
    </RadixSwitch.Root>
  );
}
