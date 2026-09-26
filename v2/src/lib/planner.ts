// Offline planner + replanner. Used when no Gemini key is configured, and as a safety net
// when the AI response fails validation. Same output shape as the AI planner.
import { addDays, diffDays, mondayOf, parse, today, uid, weekday, iso } from "./date";
import type { Course, DiffItem, Energy, Goal, GoalCategory, Milestone, Profile, Task, Tier } from "./types";

type TT = { t: string; tier: Tier; min: number; e: Energy };
type Phase = { title: string; share: number; milestones: { title: string; dod: string }[]; tasks: TT[] };

const LIB: Record<GoalCategory, Phase[]> = {
  career: [
    { title: "Foundation", share: 0.25, milestones: [
      { title: "Target roles and 20 companies listed", dod: "Spreadsheet with 20 companies, role, deadline, link" },
      { title: "Resume v1 reviewed", dod: "Resume reviewed by a senior or the career centre" }],
      tasks: [
        { t: "Research 5 internship posts and list required skills", tier: "primary", min: 60, e: "medium" },
        { t: "Rewrite one resume section with measurable results", tier: "secondary", min: 45, e: "medium" },
        { t: "Update LinkedIn headline and About section", tier: "tertiary", min: 30, e: "low" },
        { t: "Book a career centre resume review", tier: "tertiary", min: 15, e: "low" }] },
    { title: "Skill building", share: 0.35, milestones: [
      { title: "Portfolio project MVP shipped", dod: "Deployed project with README and screenshots" },
      { title: "60 practice problems solved", dod: "Tracker shows 60 solved, 20 medium" }],
      tasks: [
        { t: "Solve 3 practice problems (arrays / strings)", tier: "primary", min: 75, e: "high" },
        { t: "Build one feature of your portfolio project", tier: "primary", min: 90, e: "high" },
        { t: "Watch one lecture on your weakest topic and take notes", tier: "secondary", min: 45, e: "medium" },
        { t: "Push code and write a short progress note", tier: "tertiary", min: 20, e: "low" }] },
    { title: "Applications", share: 0.25, milestones: [
      { title: "25 applications sent", dod: "25 tailored applications logged" },
      { title: "3 referrals requested", dod: "Messages sent to 3 alumni or engineers" }],
      tasks: [
        { t: "Send 3 tailored applications", tier: "primary", min: 75, e: "medium" },
        { t: "Message one alum for a referral", tier: "secondary", min: 20, e: "medium" },
        { t: "Log applications and follow up on old ones", tier: "tertiary", min: 20, e: "low" }] },
    { title: "Interviews", share: 0.15, milestones: [
      { title: "Interview-ready", dod: "5 STAR stories written, 2 mock interviews done" }],
      tasks: [
        { t: "Do a 30-minute mock interview", tier: "primary", min: 45, e: "high" },
        { t: "Write one STAR story", tier: "secondary", min: 30, e: "medium" },
        { t: "Solve one timed problem", tier: "tertiary", min: 40, e: "high" }] },
  ],
  academic: [
    { title: "Set up for success", share: 0.2, milestones: [
      { title: "Study system in place", dod: "Every course has a notes doc, flashcard deck and deadline list" }],
      tasks: [
        { t: "Put every deadline from all syllabi into the calendar", tier: "primary", min: 45, e: "medium" },
        { t: "Visit one professor's office hours", tier: "secondary", min: 30, e: "medium" },
        { t: "Set up a flashcard deck per course", tier: "tertiary", min: 30, e: "low" }] },
    { title: "Midterm push", share: 0.35, milestones: [
      { title: "Midterms prepared", dod: "2 past papers done per course under time" }],
      tasks: [
        { t: "Do one timed past-paper section", tier: "primary", min: 60, e: "high" },
        { t: "Review mistakes and log why you got them wrong", tier: "secondary", min: 30, e: "medium" },
        { t: "Flashcard review, 20 minutes", tier: "tertiary", min: 20, e: "low" }] },
    { title: "Finals", share: 0.45, milestones: [
      { title: "All assignments submitted on time", dod: "Zero late submissions this semester" },
      { title: "Finals prepared", dod: "One-page summary and 3 past papers per course" }],
      tasks: [
        { t: "Make a one-page summary of a hard topic", tier: "primary", min: 60, e: "high" },
        { t: "Teach a topic to a friend for 15 minutes", tier: "secondary", min: 25, e: "medium" },
        { t: "Flashcard review, 20 minutes", tier: "tertiary", min: 20, e: "low" }] },
  ],
  health: [
    { title: "Base", share: 0.35, milestones: [{ title: "Exercising 3x a week", dod: "3 sessions logged for 2 weeks straight" }],
      tasks: [
        { t: "Easy run or brisk walk, 25 minutes", tier: "primary", min: 30, e: "medium" },
        { t: "Full-body strength circuit", tier: "secondary", min: 35, e: "high" },
        { t: "Mobility and stretching, 15 minutes", tier: "tertiary", min: 15, e: "low" }] },
    { title: "Build", share: 0.45, milestones: [{ title: "Longest session so far", dod: "Complete a session 50% longer than week 1" }],
      tasks: [
        { t: "Interval session: 6 x 2 min hard, 2 min easy", tier: "primary", min: 40, e: "high" },
        { t: "Long easy session", tier: "secondary", min: 50, e: "medium" },
        { t: "Plan tomorrow's meals", tier: "tertiary", min: 10, e: "low" }] },
    { title: "Test", share: 0.2, milestones: [{ title: "Goal test done", dod: "Time trial or goal event completed" }],
      tasks: [
        { t: "Goal-pace session", tier: "primary", min: 40, e: "high" },
        { t: "Recovery session", tier: "tertiary", min: 25, e: "low" }] },
  ],
  skill: [
    { title: "Fundamentals", share: 0.35, milestones: [{ title: "Core concepts learned", dod: "Finished the first course module and its exercises" }],
      tasks: [
        { t: "Complete one lesson of your course", tier: "primary", min: 60, e: "high" },
        { t: "Do the exercises from today's lesson", tier: "secondary", min: 40, e: "medium" },
        { t: "Write 5 notes on what you learned", tier: "tertiary", min: 15, e: "low" }] },
    { title: "Practice", share: 0.4, milestones: [{ title: "First project built", dod: "A small project that uses the skill end to end" }],
      tasks: [
        { t: "Work on your practice project", tier: "primary", min: 75, e: "high" },
        { t: "Study one example from an expert", tier: "secondary", min: 30, e: "medium" },
        { t: "Share progress with someone", tier: "tertiary", min: 10, e: "low" }] },
    { title: "Show it", share: 0.25, milestones: [{ title: "Portfolio piece published", dod: "Public link to the finished work" }],
      tasks: [
        { t: "Polish and publish your project", tier: "primary", min: 60, e: "high" },
        { t: "Ask for feedback from one person ahead of you", tier: "secondary", min: 20, e: "medium" }] },
  ],
  personal: [
    { title: "Clarify", share: 0.3, milestones: [{ title: "Goal defined", dod: "One sentence of what done looks like, plus the first 5 steps" }],
      tasks: [
        { t: "Write what success looks like in one sentence", tier: "primary", min: 20, e: "medium" },
        { t: "List the 5 biggest steps to the goal", tier: "secondary", min: 30, e: "medium" }] },
    { title: "Execute", share: 0.5, milestones: [{ title: "Halfway checkpoint", dod: "Half the steps completed" }],
      tasks: [
        { t: "Focused session on the current step", tier: "primary", min: 45, e: "high" },
        { t: "Remove one obstacle that slowed you down", tier: "secondary", min: 20, e: "low" }] },
    { title: "Finish", share: 0.2, milestones: [{ title: "Goal reached", dod: "Success sentence is true" }],
      tasks: [{ t: "Finish the last open item", tier: "primary", min: 45, e: "high" }] },
  ],
};

