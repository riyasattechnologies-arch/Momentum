# Momentum: your AI accountability buddy

Momentum takes a big goal, uses Google Gemini to break it into phases, weekly milestones and daily tasks, then checks in on you every day like a gym partner.

## Features (MVP)

- **Onboarding:** name, hours per week, daily check-in time, buddy personality (Gentle, Coach, Drill Sergeant)
- **AI goal breakdown:** Gemini (`gemini-2.5-flash`, JSON output) turns a goal + deadline into phases → weeks → daily tasks that fit your hours. A built-in rule-based planner takes over when there's no key or the call fails.
- **Today view:** today's and overdue tasks, one-tap check-off, "move to tomorrow", quick-add
- **Buddy check-ins:** a daily message that reacts to your streak, missed days and progress (Gemini-written when a key is set)
- **Plan timeline:** every phase and week, with editing, deleting, rescheduling missed tasks and rebuilding the plan
- **Progress:** current and best streak, last 7 days chart, on-track status per goal
- **Reminders:** browser notification at your check-in time, plus an .ics export for Google Calendar
- **Privacy:** all data stays in your browser (localStorage). Export and import a JSON backup.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

To get AI plans, create a free key at https://aistudio.google.com/apikey and paste it in **Settings → AI planner**.

Click **Load demo** on the first screen to see the app with two example goals and 10 days of history.

## Deploy (GitHub Pages)

```bash
git init && git add . && git commit -m "Momentum MVP"
git branch -M main
git remote add origin https://github.com/<you>/momentum.git
git push -u origin main
```

Then in the GitHub repo, go to **Settings → Pages → Deploy from branch → main / root**.

## Project structure

| File | What it does |
| --- | --- |
| `index.html` | Page shell, fonts, script tags |
| `style.css` | Design tokens (light + dark), layout, components |
| `planner.js` | Gemini planner, offline planner, date helpers |
| `app.js` | State, views (Today, Plan, Progress, Settings), buddy, reminders, export |
| `build-single.py` | Bundles everything into `dist/momentum.html` (a single-file demo) |

## Tech stack

HTML, CSS, JavaScript (no framework) · Google Gemini API · localStorage · Notification API · iCalendar (.ics) · GitHub Pages

## Roadmap

- Firebase Auth + Firestore sync across devices
- Push notifications when the app is closed (service worker + FCM)
- Chat with your buddy to adjust the plan
- "Gym partner" mode: pair with a friend and see each other's streaks
