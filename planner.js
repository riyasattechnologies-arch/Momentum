/* Momentum planner
   - planWithGemini(): asks Google Gemini for a structured plan (JSON)
   - planOffline(): rule-based planner used when there is no API key or the AI call fails
   Both return the same shape:
   { phases: [{ title, summary, weeks: [{ title, tasks: [{ day, title, minutes }] }] }] }
   where `day` is 0-6 (days after the week's start). */

const Planner = (() => {
  const DAY = 86400000;

  const iso = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const weeksBetween = (a, b) => Math.max(1, Math.ceil((parse(b) - parse(a) + DAY) / (7 * DAY)));

  // ---------- Offline knowledge base ----------
  const LIB = {
    career: {
      match: /intern|job|career|resume|cv\b|hired|placement|offer|interview/i,
      phases: [
        { title: 'Foundation', summary: 'Know the target and fix your materials.', share: .25,
          milestones: ['Pick 3 target roles and 20 companies', 'Resume v1 reviewed by a senior', 'LinkedIn + GitHub cleaned up', 'Portfolio project chosen'],
          tasks: ['Research {n} job posts and list required skills', 'Rewrite one resume section with numbers', 'Update LinkedIn headline and about', 'Ask one senior or career centre for feedback', 'Add a README to your best repo'] },
        { title: 'Skill building', summary: 'Close the gaps the job posts showed.', share: .35,
          milestones: ['Core skill gap #1 closed', 'Portfolio project MVP', 'Data structures practice routine', 'Portfolio project polished and deployed'],
          tasks: ['Solve 2 practice problems (LeetCode/HackerRank)', 'Build one feature of your portfolio project', 'Watch/read one tutorial on your gap skill and take notes', 'Push code and write a short progress note', 'Explain a concept out loud as if teaching it'] },
        { title: 'Applications', summary: 'Ship applications every week.', share: .25,
          milestones: ['First 10 applications sent', 'Referral outreach', '25 applications sent', 'Follow-ups done'],
          tasks: ['Send {n} tailored applications', 'Message one alum or engineer for a referral', 'Tailor resume keywords for one company', 'Log applications in your tracker', 'Follow up on applications older than a week'] },
        { title: 'Interviews', summary: 'Practise until it feels routine.', share: .15,
          milestones: ['Behavioural stories ready (STAR)', 'Two mock interviews done', 'Offer-ready'],
          tasks: ['Write one STAR story', 'Do a 30-minute mock interview (Pramp or a friend)', 'Review a company before an interview', 'Solve one timed problem', 'Prepare 3 questions to ask interviewers'] }
      ]
    },
    fitness: {
      match: /run|marathon|5k|10k|gym|fit|weight|muscle|lose|workout|pushup|pull-?up|health/i,
      phases: [
        { title: 'Base', summary: 'Build the habit before the intensity.', share: .3,
          milestones: ['Show up 3 times this week', 'Baseline measurements taken', 'Consistent routine', 'Base block complete'],
          tasks: ['Easy session: 25 minutes at conversational effort', 'Mobility and stretching, 15 minutes', 'Log sleep and water today', 'Full-body strength circuit', 'Walk 8,000 steps'] },
        { title: 'Build', summary: 'Increase volume about 10% a week.', share: .4,
          milestones: ['Volume +10%', 'First hard session', 'Longest session so far', 'Recovery week'],
          tasks: ['Interval session: 6 × 2 min hard, 2 min easy', 'Long session at easy effort', 'Strength: legs and core', 'Recovery: mobility + foam roll', 'Plan meals for tomorrow'] },
        { title: 'Peak', summary: 'Sharpen and test yourself.', share: .2,
          milestones: ['Test session / time trial', 'Peak volume week'],
          tasks: ['Goal-pace session', 'Time trial or max-effort test', 'Strength maintenance', 'Easy recovery session'] },
        { title: 'Taper & goal day', summary: 'Rest, then perform.', share: .1,
          milestones: ['Taper week', 'Goal day'],
          tasks: ['Short easy session', 'Prepare kit and plan for goal day', 'Sleep 8 hours', 'Light activation session'] }
      ]
    },
    exam: {
      match: /exam|gpa|grade|test|sat|gre|ielts|toefl|semester|course|midterm|final|study/i,
      phases: [
        { title: 'Map the syllabus', summary: 'Know exactly what will be tested.', share: .2,
          milestones: ['Syllabus mapped into topics', 'Weak topics identified'],
          tasks: ['List every topic in the syllabus', 'Rate each topic 1–5 by confidence', 'Collect past papers and notes', 'Make a one-page summary of topic {n}'] },
        { title: 'Learn', summary: 'Work through weak topics first.', share: .45,
          milestones: ['Weak topics round 1', 'Weak topics round 2', 'Medium topics covered', 'All topics touched once'],
          tasks: ['Study one weak topic with active recall', 'Make flashcards for today\'s topic', 'Solve 10 practice questions', 'Teach the topic to a friend or rubber duck', 'Review yesterday\'s flashcards'] },
        { title: 'Practise', summary: 'Past papers under time.', share: .25,
          milestones: ['First timed past paper', 'Mistake log reviewed', 'Second timed past paper'],
          tasks: ['Do one timed past paper section', 'Review mistakes and log why', 'Redo questions you got wrong', 'Flashcard review, 20 minutes'] },
        { title: 'Final review', summary: 'Consolidate and rest.', share: .1,
          milestones: ['Final revision', 'Exam day'],
          tasks: ['Skim your one-page summaries', 'Light flashcard review', 'Prepare materials and sleep early'] }
      ]
    },
    language: {
      match: /language|spanish|french|german|arabic|chinese|japanese|korean|english|urdu|fluent|speak/i,
      phases: [
        { title: 'Foundations', summary: 'Sounds, basics, first 300 words.', share: .3,
          milestones: ['Alphabet/pronunciation', 'First 150 words', 'First 300 words', 'Basic sentences'],
          tasks: ['15 minutes of Duolingo or a textbook lesson', 'Learn 15 new words with spaced repetition', 'Shadow a 2-minute audio clip', 'Write 5 simple sentences'] },
        { title: 'Comprehension', summary: 'Lots of input.', share: .35,
          milestones: ['Understand a slow podcast', 'Grammar core', 'Read a short story'],
          tasks: ['Listen to a learner podcast episode', 'Read one graded-reader chapter', 'Grammar drill, 20 minutes', 'Review vocabulary deck'] },
        { title: 'Speaking', summary: 'Talk every week.', share: .35,
          milestones: ['First conversation with a tutor', 'Weekly conversations', '10-minute conversation'],
          tasks: ['30-minute conversation (iTalki/tandem partner)', 'Record yourself speaking for 3 minutes', 'Write a short journal entry', 'Learn 10 phrases you missed in conversation'] }
      ]
    },
    build: {
      match: /app|startup|launch|build|project|website|product|saas|game|hackathon|portfolio|ship/i,
      phases: [
        { title: 'Discover', summary: 'Validate the problem and scope the MVP.', share: .2,
          milestones: ['Problem validated with 5 people', 'MVP scope and wireframes'],
          tasks: ['Interview one potential user', 'Write the problem statement and user stories', 'Sketch wireframes for key screens', 'Pick the tech stack and set up the repo'] },
        { title: 'Build the MVP', summary: 'Small, working increments.', share: .45,
          milestones: ['Core feature working', 'Data saved and loaded', 'Second feature working', 'End-to-end flow complete'],
          tasks: ['Build one small feature end to end', 'Write tests or a manual test checklist for today\'s work', 'Commit and push with a clear message', 'Fix the top bug from your list', 'Refactor one messy part'] },
        { title: 'Launch', summary: 'Put it in front of real users.', share: .2,
          milestones: ['Deployed publicly', 'First 10 users'],
          tasks: ['Deploy and test on a phone', 'Write a launch post', 'Share with 5 people and collect feedback', 'Set up simple analytics'] },
        { title: 'Iterate', summary: 'Improve from feedback.', share: .15,
          milestones: ['Feedback round 1 shipped', 'Next version planned'],
          tasks: ['Group feedback into themes', 'Ship the most requested fix', 'Update README and demo video'] }
      ]
    },
    generic: {
      match: /.*/,
      phases: [
        { title: 'Clarify', summary: 'Define what done looks like.', share: .2,
          milestones: ['Goal defined with a measurable outcome', 'Resources and people identified'],
          tasks: ['Write what success looks like in one sentence', 'List the 5 biggest steps between you and the goal', 'Find one person who has done this and read/watch their story', 'Gather the resources you need'] },
        { title: 'Build skills', summary: 'Do the core work every week.', share: .45,
          milestones: ['First step complete', 'Second step complete', 'Halfway checkpoint', 'Third step complete'],
          tasks: ['Focused work session on the current step', 'Practise the hardest part for 30 minutes', 'Write a short progress note', 'Ask for feedback from someone ahead of you'] },
        { title: 'Execute', summary: 'Produce visible results.', share: .25,
          milestones: ['Visible result #1', 'Visible result #2'],
          tasks: ['Ship or publish one piece of work', 'Measure your progress against the goal', 'Remove one obstacle that slowed you down'] },
        { title: 'Finish', summary: 'Close it out and reflect.', share: .1,
          milestones: ['Final push', 'Goal reached'],
          tasks: ['Finish the last open item', 'Write a reflection: what worked and what didn\'t'] }
      ]
    }
  };

  function pickCategory(text) {
    for (const key of ['career', 'fitness', 'language', 'exam', 'build']) {
      if (LIB[key].match.test(text)) return key;
    }
    return 'generic';
  }

  function sessionsFor(hoursPerWeek) {
    const sessions = Math.min(6, Math.max(3, Math.round(hoursPerWeek / 1.5)));
    const minutes = Math.max(20, Math.min(120, Math.round((hoursPerWeek * 60 - 20) / sessions / 5) * 5));
    const spread = { 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }[sessions];
    return { sessions, minutes, days: spread };
  }

  function allocateWeeks(phases, total) {
    const counts = phases.map((p) => Math.max(1, Math.round(p.share * total)));
    let diff = total - counts.reduce((a, b) => a + b, 0);
    let i = counts.length - 1;
    while (diff !== 0 && i >= 0) {
      if (diff > 0) { counts[1 % counts.length]++; diff--; }
      else if (counts[i] > 1) { counts[i]--; diff++; } else { i--; }
    }
    // If total < number of phases, drop trailing phases
    while (counts.reduce((a, b) => a + b, 0) > total && counts.length > 1) counts.pop();
    return counts;
  }

  function planOffline(goal, profile, startDate) {
    const key = pickCategory(`${goal.title} ${goal.why || ''}`);
    const lib = LIB[key];
    const total = Math.min(52, weeksBetween(startDate, goal.deadline));
    const counts = allocateWeeks(lib.phases, total);
    const { minutes, days } = sessionsFor(Number(profile.hoursPerWeek) || 5);
    let taskCursor = 0;
    const phases = counts.map((count, pi) => {
      const src = lib.phases[pi];
      const weeks = [];
      for (let w = 0; w < count; w++) {
        const m = src.milestones[w % src.milestones.length];
        const round = Math.floor(w / src.milestones.length);
        const title = round > 0 ? `${m} (round ${round + 1})` : m;
        const tasks = days.map((day) => {
          const t = src.tasks[taskCursor++ % src.tasks.length].replace('{n}', String(3 + (w % 3)));
          return { day, title: t, minutes };
        });
        tasks.push({ day: 6, title: `Weekly review: did you hit "${title}"? Plan next week`, minutes: 15 });
        weeks.push({ title, tasks });
      }
      return { title: src.title, summary: src.summary, weeks };
    });
    return { phases, category: key };
  }

  // ---------- Gemini ----------
  async function planWithGemini(goal, profile, startDate, apiKey, model) {
    const totalWeeks = Math.min(52, weeksBetween(startDate, goal.deadline));
    const detailWeeks = Math.min(totalWeeks, 12);
    const prompt = `You are an expert coach who turns ambitious goals into realistic plans.
Today is ${startDate}. The user's goal: "${goal.title}".
Why it matters to them: "${goal.why || 'not given'}". Current level: ${goal.level}.
Deadline: ${goal.deadline} (${totalWeeks} weeks from today). Time available: ${profile.hoursPerWeek} hours per week.

Break the goal into 2-5 phases (like semester/month blocks). Across all phases there must be exactly ${totalWeeks} weeks in order, week 1 starting today.
Each week has one milestone title (a concrete outcome). For the first ${detailWeeks} weeks, include 3-6 daily tasks per week; for later weeks, return an empty tasks array.
Each task: "day" = integer 0-6 (days after the week start), "title" = specific action a student can do in one sitting (start with a verb, under 90 characters), "minutes" = 15-120.
Total task minutes per week must not exceed ${Math.round(profile.hoursPerWeek * 60)}.
Include a short weekly review task on day 6.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        phases: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              summary: { type: 'STRING' },
              weeks: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    tasks: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: { day: { type: 'INTEGER' }, title: { type: 'STRING' }, minutes: { type: 'INTEGER' } },
                        required: ['day', 'title', 'minutes']
                      }
                    }
                  },
                  required: ['title', 'tasks']
                }
              }
            },
            required: ['title', 'summary', 'weeks']
          }
        }
      },
      required: ['phases']
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6 }
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini returned ${res.status}. ${body.slice(0, 160)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    const plan = JSON.parse(text);
    return validate(plan, goal, profile, startDate);
  }

  // Make sure the AI output is usable; fill missing tasks with the offline templates.
  function validate(plan, goal, profile, startDate) {
    if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) throw new Error('AI plan had no phases');
    const fallback = planOffline(goal, profile, startDate);
    const fbWeeks = fallback.phases.flatMap((p) => p.weeks);
    let wi = 0;
    plan.phases = plan.phases.filter((p) => p && Array.isArray(p.weeks) && p.weeks.length).map((p) => ({
      title: String(p.title || 'Phase').slice(0, 60),
      summary: String(p.summary || '').slice(0, 200),
      weeks: p.weeks.map((w) => {
        let tasks = Array.isArray(w.tasks) ? w.tasks : [];
        tasks = tasks.filter((t) => t && t.title).map((t) => ({
          day: Math.min(6, Math.max(0, parseInt(t.day, 10) || 0)),
          title: String(t.title).slice(0, 140),
          minutes: Math.min(180, Math.max(10, parseInt(t.minutes, 10) || 30))
        }));
        if (!tasks.length) {
          const fb = fbWeeks[Math.min(wi, fbWeeks.length - 1)];
          tasks = fb.tasks.map((t) => ({ ...t }));
        }
        wi++;
        return { title: String(w.title || `Week ${wi}`).slice(0, 120), tasks };
      })
    }));
    if (!plan.phases.length) throw new Error('AI plan had no weeks');
    return plan;
  }

  async function checkInWithGemini(context, apiKey, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: context }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 120 }
      })
    });
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
    if (!text) throw new Error('Empty response');
    return text.replace(/^["']|["']$/g, '');
  }

  return { planOffline, planWithGemini, checkInWithGemini, iso, parse, addDays, weeksBetween, pickCategory };
})();
