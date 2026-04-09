create or replace function public.update_selected_action(target_player_id_input text, selected_action_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_player public.players%rowtype;
  normalized_action text := trim(coalesce(selected_action_input, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_player_id_input is null or trim(target_player_id_input) = '' then
    raise exception 'Player id is required';
  end if;

  if normalized_action = '' then
    raise exception 'Selected action is required';
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
      and card.name = normalized_action
  ) then
    raise exception 'Selected action is not in that player hand';
  end if;

  update public.player_private_state
  set selected_action = normalized_action,
      updated_at = now()
  where player_id = target_player.id;
end;
$$;

grant execute on function public.update_selected_action(text, text) to authenticated;
