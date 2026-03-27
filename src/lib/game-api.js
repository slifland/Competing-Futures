import { supabase } from './supabase.js';

function normalizeProfile(user, profileData) {
  if (profileData) {
    return profileData;
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
    avatar_url: user.user_metadata?.avatar_url ?? '',
    app_role: user.email === 'sethlifland11@gmail.com' ? 'admin' : 'player',
  };
}

function getSchemaSetupError(error) {
  if (!error) {
    return null;
  }

  const message = error.message ?? String(error);

  if (
    message.includes('public.profiles') ||
    message.includes('ensure_profile') ||
    message.includes('schema cache')
  ) {
    return new Error(
      'The auth/game SQL has not been applied in Supabase yet. Run the SQL from supabase/migrations/20260327_auth_profiles_and_memberships.sql first.',
    );
  }

  return error;
}

export async function fetchAccountContext(user) {
  const ensureResult = await supabase.rpc('ensure_profile');

  if (ensureResult.error) {
    throw getSchemaSetupError(ensureResult.error);
  }

  const [
    { data: profileData, error: profileError },
    { data: gamesData, error: gamesError },
    { data: membershipsData, error: membershipsError },
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, avatar_url, app_role').eq('id', user.id).maybeSingle(),
    supabase
      .from('games')
      .select('id, name, status, join_code, created_by, round, event_index, created_at, updated_at, completed_at')
      .order('updated_at', { ascending: false }),
    supabase
      .from('game_memberships')
      .select('game_id, membership_role, power_key, created_at, updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  if (profileError || gamesError || membershipsError) {
    throw getSchemaSetupError(profileError || gamesError || membershipsError);
  }

  return {
    profile: normalizeProfile(user, profileData),
    games: gamesData ?? [],
    memberships: membershipsData ?? [],
  };
}

export async function fetchGameBoard(gameId) {
  const [
    { data: playersData, error: playersError },
    { data: eventsData, error: eventsError },
    { data: membershipsData, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from('players')
      .select('id, game_id, power_key, name, short_name, accent, role, home_class, capabilities, safety, market, support')
      .eq('game_id', gameId)
      .order('name'),
    supabase.from('events').select('sort_order, title, text').eq('game_id', gameId).order('sort_order'),
    supabase
      .from('game_memberships')
      .select('game_id, user_id, membership_role, power_key, updated_at')
      .eq('game_id', gameId),
  ]);

  if (playersError || eventsError || membershipsError) {
    throw playersError || eventsError || membershipsError;
  }

  return {
    players:
      (playersData ?? []).map((player) => ({
        ...player,
        meters: {
          capabilities: player.capabilities,
          safety: player.safety,
          market: player.market,
          support: player.support,
        },
      })) ?? [],
    events: eventsData ?? [],
    assignments: membershipsData ?? [],
  };
}

export async function fetchPrivateSeat(playerId) {
  const [
    { data: secretData, error: secretError },
    { data: cardsData, error: cardsError },
  ] = await Promise.all([
    supabase.from('player_private_state').select('objective, selected_action').eq('player_id', playerId).maybeSingle(),
    supabase.from('player_cards').select('position, name, text').eq('player_id', playerId).order('position'),
  ]);

  if (secretError || cardsError) {
    throw secretError || cardsError;
  }

  return {
    objective: secretData?.objective ?? '',
    selectedAction: secretData?.selected_action ?? '',
    cards: cardsData ?? [],
  };
}

export async function createGame(gameName, seatPowerKey) {
  const { data, error } = await supabase.rpc('create_game_with_defaults', {
    game_name_input: gameName,
    seat_power_key_input: seatPowerKey || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function joinGameByCode(joinCode, seatPowerKey) {
  const { data, error } = await supabase.rpc('join_game_by_code', {
    join_code_input: joinCode,
    seat_power_key_input: seatPowerKey || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function claimSeat(gameId, powerKey) {
  const { data, error } = await supabase.rpc('claim_game_seat', {
    target_game_id_input: gameId,
    target_power_key_input: powerKey,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateGameStatus(gameId, status) {
  const payload =
    status === 'completed'
      ? { status, completed_at: new Date().toISOString() }
      : { status, completed_at: null };

  const { error } = await supabase.from('games').update(payload).eq('id', gameId);

  if (error) {
    throw error;
  }
}

export async function persistRoundState(gameId, round, eventIndex, players) {
  const { error: gameError } = await supabase
    .from('games')
    .update({ round, event_index: eventIndex })
    .eq('id', gameId);

  if (gameError) {
    throw gameError;
  }

  for (const player of players) {
    const { error: playerError } = await supabase
      .from('players')
      .update({
        capabilities: player.meters.capabilities,
        safety: player.meters.safety,
        market: player.meters.market,
        support: player.meters.support,
      })
      .eq('id', player.id);

    if (playerError) {
      throw playerError;
    }
  }
}
