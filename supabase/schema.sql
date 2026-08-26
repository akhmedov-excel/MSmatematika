-- Future backend: keep answer keys in the database and sync student attempts.
create extension if not exists pgcrypto;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_surname text,
  variant_no integer not null check (variant_no between 1 and 20),
  score numeric(5,2),
  correct_count integer,
  total_count integer,
  unanswered_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_no integer not null check (question_no between 1 and 45),
  answer text,
  is_correct boolean,
  created_at timestamptz not null default now()
);

alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

-- Production note: do not expose unrestricted insert/select policies until auth/anti-abuse design is finalized.
