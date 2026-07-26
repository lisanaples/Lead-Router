create extension if not exists pgcrypto;

create table if not exists public.lead_router_records (
  id text primary key,
  record_type text not null default 'lead',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_router_records enable row level security;

drop policy if exists "lead_router_select_own_records" on public.lead_router_records;
drop policy if exists "lead_router_insert_own_records" on public.lead_router_records;
drop policy if exists "lead_router_update_own_records" on public.lead_router_records;
drop policy if exists "lead_router_delete_own_records" on public.lead_router_records;
drop policy if exists "lead_router_authenticated_select" on public.lead_router_records;
drop policy if exists "lead_router_authenticated_insert" on public.lead_router_records;
drop policy if exists "lead_router_authenticated_update" on public.lead_router_records;
drop policy if exists "lead_router_authenticated_delete" on public.lead_router_records;

create policy "lead_router_authenticated_select"
on public.lead_router_records
for select
using (auth.role() = 'authenticated');

create policy "lead_router_authenticated_insert"
on public.lead_router_records
for insert
with check (auth.role() = 'authenticated');

create policy "lead_router_authenticated_update"
on public.lead_router_records
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "lead_router_authenticated_delete"
on public.lead_router_records
for delete
using (auth.role() = 'authenticated');

create or replace function public.set_lead_router_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_lead_router_updated_at on public.lead_router_records;

create trigger set_lead_router_updated_at
before update on public.lead_router_records
for each row
execute function public.set_lead_router_updated_at();
