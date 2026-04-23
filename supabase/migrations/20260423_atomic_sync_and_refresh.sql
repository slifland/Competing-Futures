create or replace function public.lock_turn_selection(
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
  current_engine_state jsonb := '{}'::jsonb;
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

  select coalesce(game.engine_state, '{}'::jsonb)
  into current_engine_state
  from public.games game
  where game.id = target_player.game_id
  for update;

  update public.games
  set engine_state = jsonb_set(
    current_engine_state,
    array['eventReadySelections', target_player.power_key],
    to_jsonb(normalized_card_key),
    true
  )
  where id = target_player.game_id;
end;
$$;

create or replace function public.signal_victory_ready(target_player_id_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.players%rowtype;
  current_engine_state jsonb := '{}'::jsonb;
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

  select coalesce(game.engine_state, '{}'::jsonb)
  into current_engine_state
  from public.games game
  where game.id = target_player.game_id
  for update;

  update public.games
  set engine_state = jsonb_set(
    current_engine_state,
    array['victoryReadySelections', target_player.power_key],
    'true'::jsonb,
    true
  )
  where id = target_player.game_id;
end;
$$;

create or replace function public.persist_game_state_atomic(
  target_game_id_input text,
  game_update_input jsonb default '{}'::jsonb,
  players_input jsonb default '[]'::jsonb,
  private_states_input jsonb default '[]'::jsonb,
  hand_rows_input jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_game_update jsonb := coalesce(game_update_input, '{}'::jsonb);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_game_id_input is null or trim(target_game_id_input) = '' then
    raise exception 'Game id is required';
  end if;

  if not public.can_manage_game(target_game_id_input) then
    raise exception 'You do not have permission to persist that game';
  end if;

  perform 1
  from public.games game
  where game.id = target_game_id_input
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  update public.games
  set round = coalesce((normalized_game_update ->> 'round')::integer, round),
      phase = coalesce(normalized_game_update ->> 'phase', phase),
      current_turn_index = coalesce((normalized_game_update ->> 'current_turn_index')::integer, current_turn_index),
      status = coalesce(normalized_game_update ->> 'status', status),
      completed_at = case
        when normalized_game_update ? 'completed_at' then (normalized_game_update ->> 'completed_at')::timestamptz
        else completed_at
      end,
      winner_power_key = case
        when normalized_game_update ? 'winner_power_key' then nullif(normalized_game_update ->> 'winner_power_key', '')
        else winner_power_key
      end,
      engine_state = coalesce(normalized_game_update -> 'engine_state', engine_state)
  where id = target_game_id_input;

  update public.players player
  set name = payload.name,
      short_name = payload.short_name,
      accent = payload.accent,
      role = payload.role,
      home_class = payload.home_class,
      capabilities = payload.capabilities,
      safety = payload.safety,
      market = payload.market,
      support = payload.support
  from jsonb_to_recordset(coalesce(players_input, '[]'::jsonb)) as payload(
    id text,
    name text,
    short_name text,
    accent text,
    role text,
    home_class text,
    capabilities integer,
    safety integer,
    market integer,
    support integer
  )
  where player.id = payload.id
    and player.game_id = target_game_id_input;

  insert into public.player_private_state (
    player_id,
    objective,
    selected_action,
    selected_card_key,
    selected_action_payload,
    declared_victory,
    secret_state
  )
  select
    payload.player_id,
    coalesce(payload.objective, ''),
    coalesce(payload.selected_action, ''),
    payload.selected_card_key,
    coalesce(payload.selected_action_payload, '{}'::jsonb),
    coalesce(payload.declared_victory, false),
    coalesce(payload.secret_state, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(private_states_input, '[]'::jsonb)) as payload(
    player_id text,
    objective text,
    selected_action text,
    selected_card_key text,
    selected_action_payload jsonb,
    declared_victory boolean,
    secret_state jsonb
  )
  on conflict (player_id) do update
  set objective = excluded.objective,
      selected_action = excluded.selected_action,
      selected_card_key = excluded.selected_card_key,
      selected_action_payload = excluded.selected_action_payload,
      declared_victory = excluded.declared_victory,
      secret_state = excluded.secret_state,
      updated_at = now();

  delete from public.player_cards
  where player_id like target_game_id_input || '-%';

  insert into public.player_cards (player_id, position, card_key, name, text)
  select
    payload.player_id,
    payload.position,
    payload.card_key,
    payload.name,
    payload.text
  from jsonb_to_recordset(coalesce(hand_rows_input, '[]'::jsonb)) as payload(
    player_id text,
    position integer,
    card_key text,
    name text,
    text text
  );
end;
$$;

grant execute on function public.lock_turn_selection(text, text, text, jsonb) to authenticated;
grant execute on function public.signal_victory_ready(text) to authenticated;
grant execute on function public.persist_game_state_atomic(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
