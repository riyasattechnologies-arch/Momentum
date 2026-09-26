"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { proposePlan } from "@/lib/ai/client";
import { addDays, fmtDate, mondayOf, today } from "@/lib/date";
import { useStore } from "@/lib/store";
import { ChatBody } from "@/components/ChatDrawer";
import { Gantt, LoadBars } from "@/components/charts";
import { ProposalCard } from "@/components/ProposalCard";
import { Button, Dot, Panel, Stat, TierBadge, cx } from "@/components/ui";

export default function PlanPage() {
  const s = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const planStart = useMemo(() => s.tasks.reduce((m, t) => (t.earliest < m ? t.earliest : m), today()), [s.tasks]);
  const [week, setWeek] = useState(mondayOf(today() < planStart ? planStart : today()));
  if (!s.profile) return null;
  const p = s.profile;
  const draft = s.stage === "proposal";
  const end = s.goals.reduce((m, g) => (g.targetDate > m ? g.targetDate : m), p.semesterEnd);
  const pending = s.proposals.filter((x) => x.status === "pending" && x.kind !== "initial");
  const weekTasks = s.tasks.filter((t) => t.earliest >= week && t.earliest <= addDays(week, 6)).sort((a, b) => (a.earliest < b.earliest ? -1 : a.earliest > b.earliest ? 1 : a.tier.localeCompare(b.tier)));
  const weeksAll = [...new Set(s.tasks.map((t) => mondayOf(t.earliest)))];
  const avg = weeksAll.length ? s.tasks.reduce((a, t) => a + t.estimate, 0) / 60 / weeksAll.length : 0;
  const initial = s.proposals.find((x) => x.kind === "initial");

  async function regenerate() {
    setBusy(true);
    const st = useStore.getState();
    const plan = await proposePlan(st.profile!, st.courses, st.goals);
    const id = st.addProposal({ kind: "initial", rationale: plan.summary, diff: [], source: plan.source, plan: { milestones: plan.milestones, tasks: plan.tasks } });
    useStore.getState().decideProposal(id, true);
    setBusy(false);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label !text-accent">{draft ? "Step 03 · Agree your plan" : `Plan · v${s.plans[0]?.version ?? 1} · agreed ${s.plans[0] ? fmtDate(s.plans[0].agreedAt.slice(0, 10)) : ""}`}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{draft ? "Here's my proposal. Push back until it feels right." : "Your semester plan"}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{draft ? (initial?.rationale ?? "") : "Changes go through proposals: tell your chief of staff what changed, review the diff, approve it, and a new version is locked."}</p>
        </div>
        {draft ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => s.set({ stage: "review" })}>← Edit answers</Button>
            <Button onClick={regenerate} disabled={busy}>{busy ? "Rebuilding…" : "Regenerate"}</Button>
            <Button variant="primary" onClick={() => { s.agreeAndLock(initial?.rationale); s.rebuildDay(today()); router.push("/app/today"); }}>Agree &amp; lock v1</Button>
          </div>
        ) : null}
      </div>

      {draft && <div className="rounded-md border border-warn/40 bg-warn/5 px-4 py-2.5 text-sm text-warn">Draft: nothing is scheduled until you click <b>Agree &amp; lock</b>. After that, every change needs your approval.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Goals" value={s.goals.length} sub={s.goals.map((g) => g.category).join(" · ")} />
        <Stat label="Milestones" value={s.milestones.length} sub={`${s.milestones.filter((m) => m.status === "done").length} done`} />
        <Stat label="Tasks" value={s.tasks.length} sub={`${weeksAll.length} weeks`} />
        <Stat label="Avg load" value={`${avg.toFixed(1)} h`} sub={`of ${p.weeklyHours} h / week available`} tone={avg > p.weeklyHours ? "bad" : "good"} />
      </div>

      {pending.length > 0 && (
        <Panel title={`Pending proposals · ${pending.length}`}>
          <div className="grid gap-3 lg:grid-cols-2">{pending.map((pr) => <ProposalCard key={pr.id} proposal={pr} />)}</div>
        </Panel>
      )}

      <Panel title="Semester timeline" action={<span className="num text-[11px] text-dim">◆ milestone · ● goal date · shaded = exam weeks</span>}>
        <Gantt goals={s.goals} milestones={s.milestones} tasks={s.tasks} examWeeks={p.examWeeks} start={mondayOf(planStart)} end={end} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-5">
          <Panel title="Weekly load · hours planned" action={<span className="num text-[11px] text-dim">click a week to inspect</span>}>
            <LoadBars tasks={s.tasks} weeklyHours={p.weeklyHours} start={planStart} weeks={12} onPick={setWeek} picked={week} />
          </Panel>
          <Panel title={`Week of ${fmtDate(week, { month: "short", day: "numeric" })}`} action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">←</Button>
              <Button size="sm" variant="ghost" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">→</Button>
            </div>}>
            {weekTasks.length ? (
              <ul className="divide-y divide-line">
                {weekTasks.map((t) => {
                  const g = s.goals.find((x) => x.id === t.goalId);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                      <TierBadge tier={t.tier} />
                      <span className={cx("min-w-0 flex-1 truncate", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                      {g && <Dot color={g.color} />}
                      <span className="num w-20 text-right text-[11px] text-dim">{fmtDate(t.earliest, { weekday: "short" })} · {t.estimate}m</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No tasks start this week.</p>}
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel title={draft ? "Negotiate" : "Change the plan"} pad={false} className="flex h-[520px] flex-col">
            <div className="h-[478px]"><ChatBody thread="planning" suggestions={["October has midterms, lighten it", "Move mock interviews to weekends", "More time on calculus", "Drop LinkedIn"]} placeholder="e.g. Next week is too heavy" /></div>
          </Panel>
          <Panel title="Milestones">
            <div className="space-y-4">
              {s.goals.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-medium"><Dot color={g.color} />{g.title}</div>
                  <ol className="space-y-1 border-l border-line pl-3">
                    {s.milestones.filter((m) => m.goalId === g.id).sort((a, b) => (a.due < b.due ? -1 : 1)).map((m) => (
                      <li key={m.id} className="text-[13px]">
                        <span className={cx(m.status === "done" ? "text-good" : m.due < today() ? "text-bad" : "text-text")}>{m.status === "done" ? "✓ " : ""}{m.title}</span>
                        <span className="num ml-2 text-[11px] text-dim">{fmtDate(m.due, { month: "short", day: "numeric" })}</span>
                        <div className="text-[11px] text-dim">{m.definitionOfDone}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Panel>
          {!draft && (
            <Panel title="Version history">
              <ol className="space-y-2">
                {s.plans.map((v) => (
                  <li key={v.id} className="flex gap-3 text-sm">
                    <span className="num text-accent">v{v.version}</span>
                    <div className="min-w-0">
                      <div className="truncate">{v.summary}</div>
                      <div className="num text-[11px] text-dim">{new Date(v.agreedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {v.taskCount} tasks · {v.milestoneCount} milestones</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