export const GOAL_COLORS = ["#4C9EFF", "#3DD68C", "#F2A33A", "#C38BFF", "#2FD3D0", "#FF7A8A"];

export function guessCategory(text: string): GoalCategory {
  const s = text.toLowerCase();
  if (/intern|job|career|resume|offer|interview|placement/.test(s)) return "career";
  if (/gpa|grade|exam|course|semester|class|study|pass/.test(s)) return "academic";
  if (/run|gym|fit|weight|health|sleep|marathon|10k|5k|workout/.test(s)) return "health";
  if (/learn|code|coding|language|guitar|design|skill|build|project|app/.test(s)) return "skill";
  return "personal";
}

export function defaultExamWeeks(p: Pick<Profile, "semesterStart" | "semesterEnd">): string[] {
  const s = mondayOf(p.semesterStart);
  const e = mondayOf(p.semesterEnd);
  return [addDays(s, 7 * 7), addDays(e, -7), e];
}

export interface PlanOut {
  milestones: Milestone[];
  tasks: Task[];
  summary: string;
}

export function weeklyMinutes(tasks: Task[], weekStart: string): number {
  const end = addDays(weekStart, 6);
  return tasks.filter((t) => t.earliest >= weekStart && t.earliest <= end && t.status !== "skipped").reduce((a, t) => a + t.estimate, 0);
}

