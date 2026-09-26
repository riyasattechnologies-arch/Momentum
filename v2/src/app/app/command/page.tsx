"use client";
import { useMemo, useState } from "react";
import { askChiefOfStaff } from "@/lib/ai/client";
import { addDays, diffDays, fmtDate, mondayOf, today } from "@/lib/date";
import { goalHealth, risks, streakOf } from "@/lib/insights";
import { useStore } from "@/lib/store";
import { Gantt, Heatmap, Trend } from "@/components/charts";
import { OntologyGraph } from "@/components/OntologyGraph";
import { ProposalCard } from "@/components/ProposalCard";
import { Button, cx, Dot, HealthPill, Panel, Stat } from "@/components/ui";

export default function CommandPage() {
  const s = useStore();
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [logFilter, setLogFilter] = useState<"all" | "ai" | "user" | "system">("all");
  const t0 = today();
  const health = useMemo(() => s.goals.map((g) => goalHealth(g, s.tasks, s.milestones)), [s.goals, s.tasks, s.milestones]);
  const riskList = useMemo(() => (s.profile ? risks(s.profile, s.goals, s.tasks, s.milestones) : []), [s.profile, s.goals, s.tasks, s.milestones]);
  if (!s.profile) return null;

  const last14 = s.tasks.filter((t) => t.due >= addDays(t0, -14) && t.due < t0);
  const p14 = last14.filter((t) => t.tier === "primary");
  const primaryRate = p14.length ? Math.round((p14.filter((t) => t.status === "done").length / p14.length) * 100) : 0;
  const execRate = last14.length ? Math.round((last14.filter((t) => t.status === "done").reduce((a, t) => a + t.estimate, 0) / last14.reduce((a, t) => a + t.estimate, 0)) * 100) : 0;
  const planStart = s.tasks.reduce((m, t) => (t.earliest < m ? t.earliest : m), t0);
  const end = s.goals.reduce((m, g) => (g.targetDate > m ? g.targetDate : m), s.profile.semesterEnd);
  const semPct = Math.max(0, Math.min(100, Math.round((diffDays(s.profile.semesterStart, t0) / Math.max(1, diffDays(s.profile.semesterStart, s.profile.semesterEnd))) * 100)));

  async function fix(riskId: string, prompt: string) {
    setFixing(riskId);
    const st = useStore.getState();
    const r = await askChiefOfStaff(prompt, { profile: st.profile!, goals: st.goals, milestones: st.milestones, tasks: st.tasks, todayBlocks: st.days[t0] ?? [] });
    if (r.diff.length) {
      const id = useStore.getState().addProposal({ kind: "replan", rationale: r.rationale, diff: r.diff, source: r.source });
      setFixed((f) => ({ ...f, [riskId]: id }));
    } else {
      // Offline fallback for risks: pull the goal's overdue tasks into the next 10 days
      const risk = riskList.find((x) => x.id === riskId);
      const overdue = st.tasks.filter((t) => t.status === "todo" && t.due < t0 && (!risk?.goalId || t.goalId === risk.goalId)).sort((a, b) => (a.tier < b.tier ? -1 : 1)).slice(0, 12);
      if (overdue.length) {
        const id = useStore.getState().addProposal({
          kind: "replan", source: "offline",
          rationale: `Spread ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} over the next ${Math.ceil(overdue.length / 2)} working days, primary first.`,
          diff: overdue.map((t, i) => ({ op: "change", objectType: "task", id: t.id, label: t.title, before: { earliest: t.earliest, due: t.due }, after: { earliest: addDays(t0, 1 + Math.floor(i / 2)), due: addDays(t0, 3 + Math.floor(i / 2)) }, reason: "Catch-up slot" })),
        });
        setFixed((f) => ({ ...f, [riskId]: id }));
      }
    }
    setFixing(null);
  }

  const log = s.log.filter((l) => logFilter === "all" || l.actor === logFilter).slice(0, 40);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label !text-accent">Command Center</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{s.profile.name}'s semester, at a glance</h1>
        </div>
        <div className="w-full max-w-xs">
          <div className="num flex justify-between text-[11px] text-dim"><span>SEMESTER {s.profile.semesterNumber}</span><span>{semPct}% ELAPSED</span></div>
          <div className="mt-1 h-1.5 rounded bg-line"><div className="h-full rounded bg-accent" style={{ width: `${semPct}%` }} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Goals on track" value={`${health.filter((h) => h.health === "on track").length}/${health.length}`} tone={health.some((h) => h.health === "off track") ? "bad" : health.some((h) => h.health === "at risk") ? "warn" : "good"} />
        <Stat label="Execution · 14d" value={`${execRate}%`} sub="planned minutes done" tone={execRate >= 80 ? "good" : execRate >= 55 ? "warn" : "bad"} />
        <Stat label="Primary hit rate" value={`${primaryRate}%`} sub="last 14 days" tone={primaryRate >= 80 ? "good" : primaryRate >= 55 ? "warn" : "bad"} />
        <Stat label="Streak" value={`${streakOf(s.tasks)}d`} />
        <Stat label="Open risks" value={riskList.length} tone={riskList.some((r) => r.severity === "high") ? "bad" : riskList.length ? "warn" : "good"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Goal health" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="label border-b border-line text-left"><th className="px-4 py-2 font-normal">Goal</th><th className="px-2 py-2 font-normal">Status</th><th className="px-2 py-2 font-normal">Progress</th><th className="px-2 py-2 font-normal">Due so far</th><th className="px-4 py-2 font-normal">Next milestone</th></tr></thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.goal.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Dot color={h.goal.color} /><span className="font-medium">{h.goal.title}</span></div><div className="num mt-0.5 pl-4 text-[11px] text-dim">{h.goal.successMetric} · by {fmtDate(h.goal.targetDate, { month: "short", day: "numeric" })}</div></td>
                    <td className="px-2 py-3"><HealthPill health={h.health} /></td>
                    <td className="px-2 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded bg-line"><div className="h-full rounded" style={{ width: `${h.pct}%`, background: h.goal.color }} /></div><span className="num text-xs text-muted">{h.pct}%</span></div></td>
                    <td className="num px-2 py-3 text-xs text-muted">{h.dueDone}/{h.dueTotal} · {Math.round(h.doneMin / 60)}/{Math.round(h.plannedMin / 60)}h</td>
                    <td className="px-4 py-3 text-xs">{h.nextMilestone ? <><div>{h.nextMilestone.title}</div><div className="num text-dim">{diffDays(t0, h.nextMilestone.due)} days left</div></> : <span className="text-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={`Risk feed · ${riskList.length}`}>
          {riskList.length === 0 ? <p className="text-sm text-good">No risks. Keep the streak going.</p> : (
            <ul className="space-y-2.5">
              {riskList.slice(0, 6).map((r) => {
                const pid = fixed[r.id];
                const prop = pid ? s.proposals.find((p) => p.id === pid) : undefined;
                return (
                  <li key={r.id} className={cx("rounded-md border-l-2 bg-panel-2 px-3 py-2", r.severity === "high" ? "border-bad" : r.severity === "medium" ? "border-warn" : "border-dim")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm">{r.title}</div>
                        <div className="num text-[11px] text-dim">{r.severity.toUpperCase()} · {r.detail}</div>
                      </div>
                      {!prop && <Button size="sm" onClick={() => fix(r.id, r.fixPrompt)} disabled={fixing === r.id}>{fixing === r.id ? "…" : "Fix"}</Button>}
                    </div>
                    {prop && <div className="mt-2"><ProposalCard proposal={prop} compact /></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Semester timeline" action={<span className="num text-[11px] text-dim">◆ milestone · red outline = overdue</span>}>
        <Gantt goals={s.goals} milestones={s.milestones} tasks={s.tasks} examWeeks={s.profile.examWeeks} start={mondayOf(planStart)} end={end} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Execution · planned vs done" className="lg:col-span-2" action={<span className="num text-[11px] text-dim"><span className="text-accent">━</span> done  <span>┅</span> planned</span>}>
          <Trend tasks={s.tasks} />
        </Panel>
        <Panel title="Workload · next 4 weeks">
          <Heatmap tasks={s.tasks} start={t0} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Ontology">
          <OntologyGraph name={s.profile.name} goals={s.goals} milestones={s.milestones} tasks={s.tasks} courses={s.courses} />
        </Panel>
        <Panel title="Action log" action={
          <div className="flex gap-0.5">{(["all", "ai", "user", "system"] as const).map((f) => <button key={f} onClick={() => setLogFilter(f)} className={cx("num rounded px-1.5 py-0.5 text-[10px] uppercase", logFilter === f ? "bg-accent/15 text-accent" : "text-dim hover:text-muted")}>{f}</button>)}</div>
        }>
          <ol className="scroll-thin max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {log.map((l) => (
              <li key={l.id} className="grid grid-cols-[52px_1fr] gap-2 text-[13px]">
                <span className={cx("num text-[10px] uppercase", l.actor === "ai" ? "text-accent" : l.actor === "user" ? "text-good" : "text-dim")}>{l.actor}</span>
                <div className="min-w-0">
                  <div>{l.action}</div>
                  {l.reason && <div className="truncate text-[11px] text-dim">{l.reason}</div>}
                  <div className="num text-[10px] text-dim">{new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
