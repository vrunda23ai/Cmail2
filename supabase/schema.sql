-- ============================================================
-- Cmail schema (Postgres / Supabase)
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Profiles ----------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  gmail_connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile write" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

-- Emails ------------------------------------------------------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_id text,
  thread_id text,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  body_text text,
  received_at timestamptz not null default now(),
  importance_score numeric not null default 0,
  is_important boolean not null default false,
  summary text,
  is_demo boolean not null default false,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_id)
);
alter table public.emails enable row level security;
drop policy if exists "own emails" on public.emails;
create policy "own emails" on public.emails for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists emails_user_received_idx on public.emails (user_id, received_at desc);

-- Feedback ----------------------------------------------------
create table if not exists public.email_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_id uuid not null references public.emails(id) on delete cascade,
  label text not null check (label in ('important','not_important')),
  features jsonb,
  created_at timestamptz not null default now()
);
alter table public.email_feedback enable row level security;
drop policy if exists "own feedback" on public.email_feedback;
create policy "own feedback" on public.email_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User weights ------------------------------------------------
create table if not exists public.user_weights (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weights jsonb not null default '{}'::jsonb,
  feedback_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_weights enable row level security;
drop policy if exists "own weights" on public.user_weights;
create policy "own weights" on public.user_weights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Todos -------------------------------------------------------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_id uuid references public.emails(id) on delete set null,
  title text not null,
  notes text,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.todos enable row level security;
drop policy if exists "own todos" on public.todos;
create policy "own todos" on public.todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists todos_user_due_idx on public.todos (user_id, due_at);

-- Calendar events --------------------------------------------
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual','email','todo')),
  created_at timestamptz not null default now()
);
alter table public.calendar_events enable row level security;
drop policy if exists "own events" on public.calendar_events;
create policy "own events" on public.calendar_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists events_user_start_idx on public.calendar_events (user_id, starts_at);

-- Auto-create profile on sign-up -----------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists todos_updated_at on public.todos;
create trigger todos_updated_at before update on public.todos for each row execute function public.set_updated_at();
