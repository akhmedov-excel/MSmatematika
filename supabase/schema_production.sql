-- MS Matematika production-oriented schema.
-- Answer keys can be stored here even though a public answer-view feature exists.
-- Final grading should run server-side through a controlled RPC/function.

create extension if not exists pgcrypto;

create table if not exists public.variants (
  id integer primary key check (id between 1 and 20),
  title text not null default '',
  is_active boolean not null default true
);

create table if not exists public.questions (
  id bigserial primary key,
  variant_id integer not null references public.variants(id) on delete cascade,
  question_no integer not null check (question_no between 1 and 45),
  question_type text not null check (question_type in ('choice','open')),
  topic text,
  answer_key text,
  unique (variant_id, question_no)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_name text not null check (char_length(trim(student_name)) between 1 and 100),
  student_surname text check (student_surname is null or char_length(trim(student_surname)) <= 100),
  variant_id integer not null references public.variants(id),
  score numeric(5,2),
  correct_count integer,
  total_count integer,
  unanswered_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  answer text,
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_questions_variant on public.questions(variant_id, question_no);
create index if not exists idx_attempts_created on public.attempts(created_at desc);
create index if not exists idx_attempts_student on public.attempts(student_name, student_surname);

-- Seed the 20 variant shells. Question rows will be populated from the verified answer-key source.
insert into public.variants (id, title)
select g, g || '-variant'
from generate_series(1,20) as g
on conflict (id) do nothing;

alter table public.variants enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

-- Public read of active variants/questions is intentional because the product includes
-- a "Javoblarni darhol ko'rish" feature. Attempts are NOT publicly readable.
create policy "public can read active variants"
on public.variants for select
using (is_active = true);

create policy "public can read active question keys"
on public.questions for select
using (exists (
  select 1 from public.variants v
  where v.id = public.questions.variant_id and v.is_active = true
));

-- No public SELECT policy for attempts/attempt_answers.
-- Insert/grade RPC policies should be added after authentication and anti-abuse decisions.

comment on table public.questions is 'Verified answer key. Keep populated from the authoritative source file; do not infer missing answers.';
comment on table public.attempts is 'Student attempt history; intended for authenticated/admin workflows.';
