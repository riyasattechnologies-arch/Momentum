// Intake interview script + offline parser. With Gemini on, the same answers are parsed by the AI.
import { addDays, mondayOf, parse, today, uid } from "./date";
import { defaultExamWeeks, GOAL_COLORS, guessCategory, parseWhen } from "./planner";
import type { CoachStyle, Course, FixedEvent, Goal, PeakEnergy, Profile, Weekday } from "./types";

export interface IntakeQuestion {
  key: string;
  q: string;
  hint: string;
  multiline?: boolean;
  example: string;
}

export const QUESTIONS: IntakeQuestion[] = [
  { key: "name", q: "Hi, I'm Momentum, your chief of staff. What should I call you?", hint: "Your first name", example: "Sherbaz" },
  { key: "program", q: "What are you studying, where, and which semester are you in?", hint: "Program, university, semester number", example: "Computer Science at Texas State, semester 1" },
  { key: "dates", q: "When does your semester start and end? Say “not sure” and I'll assume a standard fall term.", hint: "Two dates", example: "Aug 24 to Dec 11" },
  { key: "courses", q: "List your courses, one per line: code and name, credits, difficulty from 1 (easy) to 5 (brutal).", hint: "One course per line", multiline: true, example: "CS1428 Foundations of CS, 4, 4\nMATH2471 Calculus I, 4, 5\nENG1310 College Writing, 3, 2\nUS1100 University Seminar, 1, 1" },
  { key: "classes", q: "When are your classes and other fixed commitments (job, gym, commute)? One per line: name, days, time.", hint: "e.g. MATH2471 Mon Wed 10:00-11:20", multiline: true, example: "CS1428 Mon Wed 14:00-15:20\nMATH2471 Mon Wed Fri 10:00-10:50\nENG1310 Tue Thu 11:00-12:20\nUS1100 Fri 13:00-13:50\nWork Sat 10:00-14:00" },
  { key: "sleep", q: "When do you usually wake up and go to sleep?", hint: "Two times", example: "7:00 and 23:30" },
  { key: "energy", q: "When is your brain sharpest: morning, afternoon or evening?", hint: "Morning / afternoon / evening", example: "Morning" },
  { key: "hours", q: "Outside class, how many hours a week can you honestly give to your goals? Any days completely off?", hint: "Hours, plus days off", example: "18 hours, Sunday off" },
  { key: "goals", q: "Now the big one. What do you want to achieve? One goal per line, with a deadline if you have one. Most important first.", hint: "One goal per line", multiline: true, example: "Land a software engineering internship for summer 2027 by March 15\nFinish the semester with a 3.5 GPA by Dec 11\nRun a 10K by Nov 22" },
  { key: "why", q: "Why do these matter to you? One line is enough. I'll bring it up on hard days.", hint: "Your reason", example: "I want to be the first in my family with a tech career" },
  { key: "style", q: "Last one: how should I push you? Gentle, coach, or drill sergeant?", hint: "Gentle / coach / drill", example: "Coach" },
];

export interface IntakeResult {
  profile: Profile;
  courses: Course[];
  events: FixedEvent[];
  goals: Goal[];
}

const DAY_WORDS: [RegExp, Weekday][] = [
  [/\bsun(day)?s?\b|\bsu\b/i, 0], [/\bmon(day)?s?\b|\bmo\b/i, 1], [/\btue(s|sday)?s?\b|\btu\b/i, 2], [/\bwed(nesday)?s?\b|\bwe\b/i, 3],
  [/\bthu(r|rs|rsday)?s?\b|\bth\b/i, 4], [/\bfri(day)?s?\b|\bfr\b/i, 5], [/\bsat(urday)?s?\b|\bsa\b/i, 6],
];

export function parseTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm|a|p)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function days(s: string): Weekday[] {
  const out = new Set<Weekday>();
  for (const [re, d] of DAY_WORDS) if (re.test(s)) out.add(d);
  const compact = s.match(/\b(M?T?W?(?:Th|R)?F?)\b/);
  if (!out.size && compact?.[1] && compact[1].length >= 2) {
    const c = compact[1];
    if (c.includes("M")) out.add(1);
    if (/T(?!h)/.test(c)) out.add(2);
    if (c.includes("W")) out.add(3);
    if (/Th|R/.test(c)) out.add(4);
    if (c.includes("F")) out.add(5);
  }
  return [...out].sort() as Weekday[];
}