export function generatePlan(profile: Profile, courses: Course[], goals: Goal[], startDate = today()): PlanOut {
  const start = mondayOf(startDate < profile.semesterStart ? profile.semesterStart : startDate);
  const exam = new Set(profile.examWeeks.length ? profile.examWeeks : defaultExamWeeks(profile));
  const milestones: Milestone[] = [];
  const tasks: Task[] = [];
  const mk = (p: Partial<Task> & Pick<Task, "goalId" | "title" | "tier" | "estimate" | "energy" | "earliest" | "due">): Task => ({ id: uid(), status: "todo", source: "ai", ...p });

  for (const goal of goals) {
    const lib = LIB[goal.category] ?? LIB.personal;
    const end = goal.targetDate > start ? goal.targetDate : addDays(start, 7 * 12);
    const totalWeeks = Math.max(2, Math.min(24, Math.ceil((diffDays(start, end) + 1) / 7)));
    let counts = lib.map((p) => Math.max(1, Math.round(p.share * totalWeeks)));
    while (counts.reduce((a, b) => a + b, 0) > totalWeeks && counts.some((c) => c > 1)) {
      const i = counts.indexOf(Math.max(...counts));
      counts[i]--;
    }
    while (counts.reduce((a, b) => a + b, 0) < totalWeeks) counts[Math.min(1, counts.length - 1)]++;
    counts = counts.slice(0, totalWeeks);

    let w = 0;
    let order = 0;
    lib.slice(0, counts.length).forEach((phase, pi) => {
      const phaseStart = addDays(start, w * 7);
      const phaseWeeks = counts[pi];
      const ms: Milestone[] = phase.milestones.map((m, mi) => {
        const at = Math.round(((mi + 1) / phase.milestones.length) * phaseWeeks) - 1;
        const due = [addDays(phaseStart, Math.max(0, at) * 7 + 4), end].sort()[0];
        return { id: uid(), goalId: goal.id, title: m.title, due, definitionOfDone: m.dod, status: "open", order: order++ };
      });
      milestones.push(...ms);
      for (let k = 0; k < phaseWeeks; k++) {
        const ws = addDays(start, w * 7);
        const isExam = exam.has(ws);
        const ms0 = ms.find((m) => m.due >= ws) ?? ms[ms.length - 1];
        const pick = phase.tasks.filter((t) => t.tier === "primary");
        const prim = pick[k % pick.length];
        const rest = phase.tasks.filter((t) => t.tier !== "primary");
        const chosen: TT[] = [prim, ...rest];
        if (goal.priority === 1 && pick.length > 1) chosen.push(pick[(k + 1) % pick.length]);
        for (const [i, tt] of chosen.entries()) {
          if (isExam && goal.category !== "academic" && tt.tier === "tertiary") continue;
          const est = isExam && goal.category !== "academic" ? Math.round(tt.min * 0.6 / 5) * 5 : tt.min;
          const earliest = addDays(ws, Math.min(4, i));
          const due = [addDays(ws, tt.tier === "primary" ? 4 : 6), end].sort()[0];
          if (earliest > end) continue;
          tasks.push(mk({ goalId: goal.id, milestoneId: ms0.id, title: tt.t, tier: i > 1 && tt.tier === "primary" ? "secondary" : tt.tier, estimate: est, energy: tt.e, earliest, due }));
        }
        w++;
      }
    });

    // Course work for academic goals
    if (goal.category === "academic") {
      for (let k = 0; k < totalWeeks; k++) {
        const ws = addDays(start, k * 7);
        const isExam = exam.has(ws);
        for (const c of courses) {
          const load = c.credits * c.difficulty; // 3..15ish
          const ps = Math.round(Math.min(120, 30 + load * 6) / 5) * 5;
          tasks.push(mk({ goalId: goal.id, courseId: c.id, title: isExam ? `${c.code}: exam prep, past paper under time` : `${c.code}: problem set / assignment work`, tier: "primary", estimate: isExam ? 90 : ps, energy: "high", earliest: addDays(ws, 1), due: addDays(ws, 4) }));
          tasks.push(mk({ goalId: goal.id, courseId: c.id, title: `${c.code}: review this week's lecture notes`, tier: "secondary", estimate: 30 + c.difficulty * 5, energy: "medium", earliest: addDays(ws, 2), due: addDays(ws, 6) }));
          if (c.difficulty >= 4) tasks.push(mk({ goalId: goal.id, courseId: c.id, title: `${c.code}: extra practice questions`, tier: "tertiary", estimate: 40, energy: "medium", earliest: addDays(ws, 3), due: addDays(ws, 6) }));
        }
      }
    }
  }

  // Weekly review
  const lastWeek = Math.max(1, ...goals.map((g) => Math.ceil((diffDays(start, g.targetDate) + 1) / 7))) ;
  for (let k = 0; k < Math.min(24, lastWeek); k++) {
    const ws = addDays(start, k * 7);
    tasks.push(mk({ goalId: goals[0]?.id ?? "", title: "Weekly review: score last week, plan next week", tier: "secondary", estimate: 20, energy: "low", earliest: addDays(ws, 5), due: addDays(ws, 6) }));
  }

  const weeks = [...new Set(tasks.map((t) => mondayOf(t.earliest)))];
  const dropped = fitToBudget(tasks, profile.weeklyHours);

  const avg = Math.round(weeks.reduce((a, ws) => a + weeklyMinutes(tasks, ws), 0) / Math.max(1, weeks.length) / 6) / 10;
  const summary = `${goals.length} goal${goals.length === 1 ? "" : "s"}, ${milestones.length} milestones, ${tasks.length} tasks over ${weeks.length} weeks. About ${avg} h of goal work a week against your ${profile.weeklyHours} h. Exam weeks are lighter for non-academic goals${dropped ? `; ${dropped} optional tasks were left out to fit your hours` : ""}.`;
  return { milestones, tasks, summary };
}


