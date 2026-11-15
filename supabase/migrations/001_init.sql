-- ContentPilot schema. Every table is owner-only via row-level security.
-- Phase 1 tables are used now; Phase 2–3 tables exist so saved projects keep one structure across phases.

create extension if not exists pgcrypto;

-- ---------- Phase 1 ----------
create table if not exists public.brands (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  data jsonb not null,            -- includes AI analysis, plan, locks, review (source + confidence metadata inside)
  updated_at timestamptz not null default now()
);
create index if not exists projects_brand_idx on public.projects(brand_id, updated_at desc);

create table if not exists public.media_assets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  storage_path text,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists media_project_idx on public.media_assets(project_id);
create index if not exists media_brand_idx on public.media_assets(brand_id);

create table if not exists public.versions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists versions_project_idx on public.versions(project_id, created_at desc);

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_month_idx on public.api_usage(user_id, created_at desc);

-- ---------- Phase 2–3 (schema only) ----------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null check (platform in ('tiktok','instagram','facebook')),
  account_type text,
  external_id text,
  token_secret_id uuid,           -- reference to an encrypted secret (Supabase Vault); tokens never stored in plain text
  scopes text[],
  created_at timestamptz not null default now()
);
create table if not exists public.trend_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid references public.brands(id) on delete cascade,
  platform text, name text, category text, market text, source text, source_url text,
  checked_at timestamptz, reporting_period text, evidence text check (evidence in ('verified','cached','inferred','general','demo')),
  confidence text, data jsonb
);
create table if not exists public.music_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid references public.projects(id) on delete cascade,
  platform text, title text, artist text, source_url text, market text, checked_at timestamptz,
  evidence text, rights_status text, data jsonb
);
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid references public.projects(id) on delete cascade,
  platform text, scheduled_for timestamptz, timezone text,
  status text check (status in ('draft','planned','ready','scheduled','published','failed')),
  data jsonb
);
create table if not exists public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  calendar_entry_id uuid references public.calendar_entries(id) on delete cascade,
  approved_at timestamptz,        -- explicit user approval required before any publish
  platform_confirmation jsonb,    -- "Published" only when this is present
  status text, attempts int default 0, last_error text, audit jsonb, created_at timestamptz default now()
);
create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid references public.brands(id) on delete cascade,
  platform text, post_external_id text, captured_at timestamptz,
  source text check (source in ('api','file_upload','manual')), metrics jsonb
);
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand_id uuid references public.brands(id) on delete cascade,
  source_platform text, source_project_id uuid references public.projects(id) on delete set null,
  product_type text, inquiry_date date, quoted_value numeric, status text,
  attribution text check (attribution in ('attributed','estimated','manual')), data jsonb
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  lead_id uuid references public.leads(id) on delete set null,
  quantity int, confirmed_value numeric, status text,
  attribution text check (attribution in ('attributed','estimated','manual')), data jsonb, created_at timestamptz default now()
);
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  training_opt_in boolean not null default false
);

-- ---------- Row-level security: owner only, everywhere ----------
do $$
declare t text;
begin
  foreach t in array array['brands','projects','media_assets','versions','api_usage','social_accounts','trend_evidence',
    'music_recommendations','calendar_entries','publishing_jobs','analytics_snapshots','leads','orders','user_preferences']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Private media bucket: users can only touch files under their own user-id folder ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 524288000)
on conflict (id) do update set public = false;

drop policy if exists media_owner_select on storage.objects;
drop policy if exists media_owner_insert on storage.objects;
drop policy if exists media_owner_update on storage.objects;
drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_select on storage.objects for select using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_owner_insert on storage.objects for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_owner_update on storage.objects for update using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_owner_delete on storage.objects for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