function timeRange(s: string): [string, string] | null {
  const m = s.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)/i);
  if (!m) return null;
  let a = parseTime(m[1]);
  let b = parseTime(m[2]);
  if (!a || !b) return null;
  // "2-3:20pm" -> both pm
  if (/p/i.test(m[2]) && !/[ap]/i.test(m[1]) && Number(a.slice(0, 2)) < 12 && Number(a.slice(0, 2)) + 12 < Number(b.slice(0, 2)) + 1) a = `${String(Number(a.slice(0, 2)) + 12).padStart(2, "0")}${a.slice(2)}`;
  if (b <= a && Number(b.slice(0, 2)) < 12) b = `${String(Number(b.slice(0, 2)) + 12).padStart(2, "0")}${b.slice(2)}`;
  return [a, b];
}

export function defaultProfile(): Profile {
  const t = today();
  const y = parse(t).getFullYear();
  const m = parse(t).getMonth();
  const start = m >= 7 ? `${y}-08-24` : m <= 4 ? `${y}-01-12` : `${y}-06-01`;
  const end = m >= 7 ? `${y}-12-11` : m <= 4 ? `${y}-05-08` : `${y}-08-07`;
  const p: Profile = {
    name: "", university: "", program: "", semesterNumber: 1, semesterStart: start, semesterEnd: end,
    wake: "07:00", sleep: "23:30", peakEnergy: "morning", maxFocus: 90, weeklyHours: 15,
    activeDays: [1, 2, 3, 4, 5, 6], coachStyle: "coach", reminderLead: 10, remindersOn: false, examWeeks: [],
  };
  p.examWeeks = defaultExamWeeks(p);
  return p;
}