/** Mutates tasks so each week fits the budget: drop tertiary, then shrink secondary, then primary. Returns dropped count. */
export function fitToBudget(tasks: Task[], weeklyHours: number): number {
  const budget = weeklyHours * 60;
  const weeks = [...new Set(tasks.map((t) => mondayOf(t.earliest)))];
  let dropped = 0;
  for (const ws of weeks) {
    const inWeek = () => tasks.filter((t) => mondayOf(t.earliest) === ws && t.status === "todo");
    const total = () => inWeek().reduce((a, t) => a + t.estimate, 0);
    for (const t of inWeek().filter((t) => t.tier === "tertiary").sort((a, b) => b.estimate - a.estimate)) {
      if (total() <= budget) break;
      tasks.splice(tasks.indexOf(t), 1);
      dropped++;
    }
    for (const tier of ["secondary", "primary"] as Tier[]) {
      if (total() <= budget) break;
      const factor = Math.max(0.5, budget / total());
      for (const t of inWeek().filter((t) => t.tier === tier)) t.estimate = Math.max(15, Math.round((t.estimate * factor) / 5) * 5);
    }
  }
  return dropped;
}

// ---------------- Offline negotiation / replanning ----------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function parseWhen(text: string, base = today()): string | null {
  const s = text.toLowerCase();
  if (/\btomorrow\b/.test(s)) return addDays(base, 1);
  if (/\btoday\b/.test(s)) return base;
  if (/next week/.test(s)) return addDays(mondayOf(base), 7);
  const md = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/) || s.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (md) {
    const monStr = isNaN(Number(md[1])) ? md[1] : md[2];
    const day = Number(isNaN(Number(md[1])) ? md[2] : md[1]);
    const m = MONTHS.findIndex((x) => x.startsWith(monStr));
    let y = parse(base).getFullYear();
    const cand = iso(new Date(y, m, day));
    if (cand < addDays(base, -30)) y++;
    return iso(new Date(y, m, day));
  }
  const dn = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(s));
  if (dn >= 0) {
    let n = (dn - weekday(base) + 7) % 7;
    if (n === 0) n = 7;
    return addDays(base, n);
  }
  return null;
}

