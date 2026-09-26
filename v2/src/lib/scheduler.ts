// Deterministic day scheduler. The AI never does calendar math: this does.
import { fromMin, toMin, weekday, uid } from "./date";
import type { FixedEvent, Profile, Task, TimeBlock, Tier } from "./types";

export const TIER_RANK: Record<Tier, number> = { primary: 0, secondary: 1, tertiary: 2 };
const BUFFER = 10; // minutes around fixed events
const BREAK = 10; // minutes after each focus block
const MIN_PART = 25; // smallest useful chunk

export const PEAK: Record<Profile["peakEnergy"], [number, number]> = {
  morning: [8 * 60, 12 * 60],
  afternoon: [13 * 60, 17 * 60],
  evening: [18 * 60, 22 * 60],
};

type Win = [number, number];

function subtract(wins: Win[], [bs, be]: Win): Win[] {
  const out: Win[] = [];
  for (const [s, e] of wins) {
    if (be <= s || bs >= e) out.push([s, e]);
    else {
      if (bs > s) out.push([s, bs]);
      if (be < e) out.push([be, e]);
    }
  }
  return out.filter(([s, e]) => e - s >= 5);
}

export function dailyCapMinutes(profile: Profile, date: string): number {
  const active = profile.activeDays.length ? profile.activeDays : [1, 2, 3, 4, 5];
  if (!active.includes(weekday(date))) return 0;
  return Math.round(((profile.weeklyHours * 60) / active.length) * 1.2);
}

export interface BuildDayInput {
  date: string;
  profile: Profile;
  events: FixedEvent[];
  tasks: Task[];
  locked?: TimeBlock[];
  fromMinute?: number; // don't schedule before this (e.g. now, when rebuilding today)
}

export interface BuildDayResult {
  blocks: TimeBlock[];
  scheduled: string[];
  overflow: string[];
}

export function candidateTasks(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => t.status === "todo" && t.earliest <= date)
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) ||
        b.estimate - a.estimate,
    );
}

export function buildDay({ date, profile, events, tasks, locked = [], fromMinute }: BuildDayInput): BuildDayResult {
  const wd = weekday(date);
  const blocks: TimeBlock[] = [];
  let dayStart = toMin(profile.wake) + 30;
  let dayEnd = toMin(profile.sleep) - 30;
  if (dayEnd <= dayStart) dayEnd = 23 * 60;
  if (fromMinute !== undefined) dayStart = Math.max(dayStart, Math.ceil(fromMinute / 5) * 5);

  let wins: Win[] = dayEnd > dayStart ? [[dayStart, dayEnd]] : [];

  // Fixed events
  for (const ev of events.filter((e) => e.weekdays.includes(wd))) {
    const s = toMin(ev.start);
    const e = toMin(ev.end);
    blocks.push({ id: `ev-${ev.id}-${date}`, date, start: ev.start, end: ev.end, kind: ev.kind === "class" ? "class" : "event", eventId: ev.id, title: ev.title, locked: true });
    wins = subtract(wins, [s - BUFFER, e + BUFFER]);
  }
  // Locked blocks from the user keep their place
  for (const b of locked.filter((b) => b.date === date)) {
    blocks.push({ ...b });
    wins = subtract(wins, [toMin(b.start), toMin(b.end) + BREAK]);
  }
  // Meals, only where the time is free
  for (const [ms, me, label] of [[12 * 60 + 30, 13 * 60 + 15, "Lunch"], [19 * 60, 19 * 60 + 45, "Dinner"]] as const) {
    const fits = wins.some(([s, e]) => s <= ms && e >= me);
    if (fits) {
      blocks.push({ id: `meal-${date}-${label}`, date, start: fromMin(ms), end: fromMin(me), kind: "meal", title: label });
      wins = subtract(wins, [ms, me]);
    }
  }

  // Split windows at peak boundaries so each piece is peak or not
  const [ps, pe] = PEAK[profile.peakEnergy];
  const pieces = () => {
    const out: { w: Win; peak: boolean }[] = [];
    for (const [s, e] of wins) {
      const cuts = [s, e, ps, pe].filter((x) => x >= s && x <= e).sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        if (cuts[i + 1] - cuts[i] >= 5) out.push({ w: [cuts[i], cuts[i + 1]], peak: cuts[i] >= ps && cuts[i + 1] <= pe });
      }
    }
    return out;
  };

  const cap = dailyCapMinutes(profile, date);
  if (cap === 0) {
    blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
    return { blocks, scheduled: [], overflow: candidateTasks(tasks, date).map((t) => t.id) };
  }
  const lockedTaskMinutes = locked.filter((b) => b.date === date && b.kind === "task").reduce((a, b) => a + toMin(b.end) - toMin(b.start), 0);
  let used = lockedTaskMinutes;
  const lockedTaskIds = new Set(locked.filter((b) => b.date === date).map((b) => b.taskId));
  const scheduled: string[] = [];
  const overflow: string[] = [];

  for (const task of candidateTasks(tasks, date)) {
    if (lockedTaskIds.has(task.id)) continue;
    const allowOverCap = task.tier === "primary" && scheduled.length === 0;
    if (used + task.estimate > cap && !allowOverCap) {
      overflow.push(task.id);
      continue;
    }
    const parts: number[] = [];
    let rem = task.estimate;
    while (rem > 0) {
      const p = Math.min(rem, profile.maxFocus);
      parts.push(p);
      rem -= p;
    }
    const placed: Win[] = [];
    let ok = true;
    const snapshot = wins.map((w) => [...w] as Win);
    for (const len of parts) {
      const order = pieces().sort((a, b) => {
        const pref = task.energy === "high" ? Number(b.peak) - Number(a.peak) : task.energy === "low" ? Number(a.peak) - Number(b.peak) : 0;
        return pref || a.w[0] - b.w[0];
      });
      const slot = order.find(({ w }) => w[1] - w[0] >= len) ?? null;
      if (!slot) {
        ok = false;
        break;
      }
      const s = slot.w[0];
      placed.push([s, s + len]);
      wins = subtract(wins, [s, s + len + BREAK]);
    }
    if (!ok) {
      wins = snapshot;
      overflow.push(task.id);
      continue;
    }
    placed.sort((a, b) => a[0] - b[0]);
    placed.forEach(([s, e], i) => {
      blocks.push({
        id: `blk-${task.id}-${date}-${i}-${uid()}`,
        date,
        start: fromMin(s),
        end: fromMin(e),
        kind: "task",
        taskId: task.id,
        title: task.title,
        part: placed.length > 1 ? `${i + 1}/${placed.length}` : undefined,
        state: "pending",
      });
    });
    used += task.estimate;
    scheduled.push(task.id);
  }

  blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { blocks, scheduled, overflow };
}

export { MIN_PART };
