"use client";
import Link from "next/link";
import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Gantt } from "@/components/charts";
import { OntologyGraph } from "@/components/OntologyGraph";
import { goalHealth, risks } from "@/lib/insights";
import { buildDemoData } from "@/lib/seed";
import { NetworkCanvas } from "./NetworkCanvas";

type Demo = ReturnType<typeof buildDemoData>;
const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, y = 24, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, delay, ease }}>
      {children}
    </motion.div>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, to, { duration: 1.6, ease });
    const un = mv.on("change", (x) => setV(Math.round(x)));
    return () => { c.stop(); un(); };
  }, [inView, to, mv]);
  return <span ref={ref} className="num">{v}{suffix}</span>;
}

const TICKER = ["SYS ● ONLINE", "INTAKE → PLAN → SCHEDULE → REMIND → ADAPT", "P1 / P2 / P3 EVERY DAY", "AI PROPOSES · YOU DECIDE", "EVERY CHANGE VERSIONED", "DETERMINISTIC SCHEDULER", "GEMINI-POWERED PLANNING", "BUILT FOR FIRST-SEMESTER STUDENTS"];

function Ticker() {
  const row = [...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden border-b border-line bg-panel/70 py-1.5">
      <motion.div className="flex w-max gap-10 whitespace-nowrap" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        {row.map((t, i) => <span key={i} className="num text-[10.5px] tracking-[0.18em] text-dim">{t.includes("●") ? <><span className="pulse-dot text-good">●</span>{t.replace("SYS ●", " SYS")}</> : t}</span>)}
      </motion.div>
    </div>
  );
}

const CONSOLE: { k: "cmd" | "ok" | "user" | "warn"; t: string }[] = [
  { k: "cmd", t: "intake.parse(answers)" },
  { k: "ok", t: "profile ✓  4 courses · 5 fixed events · 3 goals" },
  { k: "cmd", t: "planner.propose(semester)" },
  { k: "ok", t: "14 milestones · 286 tasks · 17.5 h/wk (budget 18 h)" },
  { k: "user", t: "“October has midterms, lighten it”" },
  { k: "warn", t: "proposal #2   − 9 optional   ~ 12 shortened" },
  { k: "ok", t: "approved → plan v2 locked" },
  { k: "cmd", t: "scheduler.buildDay(Mon)" },
  { k: "ok", t: "8 blocks around 3 classes · P1 in peak hours" },
  { k: "warn", t: "16:50  Up next: CS1428 problem set · P1" },
];

function ConsoleCard() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x >= CONSOLE.length + 4 ? 0 : x + 1)), 900);
    return () => clearInterval(t);
  }, []);
  const color = { cmd: "text-accent", ok: "text-good", user: "text-text", warn: "text-warn" };
  return (
    <div className="relative overflow-hidden rounded-xl border border-line-2 bg-[#0b1015]/90 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-bad/70" /><span className="h-2.5 w-2.5 rounded-full bg-warn/70" /><span className="h-2.5 w-2.5 rounded-full bg-good/70" />
        <span className="num ml-2 text-[11px] text-dim">momentum://aisha/semester-1</span>
        <span className="num ml-auto flex items-center gap-1.5 text-[10px] text-good"><span className="pulse-dot">●</span>LIVE</span>
      </div>
      <div className="num h-[300px] space-y-1.5 overflow-hidden p-4 text-[12.5px] leading-relaxed">
        {CONSOLE.slice(0, Math.min(n, CONSOLE.length)).map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="flex gap-2">
            <span className="text-dim">{l.k === "cmd" ? "›" : l.k === "user" ? "@" : " "}</span>
            <span className={color[l.k]}>{l.t}</span>
          </motion.div>
        ))}
        {n <= CONSOLE.length && <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-accent/80" />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-[scan_6s_linear_infinite] bg-gradient-to-b from-transparent via-accent/[0.04] to-transparent" />
    </div>
  );
}

