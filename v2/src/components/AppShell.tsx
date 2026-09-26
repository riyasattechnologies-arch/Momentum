"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { aiEnabled } from "@/lib/ai/client";
import { fmtDate, fmtTime, nowMin, toMin, today } from "@/lib/date";
import { nudgeText } from "@/lib/insights";
import { useStore } from "@/lib/store";
import type { TimeBlock } from "@/lib/types";
import { ChatDrawer } from "./ChatDrawer";
import { Button, cx, Kbd } from "./ui";

const NAV = [
  { href: "/app/today", label: "Today", key: "t", icon: "M12 3v2m0 14v2M5 12H3m18 0h-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" },
  { href: "/app/week", label: "Week", key: "w", icon: "M4 6h16M4 6v14h16V6M8 3v4m8-4v4M4 11h16" },
  { href: "/app/plan", label: "Plan", key: "p", icon: "M4 6h10M4 12h16M4 18h7" },
  { href: "/app/command", label: "Command", key: "c", icon: "M4 20V10m6 10V4m6 16v-7m6 7H2" },
  { href: "/app/review", label: "Review", key: "r", icon: "M5 12.5 9.5 17 19 7.5" },
  { href: "/app/settings", label: "Settings", key: "s", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" },
];

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    const done = () => setH(true);
    if (useStore.persist.hasHydrated()) done();
    const unsub = useStore.persist.onFinishHydration(done);
    return unsub;
  }, []);
  return h;
}

type Toast = { id: string; blockId: string; title: string; body: string; level: number };

