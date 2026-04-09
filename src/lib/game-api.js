import { supabase, supabaseConfigError } from './supabase.js';

function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      supabaseConfigError ||
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.',
    );
  }

  return supabase;
}

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

function isMissingGameFlowColumnError(error) {
  const message = error?.message ?? '';

  return (
    message.includes('games.phase') ||
    message.includes('games.current_turn_index') ||
    message.includes('games.winner_power_key')
  );
}

function getGameFlowSetupError(error) {
  if (isMissingGameFlowColumnError(error)) {
    return new Error(
      'Game flow columns are missing in Supabase. Run supabase/migrations/20260408_game_flow_state.sql and refresh.',
    );
  }

  return error;
}

function isMissingSelectedActionRpcError(error) {
  const message = error?.message ?? '';

  return message.includes('update_selected_action') && message.includes('does not exist');
}

export async function fetchAccountContext(user) {
  const client = getSupabaseClient();
  const ensureResult = await client.rpc('ensure_profile');

  if (ensureResult.error) {
    throw getSchemaSetupError(ensureResult.error);
  }

  const [{ data: profileData, error: profileError }, { data: membershipsData, error: membershipsError }] =
    await Promise.all([
      client.from('profiles').select('id, email, full_name, avatar_url, app_role').eq('id', user.id).maybeSingle(),
      client
        .from('game_memberships')
        .select('game_id, membership_role, power_key, created_at, updated_at')
        .order('updated_at', { ascending: false }),
    ]);

  let gamesData = [];
  let gamesError = null;

  const gamesWithFlow = await client
    .from('games')
    .select(
      'id, name, status, join_code, created_by, round, event_index, phase, current_turn_index, winner_power_key, created_at, updated_at, completed_at',
    )
    .order('updated_at', { ascending: false });

  if (gamesWithFlow.error && isMissingGameFlowColumnError(gamesWithFlow.error)) {
    const legacyGames = await client
      .from('games')
      .select('id, name, status, join_code, created_by, round, event_index, created_at, updated_at, completed_at')
      .order('updated_at', { ascending: false });

    gamesData =
      (legacyGames.data ?? []).map((game) => ({
        ...game,
        phase: 'choose_actions',
        current_turn_index: 0,
        winner_power_key: null,
      })) ?? [];
    gamesError = legacyGames.error;
  } else {
    gamesData = gamesWithFlow.data ?? [];
    gamesError = gamesWithFlow.error;
  }

  if (profileError || gamesError || membershipsError) {
    throw getSchemaSetupError(profileError || gamesError || membershipsError);
  }

  return {
    profile: normalizeProfile(user, profileData),
    games: gamesData ?? [],
    memberships: membershipsData ?? [],
  };
}

export async function fetchGameBoard(gameId, options = {}) {
  const client = getSupabaseClient();
  const includePrivateState = options.includePrivateState ?? false;
  const [
    { data: playersData, error: playersError },
    { data: eventsData, error: eventsError },
    { data: membershipsData, error: membershipsError },
    resolutionResult,
  ] = await Promise.all([
    client
      .from('players')
      .select('id, game_id, power_key, name, short_name, accent, role, home_class, capabilities, safety, market, support')
      .eq('game_id', gameId)
      .order('name'),
    client.from('events').select('sort_order, title, text').eq('game_id', gameId).order('sort_order'),
    client
      .from('game_memberships')
      .select('game_id, user_id, membership_role, power_key, updated_at')
      .eq('game_id', gameId),
    includePrivateState
      ? client.from('player_private_state').select('player_id, selected_action').like('player_id', `${gameId}-%`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data: resolutionRows, error: resolutionError } = resolutionResult;

  if (playersError || eventsError || membershipsError || resolutionError) {
    throw playersError || eventsError || membershipsError || resolutionError;
  }

  const selectedActionsByPlayerId = new Map(
    (resolutionRows ?? []).map((row) => [row.player_id, row.selected_action]),
  );

  return {
    players:
      (playersData ?? []).map((player) => ({
        ...player,
        selected_action: selectedActionsByPlayerId.get(player.id) ?? '',
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
  const client = getSupabaseClient();
  const [
    { data: secretData, error: secretError },
    { data: cardsData, error: cardsError },
  ] = await Promise.all([
    client.from('player_private_state').select('objective, selected_action').eq('player_id', playerId).maybeSingle(),
    client.from('player_cards').select('position, name, text').eq('player_id', playerId).order('position'),
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
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('create_game_with_defaults', {
    game_name_input: gameName,
    seat_power_key_input: seatPowerKey || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSelectedAction(playerId, selectedAction) {
  const client = getSupabaseClient();
  const rpcResult = await client.rpc('update_selected_action', {
    target_player_id_input: playerId,
    selected_action_input: selectedAction,
  });

  if (!rpcResult.error) {
    return;
  }

  if (isMissingSelectedActionRpcError(rpcResult.error)) {
    const { error: fallbackError } = await client
      .from('player_private_state')
      .update({ selected_action: selectedAction })
      .eq('player_id', playerId);

    if (!fallbackError) {
      return;
    }

    throw fallbackError;
  }

  throw rpcResult.error;
}

export async function joinGameByCode(joinCode, seatPowerKey) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('join_game_by_code', {
    join_code_input: joinCode,
    seat_power_key_input: seatPowerKey || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function claimSeat(gameId, powerKey) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('claim_game_seat', {
    target_game_id_input: gameId,
    target_power_key_input: powerKey,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updateGameStatus(gameId, status) {
  const client = getSupabaseClient();
  const payload =
    status === 'completed'
      ? { status, completed_at: new Date().toISOString() }
      : { status, completed_at: null };

  const { error } = await client.from('games').update(payload).eq('id', gameId);

  if (error) {
    throw error;
  }
}

export async function persistGameFlow(gameId, gameUpdate, players) {
  const client = getSupabaseClient();
  const { error: gameError } = await client.from('games').update(gameUpdate).eq('id', gameId);

  if (gameError) {
    throw getGameFlowSetupError(gameError);
  }

  for (const player of players) {
    const { error: playerError } = await client
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
