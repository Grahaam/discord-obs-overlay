/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared look of text inputs, selects and textareas. */
export const inputClass =
  "w-full bg-field border border-line rounded-control px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-ring focus-visible:border-accent disabled:opacity-60 disabled:cursor-not-allowed";
