import fs from 'node:fs/promises';
import path from 'node:path';
import {
  advanceGameState,
  buildGameInitialization,
  buildDefaultSelectionPayload,
  getActionCard,
  getBaseCardKey,
  getCurrentEvent,
  initialPowers,
  isObjectiveEligible,
  sanitizeSelectionPayload,
  tracks,
  turnOrder,
} from '../src/lib/game-data.js';

const DEFAULT_SIMULATIONS = 1000;
const DEFAULT_OUTPUT_PATH = 'reports/fuzz-report.json';
const TRACK_KEYS = tracks.map((track) => track.key);

function parseArgs(argv) {
  const args = {
    simulations: DEFAULT_SIMULATIONS,
    output: DEFAULT_OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if ((token === '--games' || token === '--simulations') && argv[index + 1]) {
      args.simulations = Math.max(1, Number.parseInt(argv[index + 1], 10) || DEFAULT_SIMULATIONS);
      index += 1;
      continue;
    }

    if ((token === '--out' || token === '--output') && argv[index + 1]) {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return args;
}

function createStartingPlayers() {
  return initialPowers.map((player) => ({
    id: player.id,
    power_key: player.id,
    name: player.name,
    short_name: player.shortName,
    accent: player.accent,
    role: player.role,
    home_class: player.homeClass,
    meters: { ...player.meters },
  }));
}

function cloneManagerState(managerState) {
  return Object.fromEntries(
    Object.entries(managerState).map(([powerKey, state]) => [
      powerKey,
      {
        ...state,
        selectedActionPayload: { ...(state.selectedActionPayload ?? {}) },
        secretState: { ...(state.secretState ?? {}) },
        hand: (state.hand ?? []).map((card) => ({ ...card })),
      },
    ]),
  );
}

function snapshotMeters(players) {
  return Object.fromEntries(
    players.map((player) => [
      player.power_key ?? player.id,
      {
        capabilities: player.meters.capabilities,
        resources: player.meters.resources,
        safety: player.meters.safety,
        publicSupport: player.meters.publicSupport,
      },
    ]),
  );
}

function diffMeters(beforeSnapshot, afterPlayers) {
  const delta = {
    capabilities: 0,
    resources: 0,
    safety: 0,
    publicSupport: 0,
  };

  for (const player of afterPlayers) {
    const powerKey = player.power_key ?? player.id;
    const before = beforeSnapshot[powerKey];
    if (!before) {
      continue;
    }

    for (const trackKey of TRACK_KEYS) {
      delta[trackKey] += player.meters[trackKey] - before[trackKey];
    }
  }

  return delta;
}

function addDelta(target, delta) {
  for (const trackKey of TRACK_KEYS) {
    target[trackKey] += delta[trackKey] ?? 0;
  }
}

function sumAbsDelta(delta) {
  return TRACK_KEYS.reduce((sum, trackKey) => sum + Math.abs(delta[trackKey] ?? 0), 0);
}

function sumNetDelta(delta) {
  return TRACK_KEYS.reduce((sum, trackKey) => sum + (delta[trackKey] ?? 0), 0);
}

function createEmptyDelta() {
  return {
    capabilities: 0,
    resources: 0,
    safety: 0,
    publicSupport: 0,
  };
}

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
  if (!card?.selection) {
    return {};
  }

  const options = (card.selection.options ?? []).filter((powerKey) => powerKey !== actingPowerKey);

  if (card.selection.kind === 'target') {
    return { targetActorKey: chooseRandom(options) };
  }

  if (card.selection.kind === 'targets') {
    return { targetActorKeys: shuffle(options).slice(0, card.selection.count) };
  }

  if (card.selection.kind === 'allocation') {
    return { capabilityPoints: randomInt(card.selection.total + 1) };
  }

  if (card.selection.kind === 'target_and_axis') {
    return {
      targetActorKey: chooseRandom(options),
      track: Math.random() < 0.5 ? 'capabilities' : 'safety',
    };
  }

  return buildDefaultSelectionPayload(card, actingPowerKey);
}

function normalizeOutcomeLabel(outcome) {
  const value = (outcome ?? '').toLowerCase();

  if (value.startsWith('success')) {
    return 'success';
  }

  if (value.startsWith('failure') || value.startsWith('failed')) {
    return 'failure';
  }

  return 'other';
}

function recordRoundOneHands(managerState, cardDrawSummary) {
  for (const powerKey of turnOrder) {
    for (const card of managerState[powerKey]?.hand ?? []) {
      recordCardDraw(cardDrawSummary, powerKey, card.definitionKey ?? getBaseCardKey(card.cardKey), 1);
    }
  }
}

function recordCardDraw(cardDrawSummary, powerKey, cardKey, round) {
  const powerEntry = (cardDrawSummary[powerKey] ??= {});
  const cardEntry = (powerEntry[cardKey] ??= {
    draws: 0,
    byRound: {},
  });

  cardEntry.draws += 1;
  cardEntry.byRound[round] = (cardEntry.byRound[round] ?? 0) + 1;
}

function recordNewHandDraws(beforeManagerState, afterManagerState, round, cardDrawSummary) {
  for (const powerKey of turnOrder) {
    const beforeKeys = new Set((beforeManagerState[powerKey]?.hand ?? []).map((card) => card.cardKey));

    for (const card of afterManagerState[powerKey]?.hand ?? []) {
      if (beforeKeys.has(card.cardKey)) {
        continue;
      }

      recordCardDraw(cardDrawSummary, powerKey, card.definitionKey ?? getBaseCardKey(card.cardKey), round);
    }
  }
}

function createActionSummaryEntry(card) {
  return {
    name: card.name,
    uses: 0,
    successes: 0,
    failures: 0,
    otherOutcomes: 0,
    cumulativeImpact: createEmptyDelta(),
    totalAbsoluteImpact: 0,
    totalNetImpact: 0,
  };
}

function summarizeTopEntries(entries, limit, valueGetter) {
  return Object.entries(entries)
    .sort((left, right) => valueGetter(right[1]) - valueGetter(left[1]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, ...value }));
}

