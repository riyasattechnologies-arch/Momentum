// Goal health, risk flags and coach messages (offline versions).
import { addDays, diffDays, fmtTime, mondayOf, today } from "./date";
import { weeklyMinutes } from "./planner";
import type { CoachStyle, Goal, Milestone, Profile, Task, TimeBlock } from "./types";


export type Health = "on track" | "at risk" | "off track";

export interface GoalHealth {
  goal: Goal;
  health: Health;
  pct: number; // done / all tasks
  dueDone: number;
  dueTotal: number;
  plannedMin: number;
  doneMin: number;
  nextMilestone?: Milestone;
  overdueMilestones: Milestone[];
}

export function goalHealth(goal: Goal, tasks: Task[], milestones: Milestone[], on = today()): GoalHealth {
  const gt = tasks.filter((t) => t.goalId === goal.id && t.status !== "skipped");
  const due = gt.filter((t) => t.due < on || (t.due === on && t.status === "done"));
  const dueDone = due.filter((t) => t.status === "done");
  const plannedMin = due.reduce((a, t) => a + t.estimate, 0);
  const doneMin = dueDone.reduce((a, t) => a + t.estimate, 0);
  const gm = milestones.filter((m) => m.goalId === goal.id).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdueMilestones = gm.filter((m) => m.status !== "done" && m.due < on && tasks.some((t) => t.milestoneId === m.id && t.status === "todo"));
  const ratio = plannedMin ? doneMin / plannedMin : 1;
  const health: Health = ratio >= 0.8 && overdueMilestones.length === 0 ? "on track" : ratio >= 0.55 && overdueMilestones.length <= 1 ? "at risk" : "off track";
  return {
    goal,
    health,
    pct: gt.length ? Math.round((gt.filter((t) => t.status === "done").length / gt.length) * 100) : 0,
    dueDone: dueDone.length,
    dueTotal: due.length,
    plannedMin,
    doneMin,
    nextMilestone: gm.find((m) => m.status !== "done" && m.due >= on),
    overdueMilestones,
  };
}

export interface Risk {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  goalId?: string;
  fixPrompt: string;
}

