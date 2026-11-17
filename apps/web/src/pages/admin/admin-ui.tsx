import { Check, Copy } from "lucide-react";
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function messageOf(error: unknown) {
  return error instanceof ApiRequestError || error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export const inputClass =
  "h-9 w-full min-w-0 rounded-xl border border-border bg-black/40 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring";

export function AdminSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)} aria-label={title}>
      <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">{title.toUpperCase()}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "gold" | "primary" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">{label.toUpperCase()}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", tone === "gold" && "text-gold", tone === "primary" && "text-primary")}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  // Unique per field: several forms on one page share labels like "Reason".
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <label htmlFor={id} className="block min-w-0 flex-1">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input id={id} className={inputClass} {...props} />
    </label>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard can be blocked; the text is still selectable.
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
    </Button>
  );
}

/**
 * A small form for one admin action: optional extra fields, a required
 * reason, and a submit button. Errors show under it.
 */
export function ActionForm({
  title,
  submitLabel,
  danger,
  children,
  needsReason = true,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  danger?: boolean;
  children?: ReactNode;
  needsReason?: boolean;
  onSubmit: (reason: string, form: FormData) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim(), form);
      setReason("");
      (event.target as HTMLFormElement).reset();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border p-3" aria-label={title}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {children}
        {needsReason ? (
          <Field label="Reason (saved in the audit log)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} />
        ) : null}
        <Button type="submit" size="sm" variant={danger ? "secondary" : "default"} className="h-9" disabled={busy || (needsReason && reason.trim().length < 3)}>
          {submitLabel}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function when(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : "never";
}