function runSingleSimulation(cardDrawSummary, actionCardSummary, eventSummary) {
  const initialization = buildGameInitialization(createStartingPlayers());
  let state = {
    players: initialization.players,
    managerState: Object.fromEntries(
      turnOrder.map((powerKey) => {
        const playerId = initialization.privateStates.find((entry) => entry.player_id === powerKey)?.player_id ?? powerKey;
        const privateState = initialization.privateStates.find((entry) => entry.player_id === powerKey);
        const cards = initialization.handRows.filter((row) => row.player_id === powerKey);
        return [
          powerKey,
          {
            playerId,
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
    ),
    phase: 'choose_actions',
    round: 1,
    currentTurnIndex: 0,
    engineState: initialization.engineState,
    status: 'active',
    winnerPowerKey: null,
  };

  recordRoundOneHands(state.managerState, cardDrawSummary);

  let safetyCounter = 0;

  while (state.status !== 'completed' && safetyCounter < 200) {
    safetyCounter += 1;

    if (state.phase === 'choose_actions') {
      const nextManagerState = cloneManagerState(state.managerState);

      for (const powerKey of turnOrder) {
        const hand = nextManagerState[powerKey].hand ?? [];
        const chosenCard = chooseRandom(hand);
        const cardDefinition = getActionCard(chosenCard.definitionKey ?? getBaseCardKey(chosenCard.cardKey));
        const randomPayload = buildRandomSelectionPayload(cardDefinition, powerKey);
        const payload = sanitizeSelectionPayload(cardDefinition, randomPayload, powerKey);

        nextManagerState[powerKey] = {
          ...nextManagerState[powerKey],
          selectedAction: chosenCard.name,
          selectedCardKey: chosenCard.cardKey,
          selectedActionPayload: payload,
          declaredVictory: false,
        };
      }

      state = {
        ...state,
        managerState: nextManagerState,
      };
    } else if (state.phase === 'victory_check') {
      const nextManagerState = cloneManagerState(state.managerState);

      for (const powerKey of turnOrder) {
        nextManagerState[powerKey] = {
          ...nextManagerState[powerKey],
          declaredVictory: isObjectiveEligible(state.players, powerKey, nextManagerState[powerKey].secretState),
        };
      }

      state = {
        ...state,
        managerState: nextManagerState,
      };
    }

    const beforePlayers = snapshotMeters(state.players);
    const beforeManagerState = cloneManagerState(state.managerState);
    const actingPowerKey =
      state.phase === 'resolve_actions'
        ? state.engineState.actionOrder?.[state.currentTurnIndex] ?? turnOrder[state.currentTurnIndex]
        : null;
    const actingPrivateState = actingPowerKey ? state.managerState[actingPowerKey] : null;
    const actingCard =
      actingPowerKey && actingPrivateState?.selectedCardKey
        ? actingPrivateState.hand?.find((card) => card.cardKey === actingPrivateState.selectedCardKey) ?? null
        : null;
    const actingCardDefinition =
      actingCard && getActionCard(actingCard.definitionKey ?? getBaseCardKey(actingCard.cardKey));
    const eventBeforeResolve = state.phase === 'resolve_event' ? getCurrentEvent(state) : null;

    const nextState = advanceGameState({
      players: state.players,
      managerState: state.managerState,
      phase: state.phase,
      round: state.round,
      currentTurnIndex: state.currentTurnIndex,
      engineState: state.engineState,
    });

    if (nextState.blocked?.length) {
      throw new Error(`Simulation entered blocked state unexpectedly for powers: ${nextState.blocked.join(', ')}`);
    }

    const afterPlayers = nextState.players;
    const delta = diffMeters(beforePlayers, afterPlayers);

    if (state.phase === 'resolve_event' && eventBeforeResolve) {
      const eventEntry = (eventSummary[eventBeforeResolve.key] ??= {
        title: eventBeforeResolve.title,
        occurrences: 0,
        cumulativeImpact: createEmptyDelta(),
      });
      eventEntry.occurrences += 1;
      addDelta(eventEntry.cumulativeImpact, delta);
    }

    if (state.phase === 'resolve_actions' && actingCardDefinition) {
      const actionEntry = (actionCardSummary[actingCardDefinition.key] ??= createActionSummaryEntry(actingCardDefinition));
      const revealedAction = nextState.engineState?.revealedActions?.[actingPowerKey] ?? null;
      const outcomeLabel = normalizeOutcomeLabel(revealedAction?.outcome);

      actionEntry.uses += 1;
      if (outcomeLabel === 'success') {
        actionEntry.successes += 1;
      } else if (outcomeLabel === 'failure') {
        actionEntry.failures += 1;
      } else {
        actionEntry.otherOutcomes += 1;
      }
      addDelta(actionEntry.cumulativeImpact, delta);
      actionEntry.totalAbsoluteImpact += sumAbsDelta(delta);
      actionEntry.totalNetImpact += sumNetDelta(delta);
    }

    if (state.phase === 'victory_check' && nextState.round === state.round + 1) {
      recordNewHandDraws(beforeManagerState, nextState.managerState, nextState.round, cardDrawSummary);
    }

    state = {
      players: nextState.players,
      managerState: nextState.managerState,
      phase: nextState.phase,
      round: nextState.round,
      currentTurnIndex: nextState.currentTurnIndex,
      engineState: nextState.engineState,
      status: nextState.status,
      winnerPowerKey: nextState.winnerPowerKey,
    };
  }

  if (state.status !== 'completed') {
    throw new Error('Simulation exceeded safety iteration limit before completion.');
  }

  return {
    winnerPowerKey: state.winnerPowerKey,
    roundsPlayed: state.round,
    singularityTriggered: Boolean(state.engineState?.singularityRound),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const winnerCounts = Object.fromEntries(turnOrder.map((powerKey) => [powerKey, 0]));
  const roundsHistogram = {};
  const cardDrawSummary = {};
  const actionCardSummary = {};
  const eventSummary = {};
  let singularityEndings = 0;

  for (let index = 0; index < args.simulations; index += 1) {
    const result = runSingleSimulation(cardDrawSummary, actionCardSummary, eventSummary);
    winnerCounts[result.winnerPowerKey] = (winnerCounts[result.winnerPowerKey] ?? 0) + 1;
    roundsHistogram[result.roundsPlayed] = (roundsHistogram[result.roundsPlayed] ?? 0) + 1;
    if (result.singularityTriggered) {
      singularityEndings += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    simulations: args.simulations,
    winners: winnerCounts,
    winnerRates: Object.fromEntries(
      Object.entries(winnerCounts).map(([powerKey, wins]) => [powerKey, wins / args.simulations]),
    ),
    roundsHistogram,
    singularityEndings,
    events: eventSummary,
    cardDraws: cardDrawSummary,
    actionCards: actionCardSummary,
    topCardsByUsage: summarizeTopEntries(actionCardSummary, 12, (entry) => entry.uses),
    topCardsByAbsoluteImpact: summarizeTopEntries(actionCardSummary, 12, (entry) => entry.totalAbsoluteImpact),
  };

  const outputPath = path.resolve(process.cwd(), args.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(`Wrote fuzz report to ${outputPath}`);
  console.log(`Simulations: ${args.simulations}`);
  console.log('Winner rates:');
  for (const powerKey of turnOrder) {
    const wins = winnerCounts[powerKey];
    const rate = ((wins / args.simulations) * 100).toFixed(1);
    console.log(`  ${powerKey}: ${wins} (${rate}%)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
