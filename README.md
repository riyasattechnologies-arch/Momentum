# Momentum: run your life like an operation

Momentum is an AI chief of staff for your whole life: career, health, money and learning. It interviews you, agrees a plan with you, builds each day around your real commitments, reminds you before every block and re-plans when life happens. The AI proposes every change; you approve it.

Built by Sherbaz Riasat for the GDG project showcase (MVP due September 29, 2026).

## What's in this repo

| Folder / file | What it is |
| --- | --- |
| `v2/` | **The MVP.** Next.js app with the interview, plan negotiation, daily scheduler, Today, Week, Review, Command Center, chat and the animated landing page. Deployed on Vercel with Root Directory `v2`. See `v2/README.md`. |
| `v2/ROADMAP.md` | Path from the MVP to the full product |
| `v2/supabase/migrations/` | Database schema for Phase 2 (accounts and sync) |
| `docs/keynote.html` | Interactive 13-slide keynote. Open it in a browser; press ← → to move, O for overview, N for notes, F for fullscreen |
| `docs/BUILD_PROMPT_V2.md` | The build specification for v2 |
| `wireframes.html` | Low-fidelity wireframes of the nine v2 screens |
| `index.html`, `app.js`, `planner.js`, `style.css` | Version 1 prototype (kept for history) |

## Run the MVP locally

```bash
cd v2
npm install
npm run dev      # http://localhost:3000
npm test         # 11 automated tests
```

Click **Live demo** on the home page to load an example with five weeks of history.

To use Gemini, add `GEMINI_API_KEY=your-key` to `v2/.env.local` (or to Vercel → Settings → Environment Variables). Without a key, the built-in offline planner is used.
