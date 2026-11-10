create table if not exists public.calculator_history_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  salt text not null,
  generation uuid not null default gen_random_uuid(),
  format_version integer not null check (format_version = 1),
  kdf_iterations integer not null check (kdf_iterations = 600000),
  created_at timestamptz not null default now()
);

alter table public.calculator_history_vaults enable row level security;

revoke all on public.calculator_history_vaults from anon, authenticated;
grant select, insert on public.calculator_history_vaults to authenticated;

drop policy if exists "Users can read their own calculator vault" on public.calculator_history_vaults;
create policy "Users can read their own calculator vault"
  on public.calculator_history_vaults for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own calculator vault" on public.calculator_history_vaults;
create policy "Users can create their own calculator vault"
  on public.calculator_history_vaults for insert to authenticated
  with check ((select auth.uid()) = user_id);

create table if not exists public.calculator_history_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  generation uuid not null,
  entry_id uuid not null,
  encrypted_entry jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, generation, entry_id)
);

alter table public.calculator_history_entries enable row level security;

revoke all on public.calculator_history_entries from anon, authenticated;
grant select, insert, delete on public.calculator_history_entries to authenticated;

drop policy if exists "Users can read their own calculator history" on public.calculator_history_entries;
create policy "Users can read their own calculator history"
  on public.calculator_history_entries for select to authenticated
  using (
    (select auth.uid()) = user_id
    and generation = (
      select vault.generation
      from public.calculator_history_vaults as vault
      where vault.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can add to their own calculator history" on public.calculator_history_entries;
create policy "Users can add to their own calculator history"
  on public.calculator_history_entries for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and generation = (
      select vault.generation
      from public.calculator_history_vaults as vault
      where vault.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can clear their own calculator history" on public.calculator_history_entries;
create policy "Users can clear their own calculator history"
  on public.calculator_history_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.clear_calculator_history()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  next_generation uuid := gen_random_uuid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.calculator_history_vaults
  set generation = next_generation
  where user_id = current_user_id;

  if not found then
    raise exception 'History vault not found';
  end if;

  delete from public.calculator_history_entries
  where user_id = current_user_id;

  return next_generation;
end;
$$;

revoke all on function public.clear_calculator_history() from public, anon;
grant execute on function public.clear_calculator_history() to authenticated;
