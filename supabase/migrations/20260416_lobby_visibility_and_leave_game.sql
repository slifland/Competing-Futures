create or replace function public.display_name_for_user(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(profile.full_name), ''),
    nullif(split_part(profile.email, '@', 1), ''),
    'Player'
  )
  from public.profiles profile
  where profile.id = target_user_id
  limit 1;
$$;

create or replace function public.reset_seat_private_state(target_game_id text, target_power_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_player_id text;
begin
  if target_game_id is null or trim(target_game_id) = '' or target_power_key is null or trim(target_power_key) = '' then
    return;
  end if;

  select player.id
  into target_player_id
  from public.players player
  where player.game_id = target_game_id
    and player.power_key = target_power_key
  limit 1;

  if target_player_id is null then
    return;
  end if;

  update public.player_private_state
  set selected_action = '',
      selected_card_key = null,
      selected_action_payload = '{}'::jsonb,
      declared_victory = false,
      updated_at = now()
  where player_id = target_player_id;
end;
$$;

create or replace function public.append_public_log(target_game_id text, log_entry text, max_entries integer default 12)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_engine_state jsonb := '{}'::jsonb;
  current_log text[] := array[]::text[];
  next_log text[];
  normalized_entry text := trim(coalesce(log_entry, ''));
  next_max integer := greatest(coalesce(max_entries, 12), 1);
begin
  if target_game_id is null or trim(target_game_id) = '' or normalized_entry = '' then
    return;
  end if;

  select coalesce(game.engine_state, '{}'::jsonb)
  into current_engine_state
  from public.games game
  where game.id = target_game_id
  for update;

  select coalesce(array_agg(value), array[]::text[])
  into current_log
  from jsonb_array_elements_text(coalesce(current_engine_state -> 'publicLog', '[]'::jsonb)) value;

  current_log := array_append(current_log, normalized_entry);

  if cardinality(current_log) > next_max then
    next_log := current_log[cardinality(current_log) - next_max + 1:cardinality(current_log)];
  else
    next_log := current_log;
  end if;

  update public.games
  set engine_state = jsonb_set(current_engine_state, '{publicLog}', to_jsonb(next_log), true)
  where id = target_game_id;
end;
$$;

create or replace function public.list_game_lobby_members(target_game_id_input text)
returns table (
  user_id uuid,
  display_name text,
  membership_role text,
  power_key text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_game_id_input is null or trim(target_game_id_input) = '' then
    raise exception 'Game id is required';
  end if;

  if not public.can_access_game(target_game_id_input) then
    raise exception 'You do not have access to that game';
  end if;

  return query
  select
    membership.user_id,
    public.display_name_for_user(membership.user_id) as display_name,
    membership.membership_role,
    membership.power_key,
    membership.created_at,
    membership.updated_at
  from public.game_memberships membership
  where membership.game_id = target_game_id_input
  order by membership.updated_at asc, membership.created_at asc, membership.id asc;
end;
$$;

create or replace function public.list_action_lock_status(target_game_id_input text)
returns table (
  power_key text,
  locked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_game_id_input is null or trim(target_game_id_input) = '' then
    raise exception 'Game id is required';
  end if;

  if not public.can_access_game(target_game_id_input) then
    raise exception 'You do not have access to that game';
  end if;

  return query
  select
    player.power_key,
    coalesce(private_state.selected_card_key is not null and trim(private_state.selected_card_key) <> '', false) as locked
  from public.players player
  left join public.player_private_state private_state
    on private_state.player_id = player.id
  where player.game_id = target_game_id_input
  order by player.power_key asc;
end;
$$;

create or replace function public.create_game_with_defaults(game_name_input text, seat_power_key_input text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_game_id text := 'game-' || substring(md5(random()::text || clock_timestamp()::text || coalesce(game_name_input, '')) from 1 for 12);
  requested_seat text := nullif(trim(seat_power_key_input), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if trim(coalesce(game_name_input, '')) = '' then
    raise exception 'Game name is required';
  end if;

  perform public.ensure_profile();

  if requested_seat is not null and not exists (
    select 1
    from public.players template
    where template.game_id = 'demo-game'
      and template.power_key = requested_seat
  ) then
    raise exception 'That seat does not exist';
  end if;

  insert into public.games (id, name, round, event_index, status, created_by, join_code)
  values (
    new_game_id,
    trim(game_name_input),
    1,
    0,
    'active',
    current_user_id,
    public.generate_join_code()
  );

  insert into public.players (
    id,
    game_id,
    power_key,
    name,
    short_name,
    accent,
    role,
    home_class,
    capabilities,
    safety,
    market,
    support
  )
  select
    new_game_id || '-' || template.power_key,
    new_game_id,
    template.power_key,
    template.name,
    template.short_name,
    template.accent,
    template.role,
    template.home_class,
    template.capabilities,
    template.safety,
    template.market,
    template.support
  from public.players template
  where template.game_id = 'demo-game';

  insert into public.player_private_state (player_id, objective, selected_action)
  select
    new_game_id || '-' || template.power_key,
    private_state.objective,
    private_state.selected_action
  from public.players template
  join public.player_private_state private_state
    on private_state.player_id = template.id
  where template.game_id = 'demo-game';

  insert into public.player_cards (player_id, position, name, text)
  select
    new_game_id || '-' || template.power_key,
    card.position,
    card.name,
    card.text
  from public.players template
  join public.player_cards card
    on card.player_id = template.id
  where template.game_id = 'demo-game';

  insert into public.events (game_id, sort_order, title, text)
  select new_game_id, event.sort_order, event.title, event.text
  from public.events event
  where event.game_id = 'demo-game';

  insert into public.game_memberships (game_id, user_id, membership_role, power_key)
  values (
    new_game_id,
    current_user_id,
    case when requested_seat is null then 'observer' else 'player' end,
    requested_seat
  );

  perform public.append_public_log(
    new_game_id,
    case
      when requested_seat is null then public.display_name_for_user(current_user_id) || ' created the lobby as an observer.'
      else public.display_name_for_user(current_user_id) || ' created the lobby and claimed ' || requested_seat || '.'
    end
  );

  return new_game_id;
end;
$$;

create or replace function public.join_game_by_code(join_code_input text, seat_power_key_input text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_code text := upper(trim(coalesce(join_code_input, '')));
  requested_seat text := nullif(trim(seat_power_key_input), '');
  target_game public.games%rowtype;
  current_membership public.game_memberships%rowtype;
  seats_available boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_code = '' then
    raise exception 'Join code is required';
  end if;

  perform public.ensure_profile();

  select *
  into target_game
  from public.games
  where join_code = requested_code
  limit 1;

  if target_game.id is null then
    raise exception 'No game found for join code %', requested_code;
  end if;

  if target_game.status <> 'active' then
    raise exception 'That game is not open for joining';
  end if;

  if requested_seat is not null and not exists (
    select 1
    from public.players player
    where player.game_id = target_game.id
      and player.power_key = requested_seat
  ) then
    raise exception 'That seat does not exist';
  end if;

  select exists (
    select 1
    from public.players player
    where player.game_id = target_game.id
      and not exists (
        select 1
        from public.game_memberships membership
        where membership.game_id = target_game.id
          and membership.power_key = player.power_key
          and membership.user_id <> current_user_id
      )
  )
  into seats_available;

  if requested_seat is null and not seats_available then
    raise exception 'All player seats are filled. Ask the host to free a seat before joining.';
  end if;

  if requested_seat is not null and exists (
    select 1
    from public.game_memberships membership
    where membership.game_id = target_game.id
      and membership.power_key = requested_seat
      and membership.user_id <> current_user_id
  ) then
    raise exception 'That seat is already taken';
  end if;

  select *
  into current_membership
  from public.game_memberships
  where game_id = target_game.id
    and user_id = current_user_id
  limit 1;

  if current_membership.id is null then
    insert into public.game_memberships (game_id, user_id, membership_role, power_key)
    values (
      target_game.id,
      current_user_id,
      case when requested_seat is null then 'observer' else 'player' end,
      requested_seat
    );

    perform public.append_public_log(
      target_game.id,
      case
        when requested_seat is null then public.display_name_for_user(current_user_id) || ' joined the lobby as an observer.'
        else public.display_name_for_user(current_user_id) || ' joined the lobby and claimed ' || requested_seat || '.'
      end
    );
  elsif requested_seat is not null then
    if current_membership.power_key is not null and current_membership.power_key <> requested_seat then
      perform public.reset_seat_private_state(target_game.id, current_membership.power_key);
    end if;

    update public.game_memberships
    set membership_role = 'player',
        power_key = requested_seat,
        updated_at = now()
    where id = current_membership.id;

    perform public.append_public_log(
      target_game.id,
      public.display_name_for_user(current_user_id) || ' claimed ' || requested_seat || '.'
    );
  end if;

  return target_game.id;
end;
$$;

create or replace function public.claim_game_seat(target_game_id_input text, target_power_key_input text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_power_key text := nullif(trim(target_power_key_input), '');
  current_membership public.game_memberships%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_power_key is null then
    raise exception 'Seat selection is required';
  end if;

  if not exists (
    select 1
    from public.players player
    where player.game_id = target_game_id_input
      and player.power_key = normalized_power_key
  ) then
    raise exception 'That seat does not exist';
  end if;

  if exists (
    select 1
    from public.game_memberships membership
    where membership.game_id = target_game_id_input
      and membership.power_key = normalized_power_key
      and membership.user_id <> current_user_id
  ) then
    raise exception 'That seat is already taken';
  end if;

  select *
  into current_membership
  from public.game_memberships membership
  where membership.game_id = target_game_id_input
    and membership.user_id = current_user_id
  limit 1;

  if current_membership.id is null then
    insert into public.game_memberships (game_id, user_id, membership_role, power_key)
    values (target_game_id_input, current_user_id, 'player', normalized_power_key);
  else
    if current_membership.power_key is not null and current_membership.power_key <> normalized_power_key then
      perform public.reset_seat_private_state(target_game_id_input, current_membership.power_key);
    end if;

    update public.game_memberships
    set membership_role = 'player',
        power_key = normalized_power_key,
        updated_at = now()
    where game_id = target_game_id_input
      and user_id = current_user_id;
  end if;

  perform public.append_public_log(
    target_game_id_input,
    public.display_name_for_user(current_user_id) || ' claimed ' || normalized_power_key || '.'
  );

  return target_game_id_input;
end;
$$;

create or replace function public.leave_game(target_game_id_input text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_membership public.game_memberships%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_game_id_input is null or trim(target_game_id_input) = '' then
    raise exception 'Game id is required';
  end if;

  select *
  into current_membership
  from public.game_memberships membership
  where membership.game_id = target_game_id_input
    and membership.user_id = current_user_id
  limit 1;

  if current_membership.id is null then
    raise exception 'You are not in that game';
  end if;

  if current_membership.power_key is not null then
    perform public.reset_seat_private_state(target_game_id_input, current_membership.power_key);
  end if;

  delete from public.game_memberships
  where id = current_membership.id;

  perform public.append_public_log(
    target_game_id_input,
    case
      when current_membership.power_key is null then public.display_name_for_user(current_user_id) || ' left the lobby.'
      else public.display_name_for_user(current_user_id) || ' left the lobby and released ' || current_membership.power_key || '.'
    end
  );

  return target_game_id_input;
end;
$$;

grant execute on function public.display_name_for_user(uuid) to authenticated;
grant execute on function public.reset_seat_private_state(text, text) to authenticated;
grant execute on function public.append_public_log(text, text, integer) to authenticated;
grant execute on function public.list_game_lobby_members(text) to authenticated;
grant execute on function public.list_action_lock_status(text) to authenticated;
grant execute on function public.leave_game(text) to authenticated;
