import * as RadixSlider from "@radix-ui/react-slider";

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  /** Text read out for the current value, e.g. "1.5×". */
  valueText?: string;
  disabled?: boolean;
}

export function Slider({ value, onValueChange, min, max, step = 1, valueText, disabled, ...aria }: SliderProps) {
  return (
    <RadixSlider.Root
      value={[value]}
      onValueChange={([v]) => onValueChange(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className="relative flex h-5 w-full min-w-40 touch-none select-none items-center"
    >
      <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-surface-hover border border-line">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        {...aria}
        aria-valuetext={valueText}
        className="block h-4.5 w-4.5 rounded-full border-2 border-accent bg-panel shadow focus-ring"
      />
    </RadixSlider.Root>
  );
}
