"use client";
// Client side of the AI layer: try Gemini through /api/ai, fall back to the offline engine.
import { addDays, mondayOf, today, uid } from "../date";
import { defaultProfile, parseIntakeOffline, type IntakeResult } from "../intake";
import { fitToBudget, generatePlan, GOAL_COLORS, offlineFeedback, defaultExamWeeks } from "../planner";
import type { CoachStyle, Course, DiffItem, Goal, Milestone, Profile, Task, TimeBlock } from "../types";

let status: Promise<boolean> | null = null;
export function aiEnabled(): Promise<boolean> {
  if (!status) status = fetch("/api/ai").then((r) => r.json()).then((j) => Boolean(j.enabled)).catch(() => false);
  return status;
}

async function call<T>(agent: string, payload: unknown): Promise<T | null> {
  if (!(await aiEnabled())) return null;
  try {
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent, payload }) });
    const j = await r.json();
    return r.ok ? (j.data as T) : null;
  } catch {
    return null;
  }
}

// ---------- Intake ----------
type AIIntake = Omit<Profile, "maxFocus" | "reminderLead" | "remindersOn" | "examWeeks" | "activeDays"> & {
  activeDays: number[];
  courses: { code: string; name: string; credits: number; difficulty: number }[];
  events: { title: string; kind: "class" | "work" | "gym" | "commute" | "other"; courseCode?: string | null; weekdays: number[]; start: string; end: string }[];
  goals: { title: string; why: string; category: Goal["category"]; targetDate: string; successMetric: string; priority: number }[];
};

export async function parseIntake(answers: Record<string, string>): Promise<{ result: IntakeResult; source: "gemini" | "offline" }> {
  const ai = await call<AIIntake>("intake", { today: today(), answers });
  if (!ai) return { result: parseIntakeOffline(answers), source: "offline" };
  const base = defaultProfile();
  const profile: Profile = {
    ...base,
    name: ai.name, program: ai.program, university: ai.university, semesterNumber: ai.semesterNumber, semesterStart: ai.semesterStart, semesterEnd: ai.semesterEnd,
    wake: ai.wake, sleep: ai.sleep, peakEnergy: ai.peakEnergy, weeklyHours: ai.weeklyHours, activeDays: ai.activeDays as Profile["activeDays"], coachStyle: ai.coachStyle,
  };
  profile.examWeeks = defaultExamWeeks(profile);
  const courses: Course[] = ai.courses.map((c) => ({ id: uid(), code: c.code.toUpperCase(), name: c.name, credits: c.credits, difficulty: Math.round(c.difficulty), targetGrade: "A" }));
  const events = ai.events.map((e) => {
    const course = courses.find((c) => c.code === (e.courseCode ?? "").toUpperCase());
    return { id: uid(), title: e.title, kind: e.kind, courseId: course?.id, weekdays: e.weekdays as Profile["activeDays"], start: e.start, end: e.end };
  });
  const goals: Goal[] = ai.goals.slice(0, 5).map((g, i) => ({ id: uid(), title: g.title, why: g.why, category: g.category, targetDate: g.targetDate, successMetric: g.successMetric, priority: Math.min(3, Math.max(1, g.priority)) as 1 | 2 | 3, color: GOAL_COLORS[i % GOAL_COLORS.length] }));
  return { result: { profile, courses, events, goals }, source: "gemini" };
}

// ---------- Plan ----------
type AIPlan = { summary: string; goals: { goalId: string; milestones: { title: string; due: string; definitionOfDone: string; tasks: { title: string; tier: Task["tier"]; estimate: number; energy: Task["energy"]; earliest: string; due: string; courseCode?: string | null }[] }[] }[] };

export async function proposePlan(profile: Profile, courses: Course[], goals: Goal[]): Promise<{ milestones: Milestone[]; tasks: Task[]; summary: string; source: "gemini" | "offline" }> {
  const start = mondayOf(today() < profile.semesterStart ? profile.semesterStart : today());
  const offline = generatePlan(profile, courses, goals);
  const ai = await call<AIPlan>("plan", { planStart: start, today: today(), profile, courses, goals: goals.map(({ color: _c, ...g }) => g), examWeeks: profile.examWeeks });
  if (!ai) return { ...offline, source: "offline" };

  const milestones: Milestone[] = [];
  const tasks: Task[] = [];
  const detailEnd = addDays(start, 27);
  for (const g of ai.goals) {
    const goal = goals.find((x) => x.id === g.goalId);
    if (!goal) continue;
    g.milestones.forEach((m, order) => {
      const ms: Milestone = { id: uid(), goalId: goal.id, title: m.title, due: m.due, definitionOfDone: m.definitionOfDone, status: "open", order };
      milestones.push(ms);
      for (const t of m.tasks) {
        if (t.due < t.earliest || t.earliest > detailEnd) continue;
        const course = courses.find((c) => c.code === (t.courseCode ?? "").toUpperCase());
        tasks.push({ id: uid(), goalId: goal.id, milestoneId: ms.id, courseId: course?.id, title: t.title, tier: t.tier, estimate: Math.round(t.estimate / 5) * 5, energy: t.energy, earliest: t.earliest < start ? start : t.earliest, due: t.due, status: "todo", source: "ai" });
      }
    });
  }
  if (!milestones.length) return { ...offline, source: "offline" };
  // Weeks after the detailed window: offline weekly targets, attached to the AI's milestones
  for (const t of offline.tasks.filter((t) => t.earliest > detailEnd)) {
    const ms = milestones.filter((m) => m.goalId === t.goalId).sort((a, b) => (a.due < b.due ? -1 : 1)).find((m) => m.due >= t.earliest);
    tasks.push({ ...t, milestoneId: ms?.id });
  }
  fitToBudget(tasks, profile.weeklyHours);
  return { milestones, tasks, summary: ai.summary, source: "gemini" };
}

