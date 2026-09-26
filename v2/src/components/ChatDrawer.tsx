"use client";
import { useEffect, useRef, useState } from "react";
import { askChiefOfStaff } from "@/lib/ai/client";
import { today } from "@/lib/date";
import { useStore } from "@/lib/store";
import { ProposalCard } from "./ProposalCard";
import { Button, cx, inputCls } from "./ui";

const SUGGEST = ["What should I do right now?", "Am I on track?", "I'm sick until Wednesday", "Lighten next week", "Add hackathon prep on Oct 18"];

export function ChatBody({ thread = "daily", suggestions = SUGGEST, placeholder = "Ask or tell your chief of staff…" }: { thread?: "planning" | "daily"; suggestions?: string[]; placeholder?: string }) {
  const s = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const msgs = s.chat.filter((m) => m.thread === thread);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length, busy]);

  async function send(msg: string) {
    const m = msg.trim();
    if (!m || !s.profile || busy) return;
    setText("");
    s.addChat({ thread, role: "user", content: m });
    setBusy(true);
    const st = useStore.getState();
    const res = await askChiefOfStaff(m, { profile: st.profile!, goals: st.goals, milestones: st.milestones, tasks: st.tasks, todayBlocks: st.days[today()] ?? [] });
    let proposalId: string | undefined;
    if (res.diff.length) proposalId = useStore.getState().addProposal({ kind: "chat_edit", rationale: res.rationale, diff: res.diff, source: res.source });
    useStore.getState().addChat({ thread, role: "assistant", content: res.reply, proposalId });
    setBusy(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        {!msgs.length && <p className="text-sm text-muted">Tell me what changed or ask anything about your plan. I propose changes; you approve them.</p>}
        {msgs.map((m) => {
          const prop = m.proposalId ? s.proposals.find((p) => p.id === m.proposalId) : undefined;
          return (
            <div key={m.id} className={cx("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
              <div className={cx("max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm", m.role === "user" ? "bg-accent/15 text-text" : "border border-line bg-panel-2 text-text")}>{m.content}</div>
              {prop && <div className="w-full"><ProposalCard proposal={prop} compact /></div>}
            </div>
          );
        })}
        {busy && <div className="num text-xs text-dim"><span className="pulse-dot">●</span> thinking…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((q) => (
            <button key={q} onClick={() => send(q)} className="rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-text">{q}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2">
          <input id={`chat-${thread}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className={inputCls} aria-label="Message" />
          <Button variant="primary" type="submit" disabled={busy || !text.trim()}>Send</Button>
        </form>
      </div>
    </div>
  );
}

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cx("fixed inset-0 z-40 overflow-hidden transition", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cx("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside className={cx("absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-line bg-panel transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="label !text-accent">Chief of staff</div>
            <div className="text-sm text-muted">Proposes changes. You decide.</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close chat">Esc</Button>
        </header>
        {open && <ChatBody />}
      </aside>
    </div>
  );
}
