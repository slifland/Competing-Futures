alter table public.games
  add column if not exists phase text not null default 'choose_actions',
  add column if not exists current_turn_index integer not null default 0,
  add column if not exists winner_power_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_phase_check'
  ) then
    alter table public.games
      add constraint games_phase_check
      check (phase in ('choose_actions', 'resolve_event', 'resolve_actions', 'victory_check'));
  end if;
end $$;

alter table public.games
  drop constraint if exists games_current_turn_index_check;

alter table public.games
  add constraint games_current_turn_index_check
  check (current_turn_index >= 0);

update public.games
set phase = coalesce(phase, 'choose_actions'),
    current_turn_index = coalesce(current_turn_index, 0)
where phase is null
   or current_turn_index is null;

update public.games
set phase = 'choose_actions',
    current_turn_index = 0,
    winner_power_key = null
where id = 'demo-game';
