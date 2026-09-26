# Build prompt: Momentum v2 — AI Chief of Staff for Students

> Paste everything below into Claude Code, Cursor or any AI coding agent, opened in an empty folder (or the `momentum` repo). Build phase by phase and do not start a phase until the previous one passes its acceptance checks.

---

## 0. Your role

You are a senior full-stack engineer and product designer. You are building **Momentum v2**, an AI "chief of staff" for university students. Ship a working, deployable MVP. Prefer boring, reliable technology. When something is ambiguous, pick the simplest option that fits the principles below, note it in `DECISIONS.md`, and keep going.

## 1. The product in one paragraph

A first-semester student tells Momentum who they are (courses, class times, job, sleep, energy) and what they want to become (e.g. "get a software internship by next summer, keep a 3.5 GPA, get fit"). Momentum interviews them, then **proposes** a semester timeline broken into monthly milestones, weekly targets and daily tasks. The student and the AI **negotiate** the plan in chat ("October is too heavy, I have midterms") until the student clicks **Agree & lock**. From then on, every day Momentum builds a **time-blocked schedule** around their classes, labels each task **Primary / Secondary / Tertiary**, sends **reminders** at each block, runs a **morning brief** and an **evening review**, and **re-plans automatically** when life happens. A **Command Center** shows goal health, risks and workload like an operations dashboard.

## 2. Design principles (the "Palantir-style" part)

1. **Ontology first.** Everything is a typed object with links: Student → Goal → Milestone → Task → TimeBlock, plus Course, FixedEvent, Constraint, Plan, CheckIn. The UI, the AI and the database all speak these same objects.
2. **AI proposes, human decides.** The AI never silently changes the locked plan. It creates a **Proposal** (a diff: added / moved / removed items with a reason). The student approves or rejects. Every AI action is written to an **Action Log**.
3. **Deterministic core, AI at the edges.** The LLM does interviewing, goal decomposition, wording and judgment. A plain TypeScript **scheduler** places tasks into time slots. Never let the LLM do calendar math.
4. **Operator UI.** Dense, calm, dark-first dashboard: monospace numbers, status pills, timelines, risk flags, keyboard shortcuts (`g t` today, `g p` plan, `g c` command center, `/` chat). Every screen answers "what should I do now, and am I on track?"
5. **Versioned plans.** Each agreed plan is a numbered version (v1, v2…) with a diff view. Nothing is lost.