// ---------- Chat / negotiation ----------
export interface ChatResult {
  reply: string;
  rationale: string;
  diff: DiffItem[];
  source: "gemini" | "offline";
}

export async function askChiefOfStaff(message: string, ctx: { profile: Profile; goals: Goal[]; milestones: Milestone[]; tasks: Task[]; todayBlocks: TimeBlock[] }): Promise<ChatResult> {
  const t0 = today();
  const window = ctx.tasks.filter((t) => (t.status === "todo" && t.due >= addDays(t0, -10) && t.earliest <= addDays(t0, 28)));
  const ai = await call<{ reply: string; intent: string; rationale: string; diff: { op: DiffItem["op"]; id?: string | null; label: string; after?: Partial<Task> | null; reason: string }[] }>("revise", {
    today: t0,
    message,
    profile: { name: ctx.profile.name, weeklyHours: ctx.profile.weeklyHours, activeDays: ctx.profile.activeDays, coachStyle: ctx.profile.coachStyle },
    goals: ctx.goals.map((g) => ({ id: g.id, title: g.title, targetDate: g.targetDate })),
    milestones: ctx.milestones.filter((m) => m.status !== "done").map((m) => ({ id: m.id, goalId: m.goalId, title: m.title, due: m.due })),
    tasks: window.slice(0, 160).map((t) => ({ id: t.id, goalId: t.goalId, title: t.title, tier: t.tier, estimate: t.estimate, earliest: t.earliest, due: t.due })),
    todaySchedule: ctx.todayBlocks.map((b) => ({ start: b.start, end: b.end, title: b.title, kind: b.kind, state: b.state })),
  });
  if (ai) {
    const ids = new Set(ctx.tasks.map((t) => t.id));
    const diff: DiffItem[] = ai.diff
      .filter((d) => d.op === "add" || (d.id && ids.has(d.id)))
      .map((d) => {
        const before = d.id ? ctx.tasks.find((t) => t.id === d.id) : undefined;
        return { op: d.op, objectType: "task", id: d.id ?? undefined, label: d.label || before?.title || "Task", before: before ? { title: before.title, tier: before.tier, estimate: before.estimate, earliest: before.earliest, due: before.due } : undefined, after: d.after ?? undefined, reason: d.reason };
      });
    return { reply: ai.reply, rationale: ai.rationale || ai.reply, diff: ai.intent === "change" ? diff : [], source: "gemini" };
  }
  return offlineAnswer(message, ctx);
}

function offlineAnswer(message: string, ctx: { profile: Profile; goals: Goal[]; tasks: Task[]; todayBlocks: TimeBlock[] }): ChatResult {
  const s = message.toLowerCase();
  const fb = offlineFeedback(message, ctx.tasks, ctx.goals);
  if (fb) return { reply: fb.rationale + " Review the changes below and approve them if they look right.", rationale: fb.rationale, diff: fb.diff, source: "offline" };
  if (/what.*(do|now|next)|right now|next task/.test(s)) {
    const now = new Date();
    const hm = now.getHours() * 60 + now.getMinutes();
    const next = ctx.todayBlocks.find((b) => b.kind === "task" && b.state !== "done" && b.state !== "skipped" && Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3)) > hm);
    return { reply: next ? `Next up: ${next.title}, ${next.start}–${next.end}. Start it now and mark it done when you finish.` : "Nothing left on today's schedule. Do a secondary task from tomorrow, or rest.", rationale: "", diff: [], source: "offline" };
  }
  if (/on track|how am i|progress|behind/.test(s)) {
    const due = ctx.tasks.filter((t) => t.due < today());
    const done = due.filter((t) => t.status === "done").length;
    return { reply: `You've finished ${done} of ${due.length} tasks that were due so far (${due.length ? Math.round((done / due.length) * 100) : 100}%). The Command Center shows each goal's status and the risks to fix.`, rationale: "", diff: [], source: "offline" };
  }
  return {
    reply: "In offline mode I understand: “lighten October”, “I'm sick until Wednesday”, “move mock interviews to weekends”, “more time on calculus”, “drop LinkedIn”, “add hackathon prep on Oct 18”, “what should I do now?” and “am I on track?”. Add a Gemini key to talk to me freely.",
    rationale: "",
    diff: [],
    source: "offline",
  };
}

// ---------- Coach ----------
export async function coachMessage(style: CoachStyle, name: string, kind: "morning" | "evening", context: unknown): Promise<{ headline: string; body: string } | null> {
  return call<{ headline: string; body: string }>("coach", { style, name, kind, context });
}
