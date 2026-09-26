"use client";
// App state. Demo mode keeps everything on this device (localStorage).
// The same actions map 1:1 onto Supabase tables later (see supabase/migrations).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { addDays, nowMin, toMin, today, uid } from "./date";
import { applyDiff, fitToBudget, weeklyMinutes } from "./planner";
import { buildDay } from "./scheduler";
import type {
  ActionLogEntry, ChatMessage, CheckIn, Course, FixedEvent, Goal, Milestone, PlanVersion, Profile, Proposal, Task, TimeBlock,
} from "./types";

export type Stage = "intake" | "review" | "proposal" | "active";

export interface State {
  stage: Stage;
  profile: Profile | null;
  courses: Course[];
  events: FixedEvent[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  plans: PlanVersion[];
  proposals: Proposal[];
  days: Record<string, TimeBlock[]>;
  checkins: CheckIn[];
  log: ActionLogEntry[];
  chat: ChatMessage[];
  intakeAnswers: Record<string, string>;
  reminded: Record<string, number>; // blockId -> escalation level sent
  demo: boolean;

  // actions
  set: (p: Partial<State>) => void;
  addLog: (e: Omit<ActionLogEntry, "id" | "at">) => void;
  addChat: (m: Omit<ChatMessage, "id" | "at">) => string;
  saveIntake: (r: { profile: Profile; courses: Course[]; events: FixedEvent[]; goals: Goal[] }) => void;
  addProposal: (p: Omit<Proposal, "id" | "createdAt" | "status">) => string;
  decideProposal: (id: string, approve: boolean) => void;
  agreeAndLock: (summary?: string) => void;
  ensureDay: (date: string) => TimeBlock[];
  rebuildDay: (date: string) => void;
  blockAction: (blockId: string, action: "start" | "done" | "skip" | "snooze" | "lock" | "unlock") => void;
  setTaskStatus: (taskId: string, status: Task["status"]) => void;
  addTask: (t: Omit<Task, "id" | "status" | "source">) => void;
  saveCheckin: (c: CheckIn) => void;
  markMissed: () => void;
  reset: () => void;
}

const empty = {
  stage: "intake" as Stage,
  profile: null,
  courses: [],
  events: [],
  goals: [],
  milestones: [],
  tasks: [],
  plans: [],
  proposals: [],
  days: {},
  checkins: [],
  log: [],
  chat: [],
  intakeAnswers: {},
  reminded: {},
  demo: false,
};

function reusableBlocks(blocks: TimeBlock[] | undefined): TimeBlock[] {
  return (blocks ?? []).filter((b) => b.kind === "task" && (b.locked || b.state === "done" || b.state === "started"));
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...empty,
      set: (p) => set(p),
      addLog: (e) => set((s) => ({ log: [{ id: uid(), at: new Date().toISOString(), ...e }, ...s.log].slice(0, 400) })),
      addChat: (m) => {
        const id = uid();
        set((s) => ({ chat: [...s.chat, { id, at: new Date().toISOString(), ...m }].slice(-300) }));
        return id;
      },
      saveIntake: (r) => {
        set({ profile: r.profile, courses: r.courses, events: r.events, goals: r.goals });
        get().addLog({ actor: "user", action: "Saved intake summary", objectType: "profile", reason: `${r.goals.length} goals, ${r.courses.length} courses, ${r.events.length} fixed events` });
      },
      addProposal: (p) => {
        const id = uid();
        set((s) => ({ proposals: [{ ...p, id, createdAt: new Date().toISOString(), status: "pending" }, ...s.proposals] }));
        get().addLog({ actor: "ai", action: `Proposed ${p.kind === "initial" ? "a semester plan" : `${p.diff.length} change${p.diff.length === 1 ? "" : "s"}`}`, objectType: "proposal", objectId: id, reason: p.rationale });
        return id;
      },
      decideProposal: (id, approve) => {
        const s = get();
        const prop = s.proposals.find((p) => p.id === id);
        if (!prop || prop.status !== "pending") return;
        let next: Partial<State> = { proposals: s.proposals.map((p) => (p.id === id ? { ...p, status: approve ? "approved" : "rejected" } : p)) };
        if (approve) {
          if (prop.kind === "initial" && prop.plan) {
            next = { ...next, milestones: prop.plan.milestones, tasks: prop.plan.tasks, stage: s.stage === "active" ? "active" : "proposal" };
            // any older pending initial proposals are superseded
            next.proposals = next.proposals!.map((p) => (p.id !== id && p.kind === "initial" && p.status === "pending" ? { ...p, status: "rejected" } : p));
          } else {
            const r = applyDiff(s.tasks, s.milestones, prop.diff);
            next = { ...next, tasks: r.tasks, milestones: r.milestones };
          }
        }
        set(next);
        get().addLog({ actor: "user", action: approve ? "Approved proposal" : "Rejected proposal", objectType: "proposal", objectId: id, reason: prop.rationale });
        if (approve && get().plans.length && prop.kind !== "initial") {
          get().agreeAndLock(prop.rationale);
        }
        if (approve && get().stage === "active") {
          // refresh today's schedule to reflect the change
          get().rebuildDay(today());
        }
      },
      agreeAndLock: (summary) => {
        const s = get();
        const version = (s.plans[0]?.version ?? 0) + 1;
        const weeks = [...new Set(s.tasks.map((t) => t.earliest))];
        const wm = s.tasks.length ? Math.round(weeklyMinutes(s.tasks, s.tasks[0].earliest)) : 0;
        const pv: PlanVersion = { id: uid(), version, summary: summary ?? "Initial agreed plan", agreedAt: new Date().toISOString(), taskCount: s.tasks.length, milestoneCount: s.milestones.length, weeklyMinutes: wm };
        void weeks;
        set({ plans: [pv, ...s.plans], stage: "active" });
        get().addLog({ actor: "user", action: `Agreed & locked plan v${version}`, objectType: "plan", objectId: pv.id, reason: pv.summary });
      },
      ensureDay: (date) => {
        const s = get();
        if (s.days[date]) return s.days[date];
        if (!s.profile) return [];
        const isToday = date === today();
        const { blocks } = buildDay({ date, profile: s.profile, events: s.events, tasks: s.tasks, fromMinute: isToday ? Math.max(nowMin(), 0) : undefined });
        set((st) => ({ days: { ...st.days, [date]: blocks } }));
        return blocks;
      },
      rebuildDay: (date) => {
        const s = get();
        if (!s.profile) return;
        const isToday = date === today();
        const now = nowMin();
        const prev = s.days[date] ?? [];
        const keep = reusableBlocks(prev);
        const past = isToday ? prev.filter((b) => b.kind === "task" && !keep.includes(b) && toMin(b.end) <= now).map((b) => ({ ...b, state: b.state === "skipped" ? "skipped" : "missed" }) as TimeBlock) : [];
        const skippedIds = new Set(prev.filter((b) => b.state === "skipped").map((b) => b.taskId));
        const { blocks, overflow } = buildDay({ date, profile: s.profile, events: s.events, tasks: s.tasks.filter((t) => !skippedIds.has(t.id)), locked: keep, fromMinute: isToday ? now : undefined });
        const merged = [...blocks, ...past.filter((p) => !blocks.some((b) => b.id === p.id))].sort((a, b) => toMin(a.start) - toMin(b.start));
        set((st) => ({ days: { ...st.days, [date]: merged } }));
        get().addLog({ actor: "system", action: `Rebuilt schedule for ${date}`, objectType: "day", reason: `${blocks.filter((b) => b.kind === "task").length} task blocks, ${overflow.length} rolled to later` });
      },
      blockAction: (blockId, action) => {
        const s = get();
        const date = Object.keys(s.days).find((d) => s.days[d].some((b) => b.id === blockId));
        if (!date) return;
        const block = s.days[date].find((b) => b.id === blockId)!;
        const upd = (patch: Partial<TimeBlock>) => set((st) => ({ days: { ...st.days, [date]: st.days[date].map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } }));
        if (action === "start") upd({ state: "started" });
        if (action === "lock") upd({ locked: true });
        if (action === "unlock") upd({ locked: false });
        if (action === "snooze") {
          const mins = 15;
          const ns = toMin(block.start) + mins;
          const ne = toMin(block.end) + mins;
          const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          upd({ start: f(ns), end: f(ne), snoozedUntil: f(ns) });
          set((st) => ({ reminded: { ...st.reminded, [blockId]: 0 } }));
        }
        if (action === "done") {
          upd({ state: "done" });
          if (block.taskId) {
            const siblings = s.days[date].filter((b) => b.taskId === block.taskId && b.id !== blockId);
            const allDone = siblings.every((b) => b.state === "done");
            if (allDone) get().setTaskStatus(block.taskId, "done");
          }
        }
        if (action === "skip") {
          upd({ state: "skipped" });
          if (block.taskId) {
            set((st) => ({ tasks: st.tasks.map((t) => (t.id === block.taskId ? { ...t, rolledCount: (t.rolledCount ?? 0) + 1 } : t)) }));
          }
          get().addLog({ actor: "user", action: "Skipped block", objectType: "task", objectId: block.taskId, reason: block.title });
        }
      },
      setTaskStatus: (taskId, status) => {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status, doneAt: status === "done" ? today() : undefined } : t)) }));
        if (status === "done") {
          // close milestones whose tasks are all done
          const s = get();
          const t = s.tasks.find((x) => x.id === taskId);
          if (t?.milestoneId && s.tasks.filter((x) => x.milestoneId === t.milestoneId).every((x) => x.status === "done")) {
            set((st) => ({ milestones: st.milestones.map((m) => (m.id === t.milestoneId ? { ...m, status: "done" } : m)) }));
            get().addLog({ actor: "system", action: "Milestone completed", objectType: "milestone", objectId: t.milestoneId });
          }
          // mirror on today's blocks
          set((st) => {
            const d = today();
            if (!st.days[d]) return {};
            return { days: { ...st.days, [d]: st.days[d].map((b) => (b.taskId === taskId ? { ...b, state: "done" } : b)) } };
          });
        }
      },
      addTask: (t) => {
        set((s) => ({ tasks: [...s.tasks, { ...t, id: uid(), status: "todo", source: "user" }] }));
        get().addLog({ actor: "user", action: "Added task", objectType: "task", reason: t.title });
      },
      saveCheckin: (c) => {
        set((s) => ({ checkins: [...s.checkins.filter((x) => !(x.date === c.date && x.type === c.type)), c] }));
        get().addLog({ actor: "user", action: `${c.type === "evening" ? "Evening review" : "Morning check-in"} saved`, objectType: "checkin", reason: c.notes });
      },
      markMissed: () => {
        const s = get();
        const d = today();
        const now = nowMin();
        const blocks = s.days[d];
        if (!blocks) return;
        let changed = false;
        const next = blocks.map((b) => {
          if (b.kind === "task" && (b.state === "pending" || !b.state) && toMin(b.end) + 5 <= now) {
            changed = true;
            return { ...b, state: "missed" as const };
          }
          return b;
        });
        if (changed) set({ days: { ...s.days, [d]: next } });
      },
      reset: () => set({ ...empty }),
    }),
    {
      name: "momentum-v2",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { set: _a, addLog: _b, addChat: _c, saveIntake: _d, addProposal: _e, decideProposal: _f, agreeAndLock: _g, ensureDay: _h, rebuildDay: _i, blockAction: _j, setTaskStatus: _k, addTask: _l, saveCheckin: _m, markMissed: _n, reset: _o, ...data } = s;
        void [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o];
        return data;
      },
    },
  ),
);

export { fitToBudget, addDays };
