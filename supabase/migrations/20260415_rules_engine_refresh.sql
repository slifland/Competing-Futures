alter table public.games
  add column if not exists engine_state jsonb not null default '{}'::jsonb;

alter table public.player_private_state
  add column if not exists selected_card_key text,
  add column if not exists selected_action_payload jsonb not null default '{}'::jsonb,
  add column if not exists declared_victory boolean not null default false,
  add column if not exists secret_state jsonb not null default '{}'::jsonb;

alter table public.player_cards
  add column if not exists card_key text;

alter table public.players
  drop constraint if exists players_capabilities_check,
  drop constraint if exists players_safety_check,
  drop constraint if exists players_market_check,
  drop constraint if exists players_support_check;

alter table public.players
  add constraint players_capabilities_check check (capabilities between 0 and 10),
  add constraint players_safety_check check (safety between 0 and 10),
  add constraint players_market_check check (market between 0 and 10),
  add constraint players_support_check check (support between 0 and 10);

update public.player_cards
set card_key = coalesce(card_key, player_id || ':' || position || ':' || md5(coalesce(name, 'card')))
where card_key is null;

alter table public.player_cards
  drop constraint if exists player_cards_player_id_name_key;

create unique index if not exists player_cards_player_card_key_idx
on public.player_cards (player_id, card_key)
where card_key is not null;

create or replace function public.can_manage_game(target_game_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and (
      public.is_admin()
      or exists (
        select 1
        from public.games game
        where game.id = target_game_id
          and game.created_by = auth.uid()
      )
    );
$$;

drop policy if exists "players are writable by admin" on public.players;
create policy "players are writable by game manager"
on public.players for all
to authenticated
using (public.can_manage_game(game_id))
with check (public.can_manage_game(game_id));

drop policy if exists "player private state is writable by admin" on public.player_private_state;
create policy "player private state is writable by game manager"
on public.player_private_state for all
to authenticated
using (
  exists (
    select 1
    from public.players player
    where player.id = player_private_state.player_id
      and public.can_manage_game(player.game_id)
  )
)
with check (
  exists (
    select 1
    from public.players player
    where player.id = player_private_state.player_id
      and public.can_manage_game(player.game_id)
  )
);

drop policy if exists "events are writable by admin" on public.events;
create policy "events are writable by game manager"
on public.events for all
to authenticated
using (public.can_manage_game(game_id))
with check (public.can_manage_game(game_id));

drop policy if exists "player cards are writable by admin" on public.player_cards;
create policy "player cards are writable by game manager"
on public.player_cards for all
to authenticated
using (
  exists (
    select 1
    from public.players player
    where player.id = player_cards.player_id
      and public.can_manage_game(player.game_id)
  )
)
with check (
  exists (
    select 1
    from public.players player
    where player.id = player_cards.player_id
      and public.can_manage_game(player.game_id)
  )
);

create or replace function public.update_turn_selection(
  target_player_id_input text,
  selected_card_key_input text,
  selected_action_input text,
  selected_action_payload_input jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.players%rowtype;
  normalized_action text := trim(coalesce(selected_action_input, ''));
  normalized_card_key text := trim(coalesce(selected_card_key_input, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_player_id_input is null or trim(target_player_id_input) = '' then
    raise exception 'Player id is required';
  end if;

  if normalized_action = '' or normalized_card_key = '' then
    raise exception 'A selected card is required';
  end if;

  select *
  into target_player
  from public.players
  where id = target_player_id_input
  limit 1;

  if target_player.id is null then
    raise exception 'Player not found';
  end if;

  if not public.can_access_player_private(target_player.game_id, target_player.power_key) then
    raise exception 'You do not have access to update that seat';
  end if;

  if not exists (
    select 1
    from public.player_cards card
    where card.player_id = target_player.id
      and card.card_key = normalized_card_key
  ) then
    raise exception 'Selected card is not in that player hand';
  end if;

  update public.player_private_state
  set selected_action = normalized_action,
      selected_card_key = normalized_card_key,
      selected_action_payload = coalesce(selected_action_payload_input, '{}'::jsonb),
      updated_at = now()
  where player_id = target_player.id;
end;
$$;

create or replace function public.set_victory_declaration(
  target_player_id_input text,
  declared_input boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.players%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_player_id_input is null or trim(target_player_id_input) = '' then
    raise exception 'Player id is required';
  end if;

  select *
  into target_player
  from public.players
  where id = target_player_id_input
  limit 1;

  if target_player.id is null then
    raise exception 'Player not found';
  end if;

  if not public.can_access_player_private(target_player.game_id, target_player.power_key) then
    raise exception 'You do not have access to update that seat';
  end if;

  update public.player_private_state
  set declared_victory = coalesce(declared_input, false),
      updated_at = now()
  where player_id = target_player.id;
end;
$$;

grant execute on function public.update_turn_selection(text, text, text, jsonb) to authenticated;
grant execute on function public.set_victory_declaration(text, boolean) to authenticated;
