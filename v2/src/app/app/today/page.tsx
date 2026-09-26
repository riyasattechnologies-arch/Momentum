"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { coachMessage } from "@/lib/ai/client";
import { addDays, fmtDate, fmtTime, nowMin, toMin, today } from "@/lib/date";
import { morningBrief, risks, streakOf } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { Task, TimeBlock } from "@/lib/types";
import { Button, cx, Dot, Panel, Stat, TierBadge } from "@/components/ui";

export default function TodayPage() {
  const s = useStore();
  const d = today();
  const [now, setNow] = useState(nowMin());
  useEffect(() => { const t = setInterval(() => setNow(nowMin()), 20000); return () => clearInterval(t); }, []);
  useEffect(() => { s.ensureDay(d); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks: TimeBlock[] = s.days[d] ?? [];
  const taskOf = (b: TimeBlock) => s.tasks.find((t) => t.id === b.taskId);
  const goalOf = (t?: Task) => s.goals.find((g) => g.id === t?.goalId);
  const riskTop = useMemo(() => (s.profile ? risks(s.profile, s.goals, s.tasks, s.milestones)[0] : undefined), [s.profile, s.goals, s.tasks, s.milestones]);

  const yesterday = addDays(d, -1);
  const missedYesterday = s.tasks.some((t) => t.tier === "primary" && t.due === yesterday && t.status === "todo");
  const brief = s.profile ? morningBrief(s.profile.coachStyle, s.profile.name, blocks, s.tasks, missedYesterday, riskTop) : { headline: "", body: "" };
  const aiBrief = s.checkins.find((c) => c.date === d && c.type === "morning")?.aiMessage;

  useEffect(() => {
    if (!s.profile || aiBrief || !blocks.length) return;
    let cancel = false;
    coachMessage(s.profile.coachStyle, s.profile.name, "morning", {
      why: s.goals[0]?.why, missedYesterday, risk: riskTop?.title,
      schedule: blocks.map((b) => ({ start: b.start, end: b.end, title: b.title, kind: b.kind, tier: taskOf(b)?.tier })),
    }).then((m) => { if (m && !cancel) useStore.getState().saveCheckin({ date: d, type: "morning", aiMessage: `${m.headline}\n${m.body}` }); });
    return () => { cancel = true; };
  }, [blocks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const taskBlocks = blocks.filter((b) => b.kind === "task");
  const uniq = (tier: Task["tier"]) => [...new Map(taskBlocks.map((b) => taskOf(b)).filter((t): t is Task => !!t && t.tier === tier).map((t) => [t.id, t])).values()];
  const primary = uniq("primary");
  const secondary = uniq("secondary");
  const tertiary = uniq("tertiary");
  const doneBlocks = taskBlocks.filter((b) => b.state === "done").length;
  const minsLeft = taskBlocks.filter((b) => b.state !== "done" && b.state !== "skipped" && b.state !== "missed").reduce((a, b) => a + toMin(b.end) - toMin(b.start), 0);
  const current = taskBlocks.find((b) => toMin(b.start) <= now && toMin(b.end) > now && b.state !== "done" && b.state !== "skipped");
  const next = current ?? taskBlocks.find((b) => toMin(b.start) > now && (b.state === "pending" || !b.state));
  const overdue = s.tasks.filter((t) => t.status === "todo" && t.due < d && t.tier !== "tertiary" && !taskBlocks.some((b) => b.taskId === t.id)).slice(0, 5);
  const [bHead, ...bRest] = (aiBrief ?? `${brief.headline}\n${brief.body}`).split("\n");

  if (!s.profile) return null;
  return (
    <div className="grid gap-5">
      {/* Brief */}
      <section className="relative overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-br from-accent/10 via-panel to-panel p-5">
        <div className="label !text-accent">Morning brief · {fmtDate(d, { weekday: "long", month: "long", day: "numeric" })} {aiBrief ? "· Gemini" : ""}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{bHead}</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{bRest.join(" ")}</p>
        {s.goals[0]?.why && <p className="mt-3 text-xs text-dim">Why you're doing this: “{s.goals[0].why}”</p>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Blocks done" value={`${doneBlocks}/${taskBlocks.length}`} sub="today" tone={taskBlocks.length && doneBlocks === taskBlocks.length ? "good" : undefined} />
        <Stat label="Focus left" value={`${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`} sub="scheduled today" />
        <Stat label="Streak" value={`${streakOf(s.tasks)}d`} sub="days with a task done" tone={streakOf(s.tasks) >= 3 ? "good" : undefined} />
        <Stat label={current ? "In progress" : "Next block"} value={next ? (current ? `${toMin(next.end) - now}m left` : `in ${Math.max(0, toMin(next.start) - now)}m`) : "—"} sub={next ? next.title : "Nothing left today"} />
      </div>

      {!s.profile.remindersOn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-2 bg-panel px-4 py-3 text-sm">
          <span className="text-muted">Turn on reminders so I can ping you {s.profile.reminderLead} minutes before each block.</span>
          <Button size="sm" variant="primary" onClick={async () => {
            try { if ("Notification" in window) await Notification.requestPermission(); } catch { /* ignore */ }
            useStore.getState().set({ profile: { ...s.profile!, remindersOn: true } });
          }}>Turn on reminders</Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Schedule" action={<Button size="sm" variant="ghost" onClick={() => s.rebuildDay(d)}>Rebuild today</Button>} pad={false}>
          <ol className="relative">
            {blocks.length === 0 && <li className="p-6 text-sm text-muted">Nothing scheduled today. Rest day, or rebuild to pull work forward.</li>}
            {blocks.map((b) => {
              const t = taskOf(b);
              const g = goalOf(t);
              const isNow = toMin(b.start) <= now && toMin(b.end) > now;
              const past = toMin(b.end) <= now;
              const state = b.state ?? "pending";
              return (
                <li key={b.id} className={cx("relative flex flex-wrap gap-3 border-b border-line px-4 py-3 last:border-0 sm:flex-nowrap", isNow && "bg-accent/5", b.kind !== "task" && "opacity-80")}>
                  {isNow && <span className="absolute left-0 top-0 h-full w-0.5 bg-accent" />}
                  <div className="num w-[74px] shrink-0 pt-0.5 text-xs text-muted">{fmtTime(b.start)}<div className="text-dim">{fmtTime(b.end)}</div></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {t ? <TierBadge tier={t.tier} /> : <span className="num rounded border border-line-2 px-1.5 text-[10px] uppercase text-dim">{b.kind}</span>}
                      <span className={cx("text-sm", state === "done" && "text-muted line-through", (state === "skipped" || state === "missed") && "text-dim line-through")}>{b.title}</span>
                      {b.part && <span className="num text-[10px] text-dim">part {b.part}</span>}
                      {b.locked && b.kind === "task" && <span className="num text-[10px] text-dim">locked</span>}
                      {t && t.due < d && t.status !== "done" && <span className="num rounded bg-warn/15 px-1.5 text-[10px] text-warn">carried over</span>}
                    </div>
                    {t && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-dim">
                        {g && <><Dot color={g.color} />{g.title}</>}
                        <span className="num">· {t.energy} energy</span>
                        {state !== "pending" && <span className={cx("num uppercase", state === "done" ? "text-good" : state === "started" ? "text-accent" : "text-bad")}>· {state}</span>}
                      </div>
                    )}
                  </div>
                  {b.kind === "task" && state !== "done" && state !== "skipped" && (
                    <div className="ml-[86px] flex shrink-0 items-start gap-1 sm:ml-0">
                      {state !== "started" && !past && <Button size="sm" variant={isNow ? "primary" : "outline"} onClick={() => s.blockAction(b.id, "start")}>Start</Button>}
                      <Button size="sm" variant={state === "started" ? "primary" : "outline"} onClick={() => s.blockAction(b.id, "done")}>Done</Button>
                      <Button size="sm" variant="ghost" onClick={() => s.blockAction(b.id, "skip")}>Skip</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Priorities today">
            <TierList label="Your one thing" tone="text-accent" tasks={primary} />
            <TierList label="Secondary" tone="text-muted" tasks={secondary} />
            <TierList label="Tertiary · if you have energy" tone="text-dim" tasks={tertiary} />
          </Panel>
          {overdue.length > 0 && (
            <Panel title={`Carried over · ${overdue.length}`}>
              <ul className="space-y-2">
                {overdue.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <TierBadge tier={t.tier} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="num text-[11px] text-bad">due {fmtDate(t.due, { month: "numeric", day: "numeric" })}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-dim">These get priority when you rebuild today or tomorrow.</p>
            </Panel>
          )}
          <Panel title="Evening review">
            <p className="text-sm text-muted">Close the day: mark what happened, rate your energy, and I'll re-plan tomorrow.</p>
            <Link href="/app/review" className="mt-3 inline-flex"><Button variant={now > toMin(s.profile.sleep) - 150 ? "primary" : "outline"}>Start evening review</Button></Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TierList({ label, tone, tasks }: { label: string; tone: string; tasks: Task[] }) {
  const setStatus = useStore((s) => s.setTaskStatus);
  if (!tasks.length) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className={cx("label mb-1.5", tone && `!${tone}`)}>{label}</div>
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={t.status === "done"} onChange={() => setStatus(t.id, t.status === "done" ? "todo" : "done")} />
              <span className={cx(t.status === "done" && "text-muted line-through")}>{t.title} <span className="num text-[11px] text-dim">{t.estimate}m</span></span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
