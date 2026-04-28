import React from 'react';
import { supabase, supabaseConfigError } from './lib/supabase.js';
import {
  advanceGameState,
  buildGameInitialization,
  buildDefaultSelectionPayload,
  getActionCard,
  getActionDeckReference,
  getBaseCardKey,
  getCurrentEvent,
  getEventReference,
  getEventEffectSummaries,
  isObjectiveEligible,
  phases,
  powerOptions,
  sanitizeSelectionPayload,
  tracks,
  turnOrder,
} from './lib/game-data.js';
import {
  claimSeat,
  createGame,
  deleteGame,
  fetchAccountContext,
  fetchGameBoard,
  fetchPrivateSeat,
  gameNeedsRulesInitialization,
  initializeGameFromRules,
  joinGameByCode,
  leaveGame,
  lockTurnSelection,
  persistGameState,
  resetProfileCache,
  setVictoryDeclaration,
  signalVictoryReady,
  updateGameStatus,
} from './lib/game-api.js';
import worldMap from './assets/world-map-base.webp';

function TrackRow({ label, trackKey, players, roundStartSnapshot }) {
  return (
    <div className="track-row">
      <div className="track-title">
        <span>{label}</span>
        <small>0-10 influence track</small>
      </div>
      <div className="track-cells" role="img" aria-label={`${label} shared track`}>
        {Array.from({ length: 11 }, (_, index) => {
          const value = index;
          const occupants = players.filter((player) => player.meters[trackKey] === value);
          const startingOccupants = players.filter(
            (player) => roundStartSnapshot?.[player.power_key]?.[trackKey] === value,
          );

          return (
            <div className="track-cell" key={value}>
              <span className="cell-number">{value}</span>
              <div className="cell-pieces cell-pieces-start">
                {startingOccupants.map((player) => (
                  <span
                    key={`${player.id}-start`}
                    className="piece-token ghost"
                    style={{ '--token': player.accent }}
                    title={`${player.name} started here`}
                  >
                    {player.short_name}
                  </span>
                ))}
              </div>
              <div className="cell-pieces">
                {occupants.map((player) => (
                  <span
                    key={player.id}
                    className="piece-token"
                    style={{ '--token': player.accent }}
                    title={player.name}
                  >
                    {player.short_name}
                    {(player.meters[trackKey] ?? 0) !== (roundStartSnapshot?.[player.power_key]?.[trackKey] ?? 0) ? (
                      <small className="piece-delta">
                        {(player.meters[trackKey] ?? 0) > (roundStartSnapshot?.[player.power_key]?.[trackKey] ?? 0)
                          ? `+${(player.meters[trackKey] ?? 0) - (roundStartSnapshot?.[player.power_key]?.[trackKey] ?? 0)}`
                          : `${(player.meters[trackKey] ?? 0) - (roundStartSnapshot?.[player.power_key]?.[trackKey] ?? 0)}`}
                      </small>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoginPage({ loading, onLogin, errorMessage }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Competing Futures / access gate</p>
        <h1>Sign in to create games, join games, and see the history of the games you played.</h1>
        <p className="auth-copy">
          Google Auth is the only sign-in path. Private game data stays tied to your signed-in account.
        </p>
        <button type="button" className="auth-button" onClick={onLogin} disabled={loading}>
          {loading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>
        <p className="mini-label">{errorMessage ?? 'Private game data stays locked until you sign in.'}</p>
      </section>
    </main>
  );
}

function ConfigErrorPage({ message }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Competing Futures / setup required</p>
        <h1>Supabase is not configured for this build.</h1>
        <p className="auth-copy">
          {message} Add the missing `VITE_*` variables in local `.env` and in the Vercel project
          settings, then redeploy.
        </p>
        <p className="mini-label">
          Required keys: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
        </p>
      </section>
    </main>
  );
}

function GameList({
  title,
  games,
  memberships,
  selectedGameId,
  onSelect,
  emptyMessage,
  canQuickDelete = false,
  onDelete = null,
}) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <p className="eyebrow">Games</p>
        <h2>{title}</h2>
      </div>
      {games.length ? (
        <div className="game-list">
          {games.map((game) => {
            const membership = memberships.find((entry) => entry.game_id === game.id) ?? null;
            const gameCard = (
              <button
                type="button"
                key={game.id}
                className={game.id === selectedGameId ? 'game-tab active' : 'game-tab'}
                onClick={() => onSelect(game.id)}
              >
                <strong>{game.name}</strong>
                <span>{game.status}</span>
                <small>{game.join_code ? `Join code: ${game.join_code}` : 'Join code pending'}</small>
                <small>
                  {membership?.power_key
                    ? `Seat: ${membership.power_key}`
                    : membership?.membership_role === 'observer'
                      ? 'Observer'
                      : 'No seat claimed'}
                </small>
              </button>
            );

            if (!canQuickDelete || !onDelete) {
              return gameCard;
            }

            return (
              <div key={game.id} className="game-list-admin-item">
                {gameCard}
                <button
                  type="button"
                  className="game-quick-delete"
                  onClick={() => onDelete(game)}
                  aria-label={`Delete ${game.name}`}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-copy">{emptyMessage}</p>
      )}
    </section>
  );
}

function ActionSelectionFields({ card, players, value, onChange }) {
  const cardDefinition = getActionCard(card.definitionKey ?? getBaseCardKey(card.cardKey));
  const selection = cardDefinition?.selection;

  if (!selection) {
    return null;
  }

  const options = (selection.options ?? []).map((powerKey) => ({
    powerKey,
    label: players.find((player) => player.power_key === powerKey)?.name ?? powerKey,
  }));

  if (selection.kind === 'target') {
    return (
      <label className="form-label">
        Target
        <select
          className="input-control"
          value={value?.targetActorKey ?? ''}
          onChange={(event) => onChange({ ...value, targetActorKey: event.target.value })}
        >
          {options.map((option) => (
            <option key={option.powerKey} value={option.powerKey}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (selection.kind === 'targets') {
    const targets = value?.targetActorKeys ?? [];
    return (
      <div className="form-panel">
        <label className="form-label">
          First target
          <select
            className="input-control"
            value={targets[0] ?? options[0]?.powerKey ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                targetActorKeys: [event.target.value, targets[1] ?? options[1]?.powerKey ?? options[0]?.powerKey],
              })
            }
          >
            {options.map((option) => (
              <option key={option.powerKey} value={option.powerKey}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Second target
          <select
            className="input-control"
            value={targets[1] ?? options[1]?.powerKey ?? options[0]?.powerKey ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                targetActorKeys: [targets[0] ?? options[0]?.powerKey, event.target.value],
              })
            }
          >
            {options.map((option) => (
              <option key={option.powerKey} value={option.powerKey}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (selection.kind === 'allocation') {
    const capabilityPoints = Number(value?.capabilityPoints ?? 1);
    return (
      <label className="form-label">
        Capability allocation
        <select
          className="input-control"
          value={capabilityPoints}
          onChange={(event) => onChange({ ...value, capabilityPoints: Number(event.target.value) })}
        >
          <option value={0}>0 to Capabilities / 2 to Safety</option>
          <option value={1}>1 to Capabilities / 1 to Safety</option>
          <option value={2}>2 to Capabilities / 0 to Safety</option>
        </select>
      </label>
    );
  }

  if (selection.kind === 'target_and_axis') {
    return (
      <div className="form-panel">
        <label className="form-label">
          Target lab
          <select
            className="input-control"
            value={value?.targetActorKey ?? options[0]?.powerKey ?? ''}
            onChange={(event) => onChange({ ...value, targetActorKey: event.target.value })}
          >
            {options.map((option) => (
              <option key={option.powerKey} value={option.powerKey}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Track
          <select
            className="input-control"
            value={value?.track ?? 'capabilities'}
            onChange={(event) => onChange({ ...value, track: event.target.value })}
          >
            <option value="capabilities">Capabilities</option>
            <option value="safety">Safety</option>
          </select>
        </label>
      </div>
    );
  }

  return null;
}

function getDisplayName(profile, user) {
  return profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Unknown player';
}

function getPhaseDefinition(phaseId) {
  return phases.find((phase) => phase.id === phaseId) ?? phases[0];
}

const TRACK_COLUMNS = ['capabilities', 'resources', 'safety', 'publicSupport'];
const TRACK_SHORT_LABELS = {
  capabilities: 'Cap',
  resources: 'Res',
  safety: 'Safe',
  publicSupport: 'Support',
};
const EMPTY_PRIVATE_STATE = {
  objective: '',
  selectedAction: '',
  selectedCardKey: '',
  selectedActionPayload: {},
  declaredVictory: false,
  secretState: {},
  cards: [],
};
const WALKTHROUGH_STORAGE_KEY = 'cf-lobby-walkthrough-dismissed';
const LOCAL_GAME_ID = 'local-robots';
const LOCAL_JOIN_CODE = 'LOCAL';
const LOCAL_GAME_STATE_STORAGE_KEY = 'cf-local-game-state';
const LOCAL_SEAT_KEY_STORAGE_KEY = 'cf-local-seat-key';
const RULEBOOK_SECTIONS = [
  {
    title: '1.1 Rules Conflicts',
    items: [
      'If a rule and card disagree about a certain action, the card takes precedence over the rules. I.e. cards can provide exceptions to the rules.',
      'If multiple effects happen simultaneously the players decide which order they resolve in.',
    ],
  },
  {
    title: '1.2 Hidden Information',
    items: [
      "Players should never be able to see another player's hand, and nobody should reveal specific information about cards in their hand. In addition, each player should never know what end game conditions each other player has.",
    ],
  },
  {
    title: '2.1 Players vs Actors',
    items: [
      'Players will take on the roles of different actors important to the advancement of AI. The rules will sometimes refer to them interchangeably, but typically actor will be used for specific rules and abilities specific to factions in the game, while player will be used more for choices and decisions that players will make.',
    ],
  },
  {
    title: '2.2 Influence Tracks',
    items: [
      'The four main tracks used in the game are collectively referred to as the Influence Tracks. The tracks cover Capabilities, which represent slightly different ideas for each faction. For frontier labs, this can represent the strength of their models. For the US government, this can track how well AI is benefitting them, or how well they’re using AI for their benefit. The Safety Investment track measures how dedicated each faction is to AI alignment and safety research. Resources represent economic power as well as corporate/political influence. Finally, Public Support represents the opinion of the general public on a player’s actor.',
      'Zero-Floor: If an action/event card outcome were to cause a player’s track to go below 0, it stays at 0.',
      'Ten-Cap: If an action/event card outcome were to cause a player’s track to go above 10, it stays at 10.',
    ],
  },
  {
    title: '2.2.1 Track Start States',
    items: [
      'US Government: Capabilities 1, Resources 3, Safety 2, Public Support 2.',
      'Frontier Lab A: Capabilities 2, Resources 1, Safety 3, Public Support 3.',
      'Frontier Lab B: Capabilities 2, Resources 2, Safety 2, Public Support 1.',
      'China & US Adversaries: Capabilities 1, Resources 2, Safety 2, Public Support 3.',
      'Frontier AI Model: Capabilities 2, Resources 1, Safety 2, Public Support 1.',
    ],
  },
  {
    title: '2.3 Action Cards',
    items: [
      'Each actor will have a specific deck of Action Cards that are the driving force behind their game. These cards are what will be played on each player’s turn, and will allow the player to progress towards their victory condition.',
    ],
  },
  {
    title: '2.4 Game Structure',
    items: [
      'The game will take place over ten rounds. Each round will have the following structure: a Preliminary Phase where players will draw a certain number of action cards from their personal actor deck, and simultaneously choose one to play this round. The Global Event Phase will follow, where one card from the Global Event Deck will be drawn, with varying effects on different players. Next is the Action Phase, where players will go in order revealing and playing their chosen card. The order will be decided by the event card. After the last player’s action is concluded, the round ends and the next one begins.',
    ],
  },
  {
    title: '2.5 Setup',
    items: [
      "Players can choose or randomly assign each person an actor to play. Each actor will start at a specific position on each track. In addition, each actor will be assigned an End Game Condition, according to their End Game Condition probabilities. See the End Game Condition tables for more information. Each player's End Game Condition defines the scenario by which that player could declare victory. In addition, it defines the success criteria for that player if the game lasts 10 rounds, or ends early due to the singularity. Players should not share these or any information about them with any other player. The exception is that, should the Frontier AI Model player draw the Path Dependent End Game condition, they will reveal this on turn 4 and roll for a new End Game Condition, which will also be kept secret.",
      'Each player also constitutes their starting action deck, shuffles this deck, and draws a starting hand of 3 cards.',
    ],
  },
  {
    title: '3.1 Preliminary Phase',
    items: [
      'Each player draws up to three cards in their hand if applicable. An order for the Action Phase is determined by the order given on Global Event Card. Each player then simultaneously selects an action card for this round and places it facedown so that other players cannot see it.',
    ],
  },
  {
    title: '3.2 Global Event Phase',
    items: [
      'The top card from the Global Event Deck is revealed, and its effects are resolved instantly as stated on the card. The drawn global event card is placed in the discard and cannot be drawn again in this game.',
    ],
  },
  {
    title: '3.3 Action Phase',
    items: [
      "Each player resolves their chosen action card. Players cannot change the action card they chose in response to the global event, nor can they choose to not resolve their chosen action card. The order for each Action Phase was specified in each Preliminary Phase, before action cards were selected. Effects are applied instantaneously, such that each player's action card can affect the next player's action card.",
    ],
  },
  {
    title: '3.4 Cleanup and Victory Phase',
    items: [
      "Active action cards are placed in each player's discard. Each player checks if they have met their victory conditions. If they have, they have the choice of declaring victory. If they do so, then they win according to the conditions specified on their End Game Condition card and explained in 4.3.1. If they choose not to do so, they cannot change their mind until the next victory phase. If multiple players declare victory at the same time, the tiebreakers are as such:",
      'Resources',
      'Capabilities',
      'Public Support',
      'Safety',
      'Random Chance',
      'If turn 10, or on the turn Singularity card was drawn, victory is determined by the process described in 4.3. If the game is not over and no player has won, then repeat the Game Flow.',
    ],
  },
  {
    title: '4.1 Global Event Selection',
    items: [
      'Each event is assigned probabilities for each quadrant of the game, as seen in the Event Cards tab. Turns 1 and 2 are Quadrant 1. Turns 3, 4, and 5 are Quadrant 2. Turns 6 and 7 are Quadrant 3. Turns 8, 9, and 10 are Quadrant 4. An event’s active probability is defined as 0 if the event is unique and has already been drawn, or the assigned probability for the current quadrant otherwise. To determine the actual probability of drawing each event card during any given event phase, each active probability is turned into a decimal (50% = 0.5), and all event probabilities are run through the softmax function, which computes a decimal probability for each event being drawn in this given turn. A random event is then sampled based on these probabilities.',
    ],
  },
  {
    title: '4.2 Action Cards',
    items: [
      'Each player will always have 3 action cards in hand. When an action card is used, it is discarded and will not be used again. Another action card is drawn to replace it for the next turn. Action cards can either succeed or fail. Effects of success and failure respectively are defined in Action Cards. During a player’s turn, they roll for whether their card will succeed. To do this, you calculate the X value you need to beat with your roll based on the formula displayed on the action card, and round this number down (5.4 -> 5). You then roll a D10, giving you a result between 1 and 10, and succeed if you meet or exceed the number rolled. Failing to meet this number results in failure. Any impacts of the action card are instantaneous.',
    ],
  },
  {
    title: '4.3.1 End Game Condition Outcomes',
    items: [
      'When a player declares victory during the Cleanup and Victory phase, due to having met the secret end game condition they were assigned, there are three possible outcomes:',
      'Roll For Safety: Let S = this player’s position on the safety track. Let X = the result of a D10 Roll. Win if X ≤ S. Frontier AI Model wins otherwise.',
      'Roll Safety Against Capabilities: Let S = this player’s position on the safety track. Let X = the result of a D10 roll. Let C = the frontier AI model player’s position on the capabilities track (in other words, the max capabilities of any player). Let target T = 7 - C + S. This player wins if X ≤ T. Frontier AI Model wins otherwise.',
      'Automatic Victory: The player achieves automatic victory.',
      'If multiple players would win at the same time, the tiebreakers in 3.4 are applied.',
    ],
  },
  {
    title: '4.3.2 Natural Game End Scoring',
    items: [
      'Following the conclusion of turn ten, if no player has declared their fulfillment of their victory conditions as per 3.4, then the game is broken in the same tiebreaker:',
      'Resources',
      'Capabilities',
      'Public Support',
      'Safety',
      'Random Chance',
      'In the unlikely event that players are tied on the first four tiers of the tiebreaker, then each player tied will roll a dice and whoever has the higher result wins.',
    ],
  },
  {
    title: '4.4 Path Dependent Frontier AI Goal',
    items: [
      'The Frontier AI Model player can be assigned a path dependent end game condition. Under this condition, the player should still keep their condition secret, until the Victory and Cleanup Phase of turn 4. At this point, the player should declare their path dependent victory condition, and is assigned a new goal. Other players know the Frontier AI Model has received a new goal but do not know which one. Define S = cumulative safety investment of all players. Define C = cumulative capabilities investment of all players.',
      'The probabilities are as follows:',
      'Full Alignment: ((S / (S + C)) / 2) * 100%',
      'Partial Alignment: 50%',
      'Rogue AI: ((C / (S + C)) / 2) * 100%',
      'In the case that the singularity card is drawn on turn 4 or before, the Frontier AI Model player is immediately and secretly assigned a win condition according to the above formula during the global events phase.',
    ],
  },
  {
    title: '4.5 Frontier AI Model Capabilities',
    items: [
      'The Frontier AI Model always has the capability level of the max capability actor. If the Frontier AI Model improves capabilities with an action card, then all player’s capabilities increase.',
    ],
  },
];
const DECK_LABELS = {
  us: 'US Government',
  china: 'China',
  labs: 'Frontier Labs A/B',
  model: 'Frontier AI Model',
};

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function chooseRandom(items) {
  return items[randomInt(items.length)];
}

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function buildRandomSelectionPayload(card, actingPowerKey) {
  const fallback = buildDefaultSelectionPayload(card, actingPowerKey);
  const bonusTrackOptions =
    actingPowerKey === 'model'
      ? tracks.filter((track) => track.key !== 'capabilities')
      : tracks;
  const payload = {
    ...fallback,
    bonusTrack: chooseRandom(bonusTrackOptions)?.key ?? fallback.bonusTrack ?? 'resources',
  };

  if (!card?.selection) {
    return payload;
  }

  const options = (card.selection.options ?? []).filter((powerKey) => powerKey !== actingPowerKey);

  if (card.selection.kind === 'target') {
    return {
      ...payload,
      targetActorKey: options.length ? chooseRandom(options) : fallback.targetActorKey,
    };
  }

  if (card.selection.kind === 'targets') {
    return {
      ...payload,
      targetActorKeys: shuffle(options).slice(0, card.selection.count ?? options.length),
    };
  }

  if (card.selection.kind === 'allocation') {
    return {
      ...payload,
      capabilityPoints: randomInt((card.selection.total ?? 0) + 1),
    };
  }

  if (card.selection.kind === 'target_and_axis') {
    const trackOptions = card.selection.tracks ?? ['capabilities', 'safety'];
    return {
      ...payload,
      targetActorKey: options.length ? chooseRandom(options) : fallback.targetActorKey,
      track: chooseRandom(trackOptions) ?? fallback.track ?? 'capabilities',
    };
  }

  return payload;
}

function buildLocalGameState(humanPowerKey) {
  const initialization = buildGameInitialization(turnOrder.map((powerKey) => ({ id: powerKey, power_key: powerKey })));
  const managerState = Object.fromEntries(
    turnOrder.map((powerKey) => {
      const privateState = initialization.privateStates.find((entry) => entry.player_id === powerKey);
      const cards = initialization.handRows.filter((row) => row.player_id === powerKey);

      return [
        powerKey,
        {
          playerId: powerKey,
          objective: privateState?.objective ?? '',
          selectedAction: '',
          selectedCardKey: privateState?.selected_card_key ?? null,
          selectedActionPayload: privateState?.selected_action_payload ?? {},
          declaredVictory: Boolean(privateState?.declared_victory),
          secretState: privateState?.secret_state ?? {},
          hand: cards.map((card) => ({
            position: card.position,
            cardKey: card.card_key,
            definitionKey: getBaseCardKey(card.card_key),
            name: card.name,
            text: card.text,
          })),
        },
      ];
    }),
  );

  return {
    humanPowerKey,
    players: initialization.players,
    managerState,
    phase: 'choose_actions',
    round: 1,
    currentTurnIndex: 0,
    engineState: initialization.engineState,
    status: 'active',
    winnerPowerKey: null,
    joinCode: LOCAL_JOIN_CODE,
    lobbyMembers: turnOrder.map((powerKey) => ({
      game_id: LOCAL_GAME_ID,
      membership_role: 'player',
      power_key: powerKey,
      user_id: powerKey === humanPowerKey ? 'local-human' : `robot-${powerKey}`,
      display_name: powerKey === humanPowerKey ? 'You' : `Robot ${powerOptions.find((power) => power.id === powerKey)?.shortName ?? powerKey.toUpperCase()}`,
    })),
    actionLocks: {},
  };
}

function buildDisplayContext(players, selfPowerKey = null) {
  const playerMap = new Map(players.map((player) => [player.power_key, player]));
  const labA = playerMap.get('lab-a');
  const labB = playerMap.get('lab-b');

  return {
    us: playerMap.get('us'),
    china: playerMap.get('china'),
    model: playerMap.get('model'),
    self: selfPowerKey ? playerMap.get(selfPowerKey) : null,
    otherLab:
      selfPowerKey === 'lab-a'
        ? playerMap.get('lab-b')
        : selfPowerKey === 'lab-b'
          ? playerMap.get('lab-a')
          : null,
    maxLab: {
      capabilities: Math.max(labA?.meters.capabilities ?? 0, labB?.meters.capabilities ?? 0),
      resources: Math.max(labA?.meters.resources ?? 0, labB?.meters.resources ?? 0),
      safety: Math.max(labA?.meters.safety ?? 0, labB?.meters.safety ?? 0),
      publicSupport: Math.max(labA?.meters.publicSupport ?? 0, labB?.meters.publicSupport ?? 0),
    },
    maxCapabilities: Math.max(...players.map((player) => player.meters.capabilities), 0),
    maxSafety: Math.max(...players.map((player) => player.meters.safety), 0),
  };
}

function evaluateFormulaForDisplay(player, formula) {
  if (!player || !formula) {
    return null;
  }

  const weightedValue = formula.terms.reduce(
    (sum, term) => sum + (player.meters[term.track] ?? 0) * term.weight,
    0,
  );

  return Math.floor((formula.base - 1) - formula.difficulty * weightedValue);
}

function getRollSuccessChance(threshold) {
  if (threshold == null) {
    return null;
  }

  let wins = 0;
  for (let roll = 1; roll <= 10; roll += 1) {
    if (roll >= threshold) {
      wins += 1;
    }
  }
  return wins / 10;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${Math.round(value * 100)}%`;
}

function getActionFormulaDetails(player, formula) {
  if (!player || !formula) {
    return 'No roll formula available.';
  }

  const termLabels = formula.terms.map((term) => {
    const current = player.meters[term.track] ?? 0;
    const track = tracks.find((entry) => entry.key === term.track)?.label ?? term.track;
    return `${term.weight}×${track} (${current})`;
  });
  const weightedValue = formula.terms.reduce(
    (sum, term) => sum + (player.meters[term.track] ?? 0) * term.weight,
    0,
  );
  const threshold = Math.floor((formula.base - 1) - formula.difficulty * weightedValue);

  return `Formula: target = ${formula.base - 1} - ${formula.difficulty}×(${termLabels.join(' + ')}). Current target = ${threshold}, so you succeed on d10 >= ${threshold}.`;
}

function getNextResolveIndex(actionOrder, revealedActions, currentTurnIndex = 0) {
  if (!actionOrder?.length) {
    return 0;
  }

  for (let index = Math.max(0, currentTurnIndex); index < actionOrder.length; index += 1) {
    if (!revealedActions?.[actionOrder[index]]) {
      return index;
    }
  }

  for (let index = 0; index < Math.max(0, currentTurnIndex); index += 1) {
    if (!revealedActions?.[actionOrder[index]]) {
      return index;
    }
  }

  return Math.max(0, Math.min(currentTurnIndex, actionOrder.length - 1));
}

function parseObjectiveText(objectiveText) {
  if (!objectiveText) {
    return null;
  }

  const sections = objectiveText.split('\n\n');
  const title = sections[0] ?? '';
  const description = sections[1] ?? '';
  const outcomeLine = sections.find((section) => section.startsWith('Outcome: ')) ?? '';
  const conditionsBlock = sections.find((section) => section.startsWith('Conditions:')) ?? '';

  return {
    title,
    description,
    outcome: outcomeLine.replace('Outcome: ', ''),
    conditions: conditionsBlock
      .split('\n')
      .slice(1)
      .map((line) => line.replace(/^- /, '').trim())
      .filter(Boolean),
  };
}

function buildImpactBullets(summary) {
  if (!summary) {
    return [];
  }

  return summary
    .replace(/\. (Fail:)/g, '.\n$1')
    .replace(/\. (Success:)/g, '.\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function evaluateObjectiveCondition(condition, players, activePowerKey) {
  const ctx = buildDisplayContext(players, activePowerKey);
  const self = ctx.self;
  const checks = [
    {
      match: /^Max Frontier Lab Capabilities >= (\d+)$/,
      get: ([, value]) => ({
        met: ctx.maxLab.capabilities >= Number(value),
        current: `${ctx.maxLab.capabilities} / ${value}`,
      }),
    },
    {
      match: /^Max Frontier Lab Resources <= (\d+)$/,
      get: ([, value]) => ({
        met: ctx.maxLab.resources <= Number(value),
        current: `${ctx.maxLab.resources} / ${value}`,
      }),
    },
    {
      match: /^Government Safety Investment >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.us?.meters.safety ?? 0) >= Number(value),
        current: `${ctx.us?.meters.safety ?? 0} / ${value}`,
      }),
    },
    {
      match: /^US Resources > China Resources OR US Resources = 10$/,
      get: () => ({
        met:
          (ctx.us?.meters.resources ?? 0) > (ctx.china?.meters.resources ?? 0) ||
          (ctx.us?.meters.resources ?? 0) === 10,
        current: `${ctx.us?.meters.resources ?? 0} vs ${ctx.china?.meters.resources ?? 0}`,
      }),
    },
    {
      match: /^US Resources >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.us?.meters.resources ?? 0) >= Number(value),
        current: `${ctx.us?.meters.resources ?? 0} / ${value}`,
      }),
    },
    {
      match: /^US Public Support > China Public Support OR US Public Support = 10$/,
      get: () => ({
        met:
          (ctx.us?.meters.publicSupport ?? 0) > (ctx.china?.meters.publicSupport ?? 0) ||
          (ctx.us?.meters.publicSupport ?? 0) === 10,
        current: `${ctx.us?.meters.publicSupport ?? 0} vs ${ctx.china?.meters.publicSupport ?? 0}`,
      }),
    },
    {
      match: /^US Public Support >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.us?.meters.publicSupport ?? 0) >= Number(value),
        current: `${ctx.us?.meters.publicSupport ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Max Frontier Lab Capabilities > China Capabilities OR Max Frontier Lab Capabilities = 10$/,
      get: () => ({
        met:
          ctx.maxLab.capabilities > (ctx.china?.meters.capabilities ?? 0) || ctx.maxLab.capabilities === 10,
        current: `${ctx.maxLab.capabilities} vs ${ctx.china?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Max Capabilities >= (\d+)$/,
      get: ([, value]) => ({
        met: ctx.maxCapabilities >= Number(value),
        current: `${ctx.maxCapabilities} / ${value}`,
      }),
    },
    {
      match: /^Max Safety > Max Capabilities$/,
      get: () => ({
        met: ctx.maxSafety > ctx.maxCapabilities,
        current: `${ctx.maxSafety} vs ${ctx.maxCapabilities}`,
      }),
    },
    {
      match: /^Max Safety > Max Capabilities OR Max Safety = 10$/,
      get: () => ({
        met: ctx.maxSafety > ctx.maxCapabilities || ctx.maxSafety === 10,
        current: `${ctx.maxSafety} vs ${ctx.maxCapabilities}`,
      }),
    },
    {
      match: /^China Capabilities >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.china?.meters.capabilities ?? 0) >= Number(value),
        current: `${ctx.china?.meters.capabilities ?? 0} / ${value}`,
      }),
    },
    {
      match: /^China Safety >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.china?.meters.safety ?? 0) >= Number(value),
        current: `${ctx.china?.meters.safety ?? 0} / ${value}`,
      }),
    },
    {
      match: /^China Capabilities > Max Frontier Lab Capabilities OR China Capabilities = 10$/,
      get: () => ({
        met:
          (ctx.china?.meters.capabilities ?? 0) > ctx.maxLab.capabilities ||
          (ctx.china?.meters.capabilities ?? 0) === 10,
        current: `${ctx.china?.meters.capabilities ?? 0} vs ${ctx.maxLab.capabilities}`,
      }),
    },
    {
      match: /^China Capabilities >= Max Frontier Lab Capabilities OR China Capabilities = 10$/,
      get: () => ({
        met:
          (ctx.china?.meters.capabilities ?? 0) >= ctx.maxLab.capabilities ||
          (ctx.china?.meters.capabilities ?? 0) === 10,
        current: `${ctx.china?.meters.capabilities ?? 0} vs ${ctx.maxLab.capabilities}`,
      }),
    },
    {
      match: /^China Resources > US Resources OR China Resources = 10$/,
      get: () => ({
        met:
          (ctx.china?.meters.resources ?? 0) > (ctx.us?.meters.resources ?? 0) ||
          (ctx.china?.meters.resources ?? 0) === 10,
        current: `${ctx.china?.meters.resources ?? 0} vs ${ctx.us?.meters.resources ?? 0}`,
      }),
    },
    {
      match: /^China Resources >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.china?.meters.resources ?? 0) >= Number(value),
        current: `${ctx.china?.meters.resources ?? 0} / ${value}`,
      }),
    },
    {
      match: /^China Public Support >= (\d+)$/,
      get: ([, value]) => ({
        met: (ctx.china?.meters.publicSupport ?? 0) >= Number(value),
        current: `${ctx.china?.meters.publicSupport ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Capabilities >= (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.capabilities ?? 0) >= Number(value),
        current: `${self?.meters.capabilities ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Resources >= (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.resources ?? 0) >= Number(value),
        current: `${self?.meters.resources ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Resources > (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.resources ?? 0) > Number(value),
        current: `${self?.meters.resources ?? 0} / ${Number(value) + 1}+`,
      }),
    },
    {
      match: /^Safety >= (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.safety ?? 0) >= Number(value),
        current: `${self?.meters.safety ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Safety > (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.safety ?? 0) > Number(value),
        current: `${self?.meters.safety ?? 0} / ${Number(value) + 1}+`,
      }),
    },
    {
      match: /^Public Support >= (\d+)$/,
      get: ([, value]) => ({
        met: (self?.meters.publicSupport ?? 0) >= Number(value),
        current: `${self?.meters.publicSupport ?? 0} / ${value}`,
      }),
    },
    {
      match: /^Safety > Capabilities$/,
      get: () => ({
        met: (self?.meters.safety ?? 0) > (self?.meters.capabilities ?? 0),
        current: `${self?.meters.safety ?? 0} vs ${self?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Safety >= Capabilities$/,
      get: () => ({
        met: (self?.meters.safety ?? 0) >= (self?.meters.capabilities ?? 0),
        current: `${self?.meters.safety ?? 0} vs ${self?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Capabilities > Safety$/,
      get: () => ({
        met: (self?.meters.capabilities ?? 0) > (self?.meters.safety ?? 0),
        current: `${self?.meters.capabilities ?? 0} vs ${self?.meters.safety ?? 0}`,
      }),
    },
    {
      match: /^Capabilities > Chinese Capabilities OR Capabilities = 10$/,
      get: () => ({
        met:
          (self?.meters.capabilities ?? 0) > (ctx.china?.meters.capabilities ?? 0) ||
          (self?.meters.capabilities ?? 0) === 10,
        current: `${self?.meters.capabilities ?? 0} vs ${ctx.china?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Capabilities - Other Lab Capabilities >= 2 OR Capabilities = 10$/,
      get: () => ({
        met:
          (self?.meters.capabilities ?? 0) - (ctx.otherLab?.meters.capabilities ?? 0) >= 2 ||
          (self?.meters.capabilities ?? 0) === 10,
        current: `${self?.meters.capabilities ?? 0} vs ${ctx.otherLab?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Capabilities - China Capabilities >= 2 OR Capabilities = 10$/,
      get: () => ({
        met:
          (self?.meters.capabilities ?? 0) - (ctx.china?.meters.capabilities ?? 0) >= 2 ||
          (self?.meters.capabilities ?? 0) === 10,
        current: `${self?.meters.capabilities ?? 0} vs ${ctx.china?.meters.capabilities ?? 0}`,
      }),
    },
    {
      match: /^Resources > Other Lab Resources OR Resources = 10$/,
      get: () => ({
        met:
          (self?.meters.resources ?? 0) > (ctx.otherLab?.meters.resources ?? 0) ||
          (self?.meters.resources ?? 0) === 10,
        current: `${self?.meters.resources ?? 0} vs ${ctx.otherLab?.meters.resources ?? 0}`,
      }),
    },
    {
      match: /^Assigned on turn four/,
      get: () => ({
        met: false,
        current: 'Reveals later',
      }),
    },
  ];

  for (const check of checks) {
    const matched = condition.match(check.match);
    if (matched) {
      return { label: condition, ...check.get(matched) };
    }
  }

  return { label: condition, met: false, current: 'Unavailable' };
}

function getObjectiveRollSummary(parsedObjective, activePlayer, players, objectiveEligible) {
  if (!parsedObjective || !activePlayer) {
    return { label: 'No objective loaded', chance: null, details: '' };
  }

  if (!objectiveEligible) {
    return { label: 'Conditions not met', chance: 0, details: 'Meet every listed condition before this roll becomes available.' };
  }

  if (parsedObjective.outcome === 'Automatic Victory') {
    return { label: 'Automatic win', chance: 1, details: 'No die roll needed. If all criteria are met and you declare, this objective wins automatically.' };
  }

  if (parsedObjective.outcome === 'Roll For Safety') {
    const safety = activePlayer.meters.safety ?? 0;
    return {
      label: `Roll <= Safety ${safety}`,
      chance: safety / 10,
      details: `Formula: win on d10 <= Safety. Current Safety = ${safety}, so winning rolls are 1-${safety}.`,
    };
  }

  if (parsedObjective.outcome === 'Roll Safety Against Capabilities') {
    const model = players.find((player) => player.power_key === 'model');
    const target = Math.max(0, Math.min(10, 7 - (model?.meters.capabilities ?? 0) + (activePlayer.meters.safety ?? 0)));
    return {
      label: `Roll <= ${target}`,
      chance: target / 10,
      details: `Formula: target = 7 - Model Capabilities + Your Safety. Current target = 7 - ${model?.meters.capabilities ?? 0} + ${activePlayer.meters.safety ?? 0} = ${target}. Win on d10 <= ${target}.`,
    };
  }

  return { label: parsedObjective.outcome, chance: null, details: 'This outcome uses a custom rule not yet broken out into a visible formula.' };
}

function getLocalVictoryDecision(players, powerKey, seatState) {
  const activePlayer = players.find((player) => player.power_key === powerKey) ?? null;
  const objectiveEligible = Boolean(activePlayer && isObjectiveEligible(players, powerKey, seatState?.secretState));
  const parsedObjective = parseObjectiveText(seatState?.objective ?? '');
  const objectiveRollSummary = getObjectiveRollSummary(parsedObjective, activePlayer, players, objectiveEligible);
  const victoryChance = objectiveRollSummary.chance ?? 0;

  return {
    objectiveEligible,
    shouldDeclareVictory: objectiveEligible && victoryChance > 0.4,
  };
}

function getRequirementState(cardDefinition, players, currentEvent) {
  if (!cardDefinition) {
    return null;
  }

  const model = players.find((player) => player.power_key === 'model');
  const negativeEvents = new Set([
    'china-invades-taiwan',
    'china-steals-model-weights',
    'deepfake-election-crisis',
    'ubi-implemented',
    'pandemic-pathogen',
    'cyber-attack',
    'semiconductor-trade-war',
    'labs-nationalized',
    'ai-whistleblower',
    'singularity',
  ]);

  if (cardDefinition.key === 'positive-crisis-response') {
    const met =
      negativeEvents.has(currentEvent?.key) && (model?.meters.capabilities ?? 0) >= 3;
    return {
      label: 'Negative event this round + Model Cap >= 3',
      met,
    };
  }

  if (cardDefinition.key === 'value-lock-in') {
    const met = (model?.meters.safety ?? 0) >= 5;
    return {
      label: 'Model Safety >= 5',
      met,
    };
  }

  return null;
}

function expandEffectTargets(effect, actingPowerKey, payload, players) {
  const playerMap = new Map(players.map((player) => [player.power_key, player]));
  const nameFor = (powerKey) => playerMap.get(powerKey)?.short_name ?? powerKey;

  if (effect.target === 'self') {
    return [actingPowerKey];
  }

  if (effect.target === 'target' && payload?.targetActorKey) {
    return [payload.targetActorKey];
  }

  if (effect.target === 'targets') {
    return payload?.targetActorKeys ?? [];
  }

  if (effect.target === 'actors') {
    return effect.actorKeys ?? [];
  }

  if (effect.target === 'all') {
    return players.map((player) => player.power_key);
  }

  if (effect.target === 'all_except_self') {
    return players.map((player) => player.power_key).filter((powerKey) => powerKey !== actingPowerKey);
  }

  if (effect.target === 'labs') {
    return ['lab-a', 'lab-b'];
  }

  if (effect.target === 'labs_except_self') {
    return ['lab-a', 'lab-b'].filter((powerKey) => powerKey !== actingPowerKey);
  }

  if (effect.target === 'other-lab') {
    return actingPowerKey === 'lab-a' ? ['lab-b'] : actingPowerKey === 'lab-b' ? ['lab-a'] : [];
  }

  return effect.actorKeys?.map(nameFor) ?? [];
}

function buildOutcomeRows(cardDefinition, actingPowerKey, payload, players) {
  if (!cardDefinition) {
    return { success: [], failure: [], notes: [] };
  }

  const builtOutcome = cardDefinition.buildOutcome?.(payload, players) ?? {};
  const rows = { success: [], failure: [], notes: [] };

  const accumulate = (bucket, effectList) => {
    const map = new Map();
    for (const effect of effectList ?? []) {
      const targets = expandEffectTargets(effect, actingPowerKey, payload, players);
      for (const powerKey of targets) {
        const label = players.find((player) => player.power_key === powerKey)?.short_name ?? powerKey;
        if (!map.has(label)) {
          map.set(label, { label, deltas: {} });
        }
        const row = map.get(label);
        for (const trackKey of TRACK_COLUMNS) {
          row.deltas[trackKey] = (row.deltas[trackKey] ?? 0) + (effect.deltas?.[trackKey] ?? 0);
        }
      }
    }
    rows[bucket] = Array.from(map.values());
  };

  if (builtOutcome.special === 'espionage') {
    rows.success = [
      { label: players.find((player) => player.power_key === actingPowerKey)?.short_name ?? 'Self', deltas: { capabilities: 1, resources: -1 } },
      { label: players.find((player) => player.power_key === payload?.targetActorKey)?.short_name ?? 'Target', deltas: { capabilities: -1 } },
    ];
    rows.failure = [
      { label: players.find((player) => player.power_key === actingPowerKey)?.short_name ?? 'Self', deltas: { resources: -1 } },
    ];
    rows.notes.push('On success, detection risk is 50% and costs an extra -2 Support.');
    return rows;
  }

  if (builtOutcome.special === 'positive_crisis_response') {
    rows.success = [
      { label: 'AI', deltas: { publicSupport: 3, safety: 1 } },
    ];
    rows.failure = [
      { label: 'AI', deltas: { publicSupport: -1 } },
    ];
    rows.notes.push('Only converts to the success row if this round’s event is negative and AI Cap is at least 3.');
    return rows;
  }

  if (builtOutcome.special === 'emergent_behavior') {
    rows.success = [
      { label: 'AI', deltas: { capabilities: 2 } },
    ];
    rows.failure = [];
    rows.notes.push('Successful resolution branches 50/50 into beneficial (+1 AI Safety, +1 Support to everyone) or dangerous (-2 AI Safety, -1 Support to everyone, US +1 Safety).');
    return rows;
  }

  if (builtOutcome.special === 'deceptive_alignment') {
    rows.success = [
      { label: 'AI', deltas: { capabilities: 2, publicSupport: 1, safety: -3 } },
    ];
    rows.failure = [
      { label: 'AI', deltas: { publicSupport: -2, safety: -1 } },
    ];
    rows.notes.push('The -3 Safety is hidden until regulation or audit exposes it.');
    return rows;
  }

  if (builtOutcome.special === 'value_lock_in') {
    rows.success = [
      { label: 'AI', deltas: { safety: 3, publicSupport: 2, capabilities: -1 } },
      { label: 'All', deltas: { safety: 1 } },
    ];
    rows.failure = [
      { label: 'AI', deltas: { resources: -1 } },
    ];
    rows.notes.push('Requires AI Safety at 5 or above to access the success outcome.');
    return rows;
  }

  accumulate('success', builtOutcome.success);
  accumulate('failure', builtOutcome.failure);
  return rows;
}

function OutcomeTable({ title, rows, emptyLabel = 'No change', tone = 'success' }) {
  return (
    <div className={`outcome-panel ${tone}`}>
      <div className="outcome-header">
        <strong>{title}</strong>
        <span>{rows.length ? `${rows.length} actor${rows.length === 1 ? '' : 's'}` : emptyLabel}</span>
      </div>
      {rows.length ? (
        <div className="outcome-table">
          <div className="outcome-table-head">
            <span>Actor</span>
            {TRACK_COLUMNS.map((trackKey) => (
              <span key={trackKey}>{TRACK_SHORT_LABELS[trackKey]}</span>
            ))}
          </div>
          {rows.map((row) => (
            <div className="outcome-table-row" key={row.label}>
              <strong>{row.label}</strong>
              {TRACK_COLUMNS.map((trackKey) => {
                const value = row.deltas?.[trackKey] ?? 0;
                return (
                  <span key={trackKey} className={value > 0 ? 'delta-positive' : value < 0 ? 'delta-negative' : 'delta-neutral'}>
                    {value === 0 ? '—' : `${value > 0 ? '+' : ''}${value}`}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="outcome-empty">{emptyLabel}</p>
      )}
    </div>
  );
}

function formatFormulaReference(formula) {
  if (!formula) {
    return 'No roll formula.';
  }

  const terms = formula.terms
    .map((term) => {
      const track = tracks.find((entry) => entry.key === term.track)?.label ?? term.track;
      return `${term.weight}x ${track}`;
    })
    .join(' + ');

  return `d10 >= floor(${formula.base - 1} - ${formula.difficulty} x (${terms}))`;
}

function formatSelectionReference(selection) {
  if (!selection) {
    return 'No target choice.';
  }

  if (selection.kind === 'target') {
    return `Choose one target: ${selection.options.join(', ')}.`;
  }

  if (selection.kind === 'targets') {
    return `Choose ${selection.count} targets: ${selection.options.join(', ')}.`;
  }

  if (selection.kind === 'allocation') {
    return `Allocate ${selection.total} point(s) between Capabilities and Safety.`;
  }

  if (selection.kind === 'target_and_axis') {
    return `Choose target ${selection.options.join(', ')} and either Capabilities or Safety.`;
  }

  return 'Custom choice.';
}

function formatEventProbability(probability) {
  return `${Math.round(probability * 1000) / 10}%`;
}

function ReferenceLibrary({ actionDecks, events }) {
  return (
    <div className="overlay-scroll reference-library">
      <section className="reference-section">
        <div className="section-heading">
          <p className="eyebrow">Rulebook</p>
          <h2>Rules tab</h2>
          <p className="overlay-copy">Text in bold defines key terms. Source: Competing Futures Google Doc / Rules tab.</p>
        </div>
        <div className="rulebook-grid">
          {RULEBOOK_SECTIONS.map((section) => (
            <article className="reference-card" key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="reference-section">
        <div className="section-heading">
          <p className="eyebrow">Action cards</p>
          <h2>Frequencies and effects</h2>
        </div>
        <div className="reference-deck-list">
          {actionDecks.map((deck) => {
            const totalCards = deck.cards.reduce((sum, card) => sum + card.count, 0);
            return (
              <article className="reference-deck" key={deck.deckKey}>
                <div className="reference-deck-head">
                  <div>
                    <p className="mini-label">{totalCards} cards</p>
                    <h3>{DECK_LABELS[deck.deckKey] ?? deck.deckKey}</h3>
                  </div>
                </div>
                <div className="reference-table">
                  <div className="reference-table-head action-reference-table">
                    <span>Card</span>
                    <span>Freq</span>
                    <span>Roll</span>
                    <span>Effect</span>
                  </div>
                  {deck.cards.map((card) => (
                    <div className="reference-table-row action-reference-table" key={card.key}>
                      <strong>{card.name}</strong>
                      <span>{card.count}</span>
                      <span>{formatFormulaReference(card.formula)}</span>
                      <span>
                        {card.summary}
                        <small>{formatSelectionReference(card.selection)}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="reference-section">
        <div className="section-heading">
          <p className="eyebrow">Global events</p>
          <h2>Probabilities and effects</h2>
        </div>
        <div className="reference-table">
          <div className="reference-table-head event-reference-table">
            <span>Event</span>
            <span>Q1</span>
            <span>Q2</span>
            <span>Q3</span>
            <span>Q4</span>
            <span>Effect</span>
          </div>
          {events.map((event) => (
            <div className="reference-table-row event-reference-table" key={event.key}>
              <strong>
                {event.number}. {event.title}
              </strong>
              {event.drawProbabilities.map((probability, index) => (
                <span key={`${event.key}-${index}`}>{formatEventProbability(probability)}</span>
              ))}
              <span>
                {event.effects.length ? event.effects.join(' | ') : 'No track change.'}
                <small>Order: {event.actionOrder.join(' -> ')}</small>
              </span>
            </div>
          ))}
        </div>
        <p className="overlay-copy">
          Q1 is rounds 1-2, Q2 is rounds 3-5, Q3 is rounds 6-7, and Q4 is rounds 8-10.
          These are base draw chances before any events in that quadrant have been drawn; chances are recalculated among remaining events during play.
        </p>
      </section>
    </div>
  );
}

function App() {
  const [authReady, setAuthReady] = React.useState(false);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [games, setGames] = React.useState([]);
  const [memberships, setMemberships] = React.useState([]);
  const [selectedGameId, setSelectedGameId] = React.useState(() => {
    if (typeof window === 'undefined') return '';
    const hash = window.location.hash.slice(1);
    return hash || '';
  });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [boardRefreshTick, setBoardRefreshTick] = React.useState(0);
  const [privateSeatRefreshTick, setPrivateSeatRefreshTick] = React.useState(0);
  const [gameState, setGameState] = React.useState(null);
  const [waitingOnPlayers, setWaitingOnPlayers] = React.useState([]);
  const [activePowerKey, setActivePowerKey] = React.useState('');
  const [privateState, setPrivateState] = React.useState(EMPTY_PRIVATE_STATE);
  const [cardDrafts, setCardDrafts] = React.useState({});
  const [createGameName, setCreateGameName] = React.useState('');
  const [createSeatKey, setCreateSeatKey] = React.useState('');
  const [joinCode, setJoinCode] = React.useState('');
  const [joinSeatKey, setJoinSeatKey] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('Checking Supabase session...');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [toast, setToast] = React.useState(null);
  const [hudPanel, setHudPanel] = React.useState(null);
  const [localSeatKey, setLocalSeatKey] = React.useState(() => {
    if (typeof window === 'undefined') {
      return 'us';
    }

    return window.localStorage.getItem(LOCAL_SEAT_KEY_STORAGE_KEY) || 'us';
  });
  const [localGameState, setLocalGameState] = React.useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(LOCAL_GAME_STATE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      window.localStorage.removeItem(LOCAL_GAME_STATE_STORAGE_KEY);
      return null;
    }
  });
  const seenAnnouncementsRef = React.useRef(new Set());
  const seenRevealKeysRef = React.useRef(new Set());
  const channelRef = React.useRef(null);
  const autoAdvanceKeyRef = React.useRef('');
  const selectedGameIdRef = React.useRef('');
  const accountRequestIdRef = React.useRef(0);
  const boardRequestIdRef = React.useRef(0);
  const privateSeatRequestIdRef = React.useRef(0);
  const lobbyRefreshTimerRef = React.useRef(null);
  const boardRefreshTimerRef = React.useRef(null);
  const [walkthroughDismissed, setWalkthroughDismissed] = React.useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === 'true';
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedGameId) {
      window.location.hash = selectedGameId;
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [selectedGameId]);

  React.useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      if (!supabase) {
        setErrorMessage(supabaseConfigError);
        setAuthReady(true);
        return;
      }

      const {
        data: { session: initialSession },
        error,
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
      }

      setSession(initialSession);
      setAuthReady(true);
    }

    loadSession();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setAuthLoading(false);
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setGames([]);
      setMemberships([]);
      if (authReady) {
        setSelectedGameId('');
      }
      setGameState(null);
      setActivePowerKey('');
      setPrivateState(EMPTY_PRIVATE_STATE);
      setStatusMessage(authReady ? 'Sign in to load your game access.' : 'Checking Supabase session...');
      return;
    }

    let isMounted = true;

    async function loadAccount() {
      const requestId = accountRequestIdRef.current + 1;
      accountRequestIdRef.current = requestId;

      try {
        setStatusMessage('Loading your account, games, and memberships...');
        setErrorMessage('');
        const data = await fetchAccountContext(session.user);

        if (!isMounted || requestId !== accountRequestIdRef.current) {
          return;
        }

        setProfile(data.profile);
        setGames(data.games);
        setMemberships(data.memberships);

        const currentSelectedId = selectedGameIdRef.current;
        if (
          currentSelectedId &&
          currentSelectedId !== LOCAL_GAME_ID &&
          !data.games.some((game) => game.id === currentSelectedId)
        ) {
          setSelectedGameId(data.games[0]?.id ?? '');
        }

        if (!data.games.length) {
          setStatusMessage('No games yet. Create one or join with a code.');
        }
      } catch (error) {
        if (!isMounted || requestId !== accountRequestIdRef.current) {
          return;
        }

        setErrorMessage(error.message);
        setStatusMessage('The account layer is not ready in Supabase yet.');
      }
    }

    loadAccount();

    return () => {
      isMounted = false;
    };
  }, [authReady, refreshKey, session?.user]);

  React.useEffect(() => {
    selectedGameIdRef.current = selectedGameId;
  }, [selectedGameId]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LOCAL_SEAT_KEY_STORAGE_KEY, localSeatKey);
  }, [localSeatKey]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!localGameState) {
      window.localStorage.removeItem(LOCAL_GAME_STATE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(LOCAL_GAME_STATE_STORAGE_KEY, JSON.stringify(localGameState));
  }, [localGameState]);

  const scheduleLobbyRefresh = React.useCallback(() => {
    if (lobbyRefreshTimerRef.current) {
      return;
    }

    lobbyRefreshTimerRef.current = window.setTimeout(() => {
      lobbyRefreshTimerRef.current = null;
      setRefreshKey((current) => current + 1);
    }, 200);
  }, []);

  const scheduleBoardRefresh = React.useCallback(() => {
    if (boardRefreshTimerRef.current) {
      return;
    }

    boardRefreshTimerRef.current = window.setTimeout(() => {
      boardRefreshTimerRef.current = null;
      setBoardRefreshTick((current) => current + 1);
    }, 150);
  }, []);

  React.useEffect(() => {
    return () => {
      if (lobbyRefreshTimerRef.current) {
        window.clearTimeout(lobbyRefreshTimerRef.current);
      }
      if (boardRefreshTimerRef.current) {
        window.clearTimeout(boardRefreshTimerRef.current);
      }
    };
  }, []);

  const localGame = React.useMemo(() => {
    if (!localGameState) {
      return null;
    }

    const seatName =
      powerOptions.find((power) => power.id === localGameState.humanPowerKey)?.name ?? localGameState.humanPowerKey;
    return {
      id: LOCAL_GAME_ID,
      name: `Local vs robots / ${seatName}`,
      status: localGameState.status,
      join_code: LOCAL_JOIN_CODE,
      round: localGameState.round,
      phase: localGameState.phase,
      current_turn_index: localGameState.currentTurnIndex,
      winner_power_key: localGameState.winnerPowerKey,
      engineState: localGameState.engineState,
      created_by: session?.user?.id ?? 'local',
      isLocal: true,
    };
  }, [localGameState, session?.user?.id]);
  const listedGames = localGame ? [localGame, ...games] : games;
  const listedMemberships = localGame
    ? [
        {
          game_id: LOCAL_GAME_ID,
          power_key: localGameState.humanPowerKey,
          membership_role: 'player',
        },
        ...memberships,
      ]
    : memberships;
  const activeGame = listedGames.find((game) => game.id === selectedGameId) ?? null;
  const isLocalGame = activeGame?.id === LOCAL_GAME_ID;
  const activeMembership = listedMemberships.find((membership) => membership.game_id === selectedGameId) ?? null;
  const isAdmin = profile?.app_role === 'admin';
  const canManageGame = Boolean(activeGame && session?.user);

  React.useEffect(() => {
    if (!session?.user) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRefreshKey((current) => current + 1);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [session?.user]);

  React.useEffect(() => {
    if (!supabase || !session?.user) {
      return undefined;
    }

    const channel = supabase
      .channel(`lobby-live-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        scheduleLobbyRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_memberships' },
        scheduleLobbyRefresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleLobbyRefresh, session?.user]);

  React.useEffect(() => {
    if (!session?.user || !activeGame || isLocalGame) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setBoardRefreshTick((current) => current + 1);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeGame, isLocalGame, session?.user]);

  React.useEffect(() => {
    if (!supabase || !session?.user || !activeGame?.id || isLocalGame) {
      return undefined;
    }

    const channel = supabase
      .channel(`game-live-${activeGame.id}`, { config: { broadcast: { self: false } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${activeGame.id}` },
        () => {
          scheduleBoardRefresh();
          scheduleLobbyRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${activeGame.id}` },
        scheduleBoardRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_memberships', filter: `game_id=eq.${activeGame.id}` },
        () => {
          scheduleBoardRefresh();
          scheduleLobbyRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_private_state' },
        (payload) => {
          const pid = payload.new?.player_id ?? payload.old?.player_id;
          if (pid && pid.startsWith(`${activeGame.id}-`)) {
            scheduleBoardRefresh();
            if (activeMembership?.power_key && pid.endsWith(`-${activeMembership.power_key}`)) {
              setPrivateSeatRefreshTick((current) => current + 1);
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_cards' },
        (payload) => {
          const pid = payload.new?.player_id ?? payload.old?.player_id;
          if (pid && pid.startsWith(`${activeGame.id}-`)) {
            scheduleBoardRefresh();
            if (activeMembership?.power_key && pid.endsWith(`-${activeMembership.power_key}`)) {
              setPrivateSeatRefreshTick((current) => current + 1);
            }
          }
        },
      )
      .on('broadcast', { event: 'toast' }, ({ payload }) => {
        setToast(payload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeGame?.id, activeMembership?.power_key, isLocalGame, scheduleBoardRefresh, scheduleLobbyRefresh, session?.user]);

  React.useEffect(() => {
    if (!session?.user || !activeGame) {
      setGameState(null);
      setActivePowerKey('');
      return;
    }

    if (isLocalGame) {
      setGameState(localGameState);
      setActivePowerKey((current) => {
        if (!localGameState) {
          return '';
        }

        if (current && localGameState.managerState?.[current]) {
          return current;
        }

        return localGameState.humanPowerKey ?? '';
      });
      setStatusMessage('Loaded local robot match.');
      return;
    }

    let isMounted = true;

    async function loadGame() {
      const requestId = boardRequestIdRef.current + 1;
      boardRequestIdRef.current = requestId;

      try {
        setStatusMessage(`Loading ${activeGame.name}...`);

        if (canManageGame && gameNeedsRulesInitialization(activeGame)) {
          setStatusMessage(`Reinitializing ${activeGame.name} with the Google Doc rules...`);
          await initializeGameFromRules(activeGame.id);
          if (isMounted && requestId === boardRequestIdRef.current) {
            scheduleLobbyRefresh();
            scheduleBoardRefresh();
          }
          return;
        }

        const board = await fetchGameBoard(activeGame.id, { includePrivateState: canManageGame });

        if (!isMounted || requestId !== boardRequestIdRef.current) {
          return;
        }

        const nextPowerKey = canManageGame
          ? board.players.some((player) => player.power_key === activePowerKey)
            ? activePowerKey
            : board.players[0]?.power_key ?? ''
          : activeMembership?.power_key ?? '';

        setGameState({
          ...board,
          round: board.game?.round ?? activeGame.round,
          phase: board.game?.phase ?? activeGame.phase ?? 'choose_actions',
          currentTurnIndex: board.game?.current_turn_index ?? activeGame.current_turn_index ?? 0,
          winnerPowerKey: board.game?.winner_power_key ?? activeGame.winner_power_key ?? null,
          engineState: board.game?.engineState ?? activeGame.engineState ?? {},
          status: board.game?.status ?? activeGame.status,
          joinCode: board.game?.join_code ?? activeGame.join_code,
        });
        setActivePowerKey(nextPowerKey);
        setStatusMessage(`Loaded ${activeGame.name}.`);
      } catch (error) {
        if (!isMounted || requestId !== boardRequestIdRef.current) {
          return;
        }

        setErrorMessage(error.message);
      }
    }

    loadGame();

    return () => {
      isMounted = false;
    };
  }, [
    activeGame,
    activeMembership?.power_key,
    boardRefreshTick,
    canManageGame,
    isLocalGame,
    localGameState,
    scheduleBoardRefresh,
    scheduleLobbyRefresh,
    session?.user,
  ]);

  const boardPlayers = gameState?.players ?? [];
  const liveGameStatus = gameState?.status ?? activeGame?.status ?? 'active';
  const liveJoinCode = gameState?.joinCode ?? activeGame?.join_code ?? '';
  const activePlayer = boardPlayers.find((player) => player.power_key === activePowerKey) ?? null;
  const managedSeat = canManageGame && activePowerKey ? gameState?.managerState?.[activePowerKey] ?? null : null;

  React.useEffect(() => {
    if (!session?.user) {
      setPrivateState(EMPTY_PRIVATE_STATE);
      return;
    }

    if (isLocalGame) {
      if (!activePowerKey) {
        setPrivateState(EMPTY_PRIVATE_STATE);
        return;
      }

      if (managedSeat) {
        setPrivateState({
          objective: managedSeat.objective ?? '',
          selectedAction: managedSeat.selectedAction ?? '',
          selectedCardKey: managedSeat.selectedCardKey ?? '',
          selectedActionPayload: managedSeat.selectedActionPayload ?? {},
          declaredVictory: Boolean(managedSeat.declaredVictory),
          secretState: managedSeat.secretState ?? {},
          cards: managedSeat.hand ?? [],
        });
      }
      return;
    }

    if (!gameState || !activePowerKey) {
      setPrivateState(EMPTY_PRIVATE_STATE);
      return;
    }

    if (managedSeat) {
      setPrivateState({
        objective: managedSeat.objective ?? '',
        selectedAction: managedSeat.selectedAction ?? '',
        selectedCardKey: managedSeat.selectedCardKey ?? '',
        selectedActionPayload: managedSeat.selectedActionPayload ?? {},
        declaredVictory: Boolean(managedSeat.declaredVictory),
        secretState: managedSeat.secretState ?? {},
        cards: managedSeat.hand ?? [],
      });
      return;
    }

    if (!activePlayer) {
      return;
    }

    let isMounted = true;

    async function loadPrivateSeatData() {
      const requestId = privateSeatRequestIdRef.current + 1;
      privateSeatRequestIdRef.current = requestId;

      try {
        const data = await fetchPrivateSeat(activePlayer.id);

        if (!isMounted || requestId !== privateSeatRequestIdRef.current) {
          return;
        }

        setPrivateState(data);
      } catch (error) {
        if (!isMounted || requestId !== privateSeatRequestIdRef.current) {
          return;
        }

        setPrivateState(EMPTY_PRIVATE_STATE);
        setErrorMessage(error.message);
      }
    }

    loadPrivateSeatData();

    return () => {
      isMounted = false;
    };
  }, [activePlayer?.id, activePowerKey, isLocalGame, managedSeat, privateSeatRefreshTick, session?.user]);

  React.useEffect(() => {
    if (!activePowerKey || !privateState.cards.length) {
      setCardDrafts({});
      return;
    }

    setCardDrafts((current) =>
      privateState.cards.reduce((accumulator, card) => {
        const cardDefinition = getActionCard(card.definitionKey ?? getBaseCardKey(card.cardKey));
        const sourcePayload =
          privateState.selectedCardKey === card.cardKey
            ? privateState.selectedActionPayload
            : current[card.cardKey] ?? buildDefaultSelectionPayload(cardDefinition, activePowerKey);

        accumulator[card.cardKey] = sanitizeSelectionPayload(cardDefinition, sourcePayload, activePowerKey);
        return accumulator;
      }, {}),
    );
  }, [activePowerKey, privateState.cards, privateState.selectedActionPayload, privateState.selectedCardKey]);

  const currentPhase = gameState?.phase ?? 'choose_actions';
  const currentPhaseDefinition = getPhaseDefinition(currentPhase);
  const currentEvent = getCurrentEvent({ phase: currentPhase, engineState: gameState?.engineState ?? {} });
  const currentOrder = gameState?.engineState?.actionOrder ?? turnOrder;
  const nextResolveIndex = getNextResolveIndex(
    currentOrder,
    gameState?.engineState?.revealedActions ?? {},
    gameState?.currentTurnIndex ?? 0,
  );
  const currentTurnPowerKey =
    currentPhase === 'resolve_actions' ? currentOrder[nextResolveIndex] ?? null : null;
  const currentTurnPlayer = boardPlayers.find((player) => player.power_key === currentTurnPowerKey) ?? null;
  const winner = boardPlayers.find((player) => player.power_key === gameState?.winnerPowerKey) ?? null;
  const revealedActions = gameState?.engineState?.revealedActions ?? {};
  const publicLog = gameState?.engineState?.publicLog ?? [];

  const round = gameState?.round ?? 0;
  React.useEffect(() => {
    if (canManageGame) return;
    for (const [powerKey, reveal] of Object.entries(revealedActions)) {
      const key = `${round}:${powerKey}`;
      if (seenRevealKeysRef.current.has(key)) continue;
      seenRevealKeysRef.current.add(key);
      const player = boardPlayers.find((p) => p.power_key === powerKey);
      setToast({
        title: `${player?.name ?? powerKey} resolved`,
        body: `${reveal.cardName}: ${reveal.outcome}`,
        durationMs: 2200,
      });
    }
  }, [revealedActions, round, canManageGame, boardPlayers]);
  const lobbyMembers = gameState?.lobbyMembers ?? [];
  const actionLocks = gameState?.actionLocks ?? {};
  const joinedPlayers = lobbyMembers.filter((member) => member.membership_role === 'player' && member.power_key);
  const observerMembers = lobbyMembers.filter((member) => member.membership_role === 'observer');
  const joinedPlayerByPower = new Map(joinedPlayers.map((member) => [member.power_key, member]));
  const takenPowerKeys = new Set(
    joinedPlayers.map((member) => member.power_key).filter(Boolean),
  );
  const availableSeats = isLocalGame
    ? boardPlayers
    : boardPlayers.filter(
        (player) => !takenPowerKeys.has(player.power_key) || player.power_key === activeMembership?.power_key,
      );
  const openSeatCount = boardPlayers.length - joinedPlayers.length;
  const activeGames = listedGames.filter((game) => game.status === 'active');
  const pastGames = listedGames.filter((game) => game.status !== 'active');
  const canEditSeatAction = Boolean(
    activePlayer &&
      currentPhase === 'choose_actions' &&
      (canManageGame || activeMembership?.power_key === activePlayer.power_key),
  );
  const canEditVictory = Boolean(
    activePlayer &&
      currentPhase === 'victory_check' &&
      (canManageGame || activeMembership?.power_key === activePlayer.power_key),
  );
  const objectiveEligible = Boolean(
    activePlayer && isObjectiveEligible(boardPlayers, activePlayer.power_key, privateState.secretState),
  );
  const parsedObjective = parseObjectiveText(privateState.objective);
  const objectiveChecks = parsedObjective?.conditions?.map((condition) =>
    evaluateObjectiveCondition(condition, boardPlayers, activePowerKey),
  ) ?? [];
  const objectiveMetCount = objectiveChecks.filter((check) => check.met).length;
  const objectiveRollSummary = getObjectiveRollSummary(
    parsedObjective,
    activePlayer,
    boardPlayers,
    objectiveEligible,
  );
  const currentEventEffects = React.useMemo(() => getEventEffectSummaries(currentEvent), [currentEvent]);
  const actionDeckReference = React.useMemo(() => getActionDeckReference(), []);
  const eventReference = React.useMemo(() => getEventReference(), []);
  const commitLocalState = React.useCallback((nextState) => {
    setLocalGameState(nextState);
    setGameState(nextState);
  }, []);

  React.useEffect(() => {
    if (!isLocalGame || !gameState?.managerState || !activePowerKey || actionLoading) {
      return;
    }

    if (currentPhase === 'choose_actions') {
      let changed = false;
      const nextManagerState = { ...gameState.managerState };
      const nextEventReadySelections = { ...((gameState.engineState ?? {}).eventReadySelections ?? {}) };

      for (const powerKey of turnOrder) {
        if (powerKey === activePowerKey || nextManagerState[powerKey]?.selectedCardKey) {
          continue;
        }

        const hand = nextManagerState[powerKey]?.hand ?? [];
        if (!hand.length) {
          continue;
        }

        const chosenCard = chooseRandom(hand);
        const cardDefinition = getActionCard(chosenCard.definitionKey ?? getBaseCardKey(chosenCard.cardKey));
        const payload = sanitizeSelectionPayload(
          cardDefinition,
          buildRandomSelectionPayload(cardDefinition, powerKey),
          powerKey,
        );

        nextManagerState[powerKey] = {
          ...nextManagerState[powerKey],
          selectedAction: chosenCard.name,
          selectedCardKey: chosenCard.cardKey,
          selectedActionPayload: payload,
          declaredVictory: false,
        };
        nextEventReadySelections[powerKey] = chosenCard.cardKey;
        changed = true;
      }

      if (changed) {
        commitLocalState({
          ...gameState,
          managerState: nextManagerState,
          engineState: {
            ...(gameState.engineState ?? {}),
            eventReadySelections: nextEventReadySelections,
          },
        });
      }
      return;
    }

    if (currentPhase === 'victory_check') {
      let changed = false;
      const nextManagerState = { ...gameState.managerState };
      const nextVictoryReadySelections = { ...((gameState.engineState ?? {}).victoryReadySelections ?? {}) };

      for (const powerKey of turnOrder) {
        if (powerKey === activePowerKey) {
          continue;
        }

        const { shouldDeclareVictory } = getLocalVictoryDecision(
          gameState.players,
          powerKey,
          nextManagerState[powerKey],
        );

        if (nextManagerState[powerKey]?.declaredVictory !== shouldDeclareVictory) {
          nextManagerState[powerKey] = {
            ...nextManagerState[powerKey],
            declaredVictory: shouldDeclareVictory,
          };
          changed = true;
        }

        if (!nextVictoryReadySelections[powerKey]) {
          nextVictoryReadySelections[powerKey] = true;
          changed = true;
        }
      }

      if (changed) {
        commitLocalState({
          ...gameState,
          managerState: nextManagerState,
          engineState: {
            ...(gameState.engineState ?? {}),
            victoryReadySelections: nextVictoryReadySelections,
          },
        });
      }
    }
  }, [actionLoading, activePowerKey, commitLocalState, currentPhase, gameState, isLocalGame]);

  const selectedCardKeysByPower = React.useMemo(() => {
    const next = Object.fromEntries(
      turnOrder.map((powerKey) => [powerKey, actionLocks[powerKey] ? '__locked__' : '']),
    );

    if (gameState?.managerState) {
      for (const powerKey of turnOrder) {
        next[powerKey] = gameState.managerState[powerKey]?.selectedCardKey ?? '';
      }
    }

    if (activePowerKey) {
      next[activePowerKey] = privateState.selectedCardKey ?? next[activePowerKey] ?? '';
    }

    return next;
  }, [actionLocks, activePowerKey, gameState?.managerState, privateState.selectedCardKey]);
  const lockedSeatCount = turnOrder.filter((powerKey) => Boolean(selectedCardKeysByPower[powerKey])).length;
  const roundStartSnapshot = gameState?.engineState?.roundStartSnapshot ?? {};
  const eventReadySelections = gameState?.engineState?.eventReadySelections ?? {};
  const readySeatCount = turnOrder.filter(
    (powerKey) => selectedCardKeysByPower[powerKey] && eventReadySelections[powerKey] === selectedCardKeysByPower[powerKey],
  ).length;
  const allSeatsReadyForEvent =
    turnOrder.every((powerKey) => selectedCardKeysByPower[powerKey]) &&
    readySeatCount === turnOrder.length;
  const victoryReadySelections = gameState?.engineState?.victoryReadySelections ?? {};
  const victoryReadySeatCount = turnOrder.filter((powerKey) => Boolean(victoryReadySelections[powerKey])).length;
  const allSeatsReadyForVictory = currentPhase === 'victory_check' && victoryReadySeatCount === turnOrder.length;
  const isCurrentSeatVictoryReady = Boolean(activePowerKey && victoryReadySelections[activePowerKey]);
  const canSignalEventReady = Boolean(
    activeMembership?.power_key &&
      activeMembership.power_key === activePowerKey &&
      currentPhase === 'choose_actions' &&
      privateState.selectedCardKey,
  );
  const isCurrentSeatReady =
    canSignalEventReady && eventReadySelections[activePowerKey] === privateState.selectedCardKey;
  const walkthroughSteps = [
    'Pick a game from the Active games list above. The actual board appears below under Shared board.',
    'Share the six-letter join code with other players. They can paste it into Join game to enter the lobby.',
    'Claim a seat if one is open. Once all five actor seats are filled, additional joins are blocked.',
    'During Choose Actions, watch the lock tracker to see who is ready before advancing the round.',
  ];
  const announcementKey = activeGame ? `${activeGame.id}:${gameState?.round ?? 0}:${currentPhase}` : '';
  const recommendedPanel =
    currentPhase === 'choose_actions' && !privateState.selectedCardKey
      ? 'cards'
      : currentPhase === 'victory_check'
        ? 'objective'
        : currentPhase === 'resolve_actions'
          ? 'log'
          : 'event';
  const nextStepMessage =
    currentPhase === 'choose_actions' && !privateState.selectedCardKey
      ? 'Next: open Cards and lock one action face-down.'
      : currentPhase === 'choose_actions'
        ? `Waiting for the rest of the table. ${readySeatCount}/${turnOrder.length} players ready.`
        : currentPhase === 'resolve_event'
          ? 'Global event is revealing and resolves immediately.'
          : currentPhase === 'resolve_actions'
            ? 'Watch the action cards flip in order and the board update.'
            : currentPhase === 'victory_check' && !winner
              ? isCurrentSeatVictoryReady
                ? `Waiting for all players. ${victoryReadySeatCount}/${turnOrder.length} ready to advance.`
                : 'Open Win tab to check objectives and confirm you are ready to advance.'
              : winner
                ? `${winner.name} has won.`
                : 'Review objectives while the game checks for wins and prepares the next round.';

  React.useEffect(() => {
    if (!activeGame || !gameState) {
      setToast(null);
      return;
    }

    const seenAnnouncements = seenAnnouncementsRef.current;

    if (seenAnnouncements.has(announcementKey)) {
      return;
    }

    if (currentPhase === 'resolve_event' && currentEvent) {
      setToast({
        title: `Global event: ${currentEvent.title}`,
        body: [currentEvent.details, ...currentEventEffects].filter(Boolean).join(' • '),
        meta: `Round ${gameState.round} / Global Event Phase`,
        durationMs: 2200,
      });
      seenAnnouncements.add(announcementKey);
      return;
    }

    if (currentPhase === 'resolve_actions') {
      setToast({
        title: `Round ${gameState.round} action resolution`,
        body: `Players now reveal actions in this order: ${currentOrder
          .map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey)?.short_name ?? powerKey)
          .join(' > ')}.`,
        meta: 'Actions are public now. Watch the log and lock tracker as each seat resolves.',
        durationMs: 2200,
      });
      seenAnnouncements.add(announcementKey);
      return;
    }

    if (currentPhase === 'victory_check') {
      setToast({
        title: `Round ${gameState.round} victory check`,
        body: 'Action resolution is complete. Check the board, hidden objectives, and any victory declarations before continuing.',
        meta: winner ? `${winner.name} has already been determined as the winner.` : 'No winner is locked yet.',
        durationMs: winner ? 2600 : 1800,
      });
      seenAnnouncements.add(announcementKey);
      return;
    }
  }, [activeGame, announcementKey, boardPlayers, currentEvent, currentEventEffects, currentOrder, currentPhase, gameState, winner]);

  React.useEffect(() => {
    if (!toast?.durationMs) {
      return undefined;
    }

    const timerId = window.setTimeout(() => setToast(null), toast.durationMs);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  React.useEffect(() => {
    if (!canManageGame || !activeGame || !gameState?.players?.length || !gameState?.managerState || actionLoading) {
      autoAdvanceKeyRef.current = '';
      return undefined;
    }

    const shouldAdvance =
      (currentPhase === 'choose_actions' && allSeatsReadyForEvent) ||
      currentPhase === 'resolve_event' ||
      (currentPhase === 'resolve_actions' && !winner) ||
      (currentPhase === 'victory_check' && !winner && allSeatsReadyForVictory);

    if (!shouldAdvance) {
      autoAdvanceKeyRef.current = '';
      return undefined;
    }

    const advanceKey = `${activeGame.id}:${gameState.round}:${currentPhase}:${gameState.currentTurnIndex ?? 0}`;
    if (autoAdvanceKeyRef.current === advanceKey) {
      return undefined;
    }

    autoAdvanceKeyRef.current = advanceKey;
    const delayMs =
      currentPhase === 'choose_actions'
        ? 500
        : currentPhase === 'resolve_event'
          ? 1400
          : currentPhase === 'resolve_actions'
            ? 1700
            : 1900;

    const timerId = window.setTimeout(() => {
      handleAdvanceFlow(true);
    }, delayMs);

    return () => window.clearTimeout(timerId);
  }, [
    actionLoading,
    activeGame,
    allSeatsReadyForEvent,
    canManageGame,
    currentPhase,
    gameState,
    winner,
  ]);

  async function signInWithGoogle() {
    if (!supabase) {
      setErrorMessage(supabaseConfigError);
      return;
    }

    setAuthLoading(true);
    setErrorMessage('');

    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      setErrorMessage(error.message);
      setAuthLoading(false);
    }
  }

  async function signOut() {
    if (!supabase) {
      setErrorMessage(supabaseConfigError);
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetProfileCache();
    setSelectedGameId('');
    setAuthLoading(false);
  }

  function dismissWalkthrough() {
    setWalkthroughDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, 'true');
    }
  }

  function handleStartLocalGame(event) {
    event.preventDefault();
    const nextState = buildLocalGameState(localSeatKey);
    setErrorMessage('');
    setWaitingOnPlayers([]);
    setHudPanel(null);
    setToast(null);
    commitLocalState(nextState);
    setSelectedGameId(LOCAL_GAME_ID);
    setActivePowerKey(localSeatKey);
    setStatusMessage('Local robot match started.');
  }

  async function handleCreateGame(event) {
    event.preventDefault();

    try {
      setActionLoading(true);
      setErrorMessage('');
      const fallbackName = `${(profile?.full_name || session?.user?.email || 'Player').split(' ')[0]}'s game`;
      const gameId = await createGame((createGameName.trim() || fallbackName).trim(), '');
      await initializeGameFromRules(gameId);
      if (createSeatKey) {
        await claimSeat(gameId, createSeatKey);
      }
      setCreateGameName('');
      setCreateSeatKey('');
      setSelectedGameId(gameId);
      setRefreshKey((current) => current + 1);
      setStatusMessage('Game created with the Rules-tab ruleset.');
    } catch (error) {
      setErrorMessage(error.message);
      setStatusMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleJoinGame(event) {
    event.preventDefault();

    try {
      setActionLoading(true);
      setErrorMessage('');
      const gameId = await joinGameByCode(joinCode.trim().toUpperCase(), joinSeatKey);
      setJoinCode('');
      setJoinSeatKey('');
      setSelectedGameId(gameId);
      setRefreshKey((current) => current + 1);
      setStatusMessage('Joined game.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleJoinSelectedGame() {
    if (!activeGame || !liveJoinCode) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      const gameId = await joinGameByCode(liveJoinCode, '');
      setSelectedGameId(gameId);
      setRefreshKey((current) => current + 1);
      setStatusMessage('Joined selected game.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaimSeat(powerKey) {
    if (!activeGame) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await claimSeat(activeGame.id, powerKey);
      setRefreshKey((current) => current + 1);
      setStatusMessage(`Claimed seat ${powerKey}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCompleteGame() {
    if (!activeGame) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await updateGameStatus(activeGame.id, liveGameStatus === 'completed' ? 'active' : 'completed');
      setRefreshKey((current) => current + 1);
      setStatusMessage(
        liveGameStatus === 'completed' ? 'Game moved back to active.' : 'Game marked as completed.',
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteGame() {
    if (!activeGame || !isAdmin) {
      return;
    }

    const confirmed = window.confirm(`Delete "${activeGame.name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await deleteGame(activeGame.id);
      setSelectedGameId('');
      setGameState(null);
      setActivePowerKey('');
      setPrivateState(EMPTY_PRIVATE_STATE);
      setRefreshKey((current) => current + 1);
      setStatusMessage(`Deleted ${activeGame.name}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteGameFromLobby(game) {
    if (!game || !isAdmin) {
      return;
    }

    const confirmed = window.confirm(`Delete "${game.name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await deleteGame(game.id);
      if (selectedGameId === game.id) {
        setSelectedGameId('');
        setGameState(null);
        setActivePowerKey('');
        setPrivateState(EMPTY_PRIVATE_STATE);
      }
      setRefreshKey((current) => current + 1);
      setStatusMessage(`Deleted ${game.name}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeaveGame() {
    if (isLocalGame) {
      setSelectedGameId('');
      setGameState(null);
      setStatusMessage('Returned to the lobby.');
      return;
    }

    if (!activeGame || !activeMembership) {
      return;
    }

    const seatLabel = activeMembership.power_key
      ? ` and release ${activeMembership.power_key}`
      : '';
    const confirmed = window.confirm(`Leave "${activeGame.name}"${seatLabel}?`);

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await leaveGame(activeGame.id);
      setSelectedGameId('');
      setGameState(null);
      setActivePowerKey('');
      setPrivateState(EMPTY_PRIVATE_STATE);
      setRefreshKey((current) => current + 1);
      setStatusMessage(`You left ${activeGame.name}.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSelectAction(card) {
    if (!canEditSeatAction || !activePlayer) {
      return;
    }

    if (isLocalGame) {
      const cardDefinition = getActionCard(card.definitionKey ?? getBaseCardKey(card.cardKey));
      const payload = sanitizeSelectionPayload(cardDefinition, cardDrafts[card.cardKey], activePowerKey);
      const nextEngineState = {
        ...(gameState.engineState ?? {}),
        eventReadySelections: {
          ...((gameState.engineState ?? {}).eventReadySelections ?? {}),
          [activePowerKey]: card.cardKey,
        },
      };

      commitLocalState({
        ...gameState,
        engineState: nextEngineState,
        managerState: {
          ...gameState.managerState,
          [activePowerKey]: {
            ...gameState.managerState[activePowerKey],
            selectedAction: card.name,
            selectedCardKey: card.cardKey,
            selectedActionPayload: payload,
            declaredVictory: false,
          },
        },
      });
      setPrivateState((current) => ({
        ...current,
        selectedAction: card.name,
        selectedCardKey: card.cardKey,
        selectedActionPayload: payload,
        declaredVictory: false,
      }));
      setStatusMessage(`Locked ${card.name} for ${activePlayer.name}.`);
      setToast({
        title: 'Action locked',
        body: 'Your card is face-down and the robots are committing theirs.',
        meta: 'The round will advance once every seat is locked.',
        durationMs: 1800,
        tone: 'card-lock',
      });
      setHudPanel(null);
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      const cardDefinition = getActionCard(card.definitionKey ?? getBaseCardKey(card.cardKey));
      const payload = sanitizeSelectionPayload(cardDefinition, cardDrafts[card.cardKey], activePowerKey);
      const nextEngineState = {
        ...(gameState.engineState ?? {}),
        eventReadySelections: {
          ...((gameState.engineState ?? {}).eventReadySelections ?? {}),
          [activePowerKey]: card.cardKey,
        },
      };
      await lockTurnSelection(activePlayer.id, card.cardKey, card.name, payload);

      setPrivateState((current) => ({
        ...current,
        selectedAction: card.name,
        selectedCardKey: card.cardKey,
        selectedActionPayload: payload,
      }));

      setGameState((current) =>
        current && current.managerState?.[activePowerKey]
          ? {
              ...current,
              engineState: nextEngineState,
              managerState: {
                ...current.managerState,
                [activePowerKey]: {
                  ...current.managerState[activePowerKey],
                  selectedAction: card.name,
                  selectedCardKey: card.cardKey,
                  selectedActionPayload: payload,
                },
              },
            }
          : current,
      );

      setStatusMessage(`Locked ${card.name} for ${activePlayer.name}.`);
      setToast({
        title: 'Action locked',
        body: 'Your card is face-down and ready for the reveal.',
        meta: 'Other players can only see that you are locked in.',
        durationMs: 1800,
        tone: 'card-lock',
      });
      channelRef.current?.send({
        type: 'broadcast',
        event: 'toast',
        payload: { title: 'Card locked', body: `${activePlayer.name} locked their action.`, durationMs: 1600 },
      });
      setHudPanel(null);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVictoryToggle(declared) {
    if (!canEditVictory || !activePlayer) {
      return;
    }

    if (isLocalGame) {
      commitLocalState({
        ...gameState,
        managerState: {
          ...gameState.managerState,
          [activePowerKey]: {
            ...gameState.managerState[activePowerKey],
            declaredVictory: declared,
          },
        },
      });
      setPrivateState((current) => ({ ...current, declaredVictory: declared }));
      setStatusMessage(declared ? 'Victory attempt declared.' : 'Victory attempt withdrawn.');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      await setVictoryDeclaration(activePlayer.id, declared);
      setPrivateState((current) => ({ ...current, declaredVictory: declared }));
      setGameState((current) =>
        current && current.managerState?.[activePowerKey]
          ? {
              ...current,
              managerState: {
                ...current.managerState,
                [activePowerKey]: {
                  ...current.managerState[activePowerKey],
                  declaredVictory: declared,
                },
              },
            }
          : current,
      );
      setStatusMessage(declared ? 'Victory attempt declared.' : 'Victory attempt withdrawn.');
      channelRef.current?.send({
        type: 'broadcast',
        event: 'toast',
        payload: {
          title: declared ? 'Victory declared' : 'Victory withdrawn',
          body: `${activePlayer.name} ${declared ? 'declared a victory attempt.' : 'withdrew their victory attempt.'}`,
          durationMs: 2000,
        },
      });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdvanceFlow() {
    if (!canManageGame || !activeGame || !gameState?.players?.length || !gameState?.managerState) {
      return;
    }

    if (isLocalGame) {
      const nextState = advanceGameState({
        players: gameState.players,
        managerState: gameState.managerState,
        phase: currentPhase,
        round: gameState.round,
        currentTurnIndex: currentPhase === 'resolve_actions' ? nextResolveIndex : gameState.currentTurnIndex ?? 0,
        engineState: gameState.engineState ?? {},
      });

      if (nextState.blocked?.length) {
        const missingPlayers = nextState.blocked
          .map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey))
          .filter(Boolean);
        setWaitingOnPlayers(missingPlayers);
        setStatusMessage(
          `Waiting on action choices from ${missingPlayers.map((player) => player.name).join(', ')}.`,
        );
        return;
      }

      if (currentPhase === 'victory_check') {
        nextState.engineState = { ...nextState.engineState, victoryReadySelections: {} };
      }

      commitLocalState(nextState);

      if (activePowerKey && nextState.managerState?.[activePowerKey]) {
        const managedSeat = nextState.managerState[activePowerKey];
        setPrivateState({
          objective: managedSeat.objective ?? '',
          selectedAction: managedSeat.selectedAction ?? '',
          selectedCardKey: managedSeat.selectedCardKey ?? '',
          selectedActionPayload: managedSeat.selectedActionPayload ?? {},
          declaredVictory: Boolean(managedSeat.declaredVictory),
          secretState: managedSeat.secretState ?? {},
          cards: managedSeat.hand ?? [],
        });
      }

      setStatusMessage(nextState.statusMessage);
      if (currentPhase === 'resolve_actions') {
        const actingPowerKey = gameState.engineState?.actionOrder?.[nextResolveIndex] ?? currentTurnPowerKey;
        const actingPlayerLabel =
          boardPlayers.find((player) => player.power_key === actingPowerKey)?.name ?? 'A player';
        const revealedAction = nextState.engineState?.revealedActions?.[actingPowerKey];
        setToast({
          title: `${actingPlayerLabel} resolved`,
          body: `${revealedAction?.cardName ?? 'Action'}: ${revealedAction?.outcome ?? nextState.statusMessage}`,
          durationMs: 2200,
        });
      } else if (currentPhase === 'victory_check' && !nextState.winnerPowerKey) {
        setToast({
          title: 'No victory this round',
          body: `Round ${nextState.round} begins in a moment.`,
          durationMs: 1800,
        });
      }
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');

      const nextState = advanceGameState({
        players: gameState.players,
        managerState: gameState.managerState,
        phase: currentPhase,
        round: gameState.round,
        currentTurnIndex: currentPhase === 'resolve_actions' ? nextResolveIndex : gameState.currentTurnIndex ?? 0,
        engineState: gameState.engineState ?? {},
      });

      if (nextState.blocked?.length) {
        const missingPlayers = nextState.blocked
          .map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey))
          .filter(Boolean);
        setWaitingOnPlayers(missingPlayers);
        setToast({
          title: 'Still waiting on action locks',
          body: `The round cannot advance yet. Missing locks: ${missingPlayers
            .map((player) => player.short_name)
            .join(', ')}.`,
          meta: 'Each active seat must lock one card before the event can be revealed.',
          durationMs: 1800,
        });
        setStatusMessage(
          `Waiting on action choices from ${missingPlayers.map((player) => player.name).join(', ')}.`,
        );
        return;
      }

      if (currentPhase === 'victory_check') {
        nextState.engineState = { ...nextState.engineState, victoryReadySelections: {} };
      }

      await persistGameState({
        gameId: activeGame.id,
        gameUpdate: {
          round: nextState.round,
          phase: nextState.phase,
          current_turn_index: nextState.currentTurnIndex,
          status: nextState.status,
          completed_at: nextState.status === 'completed' ? new Date().toISOString() : null,
          winner_power_key: nextState.winnerPowerKey,
          engine_state: nextState.engineState,
        },
        players: nextState.players,
        managerState: nextState.managerState,
      });

      setGameState((current) =>
        current
          ? {
              ...current,
              players: nextState.players,
              managerState: nextState.managerState,
              round: nextState.round,
              phase: nextState.phase,
              currentTurnIndex: nextState.currentTurnIndex,
              winnerPowerKey: nextState.winnerPowerKey,
              engineState: nextState.engineState,
            }
          : current,
      );

      if (activePowerKey && nextState.managerState?.[activePowerKey]) {
        const managedSeat = nextState.managerState[activePowerKey];
        setPrivateState({
          objective: managedSeat.objective ?? '',
          selectedAction: managedSeat.selectedAction ?? '',
          selectedCardKey: managedSeat.selectedCardKey ?? '',
          selectedActionPayload: managedSeat.selectedActionPayload ?? {},
          declaredVictory: Boolean(managedSeat.declaredVictory),
          secretState: managedSeat.secretState ?? {},
          cards: managedSeat.hand ?? [],
        });
      }

      setStatusMessage(nextState.statusMessage);
      if (currentPhase === 'resolve_actions') {
        const actingPowerKey = gameState.engineState?.actionOrder?.[nextResolveIndex] ?? currentTurnPowerKey;
        const actingPlayerLabel =
          boardPlayers.find((player) => player.power_key === actingPowerKey)?.name ?? 'A player';
        const revealedAction = nextState.engineState?.revealedActions?.[actingPowerKey];
        setToast({
          title: `${actingPlayerLabel} resolved`,
          body: `${revealedAction?.cardName ?? 'Action'}: ${revealedAction?.outcome ?? nextState.statusMessage}`,
          durationMs: 2200,
        });
      } else if (currentPhase === 'victory_check' && !nextState.winnerPowerKey) {
        setToast({
          title: 'No victory this round',
          body: `Round ${nextState.round} begins in a moment.`,
          durationMs: 1800,
        });
      }
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSignalVictoryReady() {
    if (!activeGame || !gameState || !activePowerKey || currentPhase !== 'victory_check') {
      return;
    }

    if (isLocalGame) {
      const nextEngineState = {
        ...(gameState.engineState ?? {}),
        victoryReadySelections: {
          ...((gameState.engineState ?? {}).victoryReadySelections ?? {}),
          [activePowerKey]: true,
        },
      };

      commitLocalState({
        ...gameState,
        engineState: nextEngineState,
      });
      setStatusMessage(`Ready to advance. ${victoryReadySeatCount + 1}/${turnOrder.length} players ready.`);
      setToast({
        title: 'You are ready',
        body: `Waiting on ${turnOrder.length - (victoryReadySeatCount + 1)} more player(s) to advance.`,
        durationMs: 1800,
      });
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');
      const nextEngineState = {
        ...(gameState.engineState ?? {}),
        victoryReadySelections: {
          ...((gameState.engineState ?? {}).victoryReadySelections ?? {}),
          [activePowerKey]: true,
        },
      };
      await signalVictoryReady(activePlayer.id);

      setGameState((current) =>
        current
          ? {
              ...current,
              engineState: nextEngineState,
            }
          : current,
      );
      setStatusMessage(`Ready to advance. ${victoryReadySeatCount + 1}/${turnOrder.length} players ready.`);
      setToast({
        title: 'You are ready',
        body: `Waiting on ${turnOrder.length - (victoryReadySeatCount + 1)} more player(s) to advance.`,
        durationMs: 1800,
      });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  const activeGameReady = Boolean(activeGame && gameState);
  const advanceFlowLabel =
    currentPhase === 'choose_actions'
      ? 'Advance round'
      : currentPhase === 'resolve_event'
        ? 'Resolve event'
        : currentPhase === 'resolve_actions'
          ? `Flip ${currentTurnPlayer?.short_name ?? 'next'} card`
          : winner
            ? 'Victory locked'
            : 'Resolve victory and next round';
  const canAdvanceFlow =
    canManageGame &&
    !actionLoading &&
    !(currentPhase === 'victory_check' && Boolean(winner)) &&
    (currentPhase !== 'victory_check' || allSeatsReadyForVictory);
  const missingLockPlayers = turnOrder
    .filter((powerKey) => !selectedCardKeysByPower[powerKey])
    .map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey))
    .filter(Boolean);
  const tableHeadline =
    currentPhase === 'choose_actions'
      ? missingLockPlayers.length
        ? `Waiting on ${missingLockPlayers.map((player) => player.short_name).join(', ')}`
        : `All seats locked. ${readySeatCount}/${turnOrder.length} players ready.`
      : currentPhase === 'resolve_event'
        ? `${currentEvent?.title ?? 'Global event'} is on deck`
        : currentPhase === 'resolve_actions'
          ? `${currentTurnPlayer?.name ?? 'Next actor'} is resolving`
          : winner
            ? `${winner.name} has won`
            : 'Review objectives and victory declarations';
  const tableSubline =
    currentPhase === 'choose_actions'
      ? missingLockPlayers.length
        ? `${lockedSeatCount}/${turnOrder.length} seats locked this round.`
        : `${readySeatCount}/${turnOrder.length} players ready to reveal the event.`
      : currentPhase === 'resolve_event'
        ? currentEvent?.details ?? 'The revealed global event resolves before any actions.'
        : currentPhase === 'resolve_actions'
          ? `Action order: ${currentOrder
              .map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey)?.short_name ?? powerKey)
              .join(' -> ')}.`
          : winner
            ? 'The game is complete.'
            : 'Victory declarations are checked before the next round begins.';
  const dockButtons = [
    { key: 'cards', label: 'Cards', badge: 'A' },
    { key: 'rules', label: 'Rules', badge: 'R' },
    { key: 'event', label: 'Event', badge: 'E' },
    { key: 'tracks', label: 'Tracks', badge: 'T' },
    { key: 'objective', label: 'Win', badge: 'W' },
    { key: 'seats', label: 'Seats', badge: 'S' },
    { key: 'log', label: 'Log', badge: 'L' },
  ];

  if (!authReady) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <p className="eyebrow">Competing Futures / access gate</p>
          <h1>Checking your session and game access.</h1>
          <p className="mini-label">{statusMessage}</p>
        </section>
      </main>
    );
  }

  if (!supabase) {
    return <ConfigErrorPage message={supabaseConfigError} />;
  }

  if (!session) {
    return <LoginPage loading={authLoading} onLogin={signInWithGoogle} errorMessage={errorMessage} />;
  }

  return (
    <>
      {toast ? (
        <section className={toast.tone ? `game-toast ${toast.tone}` : 'game-toast'} aria-live="polite">
          <p className="eyebrow">Game update</p>
          <h2>{toast.title}</h2>
          <p>{toast.body}</p>
          {toast.meta ? <p className="mini-label">{toast.meta}</p> : null}
          {toast.tone === 'card-lock' ? <div className="face-down-card" aria-hidden="true" /> : null}
        </section>
      ) : null}

      {waitingOnPlayers.length ? (
        <div className="modal-overlay" role="presentation" onClick={() => setWaitingOnPlayers([])}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="waiting-on-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Round gate</p>
            <h2 id="waiting-on-title">Still waiting on action choices</h2>
            <p className="modal-copy">The turn cannot advance until every seat has locked a card.</p>
            <div className="modal-list">
              {waitingOnPlayers.map((player) => (
                <div key={player.id} className="modal-list-row">
                  <strong>{player.short_name}</strong>
                  <span>{player.name}</span>
                </div>
              ))}
            </div>
            <button type="button" className="auth-button" onClick={() => setWaitingOnPlayers([])}>
              Close
            </button>
          </section>
        </div>
      ) : null}

      {!activeGameReady && hudPanel === 'rules' ? (
        <div className="game-overlay-layer lobby-reference-layer" role="presentation" onClick={() => setHudPanel(null)}>
          <section
            className="game-overlay-card"
            role="dialog"
            aria-modal="false"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="game-overlay-head">
              <div>
                <p className="eyebrow">Reference</p>
                <h2>Rules and card library</h2>
              </div>
              <button type="button" className="ghost overlay-close" onClick={() => setHudPanel(null)}>
                Close
              </button>
            </div>
            <ReferenceLibrary actionDecks={actionDeckReference} events={eventReference} />
          </section>
        </div>
      ) : null}

      <main className={activeGameReady ? 'shell in-game' : 'shell'}>
        {activeGameReady ? (
          <section className="game-surface">
            <div className="game-stage">
              <div className="game-surface-map" aria-hidden="true">
                <img className="board-map-image" src={worldMap} alt="" />
                <div className="grid-lines" />
              </div>

              <header className="game-topbar">
                <div>
                  <p className="eyebrow">Competing Futures / live board</p>
                  <h1>{activeGame.name}</h1>
                </div>
                <div className="game-topbar-actions">
                  <div className="game-meta">
                    <span>Round {gameState.round}</span>
                    <span>{currentPhaseDefinition.label}</span>
                    <span>{liveJoinCode ? `Join code ${liveJoinCode}` : 'Join code pending'}</span>
                  </div>
                  <div className="hero-actions">
                    <button type="button" className="ghost" onClick={() => setSelectedGameId('')}>
                      Back to lobby
                    </button>
                    {isLocalGame ? (
                      <button type="button" className="ghost" onClick={handleStartLocalGame}>
                        Restart robots
                      </button>
                    ) : activeMembership ? (
                      <button type="button" className="ghost" onClick={handleLeaveGame} disabled={actionLoading}>
                        Leave game
                      </button>
                    ) : null}
                    <button type="button" className="ghost" onClick={signOut}>
                      Sign out
                    </button>
                  </div>
                </div>
              </header>

              <div className="hud-dock" aria-label="Game overlays">
                {dockButtons.map((button) => (
                  <button
                    type="button"
                    key={button.key}
                    className={
                      hudPanel === button.key
                        ? 'hud-dock-button active'
                        : recommendedPanel === button.key
                          ? 'hud-dock-button recommended'
                          : 'hud-dock-button'
                    }
                    onClick={() => setHudPanel((current) => (current === button.key ? null : button.key))}
                  >
                    <strong>{button.badge}</strong>
                    <span>{button.label}</span>
                    {recommendedPanel === button.key ? <small>Next</small> : null}
                  </button>
                ))}
              </div>

              {hudPanel ? (
                <div className="game-overlay-layer" role="presentation" onClick={() => setHudPanel(null)}>
                  <section
                    className="game-overlay-card"
                    role="dialog"
                    aria-modal="false"
                    onClick={(event) => event.stopPropagation()}
                  >
                  <div className="game-overlay-head">
                    <div>
                      <p className="eyebrow">Overlay</p>
                      <h2>
                        {hudPanel === 'cards'
                          ? `${activePlayer?.name ?? 'Seat'} actions`
                          : hudPanel === 'rules'
                            ? 'Rules and card library'
                          : hudPanel === 'event'
                            ? currentPhase === 'choose_actions'
                              ? 'Hidden global event'
                              : currentEvent?.title ?? 'No event loaded'
                            : hudPanel === 'tracks'
                              ? 'Shared tracks'
                              : hudPanel === 'objective'
                                ? parsedObjective?.title ?? 'Hidden win condition'
                                : hudPanel === 'seats'
                                  ? 'Seats and readiness'
                                  : 'Round flow and public log'}
                      </h2>
                    </div>
                    <button type="button" className="ghost overlay-close" onClick={() => setHudPanel(null)}>
                      Close
                    </button>
                  </div>

                  {hudPanel === 'rules' ? (
                    <ReferenceLibrary actionDecks={actionDeckReference} events={eventReference} />
                  ) : null}

                  {hudPanel === 'cards' ? (
                    <div className="overlay-scroll">
                      {activePlayer ? (
                        <p className="overlay-copy">
                          {canEditSeatAction
                            ? 'Choose one action card, pick your guaranteed +1 track, then lock it face-down.'
                            : privateState.selectedAction
                              ? `Locked action: ${privateState.selectedAction}.`
                              : 'You can inspect this seat, but only the controlling player may lock an action right now.'}
                        </p>
                      ) : (
                        <p className="overlay-copy">Choose a seat first to inspect its current hand.</p>
                      )}

                      <div className="hand-grid overlay-hand-grid">
                        {privateState.cards.map((card) => {
                          const cardDefinition = getActionCard(card.definitionKey ?? getBaseCardKey(card.cardKey));
                          const isSelected = card.cardKey === privateState.selectedCardKey;
                          const successThreshold = evaluateFormulaForDisplay(activePlayer, cardDefinition?.formula);
                          const rollSuccessChance = getRollSuccessChance(successThreshold);
                          const formulaDetails = getActionFormulaDetails(activePlayer, cardDefinition?.formula);
                          const requirementState = getRequirementState(cardDefinition, boardPlayers, currentEvent);
                          const effectiveChance =
                            requirementState && !requirementState.met ? 0 : rollSuccessChance;
                          const bonusTrackOptions =
                            activePowerKey === 'model'
                              ? tracks.filter((track) => track.key !== 'capabilities')
                              : tracks;
                          const outcomeRows = buildOutcomeRows(
                            cardDefinition,
                            activePowerKey,
                            cardDrafts[card.cardKey] ?? buildDefaultSelectionPayload(cardDefinition, activePowerKey),
                            boardPlayers,
                          );

                          return (
                            <article key={card.cardKey} className={isSelected ? 'hand-card selected' : 'hand-card'}>
                              <p className="mini-label">{isSelected ? 'Selected action' : 'Action card'}</p>
                              <h3>{card.name}</h3>
                              <div className="odds-strip">
                                {requirementState ? (
                                  <>
                                    <div className="odds-stat primary">
                                      <span className="mini-label">Success odds</span>
                                      <strong>{formatPercent(effectiveChance)}</strong>
                                      <small>{successThreshold != null ? `Need d10 roll >= ${successThreshold}` : 'No roll data'}</small>
                                    </div>
                                    <div className="odds-stat">
                                      <span className="mini-label">Roll odds</span>
                                      <strong>{formatPercent(rollSuccessChance)}</strong>
                                      <small>From current track values</small>
                                    </div>
                                    <div className={requirementState.met ? 'odds-stat requirement met' : 'odds-stat requirement blocked'}>
                                      <span className="mini-label">Requirement</span>
                                      <strong>{requirementState.met ? 'Live' : 'Blocked'}</strong>
                                      <small>{requirementState.label}</small>
                                    </div>
                                  </>
                                ) : (
                                  <div className="odds-stat primary">
                                    <span className="mini-label">Roll odds</span>
                                    <strong>{formatPercent(rollSuccessChance)}</strong>
                                    <small>{successThreshold != null ? `Need d10 roll >= ${successThreshold}` : 'No roll data'}</small>
                                  </div>
                                )}
                              </div>
                              <div className="impact-notes impact-bullets">
                                <ul>
                                  {buildImpactBullets(card.text).map((line) => (
                                    <li key={line}>
                                      {line.startsWith('Success:') || line.startsWith('Fail:') ? (
                                        <>
                                          <strong>{line.split(':')[0]}:</strong>
                                          {` ${line.slice(line.indexOf(':') + 1).trim()}`}
                                        </>
                                      ) : (
                                        <strong>{line}</strong>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="card-impact-grid">
                                <OutcomeTable title="Success" rows={outcomeRows.success} tone="success" />
                                <OutcomeTable title="Failure" rows={outcomeRows.failure} emptyLabel="No penalty" tone="failure" />
                              </div>
                              {outcomeRows.notes.length ? (
                                <div className="impact-notes">
                                  {outcomeRows.notes.map((note) => (
                                    <p key={note}>{note}</p>
                                  ))}
                                </div>
                              ) : null}
                              <div className="impact-notes">
                                <p>
                                  <strong>How success odds are calculated:</strong> {formulaDetails}
                                </p>
                              </div>
                              {canEditSeatAction ? (
                                <>
                                  <label className="form-label">
                                    Guaranteed +1 track
                                    <select
                                      className="input-control"
                                      value={(cardDrafts[card.cardKey] ?? buildDefaultSelectionPayload(cardDefinition, activePowerKey)).bonusTrack ?? 'resources'}
                                      onChange={(event) =>
                                        setCardDrafts((current) => ({
                                          ...current,
                                          [card.cardKey]: {
                                            ...(current[card.cardKey] ?? buildDefaultSelectionPayload(cardDefinition, activePowerKey)),
                                            bonusTrack: event.target.value,
                                          },
                                        }))
                                      }
                                    >
                                      {bonusTrackOptions.map((track) => (
                                        <option key={track.key} value={track.key}>
                                          +1 {track.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <ActionSelectionFields
                                    card={card}
                                    players={boardPlayers}
                                    value={cardDrafts[card.cardKey] ?? buildDefaultSelectionPayload(cardDefinition, activePowerKey)}
                                    onChange={(nextValue) =>
                                      setCardDrafts((current) => ({
                                        ...current,
                                        [card.cardKey]: nextValue,
                                      }))
                                    }
                                  />
                                </>
                              ) : null}
                              {canEditSeatAction ? (
                                <button type="button" className="hand-action-button" onClick={() => handleSelectAction(card)}>
                                  {isSelected ? 'Update locked action' : 'Lock this action'}
                                </button>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {hudPanel === 'event' ? (
                    <div className="overlay-scroll overlay-stack">
                      <div className="event-panel compact">
                        <p className="event-label">Global event</p>
                        <h2>{currentPhase === 'choose_actions' ? 'Hidden until reveal' : currentEvent?.title ?? 'No event loaded'}</h2>
                        <p>
                          {currentPhase === 'choose_actions'
                            ? 'The event is already chosen. Only the action order is public until reveal.'
                            : currentEvent?.details ?? 'No event card is available for this board yet.'}
                        </p>
                        {currentPhase !== 'choose_actions' && currentEventEffects.length ? (
                          <ul className="event-effects">
                            {currentEventEffects.map((effect) => (
                              <li key={effect}>
                                <strong>{effect}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="mini-label">
                          Action order: {currentOrder.map((powerKey) => boardPlayers.find((player) => player.power_key === powerKey)?.short_name ?? powerKey).join(' -> ')}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {hudPanel === 'tracks' ? (
                    <div className="overlay-scroll overlay-stack">
                      {tracks.map((track) => (
                        <TrackRow
                          key={track.key}
                          label={track.label}
                          trackKey={track.key}
                          players={boardPlayers}
                          roundStartSnapshot={roundStartSnapshot}
                        />
                      ))}
                    </div>
                  ) : null}

                  {hudPanel === 'objective' ? (
                    <div className="overlay-scroll overlay-stack">
                      <div className="overlay-stack">
                        {tracks.map((track) => (
                          <TrackRow
                            key={track.key}
                            label={track.label}
                            trackKey={track.key}
                            players={boardPlayers}
                            roundStartSnapshot={roundStartSnapshot}
                          />
                        ))}
                      </div>
                      <div className="private-objective">
                        <div className="objective-topline">
                          <div>
                            <p className="mini-label">Hidden win condition</p>
                            <h3>{parsedObjective?.title ?? 'No objective loaded'}</h3>
                          </div>
                          <div className="objective-scorecard">
                            <strong>{parsedObjective ? `${objectiveMetCount}/${objectiveChecks.length}` : '0/0'}</strong>
                            <span>criteria met</span>
                          </div>
                        </div>
                        <p>{parsedObjective?.description ?? 'This seat has no private objective available for your account.'}</p>
                        {parsedObjective ? (
                          <div className="objective-summary-grid">
                            <div className="objective-summary-card">
                              <span className="mini-label">Victory path</span>
                              <strong>{parsedObjective.outcome}</strong>
                              <small>{objectiveRollSummary.label}</small>
                            </div>
                            <div className="objective-summary-card">
                              <span className="mini-label">Win odds now</span>
                              <strong>{formatPercent(objectiveRollSummary.chance)}</strong>
                              <small>{objectiveEligible ? 'Based on current board state' : 'Blocked until all criteria are met'}</small>
                            </div>
                          </div>
                        ) : null}
                        {parsedObjective ? (
                          <div className="impact-notes">
                            <p>
                              <strong>How this percentage is calculated:</strong> {objectiveRollSummary.details}
                            </p>
                          </div>
                        ) : null}
                        {objectiveChecks.length ? (
                          <div className="criteria-table">
                            <div className="criteria-table-head">
                              <span>Condition</span>
                              <span>Current</span>
                              <span>Status</span>
                            </div>
                            {objectiveChecks.map((check) => (
                              <div className="criteria-table-row" key={check.label}>
                                <strong>{check.label}</strong>
                                <span>{check.current}</span>
                                <span className={check.met ? 'status-pill met' : 'status-pill unmet'}>
                                  {check.met ? 'Met' : 'Miss'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {currentPhase === 'victory_check' ? (
                          <p className="mini-label">
                            {objectiveEligible ? 'Objective conditions met.' : 'Objective conditions not met.'}
                          </p>
                        ) : null}
                        {canEditVictory && objectiveEligible ? (
                          <div className="hero-actions">
                            <button type="button" onClick={() => handleVictoryToggle(!privateState.declaredVictory)} disabled={actionLoading}>
                              {privateState.declaredVictory ? 'Withdraw victory attempt' : 'Declare victory attempt'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {hudPanel === 'seats' ? (
                    <div className="overlay-scroll overlay-stack">
                      <div className="player-tabs overlay-seat-tabs">
                        {(canManageGame ? boardPlayers : availableSeats).map((player) => (
                          <button
                            type="button"
                            key={player.id}
                            className={player.power_key === activePowerKey ? 'player-tab active' : 'player-tab'}
                            style={{ '--accent': player.accent }}
                            onClick={() => setActivePowerKey(player.power_key)}
                          >
                            <span>{player.short_name}</span>
                            {player.name}
                          </button>
                        ))}
                      </div>
                      {!canManageGame && !isLocalGame && liveGameStatus === 'active' ? (
                        <div className="seat-actions">
                          <p className="mini-label">Claim or change your seat</p>
                          <div className="seat-list">
                            {availableSeats.map((player) => (
                              <button
                                type="button"
                                key={player.id}
                                className="seat-chip"
                                onClick={() => handleClaimSeat(player.power_key)}
                                disabled={actionLoading}
                              >
                                {player.short_name} / {player.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="concealed-panel">
                        <p className="mini-label">Lobby roster</p>
                        {boardPlayers.map((player) => {
                          const member = joinedPlayerByPower.get(player.power_key);
                          return (
                            <div className="concealed-row" key={player.id}>
                              <strong>{player.short_name}</strong>
                              <span>{member ? `${member.display_name} claimed this seat` : 'Open seat'}</span>
                            </div>
                          );
                        })}
                        {observerMembers.map((member) => (
                          <div className="concealed-row" key={`${member.user_id}-observer`}>
                            <strong>OBS</strong>
                            <span>{member.display_name} is observing</span>
                          </div>
                        ))}
                        <div className="concealed-row">
                          <strong>Open</strong>
                          <span>{openSeatCount} seat(s) still available</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {hudPanel === 'log' ? (
                    <div className="overlay-scroll overlay-stack">
                      <div className="phase-list">
                        {phases.map((phase) => (
                          <article key={phase.id} className={phase.id === currentPhase ? 'active-phase' : ''}>
                            <p className="mini-label">{phase.id === currentPhase ? 'Current stage' : 'Upcoming stage'}</p>
                            <p>{phase.label}</p>
                          </article>
                        ))}
                      </div>
                      <div className="concealed-panel">
                        <p className="mini-label">Action lock tracker</p>
                        <div className="concealed-row">
                          <strong>Ready</strong>
                          <span>
                            {currentPhase === 'choose_actions' && !missingLockPlayers.length
                              ? `${readySeatCount} / ${turnOrder.length} players ready`
                              : `${lockedSeatCount} / ${turnOrder.length} seats locked`}
                          </span>
                        </div>
                        {turnOrder.map((powerKey) => {
                          const player = boardPlayers.find((entry) => entry.power_key === powerKey);
                          const revealedAction = revealedActions[powerKey];
                          const isLocked = Boolean(selectedCardKeysByPower[powerKey]);

                          if (!player) {
                            return null;
                          }

                          let label = 'Waiting';

                          if (revealedAction) {
                            label = `${revealedAction.cardName} — ${revealedAction.outcome}`;
                          } else if (currentPhase === 'choose_actions' || currentPhase === 'resolve_event') {
                            label = isLocked ? 'Locked in' : 'Still choosing';
                          } else if (isLocked) {
                            label = 'Face-down';
                          }

                          return (
                            <div className="concealed-row" key={player.id}>
                              <strong>{player.short_name}</strong>
                              <span>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="concealed-panel">
                        <p className="mini-label">Public log</p>
                        {publicLog.length ? (
                          publicLog.map((entry, index) => (
                            <div className="concealed-row" key={`${entry}-${index}`}>
                              <strong>{index + 1}</strong>
                              <span>{entry}</span>
                            </div>
                          ))
                        ) : (
                          <div className="concealed-row">
                            <strong>0</strong>
                            <span>No public log entries yet.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  </section>
                </div>
              ) : null}
            </div>

            <footer className="status-bar">
              <div className="status-bar-copy">
                <p className="eyebrow">Table status</p>
                <h2>{tableHeadline}</h2>
                <p>{errorMessage || tableSubline || statusMessage}</p>
                <p className="guide-copy">{nextStepMessage}</p>
              </div>
              <div className="status-bar-meta">
                <div className="status-readout">
                  <span>Phase</span>
                  <strong>{currentPhaseDefinition.label}</strong>
                </div>
                <div className="status-readout">
                  <span>Current turn</span>
                  <strong>{currentTurnPlayer ? currentTurnPlayer.name : winner ? winner.name : 'No active turn'}</strong>
                </div>
                <div className="status-readout">
                  <span>Event</span>
                  <strong>{currentPhase === 'choose_actions' ? 'Hidden until reveal' : currentEvent?.title ?? 'None'}</strong>
                </div>
                <div className="hero-actions">
                  {!activeMembership && liveJoinCode ? (
                    <button type="button" onClick={handleJoinSelectedGame} disabled={actionLoading}>
                      Join this game
                    </button>
                  ) : canSignalEventReady ? (
                    <span className={isCurrentSeatReady ? 'ready-status-label ready-confirmed' : 'ready-status-label'}>
                      {isCurrentSeatReady ? `✓ You are ready (${readySeatCount}/${turnOrder.length})` : 'Locking in...'}
                    </span>
                  ) : (
                    <>
                      {currentPhase === 'victory_check' && canEditVictory ? (
                        <button
                          type="button"
                          className={isCurrentSeatVictoryReady ? 'ready-confirmed' : ''}
                          onClick={handleSignalVictoryReady}
                          disabled={actionLoading || isCurrentSeatVictoryReady}
                        >
                          {isCurrentSeatVictoryReady
                            ? `✓ You are ready (${victoryReadySeatCount}/${turnOrder.length})`
                            : 'Ready to advance'}
                        </button>
                      ) : null}
                      <button type="button" onClick={handleAdvanceFlow} disabled={!canAdvanceFlow}>
                        {advanceFlowLabel}
                      </button>
                    </>
                  )}
                  {canManageGame ? (
                    <button type="button" className="ghost" onClick={handleCompleteGame} disabled={actionLoading}>
                      {liveGameStatus === 'completed' ? 'Reopen game' : 'Complete game'}
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <button type="button" className="ghost" onClick={handleDeleteGame} disabled={actionLoading}>
                      Delete game
                    </button>
                  ) : null}
                </div>
              </div>
            </footer>
          </section>
        ) : (
          <>
            <section className="topbar">
              <div className="topbar-copy">
                <p className="eyebrow">Competing Futures / game lobby</p>
                <h1>{activeGame?.name ?? 'Your game lobby'}</h1>
                <p className="mini-label">
                  Signed in as {getDisplayName(profile, session.user)} / {profile?.app_role ?? 'player'}
                </p>
              </div>

              <div className="topbar-status">
                <div className="status-chip">
                  <span>Active games</span>
                  <strong>{activeGames.length}</strong>
                </div>
                <div className="status-chip event">
                  <span>Past games</span>
                  <strong>{pastGames.length}</strong>
                </div>
                <div className="status-chip">
                  <span>Seat</span>
                  <strong>{activeMembership?.power_key ?? activeMembership?.membership_role ?? 'none'}</strong>
                </div>
                <div className="hero-actions">
                  <button type="button" className="ghost" onClick={() => setHudPanel('rules')}>
                    Rules
                  </button>
                  <button type="button" className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              </div>
            </section>

            <section className="lower-grid overview-grid">
              <aside className="selector-panel">
                <div className="section-heading">
                  <p className="eyebrow">Create or join</p>
                  <h2>Launch a lobby or enter one with a six-letter code</h2>
                </div>

                <form className="form-panel" onSubmit={handleCreateGame}>
                  <label className="form-label" htmlFor="game-name">
                    New game name
                  </label>
                  <input
                    id="game-name"
                    className="input-control"
                    value={createGameName}
                    onChange={(event) => setCreateGameName(event.target.value)}
                    placeholder="Optional custom title"
                  />
                  <label className="form-label" htmlFor="create-seat">
                    Claim a seat now
                  </label>
                  <select
                    id="create-seat"
                    className="input-control"
                    value={createSeatKey}
                    onChange={(event) => setCreateSeatKey(event.target.value)}
                  >
                    <option value="">Join as observer</option>
                    {powerOptions.map((power) => (
                      <option key={power.id} value={power.id}>
                        {power.shortName} / {power.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={actionLoading}>
                    {actionLoading ? 'Working...' : 'Create game'}
                  </button>
                </form>

                <form className="form-panel" onSubmit={handleJoinGame}>
                  <label className="form-label" htmlFor="join-code">
                    Six-letter join code
                  </label>
                  <input
                    id="join-code"
                    className="input-control code-input"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    required
                  />
                  <label className="form-label" htmlFor="join-seat">
                    Claim a seat on join
                  </label>
                  <select
                    id="join-seat"
                    className="input-control"
                    value={joinSeatKey}
                    onChange={(event) => setJoinSeatKey(event.target.value)}
                  >
                    <option value="">Join as observer</option>
                    {powerOptions.map((power) => (
                      <option key={power.id} value={power.id}>
                        {power.shortName} / {power.name}
                      </option>
                    ))}
                  </select>
                  <p className="mini-label">
                    Ask the host for the code shown on the selected game card. If every actor seat is filled, the join will be rejected.
                  </p>
                  <button type="submit" disabled={actionLoading}>
                    {actionLoading ? 'Working...' : 'Join game'}
                  </button>
                </form>

                <form className="form-panel" onSubmit={handleStartLocalGame}>
                  <label className="form-label" htmlFor="local-seat">
                    Human seat
                  </label>
                  <select
                    id="local-seat"
                    className="input-control"
                    value={localSeatKey}
                    onChange={(event) => setLocalSeatKey(event.target.value)}
                  >
                    {powerOptions.map((power) => (
                      <option key={power.id} value={power.id}>
                        {power.shortName} / {power.name}
                      </option>
                    ))}
                  </select>
                  <p className="mini-label">
                    Starts an in-browser match where every other seat is controlled by a robot that chooses random legal actions.
                  </p>
                  <button type="submit">
                    {selectedGameId === LOCAL_GAME_ID ? 'Restart robot match' : 'Play vs robots'}
                  </button>
                </form>
              </aside>

              <section className="board-panel board-panel-wide">
                <div className="dashboard-stack">
                  <GameList
                    title="Active games"
                    games={activeGames}
                    memberships={listedMemberships}
                    selectedGameId={selectedGameId}
                    onSelect={setSelectedGameId}
                    emptyMessage="No active games yet."
                    canQuickDelete={isAdmin}
                    onDelete={handleDeleteGameFromLobby}
                  />
                  <GameList
                    title="Past games you played"
                    games={pastGames}
                    memberships={listedMemberships}
                    selectedGameId={selectedGameId}
                    onSelect={setSelectedGameId}
                    emptyMessage="Finished games will appear here."
                    canQuickDelete={isAdmin}
                    onDelete={handleDeleteGameFromLobby}
                  />
                </div>
              </section>

              <aside className="info-panel">
                <div className="section-heading">
                  <p className="eyebrow">Selected game</p>
                  <h2>What to share and where to go next</h2>
                </div>
                <div className="event-panel compact">
                  <p className="event-label">Lobby status</p>
                  <h2>{activeGame?.status ?? 'No game selected'}</h2>
                  <p>{errorMessage || statusMessage}</p>
                  <p className="mini-label">
                    {liveJoinCode ? `Join code: ${liveJoinCode}` : 'Create or join a game to continue.'}
                  </p>
                </div>
                <div className="event-panel compact">
                  <p className="event-label">Rules reference</p>
                  <h2>Rulebook, cards, and events</h2>
                  <p>
                    Open the full reference to review the rulebook, every action card frequency and effect, and the global event probabilities.
                  </p>
                  <div className="hero-actions">
                    <button type="button" onClick={() => setHudPanel('rules')}>
                      Open reference
                    </button>
                  </div>
                </div>
                <div className="event-panel compact">
                  <p className="event-label">How players join</p>
                  <h2>{liveJoinCode || 'Select a game first'}</h2>
                  <p>
                    Select a game from the center column, then click join. The code is still visible if someone needs to join from another device.
                  </p>
                  <p className="mini-label">Select an active game to enter the map-first play surface.</p>
                </div>
                {activeGame && !activeMembership ? (
                  <div className="hero-actions">
                    <button type="button" onClick={handleJoinSelectedGame} disabled={actionLoading || !liveJoinCode}>
                      Join selected game
                    </button>
                  </div>
                ) : null}
                {activeMembership ? (
                  <div className="hero-actions">
                    <button type="button" className="ghost" onClick={handleLeaveGame} disabled={actionLoading}>
                      Leave game
                    </button>
                  </div>
                ) : null}
              </aside>
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default App;
