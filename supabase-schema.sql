-- MY DISCIPLINE OS: workspace moja ya faragha kwa kila mtumiaji.
-- Endesha script hii mara moja kwenye Supabase Dashboard > SQL Editor.
create table if not exists public.discipline_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.discipline_workspaces
  add column if not exists revision bigint not null default 1;

alter table public.discipline_workspaces enable row level security;

drop policy if exists "Users can read their own workspace" on public.discipline_workspaces;
create policy "Users can read their own workspace"
  on public.discipline_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workspace" on public.discipline_workspaces;
create policy "Users can create their own workspace"
  on public.discipline_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workspace" on public.discipline_workspaces;
create policy "Users can update their own workspace"
  on public.discipline_workspaces for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.discipline_workspaces to authenticated;

create or replace function public.update_discipline_workspace(p_payload jsonb, p_expected_revision bigint)
returns table(payload jsonb, revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
    update public.discipline_workspaces as w
    set payload = p_payload,
        revision = w.revision + 1,
        updated_at = now()
    where w.user_id = (select auth.uid())
      and w.revision = p_expected_revision
    returning w.payload, w.revision, w.updated_at;

  if not found then
    raise exception 'workspace_conflict' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.update_discipline_workspace(jsonb, bigint) from public, anon;
grant execute on function public.update_discipline_workspace(jsonb, bigint) to authenticated;

-- Washa Realtime kwa jedwali hili bila kubadilisha publication iliyopo.
do $$
begin
  alter publication supabase_realtime add table public.discipline_workspaces;
exception
  when duplicate_object then null;
end $$;
