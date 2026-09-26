-- Momentum ontology on Supabase (Postgres). Mirrors src/lib/types.ts.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)


create table if not exists profile (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  university text default '',
  program text default '',
  semester_number int default 1,
  semester_start date,
  semester_end date,
  timezone text default 'America/Chicago',
  wake time default '07:00',
  sleep time default '23:30',
  peak_energy text check (peak_energy in ('morning','afternoon','evening')) default 'morning',
  max_focus int default 90,
  weekly_hours numeric default 15,
  active_days int[] default '{1,2,3,4,5,6}',
  coach_style text check (coach_style in ('gentle','coach','drill')) default 'coach',
  reminder_lead int default 10,
  reminders_on boolean default false,
  exam_weeks date[] default '{}',
  stage text default 'intake',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists course (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code text not null, name text not null,
  credits int default 3, difficulty int check (difficulty between 1 and 5) default 3,
  target_grade text default 'A',
  created_at timestamptz default now()
);

create table if not exists fixed_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  kind text check (kind in ('class','work','gym','commute','other')) default 'other',
  course_id uuid references course on delete set null,
  weekdays int[] not null,
  start_time time not null, end_time time not null,
  location text,
  created_at timestamptz default now()
);

create table if not exists goal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null, why text default '',
  category text check (category in ('academic','career','health','skill','personal')),
  target_date date, success_metric text, priority int default 2, color text,
  created_at timestamptz default now()
);

create table if not exists milestone (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_id uuid not null references goal on delete cascade,
  title text not null, due date, definition_of_done text,
  status text check (status in ('open','done')) default 'open',
  sort_order int default 0
);

create table if not exists task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_id uuid references goal on delete cascade,
  milestone_id uuid references milestone on delete set null,
  course_id uuid references course on delete set null,
  title text not null,
  tier text check (tier in ('primary','secondary','tertiary')) not null,
  estimate int not null, energy text check (energy in ('high','medium','low')),
  earliest date not null, due date not null,
  status text check (status in ('todo','done','skipped')) default 'todo',
  source text check (source in ('ai','user')) default 'ai',
  done_at date, rolled_count int default 0,
  created_at timestamptz default now()
);
create index if not exists task_user_earliest on task (user_id, earliest);

create table if not exists plan_version (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  version int not null, summary text, agreed_at timestamptz default now(),
  snapshot jsonb, unique (user_id, version)
);

create table if not exists proposal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text check (kind in ('initial','chat_edit','replan')),
  rationale text, diff jsonb not null default '[]',
  status text check (status in ('pending','approved','rejected')) default 'pending',
  source text, created_at timestamptz default now()
);

create table if not exists time_block (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null, start_time time not null, end_time time not null,
  kind text check (kind in ('task','class','event','break','meal')),
  task_id uuid references task on delete cascade,
  title text, part text, locked boolean default false,
  state text check (state in ('pending','started','done','skipped','missed')) default 'pending'
);
create index if not exists block_user_date on time_block (user_id, date);

create table if not exists checkin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null, type text check (type in ('morning','evening')),
  mood int, energy int, notes text, ai_message text,
  unique (user_id, date, type)
);

create table if not exists reminder (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  time_block_id uuid references time_block on delete cascade,
  send_at timestamptz not null,
  status text check (status in ('queued','sent','acked','missed')) default 'queued',
  escalation_level int default 0
);
create index if not exists reminder_due on reminder (status, send_at);

create table if not exists push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text unique not null, keys jsonb not null,
  created_at timestamptz default now()
);

create table if not exists action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz default now(),
  actor text check (actor in ('ai','user','system')),
  action text, object_type text, object_id uuid, reason text, payload jsonb
);

create table if not exists chat_message (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  thread text, role text, content text, proposal_id uuid references proposal on delete set null,
  at timestamptz default now()
);

-- Row Level Security: every user sees only their own rows
do $$
declare t text;
begin
  foreach t in array array['profile','course','fixed_event','goal','milestone','task','plan_version','proposal','time_block','checkin','reminder','push_subscription','action_log','chat_message']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