export function risks(profile: Profile, goals: Goal[], tasks: Task[], milestones: Milestone[], on = today()): Risk[] {
  const out: Risk[] = [];
  for (const g of goals) {
    const h = goalHealth(g, tasks, milestones, on);
    for (const m of h.overdueMilestones) {
      const left = tasks.filter((t) => t.milestoneId === m.id && t.status === "todo").length;
      out.push({ id: `ms-${m.id}`, severity: "high", title: `Milestone overdue: ${m.title}`, detail: `${g.title} · due ${m.due} · ${left} tasks left`, goalId: g.id, fixPrompt: `The milestone "${m.title}" is overdue. Reschedule its remaining tasks over the next 2 weeks without breaking other primary tasks.` });
    }
    if (h.health === "off track" && !h.overdueMilestones.length) out.push({ id: `g-${g.id}`, severity: "high", title: `${g.title} is off track`, detail: `${Math.round((h.doneMin / Math.max(1, h.plannedMin)) * 100)}% of planned minutes done so far`, goalId: g.id, fixPrompt: `My goal "${g.title}" is off track. Rebalance the next 2 weeks so I catch up.` });
    const soon = h.nextMilestone;
    if (soon && diffDays(on, soon.due) <= 5) {
      const mt = tasks.filter((t) => t.milestoneId === soon.id);
      const done = mt.filter((t) => t.status === "done").length;
      if (mt.length && done / mt.length < 0.6) out.push({ id: `soon-${soon.id}`, severity: "medium", title: `${soon.title} due in ${diffDays(on, soon.due)} days`, detail: `${done}/${mt.length} tasks done`, goalId: g.id, fixPrompt: `"${soon.title}" is due soon and only ${done}/${mt.length} tasks are done. What should I prioritise?` });
    }
  }
  const missedPrimary = tasks.filter((t) => t.tier === "primary" && t.status === "todo" && t.due < on && t.due >= addDays(on, -7));
  if (missedPrimary.length >= 2) out.push({ id: "missed-primary", severity: "medium", title: `${missedPrimary.length} primary tasks missed this week`, detail: missedPrimary.slice(0, 2).map((t) => t.title).join(" · "), fixPrompt: "I missed several primary tasks this week. Reschedule them over the next few days." });
  for (let i = 0; i < 3; i++) {
    const ws = addDays(mondayOf(on), i * 7);
    const min = weeklyMinutes(tasks.filter((t) => t.status === "todo" || t.earliest >= on), ws);
    if (min > profile.weeklyHours * 60 * 1.05) out.push({ id: `load-${ws}`, severity: "low", title: `Week of ${ws} is overloaded`, detail: `${Math.round(min / 60)} h planned vs ${profile.weeklyHours} h available`, fixPrompt: `Lighten the week of ${ws}; it has ${Math.round(min / 60)} hours planned.` });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------- Coach ----------
const TONE: Record<CoachStyle, { open: string[]; missed: string; done: string; nudge: string }> = {
  gentle: { open: ["Good morning, {name}.", "Morning, {name}. One step at a time today."], missed: "Yesterday slipped and that's okay. The smallest restart is enough.", done: "Everything done. Be proud of today, {name}, and rest.", nudge: "Whenever you're ready, {name}: {task} is waiting. Even 10 minutes counts." },
  coach: { open: ["Game day, {name}.", "Let's go, {name}."], missed: "We lost yesterday. No drama, we win today.", done: "Clean sweep, {name}. Same standard tomorrow.", nudge: "{name}, it's time: {task}. Start the timer, momentum does the rest." },
  drill: { open: ["{name}. Up.", "No excuses today, {name}."], missed: "You skipped yesterday. That's the last time this week.", done: "All done. Acceptable. Tomorrow, same standard.", nudge: "{task}. Now. Not in five minutes, {name}." },
};

export function morningBrief(style: CoachStyle, name: string, blocks: TimeBlock[], tasks: Task[], missedYesterday: boolean, risk?: Risk): { headline: string; body: string } {
  const tone = TONE[style];
  const tb = blocks.filter((b) => b.kind === "task" && b.state !== "done");
  const byTier = (tier: string) => tb.map((b) => tasks.find((t) => t.id === b.taskId)).filter((t, i, a): t is Task => !!t && t.tier === tier && a.findIndex((x) => x?.id === t.id) === i);
  const p = byTier("primary");
  const s = byTier("secondary");
  const classes = blocks.filter((b) => b.kind === "class");
  if (!tb.length) return { headline: tone.done.replaceAll("{name}", name), body: classes.length ? `Classes today: ${classes.map((c) => `${c.title} ${fmtTime(c.start)}`).join(", ")}.` : "Nothing scheduled. Rest or get ahead on a secondary task." };
  const open = tone.open[new Date().getDate() % tone.open.length].replaceAll("{name}", name);
  const one = p[0] ?? s[0];
  const first = tb[0];
  const parts = [
    `${missedYesterday ? tone.missed + " " : ""}Your one thing today: ${one.title}.`,
    s.length ? `Then: ${s.slice(0, 2).map((t) => t.title).join("; ")}.` : "",
    classes.length ? `Classes: ${classes.map((c) => `${c.title} ${fmtTime(c.start)}`).join(", ")}.` : "",
    `First block ${fmtTime(first.start)}.`,
    risk ? `Watch: ${risk.title}.` : "",
  ].filter(Boolean);
  return { headline: open, body: parts.join(" ") };
}

export function nudgeText(style: CoachStyle, name: string, task: string): string {
  return TONE[style].nudge.replaceAll("{name}", name).replaceAll("{task}", task);
}

export function streakOf(tasks: Task[]): number {
  const days = new Set(tasks.filter((t) => t.status === "done" && t.doneAt).map((t) => t.doneAt!));
  let d = today();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

