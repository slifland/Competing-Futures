import {
  RULES_VERSION,
  buildGameInitialization,
  buildManagerState,
  hydratePrivateStateForSeat,
  serializeManagerState,
} from './game-data.js';
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

const DEFAULT_RPC_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms}ms. The Supabase project may be cold-starting or the request is stuck — retry in a moment.`,
        ),
      );
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

const ensureProfilePromiseByUser = new Map();

export function resetProfileCache() {
  ensureProfilePromiseByUser.clear();
}

async function runEnsureProfile(client) {
  const result = await withTimeout(client.rpc('ensure_profile'), DEFAULT_RPC_TIMEOUT_MS, 'ensure_profile');

  if (result.error) {
    throw getSchemaSetupError(result.error);
  }

  return result;
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

  if (
    message.includes('engine_state') ||
    message.includes('selected_card_key') ||
    message.includes('selected_action_payload') ||
    message.includes('secret_state') ||
    message.includes('card_key')
  ) {
    return new Error(
      'The rules-engine migration is missing in Supabase. Run supabase/migrations/20260415_rules_engine_refresh.sql and refresh.',
    );
  }

  return error;
}

function isMissingGameFlowColumnError(error) {
  const message = error?.message ?? '';

  return (
    message.includes('games.phase') ||
    message.includes('games.current_turn_index') ||
    message.includes('games.winner_power_key') ||
    message.includes('games.engine_state')
  );
}

function getGameFlowSetupError(error) {
  if (isMissingGameFlowColumnError(error)) {
    return new Error(
      'Game flow columns are missing in Supabase. Run supabase/migrations/20260408_game_flow_state.sql and supabase/migrations/20260415_rules_engine_refresh.sql, then refresh.',
    );
  }

  return getSchemaSetupError(error);
}

function isMissingTurnSelectionRpcError(error) {
  const message = error?.message ?? '';

  return message.includes('update_turn_selection') && message.includes('does not exist');
}

function isMissingVictoryDeclarationRpcError(error) {
  const message = error?.message ?? '';

  return message.includes('set_victory_declaration') && message.includes('does not exist');
}

function mapDbPlayer(player) {
  return {
    ...player,
    selected_action: player.selected_action ?? '',
    meters: {
      capabilities: player.capabilities,
      resources: player.market,
      safety: player.safety,
      publicSupport: player.support,
    },
  };
}

export async function fetchAccountContext(user) {
  const client = getSupabaseClient();

  let ensurePromise = ensureProfilePromiseByUser.get(user.id);
  if (!ensurePromise) {
    ensurePromise = runEnsureProfile(client).catch((error) => {
      ensureProfilePromiseByUser.delete(user.id);
      throw error;
    });
    ensureProfilePromiseByUser.set(user.id, ensurePromise);
  }
  await ensurePromise;

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
      'id, name, status, join_code, created_by, round, phase, current_turn_index, winner_power_key, engine_state, created_at, updated_at, completed_at',
    )
    .order('updated_at', { ascending: false });

  if (gamesWithFlow.error && isMissingGameFlowColumnError(gamesWithFlow.error)) {
    const legacyGames = await client
      .from('games')
      .select('id, name, status, join_code, created_by, round, created_at, updated_at, completed_at')
      .order('updated_at', { ascending: false });

    gamesData =
      (legacyGames.data ?? []).map((game) => ({
        ...game,
        phase: 'choose_actions',
        current_turn_index: 0,
        winner_power_key: null,
        engine_state: {},
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
    games:
      (gamesData ?? []).map((game) => ({
        ...game,
        engineState: game.engine_state ?? {},
      })) ?? [],
    memberships: membershipsData ?? [],
  };
}

export async function fetchGameBoard(gameId, options = {}) {
  const client = getSupabaseClient();
  const includePrivateState = options.includePrivateState ?? false;
  const gameQuery = client
    .from('games')
    .select(
      'id, name, status, join_code, round, phase, current_turn_index, winner_power_key, engine_state, created_by, completed_at',
    )
    .eq('id', gameId)
    .maybeSingle();

  const playersQuery = client
    .from('players')
    .select('id, game_id, power_key, name, short_name, accent, role, home_class, capabilities, safety, market, support')
    .eq('game_id', gameId)
    .order('name');

  const lobbyMembersQuery = client.rpc('list_game_lobby_members', {
    target_game_id_input: gameId,
  });

  const actionLocksQuery = client.rpc('list_action_lock_status', {
    target_game_id_input: gameId,
  });

  const privateStateQuery = includePrivateState
    ? client
        .from('player_private_state')
        .select(
          'player_id, objective, selected_action, selected_card_key, selected_action_payload, declared_victory, secret_state',
        )
        .like('player_id', `${gameId}-%`)
    : Promise.resolve({ data: [], error: null });

  const handQuery = includePrivateState
    ? client
        .from('player_cards')
        .select('player_id, position, card_key, name, text')
        .like('player_id', `${gameId}-%`)
        .order('position')
    : Promise.resolve({ data: [], error: null });

  const [
    { data: gameData, error: gameError },
    { data: playersData, error: playersError },
    { data: lobbyMembersData, error: lobbyMembersError },
    { data: actionLocksData, error: actionLocksError },
    privateStateResult,
    handResult,
  ] = await Promise.all([gameQuery, playersQuery, lobbyMembersQuery, actionLocksQuery, privateStateQuery, handQuery]);

  const { data: privateStateRows, error: privateStateError } = privateStateResult;
  const { data: handRows, error: handError } = handResult;

  if (gameError || playersError || lobbyMembersError || actionLocksError || privateStateError || handError) {
    throw getSchemaSetupError(
      gameError || playersError || lobbyMembersError || actionLocksError || privateStateError || handError,
    );
  }

  return {
    game: gameData
      ? {
          ...gameData,
          engineState: gameData.engine_state ?? {},
        }
      : null,
    players: (playersData ?? []).map(mapDbPlayer),
    lobbyMembers: lobbyMembersData ?? [],
    actionLocks:
      (actionLocksData ?? []).reduce((accumulator, row) => {
        accumulator[row.power_key] = Boolean(row.locked);
        return accumulator;
      }, {}) ?? {},
    managerState: includePrivateState ? buildManagerState(privateStateRows ?? [], handRows ?? []) : null,
  };
}

export async function fetchPrivateSeat(playerId) {
  const client = getSupabaseClient();
  const [
    { data: secretData, error: secretError },
    { data: cardsData, error: cardsError },
  ] = await Promise.all([
    client
      .from('player_private_state')
      .select(
        'objective, selected_action, selected_card_key, selected_action_payload, declared_victory, secret_state',
      )
      .eq('player_id', playerId)
      .maybeSingle(),
    client.from('player_cards').select('position, card_key, name, text').eq('player_id', playerId).order('position'),
  ]);

  if (secretError || cardsError) {
    throw getSchemaSetupError(secretError || cardsError);
  }

  return hydratePrivateStateForSeat(secretData, cardsData ?? []);
}

export async function createGame(gameName, seatPowerKey) {
  const client = getSupabaseClient();
  const { data, error } = await withTimeout(
    client.rpc('create_game_with_defaults', {
      game_name_input: gameName,
      seat_power_key_input: seatPowerKey || null,
    }),
    DEFAULT_RPC_TIMEOUT_MS,
    'create_game',
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function initializeGameFromRules(gameId) {
  const client = getSupabaseClient();
  const { data: playersData, error: playersError } = await client
    .from('players')
    .select('id, game_id, power_key, name, short_name, accent, role, home_class, capabilities, safety, market, support')
    .eq('game_id', gameId)
    .order('name');

  if (playersError) {
    throw getSchemaSetupError(playersError);
  }

  if ((playersData ?? []).length !== 5) {
    throw new Error(
      'Game creation did not seed the five actor rows. Apply supabase/migrations/20260421_create_game_without_demo_dependency.sql, then retry.',
    );
  }

  const initialized = buildGameInitialization((playersData ?? []).map(mapDbPlayer));

  await persistGameState({
    gameId,
    gameUpdate: {
      round: 1,
      phase: 'choose_actions',
      current_turn_index: 0,
      winner_power_key: null,
      status: 'active',
      completed_at: null,
      engine_state: initialized.engineState,
    },
    players: initialized.players,
    managerState: buildManagerState(initialized.privateStates, initialized.handRows),
  });
}

function serializePlayersForPersistence(players) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    short_name: player.short_name ?? player.shortName,
    accent: player.accent,
    role: player.role,
    home_class: player.home_class ?? player.homeClass,
    capabilities: player.meters.capabilities,
    safety: player.meters.safety,
    market: player.meters.resources,
    support: player.meters.publicSupport,
  }));
}

export async function updateTurnSelection(playerId, selectedCardKey, selectedAction, selectedActionPayload) {
  const client = getSupabaseClient();
  const rpcResult = await client.rpc('update_turn_selection', {
    target_player_id_input: playerId,
    selected_card_key_input: selectedCardKey,
    selected_action_input: selectedAction,
    selected_action_payload_input: selectedActionPayload ?? {},
  });

  if (!rpcResult.error) {
    return;
  }

  if (isMissingTurnSelectionRpcError(rpcResult.error)) {
    throw new Error(
      'The turn-selection RPC is missing in Supabase. Run supabase/migrations/20260415_rules_engine_refresh.sql and refresh.',
    );
  }

  throw rpcResult.error;
}

export async function lockTurnSelection(playerId, selectedCardKey, selectedAction, selectedActionPayload) {
  const client = getSupabaseClient();
  const rpcResult = await client.rpc('lock_turn_selection', {
    target_player_id_input: playerId,
    selected_card_key_input: selectedCardKey,
    selected_action_input: selectedAction,
    selected_action_payload_input: selectedActionPayload ?? {},
  });

  if (!rpcResult.error) {
    return;
  }

  if (rpcResult.error.message?.includes('lock_turn_selection') && rpcResult.error.message?.includes('does not exist')) {
    await updateTurnSelection(playerId, selectedCardKey, selectedAction, selectedActionPayload);
    return;
  }

  throw rpcResult.error;
}

export async function setVictoryDeclaration(playerId, declaredVictory) {
  const client = getSupabaseClient();
  const rpcResult = await client.rpc('set_victory_declaration', {
    target_player_id_input: playerId,
    declared_input: declaredVictory,
  });

  if (!rpcResult.error) {
    return;
  }

  if (isMissingVictoryDeclarationRpcError(rpcResult.error)) {
    throw new Error(
      'The victory-declaration RPC is missing in Supabase. Run supabase/migrations/20260415_rules_engine_refresh.sql and refresh.',
    );
  }

  throw rpcResult.error;
}

export async function signalVictoryReady(playerId) {
  const client = getSupabaseClient();
  const rpcResult = await client.rpc('signal_victory_ready', {
    target_player_id_input: playerId,
  });

  if (!rpcResult.error) {
    return;
  }

  if (rpcResult.error.message?.includes('signal_victory_ready') && rpcResult.error.message?.includes('does not exist')) {
    throw new Error(
      'The victory-ready RPC is missing in Supabase. Run the latest migration and refresh.',
    );
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

export async function leaveGame(gameId) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('leave_game', {
    target_game_id_input: gameId,
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

export async function updateGameFlow(gameId, gameUpdate) {
  const client = getSupabaseClient();
  const { error } = await client.from('games').update(gameUpdate).eq('id', gameId);

  if (error) {
    throw getGameFlowSetupError(error);
  }
}

export async function deleteGame(gameId) {
  const client = getSupabaseClient();
  const { error } = await client.from('games').delete().eq('id', gameId);

  if (error) {
    throw error;
  }
}

export async function persistGameState({ gameId, gameUpdate, players, managerState }) {
  const client = getSupabaseClient();
  const serialized = managerState ? serializeManagerState(managerState) : { privateStates: [], handRows: [] };
  const rpcResult = await withTimeout(
    client.rpc('persist_game_state_atomic', {
      target_game_id_input: gameId,
      game_update_input: gameUpdate ?? {},
      players_input: serializePlayersForPersistence(players ?? []),
      private_states_input: serialized.privateStates,
      hand_rows_input: serialized.handRows,
    }),
    DEFAULT_RPC_TIMEOUT_MS,
    'persist_game_state_atomic',
  );

  if (!rpcResult.error) {
    return;
  }

  if (
    rpcResult.error.message?.includes('persist_game_state_atomic') &&
    rpcResult.error.message?.includes('does not exist')
  ) {
    throw new Error('The atomic game-state RPC is missing in Supabase. Run the latest migration and refresh.');
  }

  throw getGameFlowSetupError(rpcResult.error);
}

export function gameNeedsRulesInitialization(activeGame) {
  return activeGame?.engineState?.rulesVersion !== RULES_VERSION;
}
