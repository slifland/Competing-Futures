create or replace function public.can_manage_game(target_game_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_game(target_game_id);
$$;

create or replace function public.can_access_player_private(target_game_id text, target_power_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and public.can_access_game(target_game_id);
$$;

drop policy if exists "games are updateable by creator or admin" on public.games;
drop policy if exists "games are updateable by authorized users" on public.games;
create policy "games are updateable by authorized users"
on public.games for update
to authenticated
using (public.can_access_game(id))
with check (public.can_access_game(id));

drop policy if exists "games are deletable by creator or admin" on public.games;
drop policy if exists "games are deletable by admin" on public.games;
create policy "games are deletable by admin"
on public.games for delete
to authenticated
using (public.is_admin());
