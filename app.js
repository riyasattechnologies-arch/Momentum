/* Momentum — AI accountability buddy
   Vanilla JS single-page app. All data lives in localStorage on the user's device. */

(() => {
  const { iso, parse, addDays } = Planner;
  const STORE_KEY = 'momentum.v1';
  const DEFAULT_MODEL = 'gemini-2.5-flash';
  const GOAL_COLORS = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)'];

  // ---------- State ----------
  const blank = () => ({ profile: null, goals: [], tasks: [], checkins: {}, notified: {} });
  let state = load();
  const ui = { view: state.profile ? (state.goals.length ? 'today' : 'newgoal') : 'welcome', planGoal: null, editing: null, confirm: null, busy: null, toast: null, exportPanel: null, error: null, variant: 0 };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return blank();
      const s = JSON.parse(raw);
      return { ...blank(), ...s };
    } catch { return blank(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep working in memory */ }
  }

  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => iso(new Date());
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString(undefined, opts);
  const daysLeft = (s) => Math.round((parse(s) - parse(today())) / 86400000);
  const goalById = (id) => state.goals.find((g) => g.id === id);
  const fmtTime = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(h, m); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  // ---------- Stats ----------
  function doneDates() { return new Set(state.tasks.filter((t) => t.done && t.doneAt).map((t) => t.doneAt)); }
  // A day counts toward the streak if you finished at least one task.
  // Rest days (nothing scheduled, nothing done) don't break it; a scheduled day with nothing done does.
  function firstDay() { return state.goals.reduce((m, g) => (g.createdAt < m ? g.createdAt : m), today()); }
  function streak() {
    const days = doneDates();
    const sched = new Set(state.tasks.map((t) => t.date));
    const first = firstDay();
    let d = today();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (d >= first) {
      if (days.has(d)) n++;
      else if (sched.has(d)) break;
      d = addDays(d, -1);
    }
    return n;
  }
  function bestStreak() {
    const days = doneDates();
    const sched = new Set(state.tasks.map((t) => t.date));
    let best = 0, run = 0;
    for (let d = firstDay(); d <= today(); d = addDays(d, 1)) {
      if (days.has(d)) { run++; best = Math.max(best, run); }
      else if (sched.has(d) && d !== today()) run = 0;
    }
    return best;
  }
  function todayTasks() {
    const t = today();
    return state.tasks.filter((x) => x.date === t || (x.date < t && !x.done))
      .sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date) || a.goalId.localeCompare(b.goalId));
  }
  function goalStats(g) {
    const ts = state.tasks.filter((t) => t.goalId === g.id);
    const done = ts.filter((t) => t.done).length;
    const due = ts.filter((t) => t.date <= today()).length;
    const doneDue = ts.filter((t) => t.date <= today() && t.done).length;
    return { total: ts.length, done, due, doneDue, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, onTrack: due === 0 || doneDue / due >= 0.7 };
  }

  // ---------- Plan materialisation ----------
  function materialise(goal, plan, startDate) {
    goal.phases = [];
    const tasks = [];
    let weekIdx = 0;
    plan.phases.forEach((p) => {
      const phase = { id: uid(), title: p.title, summary: p.summary, weeks: [] };
      p.weeks.forEach((w) => {
        const start = addDays(startDate, weekIdx * 7);
        if (start > goal.deadline) return;
        phase.weeks.push({ idx: weekIdx, start, title: w.title });
        w.tasks.forEach((t) => {
          const date = addDays(start, t.day);
          if (date > goal.deadline) return;
          tasks.push({ id: uid(), goalId: goal.id, phaseId: phase.id, weekIdx, date, title: t.title, minutes: t.minutes, done: false, doneAt: null });
        });
        weekIdx++;
      });
      if (phase.weeks.length) {
        phase.start = phase.weeks[0].start;
        phase.end = addDays(phase.weeks[phase.weeks.length - 1].start, 6);
        goal.phases.push(phase);
      }
    });
    state.tasks = state.tasks.filter((t) => t.goalId !== goal.id).concat(tasks);
  }

  async function buildPlan(goal, startDate = today()) {
    const p = state.profile;
    if (p.apiKey) {
      try {
        const plan = await Planner.planWithGemini(goal, p, startDate, p.apiKey, p.model || DEFAULT_MODEL);
        goal.source = 'gemini';
        materialise(goal, plan, startDate);
        return null;
      } catch (e) {
        const plan = Planner.planOffline(goal, p, startDate);
        goal.source = 'offline';
        materialise(goal, plan, startDate);
        return `Gemini couldn't build the plan (${e.message}). Used the built-in planner instead.`;
      }
    }
    const plan = Planner.planOffline(goal, p, startDate);
    goal.source = 'offline';
    materialise(goal, plan, startDate);
    return null;
  }

  // ---------- Buddy ----------
  const BUDDY = {
    gentle: {
      name: 'Gentle',
      desc: 'Kind and patient',
      noGoals: ['Hi {name}. Whenever you are ready, tell me one thing you want to achieve and we will map it out together.'],
      start: ['Morning, {name}. {ntasks} today. Start with "{task}" and see how it feels.', 'Hey {name}, today is a fresh page. Just "{task}" first, the rest will follow.'],
      progress: ['Nice, {done} down and {left} to go. You are doing well, {name}.', 'Good work so far. "{task}" is next whenever you are ready.'],
      allDone: ['Everything done for today. Be proud of that, {name}, and rest well.', 'All {done} tasks finished. That is how big goals get built.'],
      missed: ['Yesterday slipped, and that is okay. One task today restarts everything. How about "{task}"?'],
      streak: ['{streak} days in a row, {name}. That consistency is quietly adding up.']
    },
    coach: {
      name: 'Coach',
      desc: 'Upbeat and direct',
      noGoals: ['Let\'s go, {name}! Give me a big goal and a deadline and I\'ll build you the game plan.'],
      start: ['Game day, {name}. {ntasks} on the board. Open with "{task}" and build momentum.', '{ntasks} today. First up: "{task}". Let\'s move.'],
      progress: ['{done} done, {left} left. Keep the pace, {name}. Next: "{task}".', 'Solid start. Don\'t coast now, "{task}" is waiting.'],
      allDone: ['That\'s a full session, {name}! Every task done. Same time tomorrow.', 'Clean sweep today. This is what progress looks like.'],
      missed: ['We lost a day yesterday. No drama, we get it back now. Start with "{task}".'],
      streak: ['{streak}-day streak! You\'re on fire, {name}. Protect it today.']
    },
    drill: {
      name: 'Drill Sergeant',
      desc: 'Tough love, no excuses',
      noGoals: ['No goal, no plan, no progress. Set a goal now, {name}.'],
      start: ['{ntasks}. Zero done. Get moving on "{task}", {name}. Now.', 'Your goal does not care how you feel. "{task}". Go.'],
      progress: ['{done} done is not {total}. Finish "{task}" before you do anything else.', 'Halfway is not done, {name}. {left} left.'],
      allDone: ['All done. Acceptable. Be back tomorrow, same standard.', 'Mission complete for today. Don\'t let it go to your head.'],
      missed: ['You skipped yesterday. Excuses don\'t build futures. "{task}", right now.'],
      streak: ['{streak} days straight. Good. Break it and you start from zero, {name}.']
    }
  };

  function buddySituation() {
    const tt = todayTasks();
    const done = tt.filter((t) => t.done).length;
    const s = streak();
    const yesterday = addDays(today(), -1);
    const hadYesterday = state.tasks.some((t) => t.date === yesterday);
    const didYesterday = doneDates().has(yesterday);
    let key;
    if (!state.goals.length) key = 'noGoals';
    else if (tt.length && done === tt.length) key = 'allDone';
    else if (done > 0) key = 'progress';
    else if (hadYesterday && !didYesterday && s === 0) key = 'missed';
    else if (s >= 3) key = 'streak';
    else key = 'start';
    return { key, tt, done, s };
  }

  function buddyMessage() {
    const style = BUDDY[state.profile?.buddyStyle || 'coach'];
    const { key, tt, done, s } = buddySituation();
    const cached = state.checkins[today()];
    if (cached && cached.key === key && cached.source === 'gemini') return { text: cached.text, source: 'gemini' };
    const list = style[key];
    const seed = parseInt(today().replace(/-/g, ''), 10) + ui.variant;
    const next = tt.find((t) => !t.done);
    const text = list[seed % list.length]
      .replaceAll('{name}', state.profile?.name || 'friend')
      .replaceAll('{ntasks}', `${tt.length} task${tt.length === 1 ? '' : 's'}`)
      .replaceAll('{done}', String(done))
      .replaceAll('{left}', String(tt.length - done))
      .replaceAll('{total}', String(tt.length))
      .replaceAll('{streak}', String(s))
      .replaceAll('{task}', next ? next.title : 'your first task');
    return { text, source: 'template' };
  }

  let checkinPending = false;
  async function maybeGeminiCheckIn(force = false) {
    const p = state.profile;
    if (!p?.apiKey || checkinPending || !state.goals.length) return;
    const { key, tt, done, s } = buddySituation();
    const cached = state.checkins[today()];
    if (!force && cached && cached.key === key) return;
    checkinPending = true;
    const style = BUDDY[p.buddyStyle || 'coach'];
    const context = `You are ${p.name}'s accountability buddy. Personality: ${style.name} (${style.desc}).
Write ONE short check-in message (max 2 sentences, no emoji, no quotes) for today.
Goals: ${state.goals.map((g) => `"${g.title}" (due ${g.deadline}, why: ${g.why || 'n/a'})`).join('; ')}.
Today's tasks: ${tt.map((t) => `${t.done ? '[done]' : '[todo]'} ${t.title}`).join('; ') || 'none'}.
Done today: ${done}/${tt.length}. Current streak: ${s} days. Situation: ${key}.`;
    try {
      const text = await Planner.checkInWithGemini(context, p.apiKey, p.model || DEFAULT_MODEL);
      state.checkins[today()] = { text, key, source: 'gemini' };
      save();
      if (ui.view === 'today') render();
    } catch { /* keep the template message */ }
    checkinPending = false;
  }

  // ---------- Reminders ----------
  function reminderDue() {
    const p = state.profile;
    if (!p?.remindersOn) return false;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return hhmm >= p.reminderTime && todayTasks().some((t) => !t.done);
  }
  function reminderTick() {
    if (!reminderDue() || state.notified[today()]) return;
    state.notified[today()] = true;
    save();
    const left = todayTasks().filter((t) => !t.done);
    const body = `${left.length} task${left.length === 1 ? '' : 's'} left today. Next: ${left[0].title}`;
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Momentum check-in', { body });
    } catch { /* notifications unavailable */ }
    toast(`Check-in time. ${body}`);
    render();
  }
  setInterval(reminderTick, 30000);

  // ---------- Calendar + data export ----------
  function icsText() {
    const p = state.profile;
    const [h, m] = (p.reminderTime || '19:00').split(':');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const end = addDays(today(), 60);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Momentum//Accountability Buddy//EN', 'CALSCALE:GREGORIAN'];
    state.tasks.filter((t) => !t.done && t.date >= today() && t.date <= end).forEach((t) => {
      const g = goalById(t.goalId);
      lines.push('BEGIN:VEVENT', `UID:${t.id}@momentum`, `DTSTAMP:${stamp}`,
        `DTSTART:${t.date.replace(/-/g, '')}T${h}${m}00`, `DURATION:PT${t.minutes}M`,
        `SUMMARY:${escIcs(t.title)}`, `DESCRIPTION:${escIcs(`Goal: ${g ? g.title : ''}`)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Momentum reminder', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  function download(name, text, type) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* some embedded viewers block downloads; the copy box covers that */ }
  }

  // ---------- Demo data ----------
  function loadDemo() {
    state = blank();
    state.profile = { name: 'Alex', hoursPerWeek: 7, reminderTime: '19:00', buddyStyle: 'coach', apiKey: '', model: DEFAULT_MODEL, remindersOn: false };
    const start = addDays(today(), -10);
    const goals = [
      { title: 'Land a software engineering internship for summer 2027', why: 'I want real industry experience before graduating', level: 'beginner', deadline: addDays(today(), 110) },
      { title: 'Run my first 10K race', why: 'Get fit and prove I can stick to something', level: 'beginner', deadline: addDays(today(), 60) }
    ];
    goals.forEach((gd, i) => {
      const g = { id: uid(), ...gd, createdAt: start, color: GOAL_COLORS[i], source: 'offline', demo: true };
      state.goals.push(g);
      materialise(g, Planner.planOffline(g, { hoursPerWeek: i === 0 ? 5 : 3 }, start), start);
    });
    // Simulate a good week and a half: most past tasks done, one missed
    state.tasks.forEach((t) => {
      if (t.date < today() && t.date !== addDays(today(), -6)) { t.done = true; t.doneAt = t.date; }
    });
    save();
    ui.view = 'today';
    toast('Demo loaded with example goals. Reset it in Settings.');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = null; render(); }, 3200);
    render();
  }

  // ---------- Icons ----------
  const I = {
    today: '<svg viewBox="0 0 24 24"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h6"/></svg>',
    progress: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    later: '<svg viewBox="0 0 24 24"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z"/></svg>',
    mark: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/></svg>',
    face: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="13" r="1.6" fill="currentColor" stroke="none"/><circle cx="21" cy="13" r="1.6" fill="currentColor" stroke="none"/><path d="M10 19c1.6 2.4 3.6 3.5 6 3.5s4.4-1.1 6-3.5"/></svg>'
  };

  // ---------- Views ----------
  function topbar() {
    const s = streak();
    return `<header class="topbar">
      <div class="brand"><span class="brand-mark">${I.mark}</span>Momentum</div>
      ${state.profile ? `<span class="streak-pill" title="Days in a row with at least one task done">${I.flame}<span class="num">${s}</span> day streak</span>` : ''}
    </header>`;
  }

  function tabs() {
    const t = [['today', 'Today'], ['plan', 'Plan'], ['progress', 'Progress'], ['settings', 'Settings']];
    return `<nav class="tabs" aria-label="Main">${t.map(([k, label]) => `<button data-action="nav" data-view="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${I[k]}${label}</button>`).join('')}</nav>`;
  }

  function taskRow(t, { showDate = false, editable = false } = {}) {
    const g = goalById(t.goalId);
    const overdue = !t.done && t.date < today();
    if (ui.editing === t.id) {
      return `<li class="task"><div class="task-body"><input class="edit-input" id="edit-${t.id}" data-edit="${t.id}" value="${esc(t.title)}" aria-label="Task title"></div>
        <input type="date" class="edit-input" style="width:auto" data-edit-date="${t.id}" value="${t.date}" aria-label="Task date">
        <button class="btn primary" data-action="save-edit" data-id="${t.id}">Save</button></li>`;
    }
    return `<li class="task ${t.done ? 'done' : ''}">
      <button class="check" data-action="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}" aria-pressed="${t.done}">${I.check}</button>
      <div class="task-body">
        <span class="task-title">${esc(t.title)}</span>
        <span class="task-meta">
          ${g && !editable ? `<span class="goal-name"><span class="dot" style="background:${g.color}"></span>${esc(g.title.length > 34 ? g.title.slice(0, 32) + '…' : g.title)}</span>` : ''}
          <span class="num">${t.minutes} min</span>
          ${showDate || overdue ? `<span>${fmtDate(t.date)}</span>` : ''}
          ${overdue ? '<span class="tag overdue">Overdue</span>' : ''}
        </span>
      </div>
      ${!t.done && !editable ? `<button class="icon-btn" data-action="later" data-id="${t.id}" title="Move to tomorrow" aria-label="Move to tomorrow">${I.later}</button>` : ''}
      ${editable ? `<button class="icon-btn" data-action="edit" data-id="${t.id}" aria-label="Edit task">${I.edit}</button>
      <button class="icon-btn" data-action="delete-task" data-id="${t.id}" aria-label="Delete task">${I.trash}</button>` : ''}
    </li>`;
  }

  function viewWelcome() {
    return `<section class="welcome card" style="gap:18px">
      <p class="eyebrow">Your AI accountability buddy</p>
      <h1>Big ambitions, broken down to what you do today.</h1>
      <p class="lede">Tell Momentum what you're aiming for. It builds the plan, puts today's tasks in front of you, and checks in every day like a gym partner who won't let you skip.</p>
      <div class="ladder" aria-label="How a goal is broken down"><span>Big goal</span><i>→</i><span>Phases</span><i>→</i><span>Weekly milestones</span><i>→</i><span>Today's tasks</span></div>
    </section>
    <section class="card">
      <h2>Set up your buddy</h2>
      <form data-form="profile">
        <div class="grid-2">
          <label>Your name<input type="text" id="p-name" name="name" required maxlength="40" value="${esc(state.profile?.name || '')}" placeholder="e.g. Sherbaz" autocomplete="given-name"></label>
          <label>Hours per week you can give<input type="number" id="p-hours" name="hoursPerWeek" min="1" max="60" value="${state.profile?.hoursPerWeek || 6}" required><span class="hint">Be honest. The plan fits inside this.</span></label>
        </div>
        <label>Daily check-in time<input type="time" id="p-time" name="reminderTime" value="${state.profile?.reminderTime || '19:00'}" required></label>
        ${buddyPicker(state.profile?.buddyStyle || 'coach')}
        ${ui.error ? `<p class="error">${esc(ui.error)}</p>` : ''}
        <button class="btn primary block" type="submit">Continue</button>
      </form>
    </section>
    <section class="card"><div class="row"><p class="grow muted small">Presenting or just curious? Load two example goals with 10 days of history.</p><button class="btn" data-action="demo">Load demo</button></div></section>`;
  }

  function buddyPicker(current) {
    return `<fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:6px"><legend style="font-weight:700;font-size:.92rem;margin-bottom:6px">Buddy personality</legend>
      <div class="seg">${Object.entries(BUDDY).map(([k, b]) => `<label><input type="radio" name="buddyStyle" id="bs-${k}" value="${k}" ${current === k ? 'checked' : ''}><b>${b.name}</b><span class="hint">${b.desc}</span></label>`).join('')}</div></fieldset>`;
  }

  function viewNewGoal() {
    const examples = ['Land a software internship by summer', 'Get a 3.7 GPA this semester', 'Run a 10K', 'Launch my first app', 'Speak conversational Spanish'];
    return `<section class="card">
      <div class="card-head"><h2>${state.goals.length ? 'Add another goal' : `What are you aiming for, ${esc(state.profile.name)}?`}</h2>
      ${state.goals.length ? '<button class="btn" data-action="nav" data-view="plan">Cancel</button>' : ''}</div>
      <div class="row">${examples.map((e) => `<button class="chip" type="button" data-action="example" data-text="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <form data-form="goal">
        <label>Your big goal<input type="text" id="g-title" name="title" maxlength="120" required placeholder="e.g. Land a software engineering internship"></label>
        <label>Why does it matter to you?<textarea id="g-why" name="why" maxlength="300" placeholder="Your buddy uses this to keep you going on hard days"></textarea></label>
        <div class="grid-2">
          <label>Deadline<input type="date" id="g-deadline" name="deadline" required min="${addDays(today(), 7)}" value="${addDays(today(), 84)}"></label>
          <label>Where are you starting?<select id="g-level" name="level"><option value="beginner">Beginner, starting from zero</option><option value="intermediate">Some experience</option><option value="advanced">Advanced, need to level up</option></select></label>
        </div>
        ${ui.error ? `<p class="error">${esc(ui.error)}</p>` : ''}
        <button class="btn primary block" type="submit">Build my plan</button>
        <p class="muted small">${state.profile.apiKey ? 'Your plan is built with Google Gemini.' : 'No Gemini key set, so the built-in planner will be used. Add a key in Settings for an AI-written plan.'}</p>
      </form>
    </section>`;
  }

  function viewToday() {
    const tt = todayTasks();
    const done = tt.filter((t) => t.done).length;
    const mins = tt.filter((t) => !t.done).reduce((a, t) => a + t.minutes, 0);
    const msg = buddyMessage();
    const nudge = reminderDue();
    return `<section class="card buddy" aria-live="polite">
      <div class="buddy-row"><span class="buddy-face">${I.face}</span>
        <div style="display:flex;flex-direction:column;gap:6px"><p class="eyebrow">${BUDDY[state.profile.buddyStyle].name} · ${fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <p class="buddy-msg">${esc(msg.text)}</p></div></div>
      <div class="buddy-actions"><button class="btn" data-action="new-msg">Another check-in</button></div>
    </section>
    ${nudge ? `<div class="notice">It's past your ${fmtTime(state.profile.reminderTime)} check-in. ${tt.length - done} task${tt.length - done === 1 ? '' : 's'} still open.</div>` : ''}
    <div class="stats">
      <div class="stat"><b>${done}/${tt.length}</b><span>done today</span></div>
      <div class="stat"><b>${mins}</b><span>minutes left</span></div>
      <div class="stat"><b>${streak()}</b><span>day streak</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Today</h2><span class="muted small">${fmtDate(today())}</span></div>
      ${tt.length ? `<ul class="task-list">${tt.map((t) => taskRow(t)).join('')}</ul>` : `<div class="empty"><p>No tasks scheduled today. Rest day, or add one below.</p></div>`}
      <form data-form="quick" class="row" style="flex-direction:row">
        <input type="text" id="q-title" name="title" class="grow" placeholder="Add a task for today" aria-label="New task" maxlength="140" required>
        ${state.goals.length > 1 ? `<select id="q-goal" name="goalId" aria-label="Goal" style="width:auto">${state.goals.map((g) => `<option value="${g.id}">${esc(g.title.slice(0, 24))}</option>`).join('')}</select>` : ''}
        <button class="btn" type="submit">Add</button>
      </form>
    </section>
    ${upNext()}`;
  }

  function upNext() {
    const t = today();
    const next = state.tasks.filter((x) => x.date > t && x.date <= addDays(t, 3) && !x.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    if (!next.length) return '';
    return `<section class="card"><h3>Coming up</h3><ul class="task-list">${next.map((x) => taskRow(x, { showDate: true })).join('')}</ul></section>`;
  }

  function viewPlan() {
    if (!state.goals.length) return viewNewGoal();
    if (!goalById(ui.planGoal)) ui.planGoal = state.goals[0].id;
    const g = goalById(ui.planGoal);
    const st = goalStats(g);
    const t = today();
    const overdue = state.tasks.filter((x) => x.goalId === g.id && !x.done && x.date < t).length;
    const confirming = ui.confirm === `goal:${g.id}`;
    return `<div class="goal-switch" role="group" aria-label="Goals">
      ${state.goals.map((x) => `<button class="chip" data-action="pick-goal" data-id="${x.id}" aria-pressed="${x.id === g.id}"><span class="dot" style="background:${x.color}"></span>${esc(x.title.length > 30 ? x.title.slice(0, 28) + '…' : x.title)}</button>`).join('')}
      <button class="chip" data-action="nav" data-view="newgoal">+ New goal</button>
    </div>
    <section class="card" style="--pc:${g.color}">
      <div class="card-head"><h2>${esc(g.title)}</h2><span class="tag ${g.source === 'gemini' ? 'ai' : 'offline'}">${g.source === 'gemini' ? 'Planned by Gemini' : 'Built-in planner'}${g.demo ? ' · demo' : ''}</span></div>
      ${g.why ? `<p class="muted">Why: ${esc(g.why)}</p>` : ''}
      <div class="row small"><span>Deadline <b>${fmtDate(g.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}</b></span><span class="muted">·</span><span class="num">${daysLeft(g.deadline)} days left</span><span class="muted">·</span><span class="num">${st.done}/${st.total} tasks</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${st.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Goal progress"><i style="width:${st.pct}%"></i></div>
      <div class="row">
        ${overdue ? `<button class="btn primary" data-action="replan" data-id="${g.id}">Reschedule ${overdue} missed task${overdue === 1 ? '' : 's'}</button>` : ''}
        <button class="btn" data-action="rebuild" data-id="${g.id}">Rebuild plan</button>
        ${confirming ? `<span class="small">Delete this goal and its tasks?</span><button class="btn danger" data-action="delete-goal" data-id="${g.id}">Delete</button><button class="btn" data-action="cancel-confirm">Keep</button>`
          : `<button class="btn danger" data-action="confirm" data-key="goal:${g.id}">Delete goal</button>`}
      </div>
    </section>
    ${g.phases.map((p) => `<section class="card phase" style="--pc:${g.color}">
        <div class="phase-head"><p class="eyebrow">${fmtDate(p.start, { day: 'numeric', month: 'short' })} – ${fmtDate(p.end, { day: 'numeric', month: 'short' })}</p><h3>${esc(p.title)}</h3>${p.summary ? `<p class="muted small">${esc(p.summary)}</p>` : ''}</div>
        ${p.weeks.map((w) => {
          const wt = state.tasks.filter((x) => x.goalId === g.id && x.weekIdx === w.idx).sort((a, b) => a.date.localeCompare(b.date));
          const wd = wt.filter((x) => x.done).length;
          const current = t >= w.start && t <= addDays(w.start, 6);
          return `<details class="week ${current ? 'current' : ''}" ${current ? 'open' : ''}>
            <summary><span><b>${esc(w.title)}</b>${current ? ' <span class="tag ai">This week</span>' : ''}</span><span class="wk">W${w.idx + 1} · ${wd}/${wt.length}</span></summary>
            <ul class="task-list">${wt.map((x) => taskRow(x, { showDate: true, editable: true })).join('') || '<li class="task muted small">No tasks this week.</li>'}</ul>
          </details>`;
        }).join('')}
      </section>`).join('')}`;
  }

  function viewProgress() {
    const t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const counts = days.map((d) => state.tasks.filter((x) => x.done && x.doneAt === d).length);
    const max = Math.max(1, ...counts);
    const all = state.tasks.filter((x) => x.date <= t);
    const allDone = all.filter((x) => x.done).length;
    return `<div class="stats">
      <div class="stat"><b>${streak()}</b><span>current streak</span></div>
      <div class="stat"><b>${bestStreak()}</b><span>best streak</span></div>
      <div class="stat"><b>${all.length ? Math.round((allDone / all.length) * 100) : 0}%</b><span>due tasks done</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Last 7 days</h2><span class="muted small">tasks completed per day</span></div>
      <div class="week-chart" role="img" aria-label="Tasks completed in the last 7 days: ${counts.join(', ')}">
        ${days.map((d, i) => `<div class="col ${d === t ? 'today' : ''}"><span class="v">${counts[i]}</span><div class="b ${counts[i] ? '' : 'zero'}" style="height:${(counts[i] / max) * 100}%"></div><span class="d">${fmtDate(d, { weekday: 'short' })}</span></div>`).join('')}
      </div>
    </section>
    <section class="card"><h2>Goals</h2>
      ${state.goals.length ? state.goals.map((g) => { const s = goalStats(g); return `<div style="--pc:${g.color};display:flex;flex-direction:column;gap:6px">
        <div class="card-head"><b>${esc(g.title)}</b><span class="tag ${s.onTrack ? '' : 'overdue'}" style="${s.onTrack ? 'background:var(--good-soft);color:var(--good)' : ''}">${s.onTrack ? 'On track' : 'Falling behind'}</span></div>
        <div class="bar"><i style="width:${s.pct}%"></i></div>
        <span class="small muted"><span class="num">${s.done}/${s.total}</span> tasks · <span class="num">${s.doneDue}/${s.due}</span> of tasks due so far · <span class="num">${daysLeft(g.deadline)}</span> days left</span></div>`; }).join('') : '<p class="muted">No goals yet.</p>'}
    </section>`;
  }

  function viewSettings() {
    const p = state.profile;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const confirming = ui.confirm === 'reset';
    return `<section class="card"><h2>Profile & buddy</h2>
      <form data-form="profile-edit">
        <div class="grid-2">
          <label>Name<input type="text" id="s-name" name="name" required maxlength="40" value="${esc(p.name)}"></label>
          <label>Hours per week<input type="number" id="s-hours" name="hoursPerWeek" min="1" max="60" value="${p.hoursPerWeek}" required><span class="hint">Used for new or rebuilt plans</span></label>
        </div>
        ${buddyPicker(p.buddyStyle)}
        <button class="btn primary" type="submit">Save profile</button>
      </form>
    </section>
    <section class="card"><h2>AI planner (Google Gemini)</h2>
      <p class="muted small">Get a free API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>. The key is stored only in this browser and sent only to Google.</p>
      <form data-form="ai">
        <label>API key<input type="password" id="s-key" name="apiKey" value="${esc(p.apiKey || '')}" placeholder="AIza…" autocomplete="off"></label>
        <label>Model<input type="text" id="s-model" name="model" value="${esc(p.model || DEFAULT_MODEL)}"><span class="hint">Default: ${DEFAULT_MODEL}</span></label>
        <div class="row"><button class="btn primary" type="submit">Save key</button><button class="btn" type="button" data-action="test-key">Test key</button></div>
      </form>
    </section>
    <section class="card"><h2>Reminders</h2>
      <form data-form="reminders">
        <label>Daily check-in time<input type="time" id="s-time" name="reminderTime" value="${p.reminderTime}"></label>
        <div class="row"><button class="btn primary" type="submit">${p.remindersOn ? 'Save time' : 'Turn on reminders'}</button>
        ${p.remindersOn ? '<button class="btn" type="button" data-action="reminders-off">Turn off</button>' : ''}</div>
        <p class="muted small">Status: ${p.remindersOn ? `on at ${fmtTime(p.reminderTime)}` : 'off'} · browser notifications ${perm === 'granted' ? 'allowed' : perm === 'denied' ? 'blocked (in-app reminders still work)' : perm === 'unsupported' ? 'not supported here' : 'not yet allowed'}. Reminders fire while Momentum is open; add tasks to your calendar to get them anywhere.</p>
      </form>
      <div class="row"><button class="btn" data-action="ics">Add next 60 days to calendar (.ics)</button></div>
    </section>
    ${ui.exportPanel ? `<section class="card"><div class="card-head"><h3>${esc(ui.exportPanel.title)}</h3><button class="btn" data-action="close-export">Close</button></div>
      <p class="muted small">If the download didn't start, copy this text into a file named <span class="num">${esc(ui.exportPanel.name)}</span>.</p>
      <textarea class="code" id="export-text" readonly>${esc(ui.exportPanel.text)}</textarea>
      <div class="row"><button class="btn primary" data-action="copy-export">Copy</button></div></section>` : ''}
    <section class="card"><h2>Your data</h2>
      <p class="muted small">Everything is saved on this device only. Export a backup to move it to another browser.</p>
      <div class="row">
        <button class="btn" data-action="export-json">Export backup</button>
        <label class="btn" style="flex-direction:row;font-weight:700">Import backup<input type="file" id="import-file" accept="application/json,.json" data-action="import" hidden></label>
        ${confirming ? `<span class="small">Erase all goals, tasks and settings?</span><button class="btn danger" data-action="reset">Erase</button><button class="btn" data-action="cancel-confirm">Keep</button>`
          : '<button class="btn danger" data-action="confirm" data-key="reset">Reset everything</button>'}
      </div>
    </section>`;
  }

  // ---------- Render ----------
  const root = document.getElementById('app');
  function render() {
    let body;
    if (!state.profile) ui.view = 'welcome';
    switch (ui.view) {
      case 'welcome': body = viewWelcome(); break;
      case 'newgoal': body = viewNewGoal(); break;
      case 'plan': body = viewPlan(); break;
      case 'progress': body = viewProgress(); break;
      case 'settings': body = viewSettings(); break;
      default: ui.view = 'today'; body = state.goals.length ? viewToday() : viewNewGoal();
    }
    root.innerHTML = `<div class="app">${topbar()}${body}</div>
      ${state.profile && state.goals.length ? tabs() : ''}
      ${ui.busy ? `<div class="overlay" role="alertdialog" aria-live="assertive"><div class="card"><div class="spinner"></div><h3>${esc(ui.busy)}</h3><p class="muted small">Breaking your goal into phases, weekly milestones and daily tasks.</p></div></div>` : ''}
      ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
    if (ui.editing) { const el = document.getElementById(`edit-${ui.editing}`); if (el) { el.focus(); el.select(); } }
    if (ui.view === 'today') maybeGeminiCheckIn();
  }

  function go(view) { ui.view = view; ui.error = null; ui.confirm = null; ui.editing = null; render(); window.scrollTo(0, 0); }

  // ---------- Events ----------
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    const { action, id } = el.dataset;
    const task = id && state.tasks.find((t) => t.id === id);
    switch (action) {
      case 'nav': go(el.dataset.view); break;
      case 'demo': loadDemo(); render(); break;
      case 'example': { const input = document.getElementById('g-title'); input.value = el.dataset.text; input.focus(); break; }
      case 'toggle':
        task.done = !task.done; task.doneAt = task.done ? today() : null; save();
        if (task.done) {
          const left = todayTasks().filter((t) => !t.done).length;
          if (ui.view === 'today' && left === 0) toast('All done for today. Streak protected.');
        }
        render(); break;
      case 'later': task.date = addDays(today(), 1); save(); toast('Moved to tomorrow'); break;
      case 'edit': ui.editing = id; render(); break;
      case 'save-edit': saveEdit(id); break;
      case 'delete-task': state.tasks = state.tasks.filter((t) => t.id !== id); save(); render(); break;
      case 'pick-goal': ui.planGoal = id; ui.confirm = null; render(); break;
      case 'confirm': ui.confirm = el.dataset.key; render(); break;
      case 'cancel-confirm': ui.confirm = null; render(); break;
      case 'delete-goal':
        state.goals = state.goals.filter((g) => g.id !== id);
        state.tasks = state.tasks.filter((t) => t.goalId !== id);
        ui.confirm = null; ui.planGoal = null; save();
        toast('Goal deleted'); if (!state.goals.length) go('newgoal'); break;
      case 'replan': {
        const t = today();
        const missed = state.tasks.filter((x) => x.goalId === id && !x.done && x.date < t).sort((a, b) => a.date.localeCompare(b.date));
        missed.forEach((x, i) => { x.date = addDays(t, Math.floor(i / 2)); });
        save(); toast(`${missed.length} task${missed.length === 1 ? '' : 's'} rescheduled from today`); break;
      }
      case 'rebuild': {
        const g = goalById(id);
        ui.busy = 'Rebuilding your plan'; render();
        const kept = state.tasks.filter((x) => x.goalId === id && x.done);
        const warn = await buildPlan(g, today());
        // keep completed history: past done tasks stay, attached to week -1
        kept.forEach((x) => { x.weekIdx = -1; });
        state.tasks = state.tasks.concat(kept);
        ui.busy = null; save();
        toast(warn || 'Plan rebuilt from today'); break;
      }
      case 'new-msg':
        ui.variant++;
        if (state.profile.apiKey) { delete state.checkins[today()]; maybeGeminiCheckIn(true); }
        render(); break;
      case 'test-key': testKey(); break;
      case 'reminders-off': state.profile.remindersOn = false; save(); toast('Reminders off'); break;
      case 'ics': {
        const text = icsText();
        download('momentum-tasks.ics', text, 'text/calendar');
        ui.exportPanel = { title: 'Calendar file', name: 'momentum-tasks.ics', text }; render(); break;
      }
      case 'export-json': {
        const text = JSON.stringify({ ...state, profile: { ...state.profile, apiKey: '' } }, null, 2);
        download('momentum-backup.json', text, 'application/json');
        ui.exportPanel = { title: 'Backup (API key removed)', name: 'momentum-backup.json', text }; render(); break;
      }
      case 'close-export': ui.exportPanel = null; render(); break;
      case 'copy-export': {
        const ta = document.getElementById('export-text');
        try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { ta.focus(); ta.select(); toast('Press Ctrl/Cmd + C to copy'); }
        break;
      }
      case 'reset': state = blank(); ui.confirm = null; try { localStorage.removeItem(STORE_KEY); } catch {} go('welcome'); break;
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-edit]')) {
      if (e.key === 'Enter') { e.preventDefault(); saveEdit(e.target.dataset.edit); }
      if (e.key === 'Escape') { ui.editing = null; render(); }
    }
  });

  root.addEventListener('change', (e) => {
    if (e.target.id !== 'import-file' || !e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.profile || !Array.isArray(data.goals) || !Array.isArray(data.tasks)) throw new Error('bad');
        const key = state.profile?.apiKey || '';
        state = { ...blank(), ...data };
        if (!state.profile.apiKey) state.profile.apiKey = key;
        save(); toast('Backup imported'); go('today');
      } catch { toast("That file isn't a Momentum backup."); }
    };
    reader.readAsText(e.target.files[0]);
  });

  function saveEdit(id) {
    const t = state.tasks.find((x) => x.id === id);
    const title = document.getElementById(`edit-${id}`)?.value.trim();
    const date = document.querySelector(`[data-edit-date="${id}"]`)?.value;
    if (title) t.title = title;
    if (date) t.date = date;
    ui.editing = null; save(); render();
  }

  async function testKey() {
    const key = document.getElementById('s-key').value.trim();
    const model = document.getElementById('s-model').value.trim() || DEFAULT_MODEL;
    if (!key) { toast('Paste an API key first'); return; }
    toast('Testing key…');
    try {
      await Planner.checkInWithGemini('Reply with the single word: ready', key, model);
      toast('Key works. Gemini is connected.');
    } catch (e) { toast(`Key test failed: ${e.message}`); }
  }

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form).entries());
    ui.error = null;
    switch (form.dataset.form) {
      case 'profile': {
        const hours = Number(f.hoursPerWeek);
        if (!f.name.trim()) { ui.error = 'Add your name so your buddy knows who to talk to.'; render(); return; }
        if (!(hours >= 1 && hours <= 60)) { ui.error = 'Hours per week must be between 1 and 60.'; render(); return; }
        state.profile = { name: f.name.trim(), hoursPerWeek: hours, reminderTime: f.reminderTime || '19:00', buddyStyle: f.buddyStyle || 'coach', apiKey: '', model: DEFAULT_MODEL, remindersOn: false };
        save(); go('newgoal'); break;
      }
      case 'profile-edit':
        Object.assign(state.profile, { name: f.name.trim() || state.profile.name, hoursPerWeek: Math.min(60, Math.max(1, Number(f.hoursPerWeek) || 5)), buddyStyle: f.buddyStyle });
        delete state.checkins[today()]; save(); toast('Profile saved'); break;
      case 'ai':
        state.profile.apiKey = f.apiKey.trim(); state.profile.model = f.model.trim() || DEFAULT_MODEL;
        delete state.checkins[today()]; save(); toast(state.profile.apiKey ? 'Key saved. New plans use Gemini.' : 'Key removed. Using the built-in planner.'); break;
      case 'reminders': {
        state.profile.reminderTime = f.reminderTime || '19:00';
        state.profile.remindersOn = true;
        delete state.notified[today()];
        try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* refused */ }
        save(); toast(`Reminders on at ${fmtTime(state.profile.reminderTime)}`); break;
      }
      case 'goal': {
        const title = f.title.trim();
        if (!title) { ui.error = 'Describe your goal in a few words.'; render(); return; }
        if (!f.deadline || f.deadline < addDays(today(), 7)) { ui.error = 'Pick a deadline at least one week from today.'; render(); return; }
        const g = { id: uid(), title, why: f.why.trim(), level: f.level, deadline: f.deadline, createdAt: today(), color: GOAL_COLORS[state.goals.length % GOAL_COLORS.length], source: 'offline' };
        ui.busy = state.profile.apiKey ? 'Gemini is building your plan' : 'Building your plan';
        render();
        const warn = await buildPlan(g, today());
        state.goals.push(g);
        ui.busy = null; ui.planGoal = g.id; save();
        ui.view = 'plan'; render();
        toast(warn || `Plan ready: ${g.phases.length} phases, ${g.phases.reduce((a, p) => a + p.weeks.length, 0)} weeks`);
        break;
      }
      case 'quick': {
        const goalId = f.goalId || state.goals[0].id;
        state.tasks.push({ id: uid(), goalId, phaseId: null, weekIdx: -1, date: today(), title: f.title.trim(), minutes: 30, done: false, doneAt: null });
        save(); render(); document.getElementById('q-title')?.focus(); break;
      }
    }
  });

  render();
  reminderTick();
})();
