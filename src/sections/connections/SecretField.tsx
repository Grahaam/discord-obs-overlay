import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, cx, inputClass } from "../../ui";
import { useDashboard } from "../../dashboard/DashboardContext";

interface SecretFieldProps {
  label: string;
  /** Accessible name of the input (what the user types is the NEW value). */
  ariaLabel: string;
  placeholder?: string;
  hint?: React.ReactNode;
  /** True when the server already holds a value. */
  stored: boolean;
  /** DOM id for the input (scroll target). */
  inputId?: string;
  onApply: (value: string) => Promise<void>;
  /** Exposes the draft so a sibling action (e.g. "test connection") can use it. */
  onDraftChange?: (value: string) => void;
}

/** Secrets are never edited through `config`: a local draft is sent explicitly with "Apply". */
export default function SecretField({
  label,
  ariaLabel,
  placeholder,
  hint,
  stored,
  inputId,
  onApply,
  onDraftChange,
}: SecretFieldProps) {
  const { t } = useDashboard();
  const [draft, setDraftState] = useState("");
  const [show, setShow] = useState(false);
  const [applying, setApplying] = useState(false);

  const setDraft = (v: string) => {
    setDraftState(v);
    onDraftChange?.(v);
  };

  const apply = async () => {
    if (!draft) return;
    setApplying(true);
    try {
      await onApply(draft);
      setDraft("");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Field
      label={label}
      hint={
        <>
          {stored && <span className="block font-semibold text-ok-text">{t.secret.stored}</span>}
          {hint}
        </>
      }
    >
      {(aria) => (
        <div className="flex flex-wrap gap-2">
          <div className="relative flex min-w-48 flex-1 items-center">
            <input
              {...aria}
              id={inputId ?? aria.id}
              aria-label={ariaLabel}
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void apply();
                if (e.key === "Escape") setDraft("");
              }}
              className={cx(inputClass, "pr-10 font-mono")}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t.bot.hidePassword : t.bot.showPassword}
              aria-pressed={show}
              className="absolute right-2 rounded p-1 text-fg-subtle hover:text-fg focus-ring"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          {draft && (
            <>
              <Button variant="primary" onClick={apply} disabled={applying}>
                {t.secret.apply}
              </Button>
              <Button variant="ghost" onClick={() => setDraft("")} disabled={applying}>
                {t.secret.cancel}
              </Button>
            </>
          )}
        </div>
      )}
    </Field>
  );
}
