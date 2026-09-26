"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, fmtDate, fmtTime, mondayOf, toMin, today } from "@/lib/date";
import { buildDay } from "@/lib/scheduler";
import { useStore } from "@/lib/store";
import type { TimeBlock } from "@/lib/types";
import { Button, cx, Panel } from "@/components/ui";

const START_H = 7;
const END_H = 24;
const PX = 44; // px per hour

export default function WeekPage() {
  const s = useStore();
  const [ws, setWs] = useState(mondayOf(today()));
  const t0 = today();
  useEffect(() => { s.ensureDay(t0); }, [t0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Projection: today's stored schedule + simulated future days (each task appears once)
  const days = useMemo(() => {
    if (!s.profile) return [];
    const out: { date: string; blocks: TimeBlock[]; projected: boolean }[] = [];
    const taken = new Set((s.days[t0] ?? []).filter((b) => b.taskId && b.state !== "skipped").map((b) => b.taskId!));
    // simulate from tomorrow up to the end of the viewed week
    const sim: Record<string, TimeBlock[]> = {};
    const last = addDays(ws, 6);
    for (let d = addDays(t0, 1); d <= last; d = addDays(d, 1)) {
      const r = buildDay({ date: d, profile: s.profile, events: s.events, tasks: s.tasks.filter((t) => !taken.has(t.id)) });
      r.scheduled.forEach((id) => taken.add(id));
      sim[d] = r.blocks;
    }
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      if (d === t0) out.push({ date: d, blocks: s.days[t0] ?? [], projected: false });
      else if (d > t0) out.push({ date: d, blocks: sim[d] ?? [], projected: true });
      else {
        // past: fixed events + what got done that day
        const ev = buildDay({ date: d, profile: s.profile, events: s.events, tasks: [] }).blocks.filter((b) => b.kind !== "meal");
        const done = s.tasks.filter((t) => t.doneAt === d);
        let cursor = toMin(s.profile.wake) + 60;
        const doneBlocks: TimeBlock[] = done.map((t) => {
          const b: TimeBlock = { id: `past-${t.id}`, date: d, start: `${String(Math.floor(cursor / 60) % 24).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`, end: "", kind: "task", taskId: t.id, title: t.title, state: "done" };
          cursor = Math.min(cursor + t.estimate + 10, 23 * 60);
          b.end = `${String(Math.floor(Math.min(cursor - 10, 23 * 60 + 50) / 60)).padStart(2, "0")}:${String(Math.min(cursor - 10, 23 * 60 + 50) % 60).padStart(2, "0")}`;
          return b;
        });
        out.push({ date: d, blocks: [...ev, ...doneBlocks.filter((b) => !ev.some((e) => toMin(e.start) < toMin(b.end) && toMin(e.end) > toMin(b.start)))], projected: false });
      }
    }
    return out;
  }, [s.profile, s.events, s.tasks, s.days, ws, t0]);

  if (!s.profile) return null;
  const color = (b: TimeBlock) => {
    const t = s.tasks.find((x) => x.id === b.taskId);
    return s.goals.find((g) => g.id === t?.goalId)?.color ?? "var(--accent)";
  };
  const tierOf = (b: TimeBlock) => s.tasks.find((x) => x.id === b.taskId)?.tier;
  const weekMin = days.reduce((a, d) => a + d.blocks.filter((b) => b.kind === "task").reduce((x, b) => x + toMin(b.end) - toMin(b.start), 0), 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label !text-accent">Week</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{fmtDate(ws, { month: "long", day: "numeric" })} – {fmtDate(addDays(ws, 6), { month: "long", day: "numeric" })}</h1>
          <p className="mt-1 text-sm text-muted"><span className="num">{(weekMin / 60).toFixed(1)} h</span> of goal work around your classes · future days are a projection and re-plan every night.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setWs(addDays(ws, -7))}>← Prev</Button>
          <Button size="sm" onClick={() => setWs(mondayOf(today()))}>This week</Button>
          <Button size="sm" variant="ghost" onClick={() => setWs(addDays(ws, 7))}>Next →</Button>
        </div>
      </div>

      <Panel pad={false}>
        <div className="overflow-x-auto">
          <div className="grid min-w-[860px] grid-cols-[48px_repeat(7,1fr)]">
            <div />
            {days.map((d) => (
              <div key={d.date} className={cx("border-b border-l border-line px-2 py-2", d.date === t0 && "bg-accent/5")}>
                <div className={cx("label", d.date === t0 && "!text-accent")}>{fmtDate(d.date, { weekday: "short" })}</div>
                <div className="num text-sm">{fmtDate(d.date, { day: "numeric" })}{d.projected && <span className="ml-1 text-[10px] text-dim">proj.</span>}</div>
              </div>
            ))}
            <div className="relative" style={{ height: (END_H - START_H) * PX }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <span key={i} className="num absolute right-1.5 text-[10px] text-dim" style={{ top: i * PX - 6 }}>{i ? fmtTime(`${String(START_H + i).padStart(2, "0")}:00`) : ""}</span>
              ))}
            </div>
            {days.map((d) => (
              <div key={d.date} className={cx("relative border-l border-line", d.date === t0 && "bg-accent/[0.03]")} style={{ height: (END_H - START_H) * PX }}>
                {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * PX }} />)}
                {d.blocks.filter((b) => b.kind !== "meal").map((b) => {
                  const top = ((toMin(b.start) - START_H * 60) / 60) * PX;
                  const h = Math.max(16, ((toMin(b.end) - toMin(b.start)) / 60) * PX - 2);
                  if (top < 0) return null;
                  const isTask = b.kind === "task";
                  const c = color(b);
                  return (
                    <div key={b.id} title={`${fmtTime(b.start)}–${fmtTime(b.end)} ${b.title}`}
                      className={cx("absolute inset-x-1 overflow-hidden rounded px-1.5 py-1 text-[11px] leading-tight", isTask ? "border-l-2" : "border border-line-2 bg-panel-2 text-dim", d.projected && isTask && "opacity-80", b.state === "done" && "opacity-60")}
                      style={{ top, height: h, ...(isTask ? { borderLeftColor: c, background: `color-mix(in srgb, ${c} 16%, var(--panel))` } : {}) }}>
                      <div className="num text-[9px] text-dim">{fmtTime(b.start)}{isTask && tierOf(b) ? ` · ${tierOf(b) === "primary" ? "P1" : tierOf(b) === "secondary" ? "P2" : "P3"}` : ""}</div>
                      <div className={cx("line-clamp-3", b.state === "done" && "line-through")}>{b.title}</div>
                    </div>
                  );
                })}
                {d.date === t0 && (() => {
                  const n = new Date();
                  const top = ((n.getHours() * 60 + n.getMinutes() - START_H * 60) / 60) * PX;
                  return top > 0 ? <div className="absolute inset-x-0 z-10 border-t-2 border-accent" style={{ top }}><span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-accent" /></div> : null;
                })()}
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
