"use client";
import { ExternalLink, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

const EXPLORER = "https://testnet.xrpl.org";

export function Card({ title, subtitle, children, right, className = "" }: {
  title?: ReactNode; subtitle?: ReactNode; children: ReactNode; right?: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-space-700 bg-space-900/80 backdrop-blur p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "accent" | "warn" | "danger" | "ok";
}) {
  const color = { default: "text-ink", accent: "text-accent", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  return (
    <div className="rounded-lg border border-space-700 bg-space-800/60 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  locked: "bg-space-700 text-ink", released: "bg-ok/15 text-ok", forfeited: "bg-danger/15 text-danger",
  active: "bg-accent/15 text-accent", verified: "bg-ok/15 text-ok", resolved: "bg-warn/15 text-warn", settled: "bg-space-600 text-ink",
  operational: "bg-accent/15 text-accent", end_of_life: "bg-warn/15 text-warn", deorbiting: "bg-warn/15 text-warn",
  deorbited: "bg-ok/15 text-ok", abandoned: "bg-danger/15 text-danger",
};
const BADGE_LABEL: Record<string, string> = {
  locked: "Verrouillée", released: "Libérée", forfeited: "Confisquée", active: "Actif", verified: "Vérifié",
  resolved: "À régler", settled: "Réglé", operational: "Opérationnel", end_of_life: "Fin de vie",
  deorbiting: "Désorbitation", deorbited: "Désorbité", abandoned: "Abandonné",
};
export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[status] ?? "bg-space-700 text-muted"}`}>
      {BADGE_LABEL[status] ?? status}
    </span>
  );
}

export function TxLink({ hash }: { hash?: string }) {
  if (!hash) return <span className="text-muted">—</span>;
  return (
    <a href={`${EXPLORER}/transactions/${hash}`} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">
      {hash.slice(0, 8)}…{hash.slice(-6)} <ExternalLink size={11} />
    </a>
  );
}

export function AddrLink({ address }: { address?: string }) {
  if (!address) return <span className="text-muted">—</span>;
  return (
    <a href={`${EXPLORER}/accounts/${address}`} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">
      {address.slice(0, 6)}…{address.slice(-5)} <ExternalLink size={11} />
    </a>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, className = "" }: {
  children: ReactNode; onClick?: () => Promise<unknown> | void; variant?: "primary" | "ghost" | "danger";
  disabled?: boolean; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const styles = {
    primary: "bg-accent text-space-950 hover:bg-accent-strong",
    ghost: "border border-space-600 text-ink hover:bg-space-800",
    danger: "border border-danger/50 text-danger hover:bg-danger/10",
  }[variant];
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        disabled={disabled || busy}
        onClick={async () => {
          if (!onClick) return;
          setBusy(true); setErr(null);
          try { await onClick(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {children}
      </button>
      {err && <span className="max-w-sm text-xs text-danger">{err}</span>}
    </span>
  );
}

export function Countdown({ target, now }: { target: number; now: number }) {
  const d = target - now;
  if (d <= 0) return <span className="font-mono text-xs text-danger">échue</span>;
  const m = Math.floor(d / 60), s = d % 60;
  return <span className="font-mono text-xs text-warn">{m}:{String(s).padStart(2, "0")}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm text-muted">{children}</div>}
    </div>
  );
}

export function SimNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[11px] italic text-muted">{children}</p>;
}

export const usdFmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
export const numFmt = (n: number, d = 2) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);