function notify(title: string, body: string, blockId: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg) reg.showNotification(title, { body, tag: blockId, icon: "/icon.svg", data: { blockId }, ...({ actions: [{ action: "start", title: "Start" }, { action: "snooze", title: "Snooze 15m" }] } as object) });
      else new Notification(title, { body, tag: blockId, icon: "/icon.svg" });
    });
  } catch {
    /* notifications unavailable */
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const path = usePathname();
  const router = useRouter();
  const s = useStore();
  const [chat, setChat] = useState(false);
  const [clock, setClock] = useState("");
  const [ai, setAi] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const gPressed = useRef(0);

  useEffect(() => { aiEnabled().then(setAi); }, []);
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Stage routing guard
  useEffect(() => {
    if (!hydrated) return;
    if (s.stage === "intake" || s.stage === "review") {
      if (!path.startsWith("/app/onboarding") && !path.startsWith("/app/settings")) router.replace("/app/onboarding");
    } else if (s.stage === "proposal") {
      if (!path.startsWith("/app/plan") && !path.startsWith("/app/settings") && !path.startsWith("/app/onboarding")) router.replace("/app/plan");
    }
  }, [hydrated, s.stage, path, router]);

  // Reminder engine: runs every 15 s while the app is open
  const act = useCallback((blockId: string, action: string) => {
    const st = useStore.getState();
    if (action === "start" || action === "done" || action === "skip" || action === "snooze") st.blockAction(blockId, action);
    setToasts((t) => t.filter((x) => x.blockId !== blockId));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const run = () => {
      const st = useStore.getState();
      if (st.stage !== "active" || !st.profile) return;
      const d = today();
      st.ensureDay(d);
      st.markMissed();
      const now = nowMin();
      const blocks: TimeBlock[] = useStore.getState().days[d] ?? [];
      for (const b of blocks) {
        if (b.kind !== "task" || (b.state && b.state !== "pending")) continue;
        const lvl = st.reminded[b.id] ?? 0;
        const start = toMin(b.start);
        const task = st.tasks.find((t) => t.id === b.taskId);
        const tierTxt = task ? { primary: "Primary", secondary: "Secondary", tertiary: "Optional" }[task.tier] : "";
        let next: Toast | null = null;
        if (lvl < 1 && now >= start - st.profile.reminderLead && now < start + 15) {
          next = { id: `${b.id}-1`, blockId: b.id, level: 1, title: `Up next ${fmtTime(b.start)}–${fmtTime(b.end)}`, body: `${b.title}${b.part ? ` (part ${b.part})` : ""} · ${tierTxt}` };
        } else if (lvl < 2 && now >= start + 15 && now < toMin(b.end)) {
          next = { id: `${b.id}-2`, blockId: b.id, level: 2, title: "Still waiting on you", body: nudgeText(st.profile.coachStyle, st.profile.name, b.title) };
        }
        if (next) {
          useStore.setState((x) => ({ reminded: { ...x.reminded, [b.id]: next!.level } }));
          const n = next;
          setToasts((t) => [...t.filter((x) => x.blockId !== n.blockId), n].slice(-3));
          if (st.profile.remindersOn) notify(n.title, n.body, b.id);
        }
      }
    };
    run();
    const t = setInterval(run, 15000);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "block-action" && e.data.blockId) act(e.data.blockId, e.data.action); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { clearInterval(t); navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, [hydrated, act]);

  // Keyboard: "/" opens chat, "g" then a letter navigates
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.key === "Escape") setChat(false); return; }
      if (e.key === "Escape") setChat(false);
      if (e.key === "/" && useStore.getState().stage === "active") { e.preventDefault(); setChat(true); return; }
      if (e.key === "g") { gPressed.current = Date.now(); return; }
      if (Date.now() - gPressed.current < 1200) {
        const n = NAV.find((x) => x.key === e.key);
        if (n) router.push(n.href);
        gPressed.current = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!hydrated) {
    return <div className="grid min-h-screen place-items-center"><div className="num text-xs text-dim"><span className="pulse-dot">●</span> loading workspace</div></div>;
  }

  const active = s.stage === "active";
  const pendingCount = s.proposals.filter((p) => p.status === "pending" && p.kind !== "initial").length;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[216px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-panel md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-tight">Momentum</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main">
          {active ? NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm", path.startsWith(n.href) ? "bg-accent/12 text-text" : "text-muted hover:bg-panel-2 hover:text-text")}>
              <span className={path.startsWith(n.href) ? "text-accent" : ""}><Icon d={n.icon} /></span>
              <span className="flex-1">{n.label}</span>
              {n.key === "p" && pendingCount > 0 && <span className="num rounded bg-warn/20 px-1.5 text-[10px] text-warn">{pendingCount}</span>}
              <span className="num text-[10px] text-dim">g {n.key}</span>
            </Link>
          )) : (
            <div className="space-y-1 px-2.5 py-2 text-sm">
              {["Interview", "Review summary", "Agree plan"].map((l, i) => {
                const order = ["intake", "review", "proposal"].indexOf(s.stage);
                return <div key={l} className={cx("flex items-center gap-2", i === order ? "text-text" : i < order ? "text-good" : "text-dim")}><span className="num text-[11px]">{i < order ? "✓" : `0${i + 1}`}</span>{l}</div>;
              })}
            </div>
          )}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          {active && <Button className="w-full justify-between" onClick={() => setChat(true)}>Ask chief of staff <Kbd>/</Kbd></Button>}
          <div className="flex items-center justify-between text-[11px]">
            <span className={cx("flex items-center gap-1.5", ai ? "text-good" : "text-dim")}><span className={cx("h-1.5 w-1.5 rounded-full bg-current", ai && "pulse-dot")} />{ai === null ? "…" : ai ? "Gemini online" : "Offline engine"}</span>
            {s.demo && <span className="num rounded border border-warn/40 px-1.5 text-warn">DEMO</span>}
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:px-6" style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))" }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="md:hidden"><img src="/icon.svg" alt="Momentum" className="h-6 w-6" /></Link>
            <span className="num text-xs text-muted">{fmtDate(today(), { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
            <span className="num hidden text-xs text-dim sm:inline">{clock}</span>
          </div>
          <div className="flex items-center gap-2">
            {s.profile && <span className="hidden text-xs text-muted sm:inline">{s.profile.name} · {s.profile.program}{s.plans[0] ? ` · plan v${s.plans[0].version}` : ""}</span>}
            {active && <Button size="sm" variant="outline" className="md:hidden" onClick={() => setChat(true)}>Ask</Button>}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Bottom tabs (mobile) */}
      {active && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Main">
          {NAV.slice(0, 5).map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", path.startsWith(n.href) ? "text-accent" : "text-muted")}>
              <Icon d={n.icon} />{n.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Toasts */}
      <div className={cx("fixed bottom-20 right-4 z-30 flex w-[min(360px,calc(100%-2rem))] flex-col gap-2 md:bottom-6", chat && "hidden")} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx("rounded-lg border bg-panel-2 p-3 shadow-2xl shadow-black/50", t.level === 2 ? "border-warn/50" : "border-accent/50")}>
            <div className={cx("label", t.level === 2 ? "!text-warn" : "!text-accent")}>{t.title}</div>
            <div className="mt-1 text-sm">{t.body}</div>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" onClick={() => act(t.blockId, "start")}>Start</Button>
              <Button size="sm" onClick={() => act(t.blockId, "snooze")}>Snooze 15m</Button>
              <Button size="sm" variant="ghost" onClick={() => act(t.blockId, "skip")}>Skip</Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">✕</Button>
            </div>
          </div>
        ))}
      </div>

      <ChatDrawer open={chat} onClose={() => setChat(false)} />
    </div>
  );
}
