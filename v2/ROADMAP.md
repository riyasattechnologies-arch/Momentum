# Momentum: from MVP to full product

Where we are: **Phase 1 is built.** Everything below is ordered by what makes Momentum more useful to a real student soonest. Rough effort assumes one developer using AI coding tools.

## Phase 1 · MVP (done)

- Intake interview → editable profile, courses, weekly schedule, goals
- Semester plan with milestones and tiered tasks, fitted to weekly hours, lighter in exam weeks
- Negotiation with diffs, Agree & lock, version history, action log
- Deterministic daily scheduler around classes (tested)
- Today view, week calendar, evening review with re-planning
- Command Center: goal health, risks with Fix, timeline, trend, heatmap, ontology graph
- In-app reminders + notifications while open, PWA install, offline shell
- Gemini integration with validation and an offline fallback
- Animated landing page

## Phase 2 · Real accounts and reminders that always arrive (1–2 weeks)

The biggest gap: data lives in one browser, and reminders only fire while the app is open.

1. Supabase Auth (Google sign-in) + the migration in `supabase/migrations`.
2. Sync layer: store actions write to Supabase; load on sign-in; keep localStorage as an offline cache.
3. Web Push: save subscriptions, a `reminder` queue filled when a day is built, and a Vercel Cron every 5 minutes that sends due pushes with Start / Snooze / Skip buttons.
4. Nightly job at 21:00 local: build tomorrow, send the evening review nudge; morning job sends the brief.
5. Email fallback (Resend) for people who block notifications.

**Done when:** a student signs in on a laptop, installs on a phone, closes both, and still gets the 7:15 brief and every block reminder.

## Phase 3 · Smarter planning (2–3 weeks)

- **Calendar sync:** two-way Google Calendar (read classes and events, write blocks) instead of `.ics` only.
- **Deadline import:** paste a syllabus or upload a PDF; Gemini extracts assignments and exam dates into tasks.
- **Learning from reality:** track actual vs estimated minutes per task type; adjust future estimates and daily capacity per student.
- **Energy model:** use evening mood/energy check-ins to shift high-energy work to the student's real best hours.
- **Voice check-ins:** 30-second spoken morning/evening check-ins transcribed by Gemini.
- **Chat that acts:** tool-calling agent that can create goals, add events and restructure milestones, still through proposals.

## Phase 4 · The "gym buddy" layer (2 weeks)

- **Accountability partner:** pair with a friend, see each other's streaks and today's P1, send a nudge.
- **Study rooms:** join a friend's focus block live (presence + timer).
- **Weekly report:** Sunday summary card (hours, P1 hit rate, milestones) that can be shared.
- **Streak protection:** a tiny fallback task on bad days so the streak survives.

## Phase 5 · Make it a product (ongoing)

- **Native apps:** wrap with Capacitor for Google Play ($25 once) and the App Store ($99/year, needs a Mac for iOS builds); native push and widgets ("Your one thing today").
- **Campus edition:** advisors or clubs see anonymised cohort health and can publish goal templates (e.g. "Internship track").
- **Templates marketplace:** proven plans for common goals (GRE, internship, first 10K, learn Spanish).
- **Privacy & safety:** data export/delete, clear AI data policy, rate limits and cost caps per user.
- **Monetisation options:** free core; Pro for calendar sync, voice, unlimited Gemini; campus licences.

## Metrics that matter

| Metric | Target |
| --- | --- |
| Interview → locked plan | > 70% of sign-ups |
| Day-7 retention | > 40% |
| Primary task hit rate | > 70% for retained users |
| Proposals approved | > 60% (the AI is proposing sensible changes) |
| Reminder → Start within 15 min | > 35% |

## Risks

- **Over-planning:** students abandon plans that are too heavy. Keep the weekly budget hard and default to fewer, clearer tasks.
- **Notification fatigue:** cap pushes per day; let students choose which tiers get reminders.
- **AI cost:** cache briefs, use Flash for most calls, and keep the deterministic scheduler doing the heavy lifting.
