"use client";
// Demo student with 5 weeks of history, so every screen has real-looking data.
import { addDays, mondayOf, today, uid } from "./date";
import { parseIntakeOffline, QUESTIONS } from "./intake";
import { generatePlan, offlineFeedback, applyDiff } from "./planner";
import { useStore } from "./store";
import type { ActionLogEntry, CheckIn, PlanVersion } from "./types";

export function buildDemoData() {
  const answers = Object.fromEntries(QUESTIONS.map((q) => [q.key, q.example]));
  answers.name = "Aisha";
  const r = parseIntakeOffline(answers);
  const t0 = today();
  // Make sure the demo semester has started ~5 weeks ago, whatever today's date is
  r.profile.semesterStart = addDays(t0, -33);
  r.profile.semesterEnd = addDays(t0, 76);
  r.profile.examWeeks = [mondayOf(addDays(t0, 14)), mondayOf(addDays(t0, 70))];
  r.goals[1].targetDate = r.profile.semesterEnd;
  r.goals[2].targetDate = addDays(t0, 55);
  const plan = generatePlan(r.profile, r.courses, r.goals, r.profile.semesterStart);

  // History: completion rate per goal (career lags so the Command Center shows a risk)
  const rate: Record<string, number> = { [r.goals[0].id]: 0.52, [r.goals[1].id]: 0.9, [r.goals[2].id]: 0.82 };
  let i = 0;
  const pastMs = new Set(plan.milestones.filter((m) => m.due < t0 && m.goalId !== r.goals[0].id).map((m) => m.id));
  for (const t of plan.tasks) {
    if (t.earliest < t0) {
      i++;
      const pr = rate[t.goalId] ?? 0.8;
      const inClosedMilestone = t.milestoneId && pastMs.has(t.milestoneId);
      const recent = t.earliest >= addDays(t0, -4); // keep a live streak
      if (inClosedMilestone || recent || ((i * 37) % 100) / 100 < pr) {
        t.status = "done";
        t.doneAt = t.earliest;
      }
    }
  }
  for (const m of plan.milestones) {
    const mt = plan.tasks.filter((t) => t.milestoneId === m.id);
    if (mt.length && mt.every((t) => t.status === "done")) m.status = "done";
  }

  // A negotiated change (v2)
  const fb = offlineFeedback("move mock interviews to weekends", plan.tasks, r.goals, t0) ?? { diff: [], rationale: "" };
  const after = applyDiff(plan.tasks, plan.milestones, fb.diff);

  const agreedAt = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const plans: PlanVersion[] = [
    { id: uid(), version: 2, summary: "Mock interviews moved to weekends", agreedAt: agreedAt(12), taskCount: after.tasks.length, milestoneCount: after.milestones.length, weeklyMinutes: r.profile.weeklyHours * 60 },
    { id: uid(), version: 1, summary: plan.summary, agreedAt: agreedAt(33), taskCount: plan.tasks.length, milestoneCount: plan.milestones.length, weeklyMinutes: r.profile.weeklyHours * 60 },
  ];
  const log: ActionLogEntry[] = [
    { id: uid(), at: agreedAt(12), actor: "user", action: "Agreed & locked plan v2", objectType: "plan", reason: "Mock interviews moved to weekends" },
    { id: uid(), at: agreedAt(12), actor: "ai", action: "Proposed changes", objectType: "proposal", reason: fb.rationale || "Moved tasks to weekends" },
    { id: uid(), at: agreedAt(33), actor: "user", action: "Agreed & locked plan v1", objectType: "plan", reason: plan.summary },
    { id: uid(), at: agreedAt(33), actor: "ai", action: "Proposed a semester plan", objectType: "proposal", reason: plan.summary },
    { id: uid(), at: agreedAt(33), actor: "user", action: "Saved intake summary", objectType: "profile", reason: "3 goals, 4 courses, 5 fixed events" },
  ];
  const checkins: CheckIn[] = Array.from({ length: 10 }, (_, k) => ({ date: addDays(t0, -(k + 1)), type: "evening", mood: 3 + ((k * 7) % 3), energy: 2 + ((k * 5) % 4), notes: k === 2 ? "Calculus quiz went badly, need more practice" : "" }));

  return {
    stage: "active" as const,
    demo: true,
    profile: r.profile,
    courses: r.courses,
    events: r.events,
    goals: r.goals,
    milestones: after.milestones,
    tasks: after.tasks,
    plans,
    proposals: [],
    days: {},
    checkins,
    log,
    chat: [],
    intakeAnswers: answers,
    reminded: {},
  };
}

export function loadDemo() {
  useStore.setState({ ...buildDemoData(), days: {} });
  useStore.getState().ensureDay(today());
}
