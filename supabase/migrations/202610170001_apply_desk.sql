-- Apply Desk: account-owned records. Never disable RLS on these tables.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  location text not null default '',
  linkedin_url text not null default '',
  portfolio_url text not null default '',
  target_roles text[] not null default '{}',
  locations text[] not null default '{}',
  skills text[] not null default '{}',
  summary text not null default '',
  resume_facts text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider_job_id text,
  title text not null check (char_length(title) between 1 and 180),
  company text not null check (char_length(company) between 1 and 140),
  location text not null default '',
  url text not null default '',
  description text not null default '',
  match_score smallint not null default 0 check (match_score between 0 and 100),
  matched_terms text[] not null default '{}',
  missing_terms text[] not null default '{}',
  status text not null default 'interested' check (status in ('interested','applied','interview','shortlisted','offer','rejected','archived')),
  applied_at date,
  follow_up_at date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid,
  provider text not null default 'gmail' check (provider in ('gmail','manual')),
  provider_message_id text not null,
  subject text not null default '',
  sender text not null default '',
  snippet text not null default '',
  status_signal text check (status_signal in ('applied','interview','shortlisted','offer','rejected') or status_signal is null),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, application_id) references public.applications (user_id, id) on delete cascade,
  unique (user_id, provider, provider_message_id)
);

-- Server-only log for basic per-account abuse control on the job search function.
create table if not exists public.job_search_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists applications_user_status_created_idx on public.applications (user_id, status, created_at desc);
create index if not exists applications_user_follow_up_idx on public.applications (user_id, follow_up_at) where follow_up_at is not null;
create index if not exists email_events_user_received_idx on public.email_events (user_id, received_at desc);
create index if not exists job_search_log_user_time_idx on public.job_search_log (user_id, requested_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.email_events enable row level security;
alter table public.job_search_log enable row level security;

revoke all on public.profiles, public.applications, public.email_events, public.job_search_log from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.applications, public.email_events to authenticated;
grant select, insert, delete on public.job_search_log to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists applications_delete_own on public.applications;
create policy applications_delete_own on public.applications for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists email_events_select_own on public.email_events;
create policy email_events_select_own on public.email_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists email_events_insert_own on public.email_events;
create policy email_events_insert_own on public.email_events for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists email_events_update_own on public.email_events;
create policy email_events_update_own on public.email_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists email_events_delete_own on public.email_events;
create policy email_events_delete_own on public.email_events for delete to authenticated using ((select auth.uid()) = user_id);