function StepVisual({ i }: { i: number }) {
  const inViewRef = useRef<HTMLDivElement>(null);
  const inView = useInView(inViewRef, { once: true, margin: "-40px" });
  const common = "num text-[11px]";
  if (i === 0) return (
    <div ref={inViewRef} className="space-y-2">
      {["When is your brain sharpest?", "Morning.", "Hours a week for goals?", "18, Sunday off."].map((t, k) => (
        <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.25 * k }} className={`flex ${k % 2 ? "justify-end" : ""}`}>
          <span className={`rounded-md px-2 py-1 text-[12px] ${k % 2 ? "bg-accent/20 text-text" : "border border-line-2 text-muted"}`}>{t}</span>
        </motion.div>
      ))}
    </div>
  );
  if (i === 1) return (
    <div ref={inViewRef} className="space-y-1.5">
      {[["+", "Hackathon prep · Oct 18", "text-good"], ["~", "Mock interview → Saturday", "text-warn"], ["~", "Lecture review 50m → 35m", "text-warn"], ["−", "LinkedIn polish (optional)", "text-bad"]].map(([s, t, c], k) => (
        <motion.div key={k} initial={{ opacity: 0, x: 14 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.2 * k }} className={`${common} flex gap-2`}>
          <span className={c}>{s}</span><span className="text-muted">{t}</span>
        </motion.div>
      ))}
    </div>
  );
  if (i === 2) return (
    <div ref={inViewRef} className="space-y-1">
      {[["08:00", "P1 Calculus problem set", "bg-accent/30 border-accent"], ["10:00", "MATH2471 lecture", "bg-panel-2 border-line-2"], ["11:10", "P2 Resume section", "bg-accent/15 border-accent/50"], ["14:00", "CS1428 lecture", "bg-panel-2 border-line-2"], ["16:00", "P3 Mobility, 15 min", "border-dashed border-line-2"]].map(([t, l, c], k) => (
        <motion.div key={k} initial={{ opacity: 0, scaleX: 0.3 }} animate={inView ? { opacity: 1, scaleX: 1 } : {}} style={{ transformOrigin: "left" }} transition={{ delay: 0.15 * k, duration: 0.5, ease }} className={`${common} flex items-center gap-2 rounded border-l-2 px-2 py-1 ${c}`}>
          <span className="text-dim">{t}</span><span className="truncate text-text">{l}</span>
        </motion.div>
      ))}
    </div>
  );
  return (
    <div ref={inViewRef} className="space-y-2">
      <motion.div initial={{ borderColor: "var(--line-2)" }} animate={inView ? { borderColor: ["var(--line-2)", "var(--bad)", "var(--bad)"] } : {}} transition={{ duration: 1.2 }} className={`${common} rounded border px-2 py-1.5 text-muted`}>
        TUE 16:00 · P1 Mock interview <motion.span initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.9 }} className="text-bad">MISSED</motion.span>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 1.4, duration: 0.5 }} className={`${common} rounded border border-accent/60 bg-accent/10 px-2 py-1.5 text-text`}>
        WED 08:00 · P1 Mock interview <span className="text-accent">RESCHEDULED</span>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2 }} className={`${common} text-dim`}>proposal #7 · approve?</motion.div>
    </div>
  );
}

const STEPS = [
  { k: "Interview", t: "It learns who you are", d: "Eleven questions: courses, class times, sleep, energy peaks, hours you can give, and the goals you actually care about. Upload your .ics timetable to skip typing." },
  { k: "Negotiate", t: "You agree on the plan", d: "It proposes a semester of milestones and weekly work that fits your hours. Push back in plain English. Every change comes back as a diff you approve." },
  { k: "Execute", t: "It runs your day", d: "A time-blocked schedule around your classes. One Primary task, a few Secondary, optional Tertiary. Reminders before every block." },
  { k: "Adapt", t: "It re-plans when life happens", d: "Missed a block? Sick until Wednesday? It proposes the smallest fix, you approve, and a new version of the plan is locked." },
];