function monthRange(text: string, base: string): [string, string] | null {
  const s = text.toLowerCase();
  const m = MONTHS.findIndex((x) => new RegExp(`\\b(${x}|${x.slice(0, 3)})\\b(?!\\.?\\s*\\d)`).test(s));
  if (m >= 0) {
    let y = parse(base).getFullYear();
    if (m < parse(base).getMonth() - 2) y++;
    return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  }
  if (/this week/.test(s)) return [base, addDays(mondayOf(base), 6)];
  if (/next week/.test(s)) return [addDays(mondayOf(base), 7), addDays(mondayOf(base), 13)];
  return null;
}

function keywordMatch(title: string, phrase: string): boolean {
  const words = phrase.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "for", "all", "my", "tasks", "task", "sessions", "session"].includes(w));
  if (!words.length) return false;
  const t = title.toLowerCase();
  return words.some((w) => t.includes(w) || (w.endsWith("s") && t.includes(w.slice(0, -1))));
}

export interface FeedbackResult {
  rationale: string;
  diff: DiffItem[];
}

export function offlineFeedback(text: string, tasks: Task[], goals: Goal[], base = today()): FeedbackResult | null {
  const s = text.toLowerCase().trim();
  const open = tasks.filter((t) => t.status === "todo" && t.due >= addDays(base, -14));
  const label = (t: Task) => t.title;
  const diff: DiffItem[] = [];

  // Sick / away until X
  const away = s.match(/\b(sick|ill|away|travel(?:l)?ing|busy|off)\b.*?\b(until|till|through|thru)\b\s*(.+)$/);
  if (away) {
    const until = parseWhen(away[3], base);
    if (until) {
      const shift = diffDays(base, until) + 1;
      for (const t of open.filter((t) => t.earliest <= until && t.due >= base)) {
        if (t.tier === "tertiary") diff.push({ op: "remove", objectType: "task", id: t.id, label: label(t), reason: "Optional task dropped while you're away" });
        else diff.push({ op: "change", objectType: "task", id: t.id, label: label(t), before: { earliest: t.earliest, due: t.due }, after: { earliest: addDays(until, 1), due: addDays(t.due < until ? until : t.due, Math.min(shift, 3)) }, reason: `Moved to after ${until}` });
      }
      return { rationale: `You're out until ${until}. Primary and secondary tasks move to after that; optional ones are dropped. Milestones stay unless you ask.`, diff };
    }
  }

  // Lighten a period
  if (/\b(lighten|lighter|too (heavy|much|busy)|less|overload|reduce)\b/.test(s)) {
    const r = monthRange(s, base) ?? [base, addDays(base, 13)];
    const inR = open.filter((t) => t.earliest >= r[0] && t.earliest <= r[1]);
    for (const t of inR.filter((t) => t.tier === "tertiary")) diff.push({ op: "remove", objectType: "task", id: t.id, label: label(t), reason: "Optional, removed to lighten this period" });
    for (const t of inR.filter((t) => t.tier === "secondary")) {
      const est = Math.max(15, Math.round((t.estimate * 0.7) / 5) * 5);
      if (est < t.estimate) diff.push({ op: "change", objectType: "task", id: t.id, label: label(t), before: { estimate: t.estimate }, after: { estimate: est }, reason: "Shortened by 30%" });
    }
    if (diff.length) return { rationale: `Lightened ${r[0]} to ${r[1]}: optional tasks removed and secondary tasks shortened. Primary tasks stay, so your goal dates don't move.`, diff };
  }

  // Move X to weekends
  const mv = s.match(/\bmove\s+(.+?)\s+to\s+(the\s+)?(weekends?|saturdays?|sundays?)\b/);
  if (mv) {
    const day = /sun/.test(mv[3]) ? 6 : 5;
    for (const t of open.filter((t) => keywordMatch(t.title, mv[1]))) {
      const ws = mondayOf(t.earliest);
      const d = addDays(ws, day);
      diff.push({ op: "change", objectType: "task", id: t.id, label: label(t), before: { earliest: t.earliest, due: t.due }, after: { earliest: d, due: addDays(ws, 6) }, reason: "Moved to the weekend" });
    }
    if (diff.length) return { rationale: `Moved ${diff.length} "${mv[1]}" task${diff.length === 1 ? "" : "s"} to weekends.`, diff };
  }

  // More time on X
  const more = s.match(/\bmore\s+(time|focus|practice)\s+(on|for)\s+(.+)$/);
  if (more) {
    for (const t of open.filter((t) => keywordMatch(t.title, more[3]))) {
      diff.push({ op: "change", objectType: "task", id: t.id, label: label(t), before: { estimate: t.estimate, tier: t.tier }, after: { estimate: Math.round((t.estimate * 1.3) / 5) * 5, tier: t.tier === "tertiary" ? "secondary" : t.tier }, reason: "More time, as asked" });
    }
    if (diff.length) return { rationale: `Gave ${diff.length} task${diff.length === 1 ? "" : "s"} about 30% more time.`, diff };
  }

  // Drop / remove X
  const drop = s.match(/\b(drop|remove|delete|skip|cancel|no more)\s+(.+)$/);
  if (drop) {
    for (const t of open.filter((t) => t.earliest >= base && keywordMatch(t.title, drop[2]))) diff.push({ op: "remove", objectType: "task", id: t.id, label: label(t), reason: "Removed as asked" });
    if (diff.length) return { rationale: `Removed ${diff.length} upcoming "${drop[2]}" task${diff.length === 1 ? "" : "s"}.`, diff };
  }

  // Add X (on/by date)
  const add = s.match(/\badd\s+(an?\s+)?(.+?)(\s+(on|by|for)\s+(.+))?$/);
  if (add) {
    const when = add[5] ? parseWhen(add[5], base) : null;
    const title = add[2].replace(/^./, (c) => c.toUpperCase());
    const goal = goals.find((g) => keywordMatch(g.title + " " + g.category, title)) ?? goals[0];
    const due = when ?? addDays(base, 7);
    diff.push({ op: "add", objectType: "task", label: title, after: { title, tier: "secondary", estimate: 60, energy: "medium", earliest: when ? addDays(when, -2) < base ? base : addDays(when, -2) : base, due, goalId: goal?.id }, reason: when ? `Scheduled before ${due}` : "Added this week" });
    return { rationale: `Added "${title}"${when ? ` for ${due}` : ""}.`, diff };
  }

  return null;
}