## 3. Tech stack (use exactly this unless blocked)

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router) + TypeScript + React Server Components |
| UI | Tailwind CSS + shadcn/ui + lucide-react; Recharts for charts |
| Auth + DB | Supabase (Postgres, Auth with Google sign-in, Row Level Security) |
| AI | Google Gemini API (`gemini-2.5-flash`, upgrade planner to `gemini-2.5-pro` if needed) via `@google/genai`, **server-side only**, structured JSON output + function calling |
| Validation | Zod for every AI response and every API input |
| Reminders | Web Push (VAPID, `web-push` package) + service worker; scheduled by Vercel Cron (every 5 min) hitting `/api/cron/reminders`; email fallback optional |
| PWA | Installable manifest + service worker (offline read of today's schedule) |
| Calendar | Import classes from `.ics` upload or manual weekly entry; export agreed schedule as `.ics` feed URL |
| Hosting | Vercel; Supabase cloud |
| Tests | Vitest for scheduler + planner validation; Playwright for one end-to-end happy path |

Environment variables: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`. Provide `.env.example`.

## 4. Ontology / data model

Create Supabase migrations for these tables. Every table has `id uuid pk`, `user_id uuid` (FK auth.users), `created_at`, `updated_at`, and RLS `user_id = auth.uid()`.

| Object | Key fields |
| --- | --- |
| `profile` | name, university, program, semester_number, semester_start, semester_end, timezone, wake_time, sleep_time, peak_energy (`morning`/`afternoon`/`evening`), max_focus_minutes (default 90), weekly_hours_available, coach_style (`gentle`/`coach`/`drill`), reminder_lead_minutes (default 10) |
| `course` | code, name, credits, difficulty 1–5, target_grade |
| `fixed_event` | title, kind (`class`/`work`/`gym`/`commute`/`other`), course_id?, weekday 0–6 or date, start_time, end_time, recurring bool, location |
| `goal` | title, why, category (`academic`/`career`/`health`/`skill`/`personal`), horizon (`semester`/`year`/`multi-year`), target_date, success_metric, priority 1–3, status |
| `milestone` | goal_id, title, due_date, definition_of_done, status, order |
| `task` | goal_id, milestone_id?, course_id?, title, notes, tier (`primary`/`secondary`/`tertiary`), estimate_minutes, energy (`high`/`medium`/`low`), earliest_date, due_date, status (`todo`/`scheduled`/`done`/`skipped`/`rolled`), source (`ai`/`user`), recurrence? |
| `plan` | version int, status (`draft`/`proposed`/`agreed`/`superseded`), summary, agreed_at, snapshot jsonb (full goal→milestone→task tree) |
| `proposal` | plan_id, kind (`initial`/`replan`/`chat_edit`), diff jsonb (`added`/`changed`/`removed` with reasons), status (`pending`/`approved`/`rejected`), rationale |
| `time_block` | date, start, end, task_id?, fixed_event_id?, kind (`task`/`class`/`buffer`/`break`), locked bool |
| `checkin` | date, type (`morning`/`evening`), mood 1–5, energy 1–5, notes, ai_message, completed_task_ids[] |
| `reminder` | time_block_id?, send_at, channel (`push`/`email`), status (`queued`/`sent`/`acked`/`missed`), escalation_level 0–2 |
| `push_subscription` | endpoint, keys jsonb |
| `action_log` | actor (`ai`/`user`/`system`), action, object_type, object_id, payload jsonb, reason |
| `chat_message` | thread (`intake`/`planning`/`daily`), role, content, tool_calls jsonb |

## 5. Core flows

### 5.1 Intake interview (chat)
- A chat UI where the **Intake Agent** asks one question at a time, max ~12 questions, then shows a summary card: profile, courses, weekly fixed schedule, goals with success metrics, constraints.
- It must capture: semester dates, each course (+ difficulty), class times, job/commute, sleep/wake, peak energy hours, weekly hours available for goals, 1–4 goals with *why* and a measurable outcome.
- Uses function calls to write objects: `upsert_profile`, `add_course`, `add_fixed_event`, `add_goal`. The student can edit the summary card directly before continuing.
- Also accept `.ics` upload of the class timetable to skip manual entry.

### 5.2 Plan proposal and negotiation ("we agree on it")
- **Planner Agent** receives the ontology and returns (Zod-validated JSON): per goal → 3–8 milestones with dates and definition-of-done → tasks for the **first 3 weeks in detail** (tier, estimate, energy, due) and weekly targets for the rest.
- Rules it must follow: total weekly task minutes ≤ `weekly_hours_available × 60`; academic tasks scale with course credits × difficulty; heavier load avoided in midterm/finals weeks; every goal has at least one Primary task per week; include a weekly review task.
- Show the proposal as: **Timeline view** (Gantt of milestones per goal across the semester) + **Week view** + a **load bar** per week (hours planned vs available, red if > 100%).
- Negotiation: the student types feedback ("move DSA practice to weekends", "October is too heavy"). The agent answers with a **new Proposal diff**, rendered as green/amber/red rows. Student clicks **Approve changes** or **Reject**.
- **Agree & lock** creates `plan` vN with status `agreed` and a snapshot. After this, all changes go through proposals.

### 5.3 Daily schedule builder (deterministic scheduler)
Write `lib/scheduler.ts`, a pure function with unit tests:

```
buildDay(date, profile, fixedEvents, candidateTasks, existingLockedBlocks) -> TimeBlock[]
```
1. Free windows = wake→sleep minus fixed events, minus 10-min buffers around each fixed event, minus a 45-min meal block near 12:30 and 19:00.
2. Candidate tasks = tasks due soonest, not done, `earliest_date ≤ date`, plus rolled tasks.
3. Place **Primary** first into peak-energy windows (high-energy tasks only in peak windows), then **Secondary**, then **Tertiary** into remaining windows.
4. Split tasks longer than `max_focus_minutes` into parts; insert a 10-min break after every focus block.
5. Daily cap: never schedule more than `weekly_hours_available / active_days` + 20%. Overflow → mark `rolled` to the next day and log it.
6. Return blocks; never move a block the user locked.

Run `buildDay` for tomorrow every night (cron 21:00 local) and on demand ("Rebuild today").

### 5.4 Morning brief and evening review
- **Morning brief** (push at wake_time + 15 min, and the top card on the Today screen), written by the **Coach Agent** in the chosen coach style, ≤ 90 words:
  - "Your ONE thing today" = the top Primary task.
  - Secondary tasks (2–3), Tertiary (optional, "if you have energy").
  - Today's classes and the first time block.
  - One risk flag if any (e.g. "Calculus milestone due Friday, 40% done").
- **Evening review** (push at sleep_time − 90 min): checklist of today's blocks (done / partial / skipped), mood and energy 1–5, one free-text line. Then the **Replanner** runs: missed Primary tasks get priority tomorrow; if a milestone slips, it creates a Proposal ("Push milestone X by 4 days, or drop tertiary tasks Y, Z") for the student to approve.

### 5.5 Reminders that keep pushing
- For each task block: push at `start − reminder_lead_minutes` ("Up next 16:00–17:00: LeetCode — 2 easy problems. Primary.") with action buttons **Start**, **Snooze 15m**, **Skip**.
- Escalation: no action 15 min after start → level-1 nudge in coach style; still nothing by end → mark `missed`, notify once, feed into evening review.
- Quiet hours between sleep and wake. Max 8 pushes per day.
- Buttons in notifications call `/api/blocks/:id/action` via the service worker.

### 5.6 Command Center (operations dashboard)
One dense screen:
- **Goal health table**: goal, progress %, on-track status (`on track` / `at risk` / `off track` from planned vs done minutes and milestone dates), next milestone + days left.
- **Semester timeline**: milestones per goal as a Gantt with a "today" line; exam weeks shaded.
- **Workload heatmap**: next 4 weeks × 7 days, planned hours per day.
- **Execution trend**: last 14 days, planned vs completed minutes, and Primary completion rate.
- **Risk feed**: auto-generated flags with a "Fix" button that asks the Replanner for a proposal.
- **Ontology graph** (stretch): force graph of Goal → Milestone → Task → Course links; click a node to open it.
- **Action Log**: every AI and user change, filterable.

### 5.7 Chat with your chief of staff (always available, `/`)
Tool-enabled agent that can read the ontology and **propose** changes: "I'm sick until Wednesday", "add a hackathon on Oct 18", "what should I do right now?", "am I on track for my internship goal?". Write actions always become Proposals; read-only answers cite the objects they used.

## 6. AI agents and their system prompts

Keep prompts in `lib/ai/prompts/*.ts`. All agents receive a compact JSON "context pack" (profile, goals, milestones, this week's tasks, today's blocks, recent check-ins), never the whole database.

**Intake Agent**
```
You are Momentum's intake interviewer for a university student. Ask ONE short question at a time.
Goal: fill the profile, courses, fixed weekly schedule, constraints, and 1–4 goals with a WHY and a measurable success metric.
Push vague goals to be specific ("get better at coding" -> "solve 150 LeetCode problems and ship 2 projects by May").
Call the provided tools to save each fact as soon as you learn it. When everything required is known, call finish_intake with a summary.
Never give a plan yet. Be warm, brief, and practical.
```

**Planner Agent**
```
You are an expert academic and career planner. Given the student's context pack, produce a semester plan as JSON matching the schema.
Hard rules: respect weekly_hours_available; each goal gets milestones with dates and a definition_of_done; tasks are concrete, start with a verb, fit in one sitting (15–120 min), and have tier, estimate, energy and due date.
Tiering: primary = moves a goal's critical path this week; secondary = important but can slip 1–2 days; tertiary = nice-to-have or stretch.
Lighten load in exam weeks. Front-load setup tasks. Include one weekly review.
When revising, return ONLY a diff (added/changed/removed) with a one-line reason per item.
```

**Coach Agent**
```
You are the student's accountability coach. Style: {coach_style}. Write the {morning_brief|evening_message|nudge}.
Use the context pack. Name the ONE primary task first. Be specific (task names, times, numbers). Max 90 words. No emoji. No generic motivation.
If they missed yesterday, acknowledge it in one sentence and give the smallest next step.
```

**Replanner Agent**
```
You adjust an agreed plan after reality changed (missed tasks, new events, sickness). Minimize disruption.
Order of preference: 1) reschedule within the week, 2) drop tertiary tasks, 3) shrink secondary tasks, 4) move a milestone date.
Never delete a primary task without saying so. Output a Proposal diff with reasons and the impact on each goal's end date.
```

## 7. Screens and routes

| Route | Screen |
| --- | --- |
| `/` | Landing + Google sign-in |
| `/onboarding` | Intake chat + editable summary card + `.ics` upload |
| `/plan` | Proposal review: timeline, week view, load bars, negotiation chat, Agree & lock, version history + diff |
| `/today` | Morning brief card, time-blocked day (vertical timeline), tier badges, Start/Done/Snooze/Skip, "Rebuild today" |
| `/week` | 7-day calendar with blocks, drag to move (locks the block) |
| `/command` | Command Center |
| `/review` | Evening review |
| `/settings` | Profile, energy, coach style, reminders, push permission, calendar export URL, data export, delete account |

Global: left sidebar on desktop, bottom tabs on mobile, `/` opens the chat drawer from anywhere, dark theme default with light toggle.

## 8. Build phases (in order) with acceptance checks

**Phase 1 — Foundation (day 1)**
Next.js + Supabase + Google auth + migrations + RLS + app shell + seed script with a demo student ("Aisha, 1st semester CS, goals: internship, 3.5 GPA, run 10K").
✅ Sign in works; RLS blocks cross-user reads (test it); seed loads.

**Phase 2 — Intake + Plan negotiation (day 2)**
Intake chat with tools, summary card, planner agent, proposal diff UI, Agree & lock, plan versions.
✅ New user reaches an agreed plan v1 in < 10 minutes; a chat edit produces a diff; approving it creates v2; weekly load never exceeds available hours.

**Phase 3 — Scheduler + Today (day 3)**
`buildDay`, Today timeline, tiers, Start/Done/Skip/Snooze, rolled tasks, morning brief.
✅ Vitest suite covers: no overlap with classes, primary placed in peak window, focus split, daily cap, locked blocks untouched.

**Phase 4 — Reminders + reviews (day 4)**
PWA, push subscribe, cron, reminder queue, escalation, evening review, replanner proposals.
✅ On a phone with the installed PWA, a test block 3 minutes out sends a push; tapping Done updates the block; a skipped primary appears first tomorrow.

**Phase 5 — Command Center + polish (day 5)**
Goal health, timeline, heatmap, trend, risk feed with Fix, action log; empty/loading/error states; mobile pass.
✅ Seeded demo shows at least one "at risk" goal and its Fix produces a sensible proposal.

**Phase 6 — Stretch (only if time)**
Ontology graph, drag-to-reschedule on `/week`, Google Calendar two-way sync, friend "accountability partner" who sees your streak, voice check-in.

## 9. Quality bar

- Every AI call: timeout 30 s, one retry, Zod validation, graceful fallback message; log token usage per user.
- Never expose `GEMINI_API_KEY` to the client. Rate limit AI routes (20/min/user).
- All times stored UTC, displayed in the profile timezone.
- Accessible: keyboard reachable, visible focus, 4.5:1 contrast, reduced-motion respected.
- `README.md` with setup, env vars, how to run migrations and seed, how to deploy to Vercel, and a 3-minute demo script.
- `DECISIONS.md` for assumptions you made.

## 10. Demo script (for the showcase)

1. Sign in → intake chat: "I'm in my first semester of CS. I want an internship next summer and a 3.5 GPA."
2. Show the proposed timeline and load bars → type "October has midterms, lighten it" → approve the diff → **Agree & lock v2**.
3. Open **Today**: morning brief, Primary / Secondary / Tertiary blocks around classes.
4. Trigger a live push reminder on the phone; tap **Snooze**.
5. Skip a primary task → evening review → replanner proposal → approve.
6. Finish on the **Command Center**: goal health, risk feed, timeline.

## 11. Out of scope for this MVP

Native store apps, payments, group features beyond one accountability partner, LMS integrations (Canvas/Moodle), and fine-tuned models.

Start with Phase 1 now. After each phase, print what was built, how to test it, and any decisions made.
