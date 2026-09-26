"use client";
import { motion } from "motion/react";
import { useState } from "react";
import { today } from "@/lib/date";
import type { Course, Goal, Milestone, Task } from "@/lib/types";

type Node = { id: string; x: number; y: number; r: number; label: string; kind: "you" | "goal" | "milestone" | "course"; color: string; detail: string };

export function OntologyGraph({ name, goals, milestones, tasks, courses }: { name: string; goals: Goal[]; milestones: Milestone[]; tasks: Task[]; courses: Course[] }) {
  const W = 640, H = 460, cx = W / 2, cy = 200;
  const nodes: Node[] = [{ id: "you", x: cx, y: cy, r: 18, label: name, kind: "you", color: "var(--text)", detail: `${goals.length} goals · ${tasks.filter((t) => t.status === "done").length}/${tasks.length} tasks done` }];
  const links: [string, string, string][] = [];
  const t0 = today();
  goals.forEach((g, i) => {
    const a = (i / goals.length) * Math.PI * 2 - Math.PI / 2;
    const gx = cx + Math.cos(a) * 115, gy = cy + Math.sin(a) * 105;
    const gt = tasks.filter((t) => t.goalId === g.id);
    nodes.push({ id: g.id, x: gx, y: gy, r: 13, label: g.title.length > 22 ? g.title.slice(0, 21) + "…" : g.title, kind: "goal", color: g.color, detail: `${g.category} · target ${g.targetDate} · ${gt.filter((t) => t.status === "done").length}/${gt.length} tasks` });
    links.push(["you", g.id, g.color]);
    const ms = milestones.filter((m) => m.goalId === g.id).sort((x, y) => (x.due < y.due ? -1 : 1));
    ms.forEach((m, j) => {
      const spread = Math.min(1.1, 0.28 * ms.length);
      const b = a + (ms.length > 1 ? (j / (ms.length - 1) - 0.5) * spread : 0);
      const mt = tasks.filter((t) => t.milestoneId === m.id);
      nodes.push({ id: m.id, x: cx + Math.cos(b) * 190, y: cy + Math.sin(b) * 172, r: 5 + Math.min(5, mt.length / 6), label: "", kind: "milestone", color: m.status === "done" ? g.color : m.due < t0 ? "var(--bad)" : "var(--line-2)", detail: `${m.title} · due ${m.due} · ${mt.filter((t) => t.status === "done").length}/${mt.length} tasks${m.status === "done" ? " · done" : m.due < t0 ? " · overdue" : ""}` });
      links.push([g.id, m.id, g.color]);
    });
  });
  const acad = goals.find((g) => g.category === "academic");
  courses.forEach((c, i) => {
    const span = Math.min(W - 120, courses.length * 110);
    nodes.push({ id: c.id, x: cx - span / 2 + (courses.length > 1 ? (i / (courses.length - 1)) * span : span / 2), y: H - 26, r: 6, label: c.code, kind: "course", color: "var(--accent-2)", detail: `${c.code} ${c.name} · ${c.credits} credits · difficulty ${c.difficulty}/5` });
    links.push([acad ? acad.id : "you", c.id, "var(--accent-2)"]);
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const [hover, setHover] = useState<Node | null>(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ontology graph linking you, your goals, milestones and courses">
        {links.map(([a, b, c], i) => {
          const A = byId.get(a)!, B = byId.get(b)!;
          return (
            <g key={i}>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={c} strokeOpacity={hover && (hover.id === a || hover.id === b) ? 0.9 : 0.22} strokeWidth={1} />
              <motion.circle r={1.6} fill={c} initial={{ cx: A.x, cy: A.y, opacity: 0 }} animate={{ cx: [A.x, B.x], cy: [A.y, B.y], opacity: [0, 1, 0] }} transition={{ duration: 2.4 + (i % 5) * 0.4, repeat: Infinity, delay: (i % 7) * 0.35, ease: "easeInOut" }} />
            </g>
          );
        })}
        {nodes.map((n, i) => (
          <motion.g key={n.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.02 * i, duration: 0.4 }} style={{ transformOrigin: `${n.x}px ${n.y}px`, cursor: "pointer" }}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n)} tabIndex={0} aria-label={n.detail}>
            {n.kind === "milestone" ? (
              <rect x={n.x - n.r} y={n.y - n.r} width={n.r * 2} height={n.r * 2} transform={`rotate(45 ${n.x} ${n.y})`} fill={n.color} stroke="var(--bg)" />
            ) : (
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.kind === "you" ? "var(--panel-2)" : n.color} stroke={n.kind === "you" ? "var(--text)" : "var(--bg)"} strokeWidth={n.kind === "you" ? 1.5 : 2} fillOpacity={n.kind === "goal" ? 0.9 : 1} />
            )}
            {n.label && <text x={n.x} y={n.y + n.r + 12} fontSize={n.kind === "course" ? 9 : 10.5} textAnchor="middle" fill={n.kind === "course" ? "var(--accent-2)" : "var(--text)"} fontFamily={n.kind === "course" ? "var(--font-mono)" : undefined}>{n.label}</text>}
          </motion.g>
        ))}
      </svg>
      <div className="num pointer-events-none absolute left-2 top-2 max-w-[70%] rounded border border-line-2 bg-panel-2/90 px-2 py-1 text-[11px] text-muted">{hover ? hover.detail : "Hover a node · ● goal ◆ milestone ● course"}</div>
    </div>
  );
}
