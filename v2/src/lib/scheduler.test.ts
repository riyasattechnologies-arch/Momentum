import { describe, expect, it } from "vitest";
import { buildDay, dailyCapMinutes, PEAK } from "./scheduler";
import { toMin } from "./date";
import type { FixedEvent, Profile, Task, TimeBlock } from "./types";

const profile: Profile = {
  name: "Test", university: "U", program: "CS", semesterNumber: 1,
  semesterStart: "2026-08-24", semesterEnd: "2026-12-11",
  wake: "07:00", sleep: "23:30", peakEnergy: "morning", maxFocus: 90,
  weeklyHours: 20, activeDays: [1, 2, 3, 4, 5, 6], coachStyle: "coach",
  reminderLead: 10, remindersOn: false, examWeeks: [],
};
const MON = "2026-09-28"; // a Monday
const events: FixedEvent[] = [
  { id: "c1", title: "Calculus", kind: "class", weekdays: [1, 3], start: "10:00", end: "11:15" },
  { id: "c2", title: "Programming", kind: "class", weekdays: [1], start: "14:00", end: "15:30" },
];
const t = (id: string, over: Partial<Task> = {}): Task => ({
  id, goalId: "g", title: id, tier: "secondary", estimate: 60, energy: "medium",
  earliest: MON, due: "2026-10-02", status: "todo", source: "ai", ...over,
});
const overlaps = (a: TimeBlock, s: string, e: string) => toMin(a.start) < toMin(e) && toMin(a.end) > toMin(s);

describe("buildDay", () => {
  it("never overlaps classes (with buffer)", () => {
    const { blocks } = buildDay({ date: MON, profile, events, tasks: [t("a"), t("b"), t("c", { estimate: 120 })] });
    for (const b of blocks.filter((x) => x.kind === "task")) {
      expect(overlaps(b, "09:50", "11:25")).toBe(false);
      expect(overlaps(b, "13:50", "15:40")).toBe(false);
    }
  });

  it("places high-energy primary tasks in the peak window", () => {
    const { blocks } = buildDay({ date: MON, profile, events, tasks: [t("p", { tier: "primary", energy: "high", estimate: 60 })] });
    const b = blocks.find((x) => x.taskId === "p")!;
    const [ps, pe] = PEAK.morning;
    expect(toMin(b.start)).toBeGreaterThanOrEqual(ps);
    expect(toMin(b.end)).toBeLessThanOrEqual(pe);
  });

  it("orders primary before secondary before tertiary", () => {
    const { scheduled } = buildDay({ date: MON, profile, events, tasks: [t("t3", { tier: "tertiary" }), t("t2"), t("t1", { tier: "primary" })] });
    expect(scheduled).toEqual(["t1", "t2", "t3"]);
  });

  it("splits tasks longer than max focus into parts", () => {
    const { blocks } = buildDay({ date: MON, profile, events, tasks: [t("long", { estimate: 150 })] });
    const parts = blocks.filter((b) => b.taskId === "long");
    expect(parts.length).toBe(2);
    expect(parts.every((p) => toMin(p.end) - toMin(p.start) <= 90)).toBe(true);
  });

  it("respects the daily cap and reports overflow", () => {
    const cap = dailyCapMinutes(profile, MON); // 20h/6 days *1.2 = 240
    const tasks = Array.from({ length: 8 }, (_, i) => t(`x${i}`, { estimate: 60 }));
    const { blocks, overflow } = buildDay({ date: MON, profile, events, tasks });
    const mins = blocks.filter((b) => b.kind === "task").reduce((a, b) => a + toMin(b.end) - toMin(b.start), 0);
    expect(mins).toBeLessThanOrEqual(cap);
    expect(overflow.length).toBeGreaterThan(0);
  });

  it("keeps locked blocks exactly where they are", () => {
    const locked: TimeBlock = { id: "L", date: MON, start: "16:00", end: "17:00", kind: "task", taskId: "lk", title: "Locked", locked: true };
    const { blocks } = buildDay({ date: MON, profile, events, tasks: [t("lk"), t("a")], locked: [locked] });
    const l = blocks.find((b) => b.id === "L")!;
    expect(l.start).toBe("16:00");
    expect(blocks.filter((b) => b.taskId === "lk").length).toBe(1);
    expect(blocks.filter((b) => b.kind === "task" && b.id !== "L").every((b) => !overlaps(b, "16:00", "17:00"))).toBe(true);
  });

  it("schedules nothing on rest days", () => {
    const { blocks } = buildDay({ date: "2026-09-27", profile, events, tasks: [t("a", { earliest: "2026-09-27" })] });
    expect(blocks.filter((b) => b.kind === "task").length).toBe(0);
  });

  it("does not schedule before fromMinute", () => {
    const { blocks } = buildDay({ date: MON, profile, events, tasks: [t("a")], fromMinute: 16 * 60 + 2 });
    expect(toMin(blocks.find((b) => b.taskId === "a")!.start)).toBeGreaterThanOrEqual(16 * 60 + 5);
  });
});
