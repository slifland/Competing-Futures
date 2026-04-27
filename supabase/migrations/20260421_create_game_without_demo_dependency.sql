create or replace function public.is_valid_power_key(target_power_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(target_power_key in ('us', 'china', 'lab-a', 'lab-b', 'model'), false);
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

  if requested_seat is not null and not public.is_valid_power_key(requested_seat) then
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
  values
    (new_game_id || '-us', new_game_id, 'us', 'US Government', 'US', '#7dd3fc', 'State actor', 'north-america', 1, 2, 3, 2),
    (new_game_id || '-china', new_game_id, 'china', 'China', 'CN', '#f97316', 'State actor', 'east-asia', 1, 2, 3, 3),
    (new_game_id || '-lab-a', new_game_id, 'lab-a', 'Frontier Lab A', 'A', '#d946ef', 'Commercial lab', 'west-coast', 2, 3, 1, 3),
    (new_game_id || '-lab-b', new_game_id, 'lab-b', 'Frontier Lab B', 'B', '#22c55e', 'Commercial lab', 'europe', 2, 2, 2, 1),
    (new_game_id || '-model', new_game_id, 'model', 'Frontier AI Model', 'AI', '#fde047', 'Emergent actor', 'global', 2, 2, 1, 1);

  insert into public.game_memberships (game_id, user_id, membership_role, power_key)
  values (
    new_game_id,
    current_user_id,
    case when requested_seat is null then 'observer' else 'player' end,
    requested_seat
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_code = '' then
    raise exception 'Join code is required';
  end if;

  perform public.ensure_profile();

  if requested_seat is not null and not public.is_valid_power_key(requested_seat) then
    raise exception 'That seat does not exist';
  end if;

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
  elsif requested_seat is not null then
    update public.game_memberships
    set membership_role = 'player',
        power_key = requested_seat,
        updated_at = now()
    where id = current_membership.id;
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_power_key is null then
    raise exception 'Seat selection is required';
  end if;

  if not public.is_valid_power_key(normalized_power_key) then
    raise exception 'That seat does not exist';
  end if;

  if not exists (
    select 1
    from public.game_memberships membership
    where membership.game_id = target_game_id_input
      and membership.user_id = current_user_id
  ) then
    insert into public.game_memberships (game_id, user_id, membership_role, power_key)
    values (target_game_id_input, current_user_id, 'player', normalized_power_key);
  else
    if exists (
      select 1
      from public.game_memberships membership
      where membership.game_id = target_game_id_input
        and membership.power_key = normalized_power_key
        and membership.user_id <> current_user_id
    ) then
      raise exception 'That seat is already taken';
    end if;

    update public.game_memberships
    set membership_role = 'player',
        power_key = normalized_power_key,
        updated_at = now()
    where game_id = target_game_id_input
      and user_id = current_user_id;
  end if;

  return target_game_id_input;
end;
$$;

grant execute on function public.is_valid_power_key(text) to authenticated;