export function applyDiff(tasks: Task[], milestones: Milestone[], diff: DiffItem[]): { tasks: Task[]; milestones: Milestone[] } {
  let t = tasks.map((x) => ({ ...x }));
  let m = milestones.map((x) => ({ ...x }));
  for (const d of diff) {
    if (d.objectType === "task") {
      if (d.op === "remove") t = t.filter((x) => x.id !== d.id);
      if (d.op === "change") t = t.map((x) => (x.id === d.id ? ({ ...x, ...(d.after as Partial<Task>) }) : x));
      if (d.op === "add" && d.after) t.push({ id: uid(), status: "todo", source: "ai", goalId: "", title: d.label, tier: "secondary", estimate: 60, energy: "medium", earliest: today(), due: addDays(today(), 7), ...(d.after as Partial<Task>) } as Task);
    } else {
      if (d.op === "remove") m = m.filter((x) => x.id !== d.id);
      if (d.op === "change") m = m.map((x) => (x.id === d.id ? ({ ...x, ...(d.after as unknown as Partial<Milestone>) }) : x));
      if (d.op === "add" && d.after) m.push({ id: uid(), goalId: "", title: d.label, due: today(), definitionOfDone: "", status: "open", order: m.length, ...(d.after as unknown as Partial<Milestone>) } as Milestone);
    }
  }
  return { tasks: t, milestones: m };
}
