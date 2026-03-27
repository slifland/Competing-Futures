import { initialPowers } from './game-data.js';
import { supabase } from './supabase.js';

export const DEMO_GAME_ID = 'demo-game';

function buildPlayerMap(players, cards, privateStateRows) {
  const cardsByPlayerId = cards.reduce((accumulator, card) => {
    const group = accumulator.get(card.player_id) ?? [];
    group.push({ name: card.name, text: card.text, position: card.position });
    accumulator.set(card.player_id, group);
    return accumulator;
  }, new Map());

  const privateStateByPlayerId = new Map(
    privateStateRows.map((row) => [row.player_id, { objective: row.objective, selectedAction: row.selected_action }]),
  );

  return new Map(
    players.map((player) => [
      player.power_key,
      {
        id: player.power_key,
        name: player.name,
        shortName: player.short_name,
        accent: player.accent,
        role: player.role,
        homeClass: player.home_class,
        meters: {
          capabilities: player.capabilities,
          safety: player.safety,
          market: player.market,
          support: player.support,
        },
        objective: privateStateByPlayerId.get(player.id)?.objective ?? '',
        selectedAction: privateStateByPlayerId.get(player.id)?.selectedAction ?? '',
        hand: (cardsByPlayerId.get(player.id) ?? [])
          .sort((left, right) => left.position - right.position)
          .map(({ name, text }) => ({ name, text })),
      },
    ]),
  );
}

export async function fetchDemoGame() {
  const [
    { data: game, error: gameError },
    { data: players, error: playersError },
    { data: cards, error: cardsError },
    { data: privateStateRows, error: privateStateError },
  ] = await Promise.all([
    supabase.from('games').select('id, round, event_index').eq('id', DEMO_GAME_ID).single(),
    supabase
      .from('players')
      .select('id, power_key, name, short_name, accent, role, home_class, capabilities, safety, market, support')
      .eq('game_id', DEMO_GAME_ID),
    supabase.from('player_cards').select('player_id, position, name, text').like('player_id', `${DEMO_GAME_ID}-%`),
    supabase.from('player_private_state').select('player_id, objective, selected_action').like('player_id', `${DEMO_GAME_ID}-%`),
  ]);

  if (gameError) {
    throw gameError;
  }

  if (playersError) {
    throw playersError;
  }

  if (cardsError) {
    throw cardsError;
  }

  if (privateStateError) {
    throw privateStateError;
  }

  const playerMap = buildPlayerMap(players, cards, privateStateRows);

  return {
    round: game.round,
    eventIndex: game.event_index,
    players: initialPowers.map((player) => playerMap.get(player.id) ?? player),
  };
}