export function parseIntakeOffline(a: Record<string, string>): IntakeResult {
  const profile = defaultProfile();
  profile.name = (a.name || "").trim().split(/\s+/)[0]?.replace(/^./, (c) => c.toUpperCase()) || "Friend";

  const prog = a.program || "";
  const sem = prog.match(/(?:semester|sem|term)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*(?:semester|sem|term)|\b(first|second|third|fourth)\b/i);
  const word: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  if (sem) profile.semesterNumber = Number(sem[1] ?? sem[2]) || word[(sem[3] ?? "").toLowerCase()] || 1;
  const at = prog.split(/\bat\b|@/i);
  profile.program = at[0].replace(/,?\s*(semester|sem|term).*$/i, "").replace(/\b(first|second|third|fourth|\d+(st|nd|rd|th))\b.*$/i, "").replace(/^i('| a)?m (studying|doing|in)\s*/i, "").trim().replace(/[, ]+$/, "") || "Undeclared";
  profile.university = (at[1] || "").split(",")[0].trim();

  if (!/not sure|don.?t know|idk/i.test(a.dates || "")) {
    const parts = (a.dates || "").split(/\bto\b|-|–|until|through/i).map((x) => parseWhen(x, addDays(today(), -120))).filter(Boolean) as string[];
    if (parts.length >= 2 && parts[1] > parts[0]) {
      profile.semesterStart = parts[0];
      profile.semesterEnd = parts[1];
      profile.examWeeks = defaultExamWeeks(profile);
    }
  }

  const courses: Course[] = (a.courses || "").split(/\n|;/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [head, cr, df] = line.split(",").map((x) => x.trim());
    const tok = head.split(/\s+/);
    const code = /\d/.test(tok[0]) || /^[A-Z]{2,5}$/.test(tok[0]) ? tok[0].toUpperCase() : tok.map((w) => w[0]).join("").toUpperCase().slice(0, 6);
    const name = /\d/.test(tok[0]) || /^[A-Z]{2,5}$/.test(tok[0]) ? tok.slice(1).join(" ") || tok[0] : head;
    return { id: uid(), code, name, credits: Math.min(6, Math.max(1, Number(cr) || 3)), difficulty: Math.min(5, Math.max(1, Number(df) || 3)), targetGrade: "A" };
  });

  const events: FixedEvent[] = [];
  for (const line of (a.classes || "").split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
    const tr = timeRange(line);
    const ds = days(line.replace(/\d.*$/, " ") + " " + line);
    if (!tr || !ds.length) continue;
    const first = line.split(/\s+/)[0];
    const course = courses.find((c) => line.toUpperCase().includes(c.code));
    const kind = course ? "class" : /work|job|shift/i.test(line) ? "work" : /gym|train|practice/i.test(line) ? "gym" : /commute|bus|drive/i.test(line) ? "commute" : /class|lab|lecture/i.test(line) ? "class" : "other";
    events.push({ id: uid(), title: course ? `${course.code} ${course.name}` : first.replace(/^./, (c) => c.toUpperCase()), kind, courseId: course?.id, weekdays: ds, start: tr[0], end: tr[1] });
  }

  const times = (a.sleep || "").match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi) ?? [];
  const wake = times[0] ? parseTime(times[0]) : null;
  let sleep = times[1] ? parseTime(times[1]) : null;
  if (sleep && Number(sleep.slice(0, 2)) < 12 && !/am/i.test(times[1] ?? "")) sleep = `${String(Number(sleep.slice(0, 2)) + 12).padStart(2, "0")}${sleep.slice(2)}`;
  if (wake) profile.wake = wake;
  if (sleep && sleep !== "24:00") profile.sleep = sleep;

  const en = (a.energy || "").toLowerCase();
  profile.peakEnergy = (en.includes("even") || en.includes("night") ? "evening" : en.includes("after") ? "afternoon" : "morning") as PeakEnergy;

  const hrs = (a.hours || "").match(/\d+(\.\d+)?/);
  if (hrs) profile.weeklyHours = Math.min(60, Math.max(2, Number(hrs[0])));
  const offPart = (a.hours || "").toLowerCase();
  const off = days(offPart.replace(/\d+(\.\d+)?\s*(h|hours?)?/g, ""));
  if (off.length && /off|free|rest|no|not|except|never/.test(offPart)) profile.activeDays = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !off.includes(d));

  const st = (a.style || "").toLowerCase();
  profile.coachStyle = (st.includes("drill") || st.includes("hard") || st.includes("strict") ? "drill" : st.includes("gentle") || st.includes("soft") || st.includes("kind") ? "gentle" : "coach") as CoachStyle;

  const why = (a.why || "").trim();
  const goals: Goal[] = (a.goals || "").split(/\n|;/).map((l) => l.trim().replace(/^[-*\d.)\s]+/, "")).filter(Boolean).slice(0, 5).map((line, i) => {
    const m = line.match(/\b(by|before|until|in)\b\s+(.+)$/i);
    let target = m ? parseWhen(m[2], today()) : null;
    const yr = line.match(/\b(spring|summer|fall|winter)?\s*(20\d\d)\b/i);
    if (!target && yr) {
      const season = (yr[1] || "").toLowerCase();
      const y = Number(yr[2]);
      target = season === "summer" ? `${y}-03-15` : season === "fall" ? `${y}-08-01` : season === "spring" ? `${y}-01-10` : `${y}-06-01`;
    }
    if (!target || target <= today()) target = profile.semesterEnd > addDays(today(), 21) ? profile.semesterEnd : addDays(today(), 90);
    const title = (m && parseWhen(m[2], today()) ? line.slice(0, m.index).trim() : line).replace(/[.,;]+$/, "");
    const category = guessCategory(title);
    const metric = category === "academic" ? (title.match(/\d\.\d+/)?.[0] ? `Semester GPA ≥ ${title.match(/\d\.\d+/)![0]}` : "All courses at target grade") : category === "career" ? "Offer letter signed" : category === "health" ? "Goal event completed" : "Finished and shared";
    return { id: uid(), title, why: i === 0 ? why : "", category, targetDate: target, successMetric: metric, priority: (Math.min(3, i + 1)) as 1 | 2 | 3, color: GOAL_COLORS[i % GOAL_COLORS.length] };
  });

  profile.examWeeks = defaultExamWeeks(profile).filter((w) => w >= mondayOf(profile.semesterStart));
  return { profile, courses, events, goals };
}
