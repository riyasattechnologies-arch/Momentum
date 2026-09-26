# Momentum v2: AI chief of staff for students

Momentum interviews a student, agrees a semester plan with them, builds each day around their classes with Primary / Secondary / Tertiary tasks, reminds them before every block, and re-plans when life happens. The AI proposes every change and the student approves it.

## What's in here

| Route | What it does |
| --- | --- |
| `/` | Animated landing page |
| `/demo` | Loads a demo student (Aisha, 5 weeks of history) and opens the app |
| `/app/onboarding` | 11-question intake interview (+ `.ics` timetable import), then an editable summary |
| `/app/plan` | Proposed semester plan: timeline, weekly load, week view, negotiation chat, Agree & lock, version history |
| `/app/today` | Morning brief, time-blocked schedule, P1/P2/P3, Start / Done / Skip, carried-over work |
| `/app/week` | 7-day calendar around classes (future days are projected) |
| `/app/review` | Evening review → re-plan proposal for tomorrow |
| `/app/command` | Command Center: goal health, risk feed with Fix, timeline, execution trend, workload heatmap, ontology graph, action log |
| `/app/settings` | Profile, coach style, reminders, AI status, backup export/import, reset |

Keyboard: `/` opens the chief-of-staff chat, `g t` Today, `g w` Week, `g p` Plan, `g c` Command, `g r` Review, `g s` Settings.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # scheduler + intake + planner tests (vitest)
```

It works with no accounts at all ("demo mode"): data stays in the browser and an offline engine does planning, negotiation and coaching.

### Turn on Gemini (recommended)

1. Create a free key at https://aistudio.google.com/apikey
2. Create `.env.local` next to `package.json`:
   ```
   GEMINI_API_KEY=your-key-here
   # optional: GEMINI_MODEL=gemini-2.5-pro
   ```
3. Restart `npm run dev`. The sidebar shows **Gemini online**. The key only lives on the server (`src/app/api/ai/route.ts`).

With Gemini on, the interview is parsed by the AI, the plan is written by the AI (first 4 weeks in detail, then weekly targets), chat understands free-form requests, and briefs are written in your coach's voice. Every AI response is validated with Zod; if it fails, the offline engine takes over.

## Deploy (Vercel)

1. Push this folder to GitHub.
2. On vercel.com → **Add New Project** → import the repo → set **Root Directory** to `v2` (if it lives in a subfolder).
3. Add the `GEMINI_API_KEY` environment variable → **Deploy**.
4. Open the site on your phone → browser menu → **Add to Home Screen**. It installs as an app (PWA).

## Architecture

```
Browser (Next.js app, React)            Server (Next.js route handlers)
  ├─ Zustand store  ── localStorage       └─ /api/ai  →  Gemini (JSON + Zod)
  ├─ scheduler.ts   (deterministic day builder, unit-tested)
  ├─ planner.ts     (offline planner, negotiation parser, diffs)
  ├─ insights.ts    (goal health, risks, coach messages)
  └─ sw.js          (offline shell, notification actions, Web Push)
```

- **Ontology**: `src/lib/types.ts` (Profile, Course, FixedEvent, Goal, Milestone, Task, PlanVersion, Proposal, TimeBlock, CheckIn, ActionLog).
- **AI proposes, human decides**: every change is a `Proposal` with a diff. Approving it applies the diff and locks a new plan version.
- **Deterministic core**: `buildDay()` places tasks around classes (10-min buffers, meals, peak-energy placement for high-energy work, focus blocks split at `maxFocus`, daily cap, locked blocks untouched).

## Connecting the backend (next step)

`supabase/migrations/0001_ontology.sql` creates every table with Row Level Security. To go multi-device:

1. Create a Supabase project → SQL editor → run the migration.
2. Enable Google sign-in (Authentication → Providers).
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Replace the `persist` storage in `src/lib/store.ts` with a Supabase sync layer (each store action already maps 1:1 to a table).
5. For reminders when the app is closed: generate VAPID keys (`npx web-push generate-vapid-keys`), save push subscriptions, and add a Vercel Cron (every 5 min) that sends due reminders. `public/sw.js` already handles `push` events and the Start / Snooze buttons.

See `ROADMAP.md` for the path from this MVP to a full product.
