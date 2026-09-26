"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aiEnabled } from "@/lib/ai/client";
import { loadDemo } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Button, cx, inputCls, Panel } from "@/components/ui";

export default function SettingsPage() {
  const s = useStore();
  const router = useRouter();
  const [ai, setAi] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const [exportText, setExportText] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { aiEnabled().then(setAi); }, []);
  const p = s.profile;
  const setP = (patch: Partial<Profile>) => p && s.set({ profile: { ...p, ...patch } });
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  function exportData() {
    const st = useStore.getState();
    const data = JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), profile: st.profile, courses: st.courses, events: st.events, goals: st.goals, milestones: st.milestones, tasks: st.tasks, plans: st.plans, proposals: st.proposals, checkins: st.checkins, log: st.log, stage: st.stage }, null, 2);
    setExportText(data);
    try {
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "momentum-backup.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch { /* copy box below covers it */ }
  }
  async function importData(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (!j.profile || !Array.isArray(j.tasks)) throw new Error();
      s.set({ ...j, days: {}, reminded: {}, demo: false });
      flash("Backup imported");
    } catch { flash("That file isn't a Momentum backup"); }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="label !text-accent">Settings</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Workspace</h1>
        </div>
        {msg && <span className="num text-xs text-good">{msg}</span>}
      </div>

      {p && (
        <Panel title="You & your coach">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Name"><input id="s-name" className={inputCls} value={p.name} onChange={(e) => setP({ name: e.target.value })} /></F>
            <F label="Hours / week for goals"><input id="s-hours" type="number" min={1} max={60} className={inputCls} value={p.weeklyHours} onChange={(e) => setP({ weeklyHours: +e.target.value || 1 })} /></F>
            <F label="Wake"><input id="s-wake" type="time" className={inputCls} value={p.wake} onChange={(e) => setP({ wake: e.target.value })} /></F>
            <F label="Sleep"><input id="s-sleep" type="time" className={inputCls} value={p.sleep} onChange={(e) => setP({ sleep: e.target.value })} /></F>
            <F label="Peak energy"><select id="s-peak" className={inputCls} value={p.peakEnergy} onChange={(e) => setP({ peakEnergy: e.target.value as Profile["peakEnergy"] })}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></F>
            <F label="Max focus block (min)"><input id="s-focus" type="number" min={25} max={180} step={5} className={inputCls} value={p.maxFocus} onChange={(e) => setP({ maxFocus: +e.target.value || 90 })} /></F>
          </div>
          <div className="mt-4">
            <div className="label mb-1.5">Coach personality</div>
            <div className="grid grid-cols-3 gap-2">
              {([["gentle", "Gentle", "Kind and patient"], ["coach", "Coach", "Upbeat and direct"], ["drill", "Drill sergeant", "Tough love"]] as const).map(([k, n, d]) => (
                <button key={k} onClick={() => setP({ coachStyle: k })} aria-pressed={p.coachStyle === k} className={cx("rounded-md border p-3 text-left", p.coachStyle === k ? "border-accent bg-accent/10" : "border-line-2 hover:border-dim")}>
                  <div className="text-sm font-medium">{n}</div><div className="text-xs text-muted">{d}</div>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-dim">Schedule changes apply when a day is rebuilt (Today → Rebuild, or automatically tomorrow).</p>
        </Panel>
      )}

      {p && (
        <Panel title="Reminders">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Remind me before each block (min)"><input id="s-lead" type="number" min={0} max={60} className={inputCls} value={p.reminderLead} onChange={(e) => setP({ reminderLead: +e.target.value })} /></F>
            <F label="Status"><div className="flex h-[38px] items-center gap-2 text-sm">{p.remindersOn ? <span className="text-good">On</span> : <span className="text-dim">Off</span>}<span className="text-xs text-dim">· browser notifications {typeof Notification !== "undefined" ? Notification.permission : "unsupported"}</span></div></F>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={p.remindersOn ? "outline" : "primary"} onClick={async () => {
              if (!p.remindersOn) { try { await Notification.requestPermission(); } catch { /* ignore */ } }
              setP({ remindersOn: !p.remindersOn });
            }}>{p.remindersOn ? "Turn off" : "Turn on reminders"}</Button>
            <Button variant="ghost" onClick={async () => {
              try {
                const reg = await navigator.serviceWorker?.getRegistration();
                if (Notification.permission === "granted") { if (reg) await reg.showNotification("Momentum test", { body: "Reminders work on this device.", icon: "/icon.svg" }); else new Notification("Momentum test", { body: "Reminders work on this device." }); flash("Test sent"); }
                else flash("Allow notifications first");
              } catch { flash("Notifications aren't supported here"); }
            }}>Send test notification</Button>
          </div>
          <p className="mt-3 text-xs text-dim">In demo mode reminders fire while Momentum is open (install it to your home screen for best results). With the backend connected, the server sends Web Push even when the app is closed.</p>
        </Panel>
      )}

      <Panel title="AI">
        <div className="flex items-center gap-2 text-sm">
          <span className={cx("h-2 w-2 rounded-full", ai ? "bg-good pulse-dot" : "bg-dim")} />
          {ai === null ? "Checking…" : ai ? "Gemini is connected on the server." : "Offline engine. Plans, negotiation and coaching use Momentum's built-in rules."}
        </div>
        {!ai && <p className="mt-2 text-xs text-muted">To connect Gemini: create a key at aistudio.google.com/apikey, put <span className="num text-text">GEMINI_API_KEY=…</span> in <span className="num text-text">.env.local</span> (or Vercel → Settings → Environment Variables) and restart. The key stays on the server.</p>}
      </Panel>

      <Panel title="Data">
        <p className="text-sm text-muted">Demo mode stores everything in this browser only. Export a backup to move it, or connect Supabase to sync across devices.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={exportData}>Export backup</Button>
          <Button onClick={() => file.current?.click()}>Import backup</Button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <Button variant="ghost" onClick={() => { loadDemo(); router.push("/app/today"); }}>Load demo student</Button>
          {confirm ? (
            <>
              <span className="self-center text-sm">Erase everything on this device?</span>
              <Button variant="danger" onClick={() => { s.reset(); router.push("/app/onboarding"); }}>Erase</Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
            </>
          ) : <Button variant="danger" onClick={() => setConfirm(true)}>Reset workspace</Button>}
        </div>
        {exportText && <textarea readOnly className={cx(inputCls, "num mt-3 h-32 text-[11px]")} value={exportText} aria-label="Backup JSON" onFocus={(e) => e.currentTarget.select()} />}
      </Panel>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="label">{label}</span>{children}</label>;
}
