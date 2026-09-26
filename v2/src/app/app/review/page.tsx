"use client";
import Link from "next/link";
import { useState } from "react";
import { coachMessage } from "@/lib/ai/client";
import { addDays, fmtTime, today } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { DiffItem, TimeBlock } from "@/lib/types";
import { ProposalCard } from "@/components/ProposalCard";
import { Button, cx, inputCls, Panel, TierBadge } from "@/components/ui";

type Outcome = "done" | "partial" | "skipped";

export default function ReviewPage() {
  const s = useStore();
  const d = today();
  const blocks: TimeBlock[] = (s.days[d] ?? []).filter((b) => b.kind === "task");
  const initial: Record<string, Outcome> = Object.fromEntries(blocks.map((b) => [b.id, b.state === "done" ? "done" : b.state === "started" ? "partial" : "skipped"]));
  const [out, setOut] = useState<Record<string, Outcome>>(initial);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ msg: string; proposalId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = s.checkins.find((c) => c.date === d && c.type === "evening");
  if (!s.profile) return null;

  async function close() {
    setBusy(true);
    const st = useStore.getState();
    for (const b of blocks) {
      const o = out[b.id];
      if (o === "done" && b.state !== "done") st.blockAction(b.id, "done");
      if (o === "skipped" && b.state !== "skipped") st.blockAction(b.id, "skip");
    }
    // Replanner: missed primary/secondary work moves to the next working days
    const tomorrow = addDays(d, 1);
    const missed = [...new Map(blocks.filter((b) => out[b.id] !== "done").map((b) => [b.taskId, useStore.getState().tasks.find((t) => t.id === b.taskId)])).values()].filter((t) => t && t.tier !== "tertiary");
    const diff: DiffItem[] = missed.map((t, i) => ({
      op: "change", objectType: "task", id: t!.id, label: t!.title,
      before: { earliest: t!.earliest, due: t!.due, tier: t!.tier },
      after: { earliest: addDays(tomorrow, Math.floor(i / 2)), due: t!.due < addDays(tomorrow, 2) ? addDays(tomorrow, 2) : t!.due, tier: t!.tier === "secondary" && out[blocks.find((b) => b.taskId === t!.id)!.id] === "partial" ? "primary" : t!.tier },
      reason: out[blocks.find((b) => b.taskId === t!.id)!.id] === "partial" ? "Half done: finish it first thing" : "Missed today: rescheduled",
    }));
    const droppedTertiary = blocks.filter((b) => out[b.id] !== "done" && useStore.getState().tasks.find((t) => t.id === b.taskId)?.tier === "tertiary").length;
    let proposalId: string | undefined;
    if (diff.length) proposalId = st.addProposal({ kind: "replan", rationale: `${diff.length} unfinished task${diff.length === 1 ? "" : "s"} moved to the next ${diff.length > 2 ? "few days" : "day"}${droppedTertiary ? `; ${droppedTertiary} optional task${droppedTertiary === 1 ? "" : "s"} left for when you have time` : ""}.`, diff, source: "offline" });

    const doneN = blocks.filter((b) => out[b.id] === "done").length;
    const ai = await coachMessage(s.profile!.coachStyle, s.profile!.name, "evening", { done: doneN, total: blocks.length, mood, energy, notes, missed: missed.map((t) => t!.title), why: s.goals[0]?.why });
    const msg = ai ? `${ai.headline} ${ai.body}` : doneN === blocks.length && blocks.length
      ? `All ${doneN} blocks done. That's a full day, ${s.profile!.name}. Tomorrow is already planned.`
      : `${doneN} of ${blocks.length} blocks done. ${missed.length ? `I've proposed moving ${missed.length} unfinished task${missed.length === 1 ? "" : "s"} forward. Approve it and tomorrow's schedule updates.` : "Tomorrow is planned."}${energy <= 2 ? " Energy was low, so sleep is the priority tonight." : ""}`;
    st.saveCheckin({ date: d, type: "evening", mood, energy, notes, aiMessage: msg });
    // pre-build tomorrow
    useStore.setState((x) => { const { [tomorrow]: _drop, ...rest } = x.days; void _drop; return { days: rest }; });
    setResult({ msg, proposalId });
    setBusy(false);
  }

  const prop = result?.proposalId ? s.proposals.find((p) => p.id === result.proposalId) : undefined;

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <div className="label !text-accent">Evening review</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">How did today go, {s.profile.name}?</h1>
        <p className="mt-1 text-sm text-muted">Be honest. I only use this to plan tomorrow better.{existing ? " You already reviewed today; saving again replaces it." : ""}</p>
      </div>

      {!result ? (
        <>
          <Panel title={`Today's blocks · ${blocks.length}`}>
            {blocks.length === 0 ? <p className="text-sm text-muted">No task blocks today.</p> : (
              <ul className="divide-y divide-line">
                {blocks.map((b) => {
                  const t = s.tasks.find((x) => x.id === b.taskId);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      {t && <TierBadge tier={t.tier} />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{b.title}</div>
                        <div className="num text-[11px] text-dim">{fmtTime(b.start)}–{fmtTime(b.end)}{b.part ? ` · part ${b.part}` : ""}</div>
                      </div>
                      <div className="flex rounded-md border border-line-2 p-0.5" role="radiogroup" aria-label={`Outcome for ${b.title}`}>
                        {(["done", "partial", "skipped"] as Outcome[]).map((o) => (
                          <button key={o} role="radio" aria-checked={out[b.id] === o} onClick={() => setOut({ ...out, [b.id]: o })}
                            className={cx("rounded px-2.5 py-1 text-xs capitalize", out[b.id] === o ? (o === "done" ? "bg-good/20 text-good" : o === "partial" ? "bg-warn/20 text-warn" : "bg-bad/15 text-bad") : "text-dim hover:text-muted")}>{o}</button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="You">
            <div className="grid gap-4 sm:grid-cols-2">
              <Scale label="Mood" value={mood} onChange={setMood} />
              <Scale label="Energy" value={energy} onChange={setEnergy} />
            </div>
            <label className="mt-4 flex flex-col gap-1"><span className="label">One line about today</span>
              <textarea id="review-notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Calculus quiz went badly, need more practice" /></label>
          </Panel>
          <Button variant="primary" className="h-11" onClick={close} disabled={busy}>{busy ? "Planning tomorrow…" : "Close the day & plan tomorrow"}</Button>
        </>
      ) : (
        <>
          <section className="rounded-lg border border-accent/30 bg-accent/5 p-5">
            <div className="label !text-accent">Your coach</div>
            <p className="mt-2 text-[15px] leading-relaxed">{result.msg}</p>
          </section>
          {prop && <ProposalCard proposal={prop} />}
          <div className="flex gap-2"><Link href="/app/week"><Button variant="primary">See tomorrow</Button></Link><Link href="/app/command"><Button>Command Center</Button></Link></div>
        </>
      )}
    </div>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={value === n} onClick={() => onChange(n)} className={cx("num h-9 flex-1 rounded-md border text-sm", value === n ? "border-accent bg-accent/15 text-accent" : "border-line-2 text-dim hover:text-muted")}>{n}</button>
        ))}
      </div>
    </div>
  );
}