export default function Landing() {
  const [demo, setDemo] = useState<Demo | null>(null);
  useEffect(() => { setDemo(buildDemoData()); }, []);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(heroP, [0, 1], [0, 120]);
  const heroO = useTransform(heroP, [0, 0.8], [1, 0]);
  const stepsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: stepsP } = useScroll({ target: stepsRef, offset: ["start 75%", "end 60%"] });
  const line = useSpring(stepsP, { stiffness: 80, damping: 20 });
  const dashRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: dashP } = useScroll({ target: dashRef, offset: ["start end", "center center"] });
  const tilt = useTransform(dashP, [0, 1], [18, 0]);
  const scale = useTransform(dashP, [0, 1], [0.92, 1]);
  const health = demo ? demo.goals.map((g) => goalHealth(g, demo.tasks, demo.milestones)) : [];
  const riskList = demo ? risks(demo.profile, demo.goals, demo.tasks, demo.milestones).slice(0, 4) : [];
  const words = "Run your semester like an operation.".split(" ");

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-text">
      <Ticker />
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2.5"><img src="/icon.svg" alt="" className="h-7 w-7" /><span className="font-semibold tracking-tight">Momentum</span></Link>
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#ontology" className="hover:text-text">Ontology</a>
            <a href="#command" className="hover:text-text">Command Center</a>
            <a href="#principles" className="hover:text-text">Principles</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/demo" className="hidden rounded-md px-3 py-1.5 text-sm text-muted hover:text-text sm:inline">Live demo</Link>
            <Link href="/app" className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-[#06101c] hover:bg-[#6aafff]">Launch console</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section ref={heroRef} className="relative isolate overflow-hidden border-b border-line">
        <div className="grid-bg absolute inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <NetworkCanvas className="-z-10" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />
        <motion.div style={{ y: heroY, opacity: heroO }} className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-28">
          <div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="label mb-5 inline-flex items-center gap-2 rounded-full border border-line-2 bg-panel/60 px-3 py-1 !text-accent">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent-2" /> AI chief of staff for students
            </motion.div>
            <h1 className="text-[clamp(2.6rem,6.2vw,5.2rem)] font-semibold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">
              {words.map((w, i) => (
                <motion.span key={i} className="mr-[0.22em] inline-block" initial={{ opacity: 0, y: 30, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.15 + i * 0.08, duration: 0.8, ease }}>
                  {w === "operation." ? <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">{w}</span> : w}
                </motion.span>
              ))}
            </h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.8, ease }} className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Tell Momentum who you want to become. It interviews you, agrees a semester plan with you, builds every day around your classes, and keeps pushing until it's done.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.8, ease }} className="mt-9 flex flex-wrap gap-3">
              <Link href="/app" className="group inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 font-medium text-[#06101c] transition hover:bg-[#6aafff]">Start your interview <span className="transition group-hover:translate-x-1">→</span></Link>
              <Link href="/demo" className="inline-flex h-12 items-center rounded-md border border-line-2 bg-panel/60 px-6 font-medium hover:border-dim">Open the live demo</Link>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="num mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-dim">
              <span>NO ACCOUNT NEEDED</span><span>WORKS OFFLINE</span><span>GEMINI OPTIONAL</span>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.5, duration: 1.1, ease }} style={{ perspective: 1200 }}>
            <ConsoleCard />
          </motion.div>
        </motion.div>
      </section>

      {/* METRICS */}
      <section className="border-b border-line bg-panel/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-line px-4 md:grid-cols-4 md:divide-x md:px-8">
          {[
            [11, "", "questions to a full profile"],
            [3, "", "priority tiers, every single day"],
            [0, "", "silent changes: every AI edit is approved"],
            [100, "%", "of changes versioned and logged"],
          ].map(([n, s, l], i) => (
            <Reveal key={i} delay={i * 0.08} className="px-2 py-8 md:px-8">
              <div className="text-4xl font-semibold tracking-tight md:text-5xl"><Counter to={n as number} suffix={s as string} /></div>
              <div className="mt-2 text-sm text-muted">{l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="relative border-b border-line py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal><div className="label !text-accent">How it works</div></Reveal>
          <Reveal delay={0.05}><h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl [text-wrap:balance]">From “I want to…” to what you do at 4 pm on Tuesday.</h2></Reveal>
          <div ref={stepsRef} className="relative mt-16">
            <div className="absolute left-0 right-0 top-[22px] hidden h-px bg-line lg:block" />
            <motion.div className="absolute left-0 top-[22px] hidden h-px origin-left bg-gradient-to-r from-accent to-accent-2 lg:block" style={{ scaleX: line, width: "100%" }} />
            <div className="grid gap-6 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.k} delay={i * 0.12}>
                  <div className="relative">
                    <div className="num relative z-10 mb-6 flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-bg text-sm text-accent">0{i + 1}</div>
                    <div className="rounded-xl border border-line bg-panel p-5 transition hover:border-line-2">
                      <div className="label">{s.k}</div>
                      <h3 className="mt-2 text-xl font-semibold tracking-tight">{s.t}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
                      <div className="mt-5 min-h-[132px] rounded-lg border border-line bg-bg/60 p-3"><StepVisual i={i} /></div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ONTOLOGY */}
      <section id="ontology" className="relative overflow-hidden border-b border-line py-24">
        <div className="grid-bg absolute inset-0 -z-10 opacity-20" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Reveal><div className="label !text-accent">The ontology</div></Reveal>
            <Reveal delay={0.05}><h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl [text-wrap:balance]">Your life, modeled as objects that link.</h2></Reveal>
            <Reveal delay={0.1}><p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">Goals break into milestones, milestones into tasks, tasks into time blocks around your courses and classes. The AI, the scheduler and the dashboard all read the same model, so nothing drifts out of sync.</p></Reveal>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {["Student", "Goal", "Milestone", "Task", "TimeBlock", "Course", "FixedEvent", "Proposal", "PlanVersion"].map((o, i) => (
                <Reveal key={o} delay={0.04 * i} y={10}>
                  <div className="num flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ["#4c9eff", "#3dd68c", "#f2a33a", "#c38bff", "#2fd3d0"][i % 5] }} />{o}</div>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal delay={0.1}>
            <div className="rounded-xl border border-line-2 bg-panel/80 p-3 shadow-2xl shadow-black/50">
              {demo ? <OntologyGraph name="Aisha" goals={demo.goals} milestones={demo.milestones} tasks={demo.tasks} courses={demo.courses} /> : <div className="aspect-[640/460]" />}
            </div>
          </Reveal>
        </div>
      </section>

      {/* COMMAND CENTER */}
      <section id="command" className="border-b border-line py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <Reveal><div className="label !text-accent">Command Center</div></Reveal>
          <Reveal delay={0.05}><h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl [text-wrap:balance]">Know if you're on track before it's too late.</h2></Reveal>
          <Reveal delay={0.1}><p className="mt-5 max-w-2xl text-lg text-muted">Goal health from planned versus completed work. Risks surface on their own, with a Fix button that drafts the smallest re-plan.</p></Reveal>
          <div ref={dashRef} className="mt-14" style={{ perspective: 1400 }}>
            <motion.div style={{ rotateX: tilt, scale }} className="origin-top rounded-2xl border border-line-2 bg-panel p-4 shadow-[0_40px_120px_-20px_rgba(76,158,255,0.25)] md:p-6">
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-line">
                  <div className="label border-b border-line px-4 py-2.5">Goal health</div>
                  <div className="divide-y divide-line">
                    {health.map((h, i) => (
                      <div key={h.goal.id} className="flex items-center gap-4 px-4 py-3">
                        <span className="h-2 w-2 rounded-full" style={{ background: h.goal.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm">{h.goal.title}</span>
                        <span className={`hidden rounded-full border px-2 py-0.5 text-[11px] sm:inline ${h.health === "on track" ? "border-good/30 text-good" : h.health === "at risk" ? "border-warn/30 text-warn" : "border-bad/30 text-bad"}`}>{h.health}</span>
                        <div className="h-1.5 w-24 rounded bg-line"><motion.div className="h-full rounded" style={{ background: h.goal.color }} initial={{ width: 0 }} whileInView={{ width: `${h.pct}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.15, duration: 1.2, ease }} /></div>
                        <span className="num w-9 text-right text-xs text-muted">{h.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-line">
                  <div className="label border-b border-line px-4 py-2.5">Risk feed</div>
                  <div className="space-y-2 p-3">
                    {riskList.map((r, i) => (
                      <motion.div key={r.id} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.18, duration: 0.6, ease }}
                        className={`flex items-center justify-between gap-2 rounded-md border-l-2 bg-panel-2 px-3 py-2 ${r.severity === "high" ? "border-bad" : r.severity === "medium" ? "border-warn" : "border-dim"}`}>
                        <span className="truncate text-[13px]">{r.title}</span>
                        <span className="num rounded border border-line-2 px-1.5 text-[10px] text-muted">FIX</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-line p-4">
                <div className="label mb-3">Semester timeline</div>
                {demo ? <Gantt goals={demo.goals} milestones={demo.milestones} tasks={demo.tasks} examWeeks={demo.profile.examWeeks} start={demo.profile.semesterStart} end={demo.goals.reduce((m, g) => (g.targetDate > m ? g.targetDate : m), demo.profile.semesterEnd)} /> : <div className="h-40" />}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
      <section id="principles" className="border-b border-line py-24">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <Reveal><div className="label !text-accent">Principles</div></Reveal>
              <Reveal delay={0.05}><h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl [text-wrap:balance]">AI proposes. You decide.</h2></Reveal>
              <div className="mt-10 space-y-8">
                {[
                  ["Human in the loop", "The AI never edits your agreed plan silently. Every change is a proposal with a reason per line. Approve it and a new version is locked."],
                  ["Deterministic core", "Language models are great at understanding you and bad at calendar math. A tested scheduler places every block, so nothing overlaps a class."],
                  ["Built to adapt", "Missed tasks roll forward, optional ones drop first, milestones only move when you say so. The plan bends without breaking."],
                ].map(([t, d], i) => (
                  <Reveal key={t} delay={0.1 * i}>
                    <div className="flex gap-4">
                      <span className="num mt-1 text-sm text-accent">0{i + 1}</span>
                      <div><h3 className="text-lg font-semibold">{t}</h3><p className="mt-1.5 leading-relaxed text-muted">{d}</p></div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
            <Reveal delay={0.15}>
              <div className="rounded-xl border border-accent/40 bg-panel shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><span className="label !text-accent">Proposal #4 · 5 changes</span><span className="num text-[11px] text-warn">PENDING</span></div>
                <p className="px-4 pt-3 text-sm">You're out until Wednesday. Primary tasks move to Thursday and Friday; optional ones are dropped. Milestones stay put.</p>
                <ul className="space-y-2 px-4 py-4">
                  {[["~", "Solve 3 practice problems", "Tue → Thu · moved after you're back", "text-warn"], ["~", "MATH2471: problem set", "Wed → Thu · due Fri unchanged", "text-warn"], ["−", "Update LinkedIn About section", "optional, dropped while you're away", "text-bad"], ["~", "Rewrite one resume section", "Tue → Fri", "text-warn"], ["+", "30-min catch-up block", "Sat 09:00 · protects your streak", "text-good"]].map(([s, t, r, c], i) => (
                    <motion.li key={i} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.12 }} className="flex gap-3 text-sm">
                      <span className={`num w-3 ${c}`}>{s}</span>
                      <div><div className={s === "−" ? "text-muted line-through" : ""}>{t}</div><div className="num text-[11px] text-dim">{r}</div></div>
                    </motion.li>
                  ))}
                </ul>
                <div className="flex gap-2 border-t border-line px-4 py-3">
                  <motion.span initial={{ boxShadow: "0 0 0 0 rgba(76,158,255,0)" }} whileInView={{ boxShadow: ["0 0 0 0 rgba(76,158,255,0.6)", "0 0 0 10px rgba(76,158,255,0)"] }} viewport={{ once: false }} transition={{ duration: 1.6, repeat: Infinity, delay: 1.2 }} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-[#06101c]">Approve changes</motion.span>
                  <span className="rounded-md px-3 py-1.5 text-xs text-muted">Reject</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden py-28">
        <NetworkCanvas density={0.00006} className="-z-10 opacity-70" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(76,158,255,0.14),transparent_60%)]" />
        <div className="mx-auto max-w-4xl px-4 text-center md:px-8">
          <Reveal><h2 className="text-4xl font-semibold tracking-tight md:text-6xl [text-wrap:balance]">Your first semester only happens once.</h2></Reveal>
          <Reveal delay={0.1}><p className="mx-auto mt-5 max-w-xl text-lg text-muted">Ten minutes of questions. A plan you both agree on. A buddy that doesn't let you drift.</p></Reveal>
          <Reveal delay={0.2}>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/app" className="inline-flex h-12 items-center rounded-md bg-accent px-7 font-medium text-[#06101c] hover:bg-[#6aafff]">Start your interview →</Link>
              <Link href="/demo" className="inline-flex h-12 items-center rounded-md border border-line-2 bg-panel/60 px-7 font-medium hover:border-dim">See Aisha's semester</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="num mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[11px] text-dim md:px-8">
          <span>MOMENTUM · AI CHIEF OF STAFF FOR STUDENTS</span>
          <span>BUILT BY SHERBAZ RIASAT · GDG PROJECT SHOWCASE 2026</span>
        </div>
      </footer>
    </div>
  );
}
