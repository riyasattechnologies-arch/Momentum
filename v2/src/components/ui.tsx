"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Health } from "@/lib/insights";
import type { Tier } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Panel({ title, action, children, className, pad = true, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={cx("rounded-lg border border-line bg-panel", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="label !text-muted">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md" };
export function Button({ variant = "outline", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-[#06101c] hover:bg-[#6aafff]",
        variant === "outline" && "border border-line-2 bg-panel-2 text-text hover:border-dim",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-text",
        variant === "danger" && "border border-bad/40 text-bad hover:bg-bad/10",
        className,
      )}
    />
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  const map = {
    primary: "bg-accent/15 text-accent border-accent/40",
    secondary: "bg-panel-2 text-muted border-line-2",
    tertiary: "border-dashed text-dim border-line-2",
  } as const;
  const txt = { primary: "P1", secondary: "P2", tertiary: "P3" } as const;
  return (
    <span title={tier} className={cx("num inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-semibold", map[tier])}>
      {txt[tier]}
    </span>
  );
}

export function HealthPill({ health }: { health: Health }) {
  const map = {
    "on track": "text-good bg-good/10 border-good/30",
    "at risk": "text-warn bg-warn/10 border-warn/30",
    "off track": "text-bad bg-bad/10 border-bad/30",
  } as const;
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", map[health])}><span className="h-1.5 w-1.5 rounded-full bg-current" />{health}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="label">{label}</div>
      <div className={cx("num mt-1 text-2xl font-semibold", tone === "good" && "text-good", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line-2 px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded border border-line-2 bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{children}</kbd>;
}

export const inputCls = "w-full rounded-md border border-line-2 bg-panel-2 px-3 py-2 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none";
