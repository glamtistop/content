-- ContentPilot feature 5: evolving memory of the user's decisions.
-- Run in the Supabase SQL Editor after 001_init.sql. Safe to run more than once.

create table if not exists public.decision_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  data jsonb not null,           -- DecisionEvent: kind, field, platform, before, after, reasons, context
  created_at timestamptz not null default now()
);
create index if not exists decision_events_brand_idx on public.decision_events (brand_id, created_at);

create table if not exists public.preference_rules (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rule_key text not null,        -- kind + scope + params; one row per learned rule
  data jsonb not null,           -- PreferenceRule: text, params, evidence, status, userSet
  updated_at timestamptz not null default now(),
  unique (brand_id, rule_key)
);

alter table public.decision_events enable row level security;
alter table public.preference_rules enable row level security;
drop policy if exists owner_all on public.decision_events;
drop policy if exists owner_all on public.preference_rules;
create policy owner_all on public.decision_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on public.preference_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
