"use client";
import { addDays, diffDays, fmtDate, mondayOf, parse, today } from "@/lib/date";
import type { Goal, Milestone, Task } from "@/lib/types";

// ---------- Semester timeline (Gantt) ----------
export function Gantt({ goals, milestones, tasks, examWeeks, start, end }: { goals: Goal[]; milestones: Milestone[]; tasks: Task[]; examWeeks: string[]; start: string; end: string }) {
  const W = 1000;
  const left = 170;
  const rowH = 44;
  const top = 26;
  const H = top + goals.length * rowH + 8;
  const days = Math.max(14, diffDays(start, end) + 1);
  const x = (d: string) => left + (Math.max(0, Math.min(days, diffDays(start, d))) / days) * (W - left - 10);
  const t0 = today();
  const months: string[] = [];
  for (let d = parse(start); d <= parse(end); d.setMonth(d.getMonth() + 1, 1)) months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Semester timeline of milestones per goal">
        {examWeeks.map((w) => (
          <g key={w}>
            <rect x={x(w)} y={top - 6} width={Math.max(4, x(addDays(w, 7)) - x(w))} height={H - top} fill="var(--warn)" opacity="0.07" />
            <text x={x(w) + 3} y={H - 4} fontSize="9" fill="var(--warn)" fontFamily="var(--font-mono)" opacity="0.8">EXAMS</text>
          </g>
        ))}
        {months.map((m) => (
          <g key={m}>
            <line x1={x(m < start ? start : m)} x2={x(m < start ? start : m)} y1={top - 8} y2={H} stroke="var(--line)" />
            <text x={x(m < start ? start : m) + 4} y={12} fontSize="10" fill="var(--dim)" fontFamily="var(--font-mono)">{fmtDate(m, { month: "short" }).toUpperCase()}</text>
          </g>
        ))}
        {goals.map((g, i) => {
          const y = top + i * rowH;
          const gm = milestones.filter((m) => m.goalId === g.id);
          const gt = tasks.filter((t) => t.goalId === g.id);
          const done = gt.filter((t) => t.status === "done").length;
          const pct = gt.length ? done / gt.length : 0;
          const gEnd = g.targetDate < end ? g.targetDate : end;
          return (
            <g key={g.id}>
              <text x={0} y={y + 16} fontSize="12" fill="var(--text)">{g.title.length > 24 ? g.title.slice(0, 23) + "…" : g.title}</text>
              <text x={0} y={y + 30} fontSize="10" fill="var(--dim)" fontFamily="var(--font-mono)">{Math.round(pct * 100)}% · {gm.length} MS</text>
              <rect x={x(start)} y={y + 14} width={x(gEnd) - x(start)} height={6} rx={3} fill="var(--line-2)" />
              <rect x={x(start)} y={y + 14} width={(x(gEnd) - x(start)) * pct} height={6} rx={3} fill={g.color} opacity="0.85" />
              {gm.map((m) => {
                const mx = x(m.due);
                const late = m.status !== "done" && m.due < t0;
                return (
                  <g key={m.id}>
                    <title>{`${m.title} · due ${m.due}${m.status === "done" ? " · done" : late ? " · overdue" : ""}`}</title>
                    <rect x={mx - 5} y={y + 12} width={10} height={10} transform={`rotate(45 ${mx} ${y + 17})`} fill={m.status === "done" ? g.color : "var(--panel)"} stroke={late ? "var(--bad)" : g.color} strokeWidth={1.6} />
                  </g>
                );
              })}
              <circle cx={x(gEnd)} cy={y + 17} r={4} fill="var(--panel)" stroke="var(--text)" strokeWidth={1.4} />
            </g>
          );
        })}
        {t0 >= start && t0 <= end && (
          <g>
            <line x1={x(t0)} x2={x(t0)} y1={top - 10} y2={H} stroke="var(--accent)" strokeDasharray="3 3" />
            <text x={x(t0) + 4} y={top - 2} fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono)">TODAY</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------- Weekly load bars ----------
export function LoadBars({ tasks, weeklyHours, start, weeks = 12, onPick, picked }: { tasks: Task[]; weeklyHours: number; start: string; weeks?: number; onPick?: (w: string) => void; picked?: string }) {
  const ws = Array.from({ length: weeks }, (_, i) => addDays(mondayOf(start), i * 7));
  const vals = ws.map((w) => tasks.filter((t) => t.status !== "skipped" && t.earliest >= w && t.earliest <= addDays(w, 6)).reduce((a, t) => a + t.estimate, 0) / 60);
  const max = Math.max(weeklyHours * 1.25, ...vals, 1);
  return (
    <div>
      <div className="relative flex h-36 items-end gap-1.5">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted/60" style={{ bottom: `${(weeklyHours / max) * 100}%` }}>
          <span className="num absolute -top-4 right-0 text-[10px] text-muted">{weeklyHours} h available</span>
        </div>
        {ws.map((w, i) => {
          const over = vals[i] > weeklyHours * 1.02;
          return (
            <button key={w} onClick={() => onPick?.(w)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${w}: ${vals[i].toFixed(1)} h`}>
              <span className="num text-[10px] text-dim group-hover:text-text">{vals[i].toFixed(0)}</span>
              <span className={`w-full max-w-9 rounded-t ${over ? "bg-bad" : picked === w ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70"}`} style={{ height: `${(vals[i] / max) * 100}%`, minHeight: 2 }} />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {ws.map((w) => <span key={w} className={`num flex-1 text-center text-[9px] ${picked === w ? "text-accent" : "text-dim"}`}>{fmtDate(w, { month: "numeric", day: "numeric" })}</span>)}
      </div>
    </div>
  );
}

// ---------- Workload heatmap (4 weeks x 7 days) ----------
export function Heatmap({ tasks, start }: { tasks: Task[]; start: string }) {
  const ws = mondayOf(start);
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = addDays(ws, i);
    const min = tasks.filter((t) => t.status !== "skipped" && t.earliest === d).reduce((a, t) => a + t.estimate, 0);
    return { d, h: min / 60 };
  });
  const max = Math.max(3, ...cells.map((c) => c.h));
  return (
    <div>
      <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-1">
        <span />
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="num text-center text-[10px] text-dim">{d}</span>)}
        {[0, 1, 2, 3].map((r) => (
          <div key={r} className="contents">
            <span className="num self-center text-[10px] text-dim">W{r + 1}</span>
            {cells.slice(r * 7, r * 7 + 7).map((c) => (
              <div key={c.d} title={`${c.d}: ${c.h.toFixed(1)} h starting`} className={`aspect-[1.6] rounded-sm ${c.d === today() ? "ring-1 ring-accent" : ""}`} style={{ background: c.h ? `color-mix(in srgb, var(--accent) ${Math.round(18 + (c.h / max) * 70)}%, var(--panel-2))` : "var(--panel-2)" }} />
            ))}
          </div>
        ))}
      </div>
      <div className="num mt-2 flex items-center gap-2 text-[10px] text-dim">less <span className="h-2 w-16 rounded" style={{ background: "linear-gradient(90deg, var(--panel-2), var(--accent))" }} /> more</div>
    </div>
  );
}

// ---------- Execution trend (planned vs done minutes, last 14 days) ----------
export function Trend({ tasks, days = 14 }: { tasks: Task[]; days?: number }) {
  const t0 = today();
  const ds = Array.from({ length: days }, (_, i) => addDays(t0, i - days + 1));
  const planned = ds.map((d) => tasks.filter((t) => t.earliest === d && t.status !== "skipped").reduce((a, t) => a + t.estimate, 0));
  const done = ds.map((d) => tasks.filter((t) => t.status === "done" && t.doneAt === d).reduce((a, t) => a + t.estimate, 0));
  const W = 560;
  const H = 150;
  const pad = 22;
  const max = Math.max(60, ...planned, ...done);
  const x = (i: number) => pad + (i / (days - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Planned versus completed minutes over the last 14 days">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
          <text x={2} y={y(max * f) + 3} fontSize="9" fill="var(--dim)" fontFamily="var(--font-mono)">{Math.round((max * f) / 60)}h</text>
        </g>
      ))}
      <path d={`${line(done)} L${x(days - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--accent)" opacity="0.12" />
      <path d={line(planned)} fill="none" stroke="var(--dim)" strokeDasharray="4 3" strokeWidth={1.5} />
      <path d={line(done)} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <circle cx={x(days - 1)} cy={y(done[days - 1])} r={3.5} fill="var(--accent)" />
      {ds.map((d, i) => (i % 3 === 0 || i === days - 1) && <text key={d} x={x(i)} y={H - 6} fontSize="9" fill="var(--dim)" textAnchor="middle" fontFamily="var(--font-mono)">{fmtDate(d, { month: "numeric", day: "numeric" })}</text>)}
    </svg>
  );
}
