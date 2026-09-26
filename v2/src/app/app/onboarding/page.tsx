"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseIntake, proposePlan } from "@/lib/ai/client";
import { uid, WEEKDAYS } from "@/lib/date";
import { icsToLines } from "@/lib/ics";
import { QUESTIONS } from "@/lib/intake";
import { GOAL_COLORS } from "@/lib/planner";
import { loadDemo } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Course, FixedEvent, Goal, Profile, Weekday } from "@/lib/types";
import { Button, cx, Dot, inputCls, Panel } from "@/components/ui";

export default function Onboarding() {
  const stage = useStore((s) => s.stage);
  return stage === "intake" ? <Interview /> : <Summary />;
}

function Interview() {
  const answers = useStore((s) => s.intakeAnswers);
  const set = useStore((s) => s.set);
  const router = useRouter();
  const idx = QUESTIONS.findIndex((q) => !(q.key in answers));
  const q = idx >= 0 ? QUESTIONS[idx] : null;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [idx, busy]);

  async function finish(all: Record<string, string>) {
    setBusy("Reading your answers and building your profile…");
    const { result } = await parseIntake(all);
    useStore.getState().saveIntake(result);
    useStore.getState().set({ stage: "review" });
    setBusy("");
  }

  function submit(v: string) {
    if (!q) return;
    const val = v.trim() || (q.key === "dates" ? "not sure" : "");
    if (!val) return;
    const next = { ...answers, [q.key]: val };
    set({ intakeAnswers: next });
    setText("");
    if (idx === QUESTIONS.length - 1) finish(next);
  }

  async function onIcs(f: File) {
    const lines = icsToLines(await f.text());
    setText((t) => [t, ...lines].filter(Boolean).join("\n"));
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label !text-accent">Step 01 · Interview</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Let's get to know you</h1>
          <p className="mt-1 text-sm text-muted">{QUESTIONS.length} short questions. Your answers become your profile, schedule and goals.</p>
        </div>
        <Button variant="ghost" onClick={() => { loadDemo(); router.push("/app/today"); }}>Skip: load a demo student</Button>
      </div>

      <div className="h-1 overflow-hidden rounded bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${((idx < 0 ? QUESTIONS.length : idx) / QUESTIONS.length) * 100}%` }} /></div>

      <Panel pad={false}>
        <div className="scroll-thin max-h-[58vh] space-y-4 overflow-y-auto p-4">
          {QUESTIONS.slice(0, idx < 0 ? QUESTIONS.length : idx + 1).map((qq, i) => (
            <div key={qq.key} className="space-y-2">
              <div className="flex gap-2.5">
                <span className="num mt-0.5 text-[11px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-sm">{qq.q}</p>
              </div>
              {qq.key in answers && (
                <div className="flex justify-end">
                  <button className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent/15 px-3 py-2 text-left text-sm hover:bg-accent/25" title="Edit this answer" onClick={() => { const { [qq.key]: _, ...rest } = answers; void _; const keep = Object.fromEntries(Object.entries(rest).filter(([k]) => QUESTIONS.findIndex((x) => x.key === k) < i)); set({ intakeAnswers: keep }); setText(answers[qq.key]); }}>
                    {answers[qq.key]}
                  </button>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="num text-xs text-dim"><span className="pulse-dot">●</span> {busy}</div>}
          <div ref={end} />
        </div>
        {q && !busy && (
          <form className="space-y-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            {q.multiline ? (
              <textarea id={`q-${q.key}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={q.example} className={cx(inputCls, "num text-[13px]")} aria-label={q.q}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(text); }} />
            ) : (
              <input id={`q-${q.key}`} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={q.example} className={inputCls} aria-label={q.q} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary">{idx === QUESTIONS.length - 1 ? "Finish interview" : "Answer"}</Button>
              <Button type="button" variant="ghost" onClick={() => setText(q.example)}>Use example</Button>
              {q.key === "classes" && (
                <>
                  <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>Import .ics timetable</Button>
                  <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => e.target.files?.[0] && onIcs(e.target.files[0])} />
                </>
              )}
              <span className="ml-auto text-xs text-dim">{q.hint}{q.multiline ? " · Ctrl+Enter to send" : ""}</span>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

// ---------------- Summary card (editable) ----------------
function Summary() {
  const s = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!s.profile) return null;
  const p = s.profile;
  const setP = (patch: Partial<Profile>) => s.set({ profile: { ...p, ...patch } });
  const setCourse = (id: string, patch: Partial<Course>) => s.set({ courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setEvent = (id: string, patch: Partial<FixedEvent>) => s.set({ events: s.events.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setGoal = (id: string, patch: Partial<Goal>) => s.set({ goals: s.goals.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  async function build() {
    setBusy(true);
    const st = useStore.getState();
    const plan = await proposePlan(st.profile!, st.courses, st.goals);
    const id = st.addProposal({ kind: "initial", rationale: plan.summary, diff: [], source: plan.source, plan: { milestones: plan.milestones, tasks: plan.tasks } });
    useStore.getState().decideProposal(id, true);
    useStore.getState().set({ stage: "proposal" });
    setBusy(false);
    router.push("/app/plan");
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label !text-accent">Step 02 · Review</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Here's what I understood, {p.name}</h1>
          <p className="mt-1 text-sm text-muted">Fix anything that's wrong. Everything here drives your plan and your daily schedule.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => s.set({ stage: "intake", intakeAnswers: {} })}>Redo interview</Button>
          <Button variant="primary" onClick={build} disabled={busy || !s.goals.length}>{busy ? "Planning your semester…" : "Build my plan →"}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <L label="Name"><input id="p-name" className={inputCls} value={p.name} onChange={(e) => setP({ name: e.target.value })} /></L>
            <L label="Program"><input id="p-program" className={inputCls} value={p.program} onChange={(e) => setP({ program: e.target.value })} /></L>
            <L label="University"><input id="p-uni" className={inputCls} value={p.university} onChange={(e) => setP({ university: e.target.value })} /></L>
            <L label="Semester #"><input id="p-sem" type="number" min={1} className={inputCls} value={p.semesterNumber} onChange={(e) => setP({ semesterNumber: +e.target.value || 1 })} /></L>
            <L label="Semester start"><input id="p-start" type="date" className={inputCls} value={p.semesterStart} onChange={(e) => setP({ semesterStart: e.target.value })} /></L>
            <L label="Semester end"><input id="p-end" type="date" className={inputCls} value={p.semesterEnd} onChange={(e) => setP({ semesterEnd: e.target.value })} /></L>
            <L label="Wake"><input id="p-wake" type="time" className={inputCls} value={p.wake} onChange={(e) => setP({ wake: e.target.value })} /></L>
            <L label="Sleep"><input id="p-sleep" type="time" className={inputCls} value={p.sleep} onChange={(e) => setP({ sleep: e.target.value })} /></L>
            <L label="Peak energy">
              <select id="p-peak" className={inputCls} value={p.peakEnergy} onChange={(e) => setP({ peakEnergy: e.target.value as Profile["peakEnergy"] })}>
                <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
              </select>
            </L>
            <L label="Hours / week for goals"><input id="p-hours" type="number" min={1} max={60} className={inputCls} value={p.weeklyHours} onChange={(e) => setP({ weeklyHours: +e.target.value || 1 })} /></L>
            <L label="Coach style">
              <select id="p-style" className={inputCls} value={p.coachStyle} onChange={(e) => setP({ coachStyle: e.target.value as Profile["coachStyle"] })}>
                <option value="gentle">Gentle</option><option value="coach">Coach</option><option value="drill">Drill sergeant</option>
              </select>
            </L>
            <L label="Work days">
              <Days value={p.activeDays} onChange={(v) => setP({ activeDays: v })} />
            </L>
          </div>
        </Panel>

        <Panel title={`Goals · ${s.goals.length}`} action={<Button size="sm" variant="ghost" onClick={() => s.set({ goals: [...s.goals, { id: uid(), title: "New goal", why: "", category: "personal", targetDate: p.semesterEnd, successMetric: "Done", priority: 3, color: GOAL_COLORS[s.goals.length % GOAL_COLORS.length] }] })}>+ Goal</Button>}>
          <div className="space-y-3">
            {s.goals.map((g, i) => (
              <div key={g.id} className="space-y-2 rounded-md border border-line bg-panel-2 p-3">
                <div className="flex items-center gap-2">
                  <Dot color={g.color} />
                  <span className="num text-[11px] text-dim">G{i + 1}</span>
                  <input className={cx(inputCls, "py-1.5")} value={g.title} onChange={(e) => setGoal(g.id, { title: e.target.value })} aria-label="Goal title" />
                  <Button size="sm" variant="ghost" onClick={() => s.set({ goals: s.goals.filter((x) => x.id !== g.id) })} aria-label="Remove goal">✕</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className={cx(inputCls, "py-1.5")} value={g.category} onChange={(e) => setGoal(g.id, { category: e.target.value as Goal["category"] })} aria-label="Category">
                    {["academic", "career", "health", "skill", "personal"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input type="date" className={cx(inputCls, "py-1.5")} value={g.targetDate} onChange={(e) => setGoal(g.id, { targetDate: e.target.value })} aria-label="Target date" />
                  <select className={cx(inputCls, "py-1.5")} value={g.priority} onChange={(e) => setGoal(g.id, { priority: +e.target.value as 1 | 2 | 3 })} aria-label="Priority">
                    <option value={1}>Priority 1</option><option value={2}>Priority 2</option><option value={3}>Priority 3</option>
                  </select>
                </div>
                <input className={cx(inputCls, "py-1.5")} value={g.successMetric} onChange={(e) => setGoal(g.id, { successMetric: e.target.value })} placeholder="How will you know it's done?" aria-label="Success metric" />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Courses · ${s.courses.length}`} action={<Button size="sm" variant="ghost" onClick={() => s.set({ courses: [...s.courses, { id: uid(), code: "NEW101", name: "New course", credits: 3, difficulty: 3, targetGrade: "A" }] })}>+ Course</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="label text-left"><th className="pb-2 font-normal">Code</th><th className="pb-2 font-normal">Name</th><th className="pb-2 font-normal">Credits</th><th className="pb-2 font-normal">Difficulty</th><th /></tr></thead>
              <tbody>
                {s.courses.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-1.5 pr-2"><input className={cx(inputCls, "num w-24 py-1")} value={c.code} onChange={(e) => setCourse(c.id, { code: e.target.value.toUpperCase() })} aria-label="Code" /></td>
                    <td className="py-1.5 pr-2"><input className={cx(inputCls, "py-1")} value={c.name} onChange={(e) => setCourse(c.id, { name: e.target.value })} aria-label="Name" /></td>
                    <td className="py-1.5 pr-2"><input type="number" min={1} max={6} className={cx(inputCls, "num w-16 py-1")} value={c.credits} onChange={(e) => setCourse(c.id, { credits: +e.target.value })} aria-label="Credits" /></td>
                    <td className="py-1.5 pr-2"><input type="range" min={1} max={5} value={c.difficulty} onChange={(e) => setCourse(c.id, { difficulty: +e.target.value })} aria-label="Difficulty" className="accent-[var(--accent)]" /> <span className="num text-xs text-muted">{c.difficulty}</span></td>
                    <td><Button size="sm" variant="ghost" onClick={() => s.set({ courses: s.courses.filter((x) => x.id !== c.id) })} aria-label="Remove course">✕</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={`Weekly fixed schedule · ${s.events.length}`} action={<Button size="sm" variant="ghost" onClick={() => s.set({ events: [...s.events, { id: uid(), title: "New event", kind: "other", weekdays: [1], start: "09:00", end: "10:00" }] })}>+ Event</Button>}>
          <div className="space-y-2">
            {s.events.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel-2 p-2">
                <input className={cx(inputCls, "min-w-[140px] flex-1 py-1")} value={ev.title} onChange={(e) => setEvent(ev.id, { title: e.target.value })} aria-label="Event title" />
                <Days value={ev.weekdays} onChange={(v) => setEvent(ev.id, { weekdays: v })} />
                <input type="time" className={cx(inputCls, "num w-[110px] py-1")} value={ev.start} onChange={(e) => setEvent(ev.id, { start: e.target.value })} aria-label="Start" />
                <input type="time" className={cx(inputCls, "num w-[110px] py-1")} value={ev.end} onChange={(e) => setEvent(ev.id, { end: e.target.value })} aria-label="End" />
                <Button size="sm" variant="ghost" onClick={() => s.set({ events: s.events.filter((x) => x.id !== ev.id) })} aria-label="Remove event">✕</Button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="label">{label}</span>{children}</label>;
}

function Days({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Days">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = value.includes(d as Weekday);
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange((on ? value.filter((x) => x !== d) : [...value, d as Weekday]).sort() as Weekday[])}
            className={cx("num h-7 w-8 rounded text-[11px]", on ? "bg-accent/20 text-accent" : "bg-panel text-dim hover:text-muted")}>{WEEKDAYS[d].slice(0, 2)}</button>
        );
      })}
    </div>
  );
}
