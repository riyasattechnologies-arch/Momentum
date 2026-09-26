import { describe, expect, it } from "vitest";
import { parseIntakeOffline, QUESTIONS } from "./intake";
import { generatePlan, offlineFeedback, weeklyMinutes } from "./planner";
import { mondayOf } from "./date";

const answers = Object.fromEntries(QUESTIONS.map((q) => [q.key, q.example]));

describe("intake + planner", () => {
  const r = parseIntakeOffline(answers);
  it("parses the example interview", () => {
    expect(r.profile.name).toBe("Sherbaz");
    expect(r.profile.program).toBe("Computer Science");
    expect(r.profile.university).toBe("Texas State");
    expect(r.courses.length).toBe(4);
    expect(r.courses[1]).toMatchObject({ code: "MATH2471", credits: 4, difficulty: 5 });
    expect(r.events.length).toBe(5);
    expect(r.events.find((e) => e.title.startsWith("CS1428"))).toMatchObject({ weekdays: [1, 3], start: "14:00", end: "15:20" });
    expect(r.events.find((e) => e.kind === "work")).toMatchObject({ weekdays: [6], start: "10:00", end: "14:00" });
    expect(r.profile.wake).toBe("07:00");
    expect(r.profile.sleep).toBe("23:30");
    expect(r.profile.weeklyHours).toBe(18);
    expect(r.profile.activeDays).not.toContain(0);
    expect(r.goals.map((g) => g.category)).toEqual(["career", "academic", "health"]);
    expect(r.goals[0].title).toBe("Land a software engineering internship for summer 2027");
    console.log(r.profile, r.goals.map((g) => [g.title, g.targetDate]));
  });
  it("builds a plan that fits the weekly budget", () => {
    const plan = generatePlan(r.profile, r.courses, r.goals);
    expect(plan.tasks.length).toBeGreaterThan(50);
    const weeks = [...new Set(plan.tasks.map((t) => mondayOf(t.earliest)))];
    for (const w of weeks) expect(weeklyMinutes(plan.tasks, w)).toBeLessThanOrEqual(r.profile.weeklyHours * 60 * 1.05);
    console.log(plan.summary);
  });
  it("understands negotiation phrases", () => {
    const plan = generatePlan(r.profile, r.courses, r.goals);
    expect(offlineFeedback("October is too heavy, I have midterms", plan.tasks, r.goals)?.diff.length).toBeGreaterThan(0);
    expect(offlineFeedback("move mock interviews to weekends", plan.tasks, r.goals)).toBeTruthy();
    expect(offlineFeedback("I'm sick until Wednesday", plan.tasks, r.goals)?.diff.length).toBeGreaterThan(0);
    expect(offlineFeedback("add hackathon prep on Oct 18", plan.tasks, r.goals)?.diff[0].op).toBe("add");
    expect(offlineFeedback("drop LinkedIn", plan.tasks, r.goals)).toBeTruthy();
    expect(offlineFeedback("blah blah", plan.tasks, r.goals)).toBeNull();
  });
});
