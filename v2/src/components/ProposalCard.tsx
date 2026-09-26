"use client";
import { useStore } from "@/lib/store";
import type { DiffItem, Proposal, Task } from "@/lib/types";
import { Button, cx } from "./ui";

const OP = {
  add: { sym: "+", cls: "text-good border-good/30 bg-good/10" },
  change: { sym: "~", cls: "text-warn border-warn/30 bg-warn/10" },
  remove: { sym: "−", cls: "text-bad border-bad/30 bg-bad/10" },
} as const;

function describe(d: DiffItem): string {
  if (d.op === "remove") return "";
  const b = (d.before ?? {}) as Partial<Task>;
  const a = (d.after ?? {}) as Partial<Task>;
  const parts: string[] = [];
  if (a.earliest && a.earliest !== b.earliest) parts.push(`${b.earliest ?? "—"} → ${a.earliest}`);
  if (a.due && a.due !== b.due && !a.earliest) parts.push(`due ${b.due ?? "—"} → ${a.due}`);
  if (a.estimate && a.estimate !== b.estimate) parts.push(`${b.estimate ?? "—"}m → ${a.estimate}m`);
  if (a.tier && a.tier !== b.tier) parts.push(`${b.tier ?? "—"} → ${a.tier}`);
  if (d.op === "add") parts.push([a.tier, a.estimate && `${a.estimate}m`, a.due && `due ${a.due}`].filter(Boolean).join(" · "));
  return parts.join(" · ");
}

export function ProposalCard({ proposal, compact = false }: { proposal: Proposal; compact?: boolean }) {
  const decide = useStore((s) => s.decideProposal);
  const pending = proposal.status === "pending";
  const shown = compact ? proposal.diff.slice(0, 6) : proposal.diff;
  return (
    <div className={cx("rounded-lg border bg-panel-2", pending ? "border-accent/40" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="label !text-accent">Proposal</span>
          <span className="num text-[11px] text-dim">{proposal.diff.length} change{proposal.diff.length === 1 ? "" : "s"} · {proposal.source === "gemini" ? "Gemini" : "offline engine"}</span>
        </div>
        <span className={cx("num text-[11px] uppercase", proposal.status === "approved" ? "text-good" : proposal.status === "rejected" ? "text-bad" : "text-warn")}>{proposal.status}</span>
      </div>
      <p className="px-3 pt-2.5 text-sm text-text">{proposal.rationale}</p>
      <ul className="scroll-thin max-h-72 space-y-1 overflow-y-auto px-3 py-2.5">
        {shown.map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <span className={cx("num mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px]", OP[d.op].cls)}>{OP[d.op].sym}</span>
            <div className="min-w-0">
              <div className={cx("truncate", d.op === "remove" && "text-muted line-through")}>{d.label}</div>
              <div className="num text-[11px] text-dim">{[describe(d), d.reason].filter(Boolean).join(" — ")}</div>
            </div>
          </li>
        ))}
        {compact && proposal.diff.length > shown.length && <li className="text-xs text-dim">+ {proposal.diff.length - shown.length} more</li>}
      </ul>
      {pending && (
        <div className="flex gap-2 border-t border-line px-3 py-2">
          <Button size="sm" variant="primary" onClick={() => decide(proposal.id, true)}>Approve changes</Button>
          <Button size="sm" variant="ghost" onClick={() => decide(proposal.id, false)}>Reject</Button>
        </div>
      )}
    </div>
  );
}
