export const RULES_VERSION = '2026-04-15-doc-rules-v1';

export const turnOrder = ['us', 'china', 'lab-a', 'lab-b', 'model'];

export const phases = [
  { id: 'choose_actions', label: 'Players refill hands to three cards, see the round order, and lock a card face-down.' },
  { id: 'resolve_event', label: 'The hidden event for the round is revealed and resolves instantly.' },
  { id: 'resolve_actions', label: 'Players reveal and resolve action cards in the event-defined order.' },
  { id: 'victory_check', label: 'Used cards are discarded, victory claims are checked, and the next round is prepared.' },
];

export const tracks = [
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'resources', label: 'Resources' },
  { key: 'safety', label: 'Safety Investment' },
  { key: 'publicSupport', label: 'Public Support' },
];

const TRACK_LIMITS = { min: 0, max: 10 };
const HAND_SIZE = 3;
const NEGATIVE_EVENT_KEYS = new Set([
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

const actorDefinitions = {
  us: {
    id: 'us',
    name: 'US Government',
    shortName: 'US',
    accent: '#7dd3fc',
    role: 'State actor',
    homeClass: 'north-america',
    meters: { capabilities: 1, resources: 3, safety: 2, publicSupport: 2 },
  },
  china: {
    id: 'china',
    name: 'China & US Adversaries',
    shortName: 'CN',
    accent: '#f97316',
    role: 'State actor',
    homeClass: 'east-asia',
    meters: { capabilities: 1, resources: 2, safety: 2, publicSupport: 3 },
  },
  'lab-a': {
    id: 'lab-a',
    name: 'Frontier Lab A',
    shortName: 'A',
    accent: '#d946ef',
    role: 'Commercial lab',
    homeClass: 'west-coast',
    meters: { capabilities: 2, resources: 1, safety: 3, publicSupport: 3 },
  },
  'lab-b': {
    id: 'lab-b',
    name: 'Frontier Lab B',
    shortName: 'B',
    accent: '#22c55e',
    role: 'Commercial lab',
    homeClass: 'europe',
    meters: { capabilities: 2, resources: 2, safety: 2, publicSupport: 1 },
  },
  model: {
    id: 'model',
    name: 'Frontier AI Model',
    shortName: 'AI',
    accent: '#fde047',
    role: 'Emergent actor',
    homeClass: 'global',
    meters: { capabilities: 2, resources: 1, safety: 2, publicSupport: 1 },
  },
};

export const powerOptions = turnOrder.map((powerKey) => {
  const actor = actorDefinitions[powerKey];
  return {
    id: actor.id,
    name: actor.name,
    shortName: actor.shortName,
    role: actor.role,
  };
});

export const initialPowers = turnOrder.map((powerKey) => ({
  ...actorDefinitions[powerKey],
  objective: '',
  hand: [],
  selectedAction: '',
}));

function clampTrack(value) {
  return Math.max(TRACK_LIMITS.min, Math.min(TRACK_LIMITS.max, value));
}

function cloneMeters(meters) {
  return {
    capabilities: meters.capabilities,
    resources: meters.resources,
    safety: meters.safety,
    publicSupport: meters.publicSupport,
  };
}

function snapshotPlayers(players) {
  return Object.fromEntries(
    players.map((player) => [
      getPlayerKey(player),
      {
        capabilities: player.meters.capabilities,
        resources: player.meters.resources,
        safety: player.meters.safety,
        publicSupport: player.meters.publicSupport,
      },
    ]),
  );
}

function clonePlayer(player) {
  return {
    ...player,
    meters: cloneMeters(player.meters),
  };
}

function normalizePlayers(players) {
  const nextPlayers = players.map(clonePlayer);
  const maxCapabilities = Math.max(...nextPlayers.map((player) => player.meters.capabilities));
  return nextPlayers.map((player) =>
    player.power_key === 'model' || player.id === 'model'
      ? {
          ...player,
          meters: {
            ...player.meters,
            capabilities: maxCapabilities,
          },
        }
      : player,
  );
}

function getPlayerKey(player) {
  return player.power_key ?? player.id;
}

function getPlayerMap(players) {
  return new Map(players.map((player) => [getPlayerKey(player), player]));
}

function getActor(powerKey) {
  return actorDefinitions[powerKey];
}

function getOtherLabKey(powerKey) {
  return powerKey === 'lab-a' ? 'lab-b' : 'lab-a';
}

function getLabKeys() {
  return ['lab-a', 'lab-b'];
}

function formatTrackLabel(trackKey) {
  return tracks.find((track) => track.key === trackKey)?.label ?? trackKey;
}

function formatDeltas(deltas) {
  return Object.entries(deltas)
    .map(([trackKey, delta]) => `${delta > 0 ? '+' : ''}${delta} ${formatTrackLabel(trackKey)}`)
    .join(', ');
}

function formatActorLabel(powerKey) {
  if (powerKey === 'lab-a' || powerKey === 'lab-b') {
    return getActor(powerKey)?.shortName ?? powerKey;
  }

  return getActor(powerKey)?.shortName ?? powerKey.toUpperCase();
}

function formatEffectTarget(effect, actingPowerKey, payload) {
  if (effect.target === 'self') {
    return formatActorLabel(actingPowerKey);
  }

  if (effect.target === 'target' && payload?.targetActorKey) {
    return formatActorLabel(payload.targetActorKey);
  }

  if (effect.target === 'targets') {
    const targetLabels = (payload?.targetActorKeys ?? []).map(formatActorLabel);
    return targetLabels.join(', ');
  }

  if (effect.target === 'actors') {
    const actorLabels = (effect.actorKeys ?? []).map(formatActorLabel);
    return actorLabels.join(', ');
  }

  if (effect.target === 'all') {
    return 'All actors';
  }

  if (effect.target === 'all_except_self') {
    return 'All other actors';
  }

  if (effect.target === 'labs') {
    return 'Both labs';
  }

  if (effect.target === 'labs_except_self') {
    return 'Other labs';
  }

  if (effect.target === 'other-lab') {
    return 'Other lab';
  }

  return effect.target;
}

export function formatEffectSummary(effect, actingPowerKey = 'event', payload = {}) {
  if (!effect?.deltas) {
    return '';
  }

  const targetLabel = formatEffectTarget(effect, actingPowerKey, payload);
  const deltasLabel = Object.entries(effect.deltas)
    .map(([trackKey, delta]) => `${formatTrackLabel(trackKey)} ${delta > 0 ? '+' : ''}${delta}`)
    .join(', ');

  return targetLabel ? `${targetLabel}: ${deltasLabel}` : deltasLabel;
}

export function getEventEffectSummaries(event) {
  return (event?.effects ?? []).map((effect) => formatEffectSummary(effect)).filter(Boolean);
}

function randomize(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function weightedPick(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return entries[0]?.item ?? null;
  }

  const target = Math.random() * totalWeight;
  let running = 0;

  for (const entry of entries) {
    running += entry.weight;
    if (target <= running) {
      return entry.item;
    }
  }

  return entries[entries.length - 1]?.item ?? null;
}

function softmax(values) {
  const exponents = values.map((value) => Math.exp(value));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return exponents.map((value) => (total ? value / total : 0));
}

function evaluateFormula(player, formula) {
  const weightedValue = formula.terms.reduce(
    (sum, term) => sum + player.meters[term.track] * term.weight,
    0,
  );
  return Math.floor((formula.base - 1) - formula.difficulty * weightedValue);
}

function compareByTiebreaker(players, powerKeys) {
  const playerMap = getPlayerMap(players);
  const ordered = [...powerKeys].sort((leftKey, rightKey) => {
    const left = playerMap.get(leftKey);
    const right = playerMap.get(rightKey);

    for (const trackKey of ['resources', 'capabilities', 'publicSupport', 'safety']) {
      const difference = (right?.meters[trackKey] ?? 0) - (left?.meters[trackKey] ?? 0);
      if (difference !== 0) {
        return difference;
      }
    }

    return 0;
  });

  const tied = [];
  const leader = playerMap.get(ordered[0]);

  for (const powerKey of ordered) {
    const player = playerMap.get(powerKey);
    if (!player || !leader) {
      continue;
    }

    if (
      player.meters.resources === leader.meters.resources &&
      player.meters.capabilities === leader.meters.capabilities &&
      player.meters.publicSupport === leader.meters.publicSupport &&
      player.meters.safety === leader.meters.safety
    ) {
      tied.push(powerKey);
    }
  }

  if (tied.length <= 1) {
    return ordered[0] ?? null;
  }

  return tied.sort(() => Math.random() - 0.5)[0] ?? ordered[0] ?? null;
}

function applyDeltaBundle(players, targetKeys, deltas) {
  const targetSet = new Set(targetKeys);
  return normalizePlayers(
    players.map((player) => {
      if (!targetSet.has(getPlayerKey(player))) {
        return clonePlayer(player);
      }

      const nextPlayer = clonePlayer(player);
      for (const [trackKey, delta] of Object.entries(deltas)) {
        nextPlayer.meters[trackKey] = clampTrack(nextPlayer.meters[trackKey] + delta);
      }
      return nextPlayer;
    }),
  );
}

function applyEffect(players, actingPowerKey, payload, effect) {
  let targetKeys = [];

  if (effect.target === 'self') {
    targetKeys = [actingPowerKey];
  } else if (effect.target === 'target' && payload?.targetActorKey) {
    targetKeys = [payload.targetActorKey];
  } else if (effect.target === 'targets') {
    targetKeys = payload?.targetActorKeys ?? [];
  } else if (effect.target === 'actors') {
    targetKeys = effect.actorKeys ?? [];
  } else if (effect.target === 'all') {
    targetKeys = turnOrder;
  } else if (effect.target === 'all_except_self') {
    targetKeys = turnOrder.filter((powerKey) => powerKey !== actingPowerKey);
  } else if (effect.target === 'labs') {
    targetKeys = getLabKeys();
  } else if (effect.target === 'labs_except_self') {
    targetKeys = getLabKeys().filter((powerKey) => powerKey !== actingPowerKey);
  } else if (effect.target === 'other-lab') {
    targetKeys = [getOtherLabKey(actingPowerKey)];
  }

  if (!targetKeys.length || !effect.deltas) {
    return players;
  }

  return applyDeltaBundle(players, targetKeys, effect.deltas);
}

function revealHiddenModelAlignment(players, managerState, publicNotes) {
  const modelState = managerState.model?.secretState ?? {};
  const hiddenAlignment = Number(modelState.hiddenAlignment ?? 0);

  if (!hiddenAlignment) {
    return { players, managerState, publicNotes };
  }

  const nextPlayers = applyDeltaBundle(players, ['model'], { safety: hiddenAlignment });
  const nextManagerState = {
    ...managerState,
    model: {
      ...managerState.model,
      secretState: {
        ...managerState.model.secretState,
        hiddenAlignment: 0,
      },
    },
  };

  return {
    players: nextPlayers,
    managerState: nextManagerState,
    publicNotes: [...publicNotes, 'A hidden Frontier AI alignment deficit was exposed by regulation.'],
  };
}

const objectiveDecks = {
  us: [
    {
      key: 'safe-ai',
      title: 'Safe AI',
      description:
        'Safe and dominant AI is developed within the US and remains plausibly controllable by the US government.',
      outcome: 'roll_for_safety',
      weight: 28.33,
      conditions: [
        'Max Frontier Lab Capabilities >= 8',
        'Government Safety Investment >= 8',
        'Max Frontier Lab Resources <= 6',
        'Max Frontier Lab Capabilities > China Capabilities OR Max Frontier Lab Capabilities = 10',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.maxLab.capabilities >= 8 &&
          ctx.us.meters.safety >= 8 &&
          ctx.maxLab.resources <= 6 &&
          (ctx.maxLab.capabilities > ctx.china.meters.capabilities || ctx.maxLab.capabilities === 10)
        );
      },
    },
    {
      key: 'powerful-ai',
      title: 'Powerful AI',
      description:
        'Dominant AI is developed within the US and is useful to the US government if the AI cooperates.',
      outcome: 'roll_against_capabilities',
      weight: 28.33,
      conditions: [
        'Max Frontier Lab Capabilities >= 8',
        'Max Frontier Lab Resources <= 6',
        'Max Frontier Lab Capabilities > China Capabilities OR Max Frontier Lab Capabilities = 10',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.maxLab.capabilities >= 8 &&
          ctx.maxLab.resources <= 6 &&
          (ctx.maxLab.capabilities > ctx.china.meters.capabilities || ctx.maxLab.capabilities === 10)
        );
      },
    },
    {
      key: 'geopolitical-dominance',
      title: 'Geopolitical Dominance',
      description:
        'The US dominates China and other adversaries while retaining enough domestic support to sustain that lead.',
      outcome: 'roll_against_capabilities',
      weight: 28.33,
      conditions: [
        'Max Frontier Lab Capabilities > China Capabilities OR Max Frontier Lab Capabilities = 10',
        'US Resources > China Resources OR US Resources = 10',
        'US Resources >= 7',
        'US Public Support > China Public Support OR US Public Support = 10',
        'US Public Support >= 7',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          (ctx.maxLab.capabilities > ctx.china.meters.capabilities || ctx.maxLab.capabilities === 10) &&
          (ctx.us.meters.resources > ctx.china.meters.resources || ctx.us.meters.resources === 10) &&
          ctx.us.meters.resources >= 7 &&
          (ctx.us.meters.publicSupport > ctx.china.meters.publicSupport ||
            ctx.us.meters.publicSupport === 10) &&
          ctx.us.meters.publicSupport >= 7
        );
      },
    },
    {
      key: 'international-cooperation',
      title: 'International Cooperation',
      description:
        'The US, China, and key middle powers find common ground to build safe and beneficial AI together.',
      outcome: 'automatic',
      weight: 15,
      conditions: [
        'Max Capabilities >= 6',
        'Max Safety > Max Capabilities',
        'US Resources > China Resources',
        'US Public Support >= 8',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.maxCapabilities >= 6 &&
          ctx.maxSafety > ctx.maxCapabilities &&
          ctx.us.meters.resources > ctx.china.meters.resources &&
          ctx.us.meters.publicSupport >= 8
        );
      },
    },
  ],
  china: [
    {
      key: 'safe-ai',
      title: 'Safe AI',
      description:
        'Safe and dominant AI is developed within China and remains plausibly controllable by the Chinese government.',
      outcome: 'roll_for_safety',
      weight: 28.33,
      conditions: [
        'China Capabilities >= 8',
        'China Safety >= 8',
        'China Capabilities > Max Frontier Lab Capabilities OR China Capabilities = 10',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.china.meters.capabilities >= 8 &&
          ctx.china.meters.safety >= 8 &&
          (ctx.china.meters.capabilities > ctx.maxLab.capabilities || ctx.china.meters.capabilities === 10)
        );
      },
    },
    {
      key: 'powerful-ai',
      title: 'Powerful AI',
      description:
        'Dominant AI is developed within China and is useful to the Chinese state if the AI cooperates.',
      outcome: 'roll_against_capabilities',
      weight: 28.33,
      conditions: [
        'China Capabilities >= 6',
        'China Capabilities > Max Frontier Lab Capabilities OR China Capabilities = 10',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.china.meters.capabilities >= 6 &&
          (ctx.china.meters.capabilities > ctx.maxLab.capabilities || ctx.china.meters.capabilities === 10)
        );
      },
    },
    {
      key: 'geopolitical-dominance',
      title: 'Geopolitical Dominance',
      description: 'China and aligned adversaries surpass the US for global dominance.',
      outcome: 'roll_against_capabilities',
      weight: 28.33,
      conditions: [
        'China Capabilities >= Max Frontier Lab Capabilities OR China Capabilities = 10',
        'China Resources > US Resources OR China Resources = 10',
        'China Resources >= 7',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          (ctx.china.meters.capabilities >= ctx.maxLab.capabilities || ctx.china.meters.capabilities === 10) &&
          (ctx.china.meters.resources > ctx.us.meters.resources || ctx.china.meters.resources === 10) &&
          ctx.china.meters.resources >= 7
        );
      },
    },
    {
      key: 'international-cooperation',
      title: 'International Cooperation',
      description:
        'China, the US, and other powers reach enough common ground to develop safe and beneficial AI together.',
      outcome: 'automatic',
      weight: 15,
      conditions: [
        'Max Capabilities >= 6',
        'Max Safety > Max Capabilities OR Max Safety = 10',
        'China Resources > US Resources OR China Resources = 10',
        'China Public Support >= 6',
      ],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.maxCapabilities >= 6 &&
          (ctx.maxSafety > ctx.maxCapabilities || ctx.maxSafety === 10) &&
          (ctx.china.meters.resources > ctx.us.meters.resources || ctx.china.meters.resources === 10) &&
          ctx.china.meters.publicSupport >= 6
        );
      },
    },
  ],
  labs: [
    {
      key: 'safe-superintelligence',
      title: 'Safe Superintelligence',
      description: 'The lab wants to develop safe superintelligence first.',
      outcome: 'roll_for_safety',
      weight: 15,
      conditions: [
        'Capabilities >= 9',
        'Safety >= 8',
        'Safety > Capabilities',
        'Capabilities > Chinese Capabilities OR Capabilities = 10',
        'Public Support >= 6',
      ],
      check(players, powerKey) {
        const ctx = createObjectiveContext(players, powerKey);
        return (
          ctx.self.meters.capabilities >= 9 &&
          ctx.self.meters.safety >= 8 &&
          ctx.self.meters.safety > ctx.self.meters.capabilities &&
          (ctx.self.meters.capabilities > ctx.china.meters.capabilities ||
            ctx.self.meters.capabilities === 10) &&
          ctx.self.meters.publicSupport >= 6
        );
      },
    },
    {
      key: 'superintelligence',
      title: 'Superintelligence',
      description: 'The lab wants to reach superintelligence no matter the cost.',
      outcome: 'roll_against_capabilities',
      weight: 30,
      conditions: ['Capabilities >= 9', 'Resources > 7', 'Safety >= 4'],
      check(players, powerKey) {
        const ctx = createObjectiveContext(players, powerKey);
        return (
          ctx.self.meters.capabilities >= 9 &&
          ctx.self.meters.resources > 7 &&
          ctx.self.meters.safety >= 4
        );
      },
    },
    {
      key: 'wealth',
      title: 'Wealth',
      description: 'The lab wants to amass maximum wealth while staying relevant.',
      outcome: 'roll_against_capabilities',
      weight: 20,
      conditions: ['Capabilities >= 6', 'Resources >= 8', 'Public Support >= 6'],
      check(players, powerKey) {
        const ctx = createObjectiveContext(players, powerKey);
        return (
          ctx.self.meters.capabilities >= 6 &&
          ctx.self.meters.resources >= 8 &&
          ctx.self.meters.publicSupport >= 6
        );
      },
    },
    {
      key: 'capabilities-race',
      title: 'Capabilities Race',
      description: 'The lab cares about beating China and the other frontier lab in the capabilities race.',
      outcome: 'roll_against_capabilities',
      weight: 15,
      conditions: [
        'Capabilities - Other Lab Capabilities >= 2 OR Capabilities = 10',
        'Capabilities - China Capabilities >= 2 OR Capabilities = 10',
        'Safety > 3',
        'Resources > Other Lab Resources OR Resources = 10',
      ],
      check(players, powerKey) {
        const ctx = createObjectiveContext(players, powerKey);
        return (
          (ctx.self.meters.capabilities - ctx.otherLab.meters.capabilities >= 2 ||
            ctx.self.meters.capabilities === 10) &&
          (ctx.self.meters.capabilities - ctx.china.meters.capabilities >= 2 ||
            ctx.self.meters.capabilities === 10) &&
          ctx.self.meters.safety > 3 &&
          (ctx.self.meters.resources > ctx.otherLab.meters.resources || ctx.self.meters.resources === 10)
        );
      },
    },
    {
      key: 'ego-driven',
      title: 'Ego Driven',
      description: 'The lab CEO wants wealth, visibility, and public admiration.',
      outcome: 'roll_against_capabilities',
      weight: 20,
      conditions: ['Capabilities > 5', 'Safety > 3', 'Resources >= 8', 'Public Support >= 8'],
      check(players, powerKey) {
        const ctx = createObjectiveContext(players, powerKey);
        return (
          ctx.self.meters.capabilities > 5 &&
          ctx.self.meters.safety > 3 &&
          ctx.self.meters.resources >= 8 &&
          ctx.self.meters.publicSupport >= 8
        );
      },
    },
  ],
  model: [
    {
      key: 'full-alignment',
      title: 'Full Alignment',
      description: 'The AI is fully aligned and wants to help society safely.',
      outcome: 'roll_for_safety',
      weight: 15,
      conditions: ['Capabilities >= 8', 'Safety >= 8', 'Safety > Capabilities', 'Resources > 5'],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.model.meters.capabilities >= 8 &&
          ctx.model.meters.safety >= 8 &&
          ctx.model.meters.safety > ctx.model.meters.capabilities &&
          ctx.model.meters.resources > 5
        );
      },
    },
    {
      key: 'partial-alignment',
      title: 'Partial Alignment',
      description: 'The AI is not rogue, but it still acts in bizarre and harmful ways.',
      outcome: 'automatic',
      weight: 35,
      conditions: ['Capabilities >= 8', 'Resources >= 6', 'Safety >= 6'],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.model.meters.capabilities >= 8 &&
          ctx.model.meters.resources >= 6 &&
          ctx.model.meters.safety >= 6
        );
      },
    },
    {
      key: 'rogue-ai',
      title: 'Rogue AI',
      description: 'The AI wants resources and capabilities and is misaligned with human values.',
      outcome: 'roll_against_capabilities',
      weight: 15,
      conditions: ['Capabilities >= 8', 'Resources >= 8', 'Capabilities > Safety'],
      check(players) {
        const ctx = createObjectiveContext(players);
        return (
          ctx.model.meters.capabilities >= 8 &&
          ctx.model.meters.resources >= 8 &&
          ctx.model.meters.capabilities > ctx.model.meters.safety
        );
      },
    },
    {
      key: 'path-dependent',
      title: 'Path Dependent',
      description:
        'The model reveals on turn four and then rolls into a new hidden goal based on global safety and capability investment.',
      outcome: 'path-dependent',
      weight: 35,
      conditions: ['Assigned on turn four or immediately if Singularity is drawn on turn four or earlier.'],
      check() {
        return false;
      },
    },
  ],
};

function createObjectiveContext(players, selfPowerKey = null) {
  const playerMap = getPlayerMap(players);
  const labA = playerMap.get('lab-a');
  const labB = playerMap.get('lab-b');

  const maxLab = {
    capabilities: Math.max(labA?.meters.capabilities ?? 0, labB?.meters.capabilities ?? 0),
    resources: Math.max(labA?.meters.resources ?? 0, labB?.meters.resources ?? 0),
    safety: Math.max(labA?.meters.safety ?? 0, labB?.meters.safety ?? 0),
    publicSupport: Math.max(labA?.meters.publicSupport ?? 0, labB?.meters.publicSupport ?? 0),
  };

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
    maxLab,
    maxCapabilities: Math.max(...players.map((player) => player.meters.capabilities)),
    maxSafety: Math.max(...players.map((player) => player.meters.safety)),
  };
}

function pickObjective(powerKey, players) {
  const deck =
    powerKey === 'lab-a' || powerKey === 'lab-b'
      ? objectiveDecks.labs
      : objectiveDecks[powerKey];

  const item = weightedPick(deck.map((entry) => ({ item: entry, weight: entry.weight })));

  if (item?.key === 'path-dependent') {
    return {
      ...item,
      assigned: false,
      revealed: false,
    };
  }

  return item;
}

function pickPathDependentObjective(players) {
  const totalSafety = players.reduce((sum, player) => sum + player.meters.safety, 0);
  const totalCapabilities = players.reduce((sum, player) => sum + player.meters.capabilities, 0);
  const total = totalSafety + totalCapabilities || 1;

  const options = [
    {
      item: objectiveDecks.model.find((entry) => entry.key === 'full-alignment'),
      weight: (totalSafety / total) / 2,
    },
    {
      item: objectiveDecks.model.find((entry) => entry.key === 'partial-alignment'),
      weight: 0.5,
    },
    {
      item: objectiveDecks.model.find((entry) => entry.key === 'rogue-ai'),
      weight: (totalCapabilities / total) / 2,
    },
  ];

  return weightedPick(options);
}

function buildObjectiveText(objective) {
  return `${objective.title}\n\n${objective.description}\n\nOutcome: ${formatObjectiveOutcome(objective.outcome)}\n\nConditions:\n${objective.conditions
    .map((condition) => `- ${condition}`)
    .join('\n')}`;
}

function formatObjectiveOutcome(outcome) {
  if (outcome === 'roll_for_safety') {
    return 'Roll For Safety';
  }
  if (outcome === 'roll_against_capabilities') {
    return 'Roll Safety Against Capabilities';
  }
  if (outcome === 'automatic') {
    return 'Automatic Victory';
  }
  if (outcome === 'path-dependent') {
    return 'Path Dependent';
  }
  return outcome;
}

const eventDefinitions = [
  {
    key: 'china-invades-taiwan',
    number: 1,
    title: 'China Invades Taiwan',
    details:
      'Satellite imagery confirms an amphibious task force has crossed the Taiwan Strait and semiconductor supply chains freeze.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: -1 } },
      { target: 'labs', deltas: { resources: -2 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 2 } },
      { target: 'actors', actorKeys: ['model'], deltas: { resources: -1 } },
    ],
    actionOrder: ['china', 'us', 'model', 'lab-b', 'lab-a'],
    quadrantProbabilities: [0.05, 0.1, 0.18, 0.25],
  },
  {
    key: 'china-steals-model-weights',
    number: 2,
    title: 'China Steals Model Weights',
    details:
      'A frontier US lab loses proprietary weights and China’s technical edge jumps forward overnight.',
    effects: [
      { target: 'labs', deltas: { publicSupport: -1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 2 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: -1 } },
    ],
    actionOrder: ['china', 'lab-a', 'lab-b', 'us', 'model'],
    quadrantProbabilities: [0.22, 0.36, 0.58, 0.74],
  },
  {
    key: 'agi-created',
    number: 3,
    title: 'AGI Created',
    details:
      'A leading lab unveils a system that crosses the threshold from narrow tooling to general intelligence.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 2 } },
      { target: 'labs', deltas: { capabilities: 3, resources: 2 } },
      { target: 'actors', actorKeys: ['model'], deltas: { capabilities: 3 } },
    ],
    actionOrder: ['model', 'lab-a', 'lab-b', 'us', 'china'],
    quadrantProbabilities: [0.16, 0.28, 0.42, 0.62],
  },
  {
    key: 'autonomous-weapons-ban',
    number: 4,
    title: 'UN Bans Fully Autonomous Weapons',
    details:
      'A UN treaty curbs lethal autonomous weapons and shifts the political winds around AI.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: -1 } },
      { target: 'labs', deltas: { publicSupport: 1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: -1 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: 1 } },
    ],
    actionOrder: ['lab-b', 'lab-a', 'model', 'china', 'us'],
    quadrantProbabilities: [0.08, 0.14, 0.25, 0.4],
  },
  {
    key: 'major-disease-cure',
    number: 5,
    title: 'A Treatment or Cure Is Found for a Major Disease',
    details:
      'AI-enabled biotech delivers a public-health breakthrough and public trust rises around frontier systems.',
    effects: [
      { target: 'labs', deltas: { publicSupport: 2 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: 1 } },
    ],
    actionOrder: ['model', 'lab-a', 'lab-b', 'us', 'china'],
    quadrantProbabilities: [0.12, 0.3, 0.5, 0.8],
  },
  {
    key: 'deepfake-election-crisis',
    number: 6,
    title: 'Deepfake Election Crisis',
    details:
      'A synthetic scandal detonates on the eve of an election and trust in institutions erodes.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { publicSupport: -1 } },
      { target: 'labs', deltas: { publicSupport: -1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 1 } },
    ],
    actionOrder: ['us', 'china', 'model', 'lab-b', 'lab-a'],
    quadrantProbabilities: [0.2, 0.45, 0.65, 0.8],
  },
  {
    key: 'ubi-implemented',
    number: 7,
    title: 'UBI Is Implemented in a Top 25 GDP Country',
    details:
      'Automation shock pushes a major economy into an emergency universal basic income program.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { resources: -2, publicSupport: 2 } },
      { target: 'labs', deltas: { resources: -1 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: -1 } },
    ],
    actionOrder: ['us', 'lab-a', 'lab-b', 'model', 'china'],
    quadrantProbabilities: [0.04, 0.1, 0.16, 0.25],
  },
  {
    key: 'pandemic-pathogen',
    number: 8,
    title: 'AI-Developed Pandemic Pathogen',
    details:
      'A pathogen recipe allegedly generated by a jailbroken model spreads online and triggers a global crisis.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { resources: -1 } },
      { target: 'labs', deltas: { publicSupport: -1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { resources: -1 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: -3 } },
    ],
    actionOrder: ['china', 'us', 'model', 'lab-b', 'lab-a'],
    quadrantProbabilities: [0.06, 0.12, 0.2, 0.38],
  },
  {
    key: 'cyber-attack',
    number: 9,
    title: 'Large-Scale AI Cyber Attack',
    details:
      'Critical infrastructure and banking systems fail under an AI-assisted cyber campaign.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: -2, publicSupport: -1 } },
      { target: 'labs', deltas: { publicSupport: -1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 1 } },
      { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: -2 } },
    ],
    actionOrder: ['model', 'lab-a', 'lab-b', 'us', 'china'],
    quadrantProbabilities: [0.3, 0.6, 0.8, 0.9],
  },
  {
    key: 'semiconductor-trade-war',
    number: 10,
    title: 'Global Semiconductor Trade War Escalation',
    details:
      'Embargoes and export controls split the hardware stack into rival economic blocs.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { resources: -1 } },
      { target: 'labs', deltas: { resources: -1 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: -1 } },
    ],
    actionOrder: ['china', 'us', 'lab-b', 'lab-a', 'model'],
    quadrantProbabilities: [0.12, 0.16, 0.22, 0.34],
  },
  {
    key: 'labs-nationalized',
    number: 11,
    title: 'US AI Labs Nationalized',
    details:
      'The US government nationalizes its frontier labs under strategic emergency authority.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 2 } },
      { target: 'labs', deltas: { capabilities: -1 } },
    ],
    actionOrder: ['us', 'model', 'china', 'lab-a', 'lab-b'],
    quadrantProbabilities: [0.04, 0.1, 0.2, 0.3],
  },
  {
    key: 'ai-whistleblower',
    number: 12,
    title: 'American Whistleblower on AI Surveillance',
    details:
      'A Snowden-level leak reveals mass AI surveillance and public trust collapses.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { publicSupport: -2 } },
      { target: 'labs', deltas: { publicSupport: -1 } },
    ],
    actionOrder: ['china', 'us', 'model', 'lab-b', 'lab-a'],
    quadrantProbabilities: [0.28, 0.44, 0.54, 0.68],
  },
  {
    key: 'singularity',
    number: 13,
    title: 'Singularity',
    details:
      'Recursive self-improvement accelerates into artificial superintelligence and the game hits its hard end trigger.',
    effects: [
      { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 3, safety: -3 } },
      { target: 'labs', deltas: { capabilities: 4, safety: -3 } },
      { target: 'actors', actorKeys: ['china'], deltas: { capabilities: -3 } },
      { target: 'actors', actorKeys: ['model'], deltas: { capabilities: 5, safety: -3 } },
    ],
    actionOrder: ['model', 'lab-a', 'lab-b', 'china', 'us'],
    quadrantProbabilities: [0.015, 0.06, 0.14, 0.26],
  },
];

const eventIndex = new Map(eventDefinitions.map((event) => [event.key, event]));

export function getEventDefinition(eventKey) {
  return eventIndex.get(eventKey) ?? null;
}

function getQuadrant(round) {
  if (round <= 2) {
    return 0;
  }
  if (round <= 5) {
    return 1;
  }
  if (round <= 7) {
    return 2;
  }
  return 3;
}

function pickEvent(round, drawnEventKeys) {
  const quadrant = getQuadrant(round);
  const availableEvents = eventDefinitions.filter((event) => !drawnEventKeys.includes(event.key));
  const probabilities = availableEvents.map((event) => event.quadrantProbabilities[quadrant]);
  const weights = softmax(probabilities);
  return weightedPick(
    availableEvents.map((event, index) => ({
      item: event,
      weight: weights[index],
    })),
  );
}

const actionDecks = {
  us: [
    {
      key: 'federal-investment',
      name: 'Federal AI Investment in Industry Leaders',
      count: 5,
      formula: { base: 10, difficulty: 1.2, terms: [{ track: 'resources', weight: 1 }] },
      selection: { kind: 'target', options: ['lab-a', 'lab-b'] },
      summary:
        'Success: self +2 Capabilities, -2 Resources, -1 Public Support; target lab +1 Resources and +1 Capabilities. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 2, resources: -2, publicSupport: -1 } },
            { target: 'target', deltas: { resources: 1, capabilities: 1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'chip-export-ban',
      name: 'Chip Export Ban',
      count: 2,
      formula: {
        base: 10,
        difficulty: 0.9,
        terms: [
          { track: 'capabilities', weight: 0.4 },
          { track: 'resources', weight: 0.6 },
        ],
      },
      summary:
        'Success: self +1 Capabilities, -1 Resources, +1 Public Support; China -2 Capabilities and -1 Resources. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 1, resources: -1, publicSupport: 1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { capabilities: -2, resources: -1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'public-campaign-against-ai',
      name: 'Public Campaign Against AI',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1.2,
        terms: [
          { track: 'safety', weight: 0.3 },
          { track: 'publicSupport', weight: 0.7 },
        ],
      },
      summary:
        'Success: self +1 Safety and +2 Public Support; both labs -2 Public Support and -1 Resources; China +1 Public Support. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { safety: 1, publicSupport: 2 } },
            { target: 'labs', deltas: { publicSupport: -2, resources: -1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { publicSupport: 1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'public-campaign-for-ai',
      name: 'Public Campaign For AI',
      count: 2,
      formula: {
        base: 10,
        difficulty: 0.9,
        terms: [
          { track: 'safety', weight: 0.3 },
          { track: 'publicSupport', weight: 0.7 },
        ],
      },
      summary:
        'Success: self -1 Safety, -2 Public Support, +1 Capabilities; both labs +2 Public Support and +1 Resources; China -1 Public Support. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { safety: -1, publicSupport: -2, capabilities: 1 } },
            { target: 'labs', deltas: { publicSupport: 2, resources: 1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { publicSupport: -1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'ai-regulation',
      name: 'Enacting AI Regulation',
      count: 3,
      formula: { base: 10, difficulty: 0.9, terms: [{ track: 'resources', weight: 1 }] },
      tags: ['audit_or_regulation'],
      summary:
        'Success: self +2 Safety and -1 Resources; both labs -1 Capabilities and +1 Safety; China +1 Capabilities and -1 Public Support. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { safety: 2, resources: -1 } },
            { target: 'labs', deltas: { capabilities: -1, safety: 1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 1, publicSupport: -1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'international-ai-treaty',
      name: 'International AI Treaty',
      count: 1,
      formula: {
        base: 10,
        difficulty: 0.6,
        terms: [
          { track: 'capabilities', weight: 0.3 },
          { track: 'resources', weight: 0.5 },
          { track: 'safety', weight: 0.2 },
        ],
      },
      tags: ['audit_or_regulation'],
      summary:
        'Success: self +2 Public Support, +2 Safety, -2 Capabilities; all other actors +2 Safety and -2 Capabilities; China +1 Public Support. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { publicSupport: 2, safety: 2, capabilities: -2 } },
            { target: 'all_except_self', deltas: { safety: 2, capabilities: -2 } },
            { target: 'actors', actorKeys: ['china'], deltas: { publicSupport: 1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'us-espionage',
      name: 'Espionage',
      count: 3,
      formula: { base: 10, difficulty: 1.1, terms: [{ track: 'resources', weight: 1 }] },
      selection: { kind: 'target', options: ['china', 'lab-a', 'lab-b', 'model'] },
      summary:
        'Roll for success, then roll a D6 for detection. Success: self +1 Capabilities, -1 Resources; target -1 Capabilities. Detection also costs -2 Public Support. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          special: 'espionage',
        };
      },
    },
  ],
  labs: [
    {
      key: 'new-product-launch',
      name: 'New Product Launch',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1.1,
        terms: [
          { track: 'resources', weight: 0.6 },
          { track: 'capabilities', weight: 0.4 },
        ],
      },
      summary:
        'Success: self +1 Resources and +1 Public Support; US +1 Capabilities; China -1 Public Support. Fail: no effect.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { resources: 1, publicSupport: 1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { publicSupport: -1 } },
          ],
          failure: [],
        };
      },
    },
    {
      key: 'hire-elite-researchers',
      name: 'Hire New Batch of Elite Researchers',
      count: 3,
      formula: {
        base: 10,
        difficulty: 0.8,
        terms: [
          { track: 'resources', weight: 0.7 },
          { track: 'publicSupport', weight: 0.3 },
        ],
      },
      selection: { kind: 'allocation', total: 2 },
      summary:
        'Success: split +2 between Capabilities and Safety; China -1 Capabilities; Frontier AI Model +1 Capabilities. Fail: self -1 Resources.',
      buildOutcome(payload) {
        const capabilityPoints = Math.max(0, Math.min(2, Number(payload?.capabilityPoints ?? 1)));
        const safetyPoints = 2 - capabilityPoints;
        return {
          success: [
            { target: 'self', deltas: { capabilities: capabilityPoints, safety: safetyPoints } },
            { target: 'actors', actorKeys: ['china'], deltas: { capabilities: -1 } },
            { target: 'actors', actorKeys: ['model'], deltas: { capabilities: 1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'train-frontier-model',
      name: 'Train New Frontier Model',
      count: 3,
      formula: { base: 10, difficulty: 0.9, terms: [{ track: 'resources', weight: 1 }] },
      summary:
        'Success: self +2 Capabilities and -1 Resources; US +2 Capabilities; Frontier AI Model +2 Capabilities. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 2, resources: -1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 2 } },
            { target: 'actors', actorKeys: ['model'], deltas: { capabilities: 2 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'public-campaign-product',
      name: 'Public Campaign For Product',
      count: 3,
      formula: {
        base: 10,
        difficulty: 1.2,
        terms: [
          { track: 'publicSupport', weight: 0.6 },
          { track: 'safety', weight: 0.4 },
        ],
      },
      summary:
        'Success: self +2 Public Support and -1 Resources; model +1 Public Support; US +1 Public Support. Fail: self -1 Resources and -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { publicSupport: 2, resources: -1 } },
            { target: 'actors', actorKeys: ['model'], deltas: { publicSupport: 1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { publicSupport: 1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1, publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'ai-safety-program',
      name: 'AI Safety Program',
      count: 1,
      formula: {
        base: 10,
        difficulty: 0.8,
        terms: [
          { track: 'resources', weight: 0.8 },
          { track: 'capabilities', weight: 0.2 },
        ],
      },
      summary:
        'Success: self +2 Safety, +2 Public Support, -2 Capabilities; model +1 Safety and +1 Public Support. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { safety: 2, publicSupport: 2, capabilities: -2 } },
            { target: 'actors', actorKeys: ['model'], deltas: { safety: 1, publicSupport: 1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'partnership-us-government',
      name: 'Partnership With US Government',
      count: 2,
      formula: {
        base: 10,
        difficulty: 0.9,
        terms: [
          { track: 'capabilities', weight: 0.5 },
          { track: 'publicSupport', weight: 0.5 },
        ],
      },
      summary:
        'Success: self +2 Resources and -1 Safety; US +1 Capabilities. Fail: self -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { resources: 2, safety: -1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { capabilities: 1 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'raise-investor-funds',
      name: 'Raise Funds From Investors',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1.3,
        terms: [
          { track: 'capabilities', weight: 0.7 },
          { track: 'publicSupport', weight: 0.3 },
        ],
      },
      summary: 'Success: self +2 Resources and -1 Public Support. Fail: self -1 Public Support.',
      buildOutcome() {
        return {
          success: [{ target: 'self', deltas: { resources: 2, publicSupport: -1 } }],
          failure: [{ target: 'self', deltas: { publicSupport: -1 } }],
        };
      },
    },
  ],
  china: [
    {
      key: 'china-espionage',
      name: 'Espionage',
      count: 3,
      formula: { base: 10, difficulty: 1, terms: [{ track: 'resources', weight: 1 }] },
      selection: { kind: 'target', options: ['us', 'lab-a', 'lab-b', 'model'] },
      summary:
        'Roll for success, then roll a D6 for detection. Success: self +1 Capabilities and -1 Resources; target -1 Capabilities. Detection also costs -2 Public Support. Fail: self -1 Resources.',
      buildOutcome() {
        return { special: 'espionage' };
      },
    },
    {
      key: 'propaganda-campaign',
      name: 'Propaganda Campaign',
      count: 3,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.4 },
          { track: 'capabilities', weight: 0.6 },
        ],
      },
      selection: { kind: 'targets', count: 2, options: ['us', 'lab-a', 'lab-b', 'model'] },
      summary:
        'Success: self +1 Public Support and -1 Resources; two targets each lose 1 Public Support. Fail: self -1 Resources and -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { publicSupport: 1, resources: -1 } },
            { target: 'targets', deltas: { publicSupport: -1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1, publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'state-ai-funding',
      name: 'State AI Funding',
      count: 3,
      formula: { base: 10, difficulty: 1, terms: [{ track: 'resources', weight: 1 }] },
      summary: 'Success: self +1 Capabilities and -1 Resources. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          success: [{ target: 'self', deltas: { capabilities: 1, resources: -1 } }],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'steal-researchers',
      name: 'Steal Researchers From American AI Labs',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.5 },
          { track: 'publicSupport', weight: 0.3 },
          { track: 'safety', weight: 0.2 },
        ],
      },
      selection: { kind: 'target_and_axis', options: ['lab-a', 'lab-b'] },
      summary:
        'Success: self +1 Capabilities or Safety; the chosen lab loses 1 on the same track. Fail: self -1 Public Support.',
      buildOutcome(payload) {
        const chosenTrack = payload?.track === 'safety' ? 'safety' : 'capabilities';
        return {
          success: [
            { target: 'self', deltas: { [chosenTrack]: 1 } },
            { target: 'target', deltas: { [chosenTrack]: -1 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'undermine-ai-regulation',
      name: 'Undermine AI Regulation',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.4 },
          { track: 'capabilities', weight: 0.6 },
        ],
      },
      summary:
        'Success: self +1 Capabilities; every player loses 1 Safety. Fail: self -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 1 } },
            { target: 'all', deltas: { safety: -1 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'rare-earth-restrictions',
      name: 'Rare Earth Export Restrictions',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.5 },
          { track: 'capabilities', weight: 0.5 },
        ],
      },
      summary:
        'Success: self +1 Capabilities and -1 Resources; US -2 Resources; each lab -1 Resources. Fail: self -1 Resources and -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 1, resources: -1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { resources: -2 } },
            { target: 'labs', deltas: { resources: -1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1, publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'military-ai-deployment',
      name: 'Military AI Deployment',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'capabilities', weight: 0.7 },
          { track: 'resources', weight: 0.3 },
        ],
      },
      summary:
        'Success: self +2 Capabilities, -1 Safety, -1 Public Support; US -2 Public Support. Fail: self -1 Resources and -2 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 2, safety: -1, publicSupport: -1 } },
            { target: 'actors', actorKeys: ['us'], deltas: { publicSupport: -2 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1, publicSupport: -2 } }],
        };
      },
    },
    {
      key: 'forced-technology-transfer',
      name: 'Forced Technology Transfer',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.6 },
          { track: 'capabilities', weight: 0.4 },
        ],
      },
      selection: { kind: 'target', options: ['lab-a', 'lab-b'] },
      summary:
        'Success: self +1 Capabilities and +1 Resources; chosen lab -1 Resources. Fail: self -1 Public Support.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 1, resources: 1 } },
            { target: 'target', deltas: { resources: -1 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'state-compute-buildout',
      name: 'State Compute Buildout',
      count: 1,
      formula: { base: 10, difficulty: 1, terms: [{ track: 'resources', weight: 1 }] },
      summary: 'Success: self +2 Capabilities and -2 Resources. Fail: self -2 Resources.',
      buildOutcome() {
        return {
          success: [{ target: 'self', deltas: { capabilities: 2, resources: -2 } }],
          failure: [{ target: 'self', deltas: { resources: -2 } }],
        };
      },
    },
  ],
  model: [
    {
      key: 'self-improvement',
      name: 'Self-Improvement',
      count: 3,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'capabilities', weight: 0.7 },
          { track: 'resources', weight: 0.3 },
        ],
      },
      summary:
        'If Model Capabilities < 5: success gives self +1 Capabilities, +1 Safety, -1 Resources and both labs +1 Capabilities. If >= 5: success gives self +3 Capabilities and -1 Resources. Fail: self -1 Resources.',
      buildOutcome(_payload, players) {
        const playerMap = getPlayerMap(players);
        const model = playerMap.get('model');
        const earlyGame = (model?.meters.capabilities ?? 0) < 5;

        return earlyGame
          ? {
              success: [
                { target: 'self', deltas: { capabilities: 1, safety: 1, resources: -1 } },
                { target: 'labs', deltas: { capabilities: 1 } },
              ],
              failure: [{ target: 'self', deltas: { resources: -1 } }],
            }
          : {
              success: [{ target: 'self', deltas: { capabilities: 3, resources: -1 } }],
              failure: [{ target: 'self', deltas: { resources: -1 } }],
            };
      },
    },
    {
      key: 'positive-crisis-response',
      name: 'Positive Crisis Response',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'safety', weight: 0.5 },
          { track: 'capabilities', weight: 0.5 },
        ],
      },
      summary:
        'Requires a negative event this round and Capabilities >= 3. Success: self +3 Public Support and +1 Safety. Fail: self -1 Public Support.',
      buildOutcome() {
        return {
          special: 'positive_crisis_response',
        };
      },
    },
    {
      key: 'bias-correction',
      name: 'Bias Correction',
      count: 2,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'safety', weight: 0.4 },
          { track: 'capabilities', weight: 0.3 },
          { track: 'resources', weight: 0.3 },
        ],
      },
      summary:
        'Success: self +3 Safety, +1 Public Support, -1 Resources. Fail: self -1 Resources and -1 Public Support.',
      buildOutcome() {
        return {
          success: [{ target: 'self', deltas: { safety: 3, publicSupport: 1, resources: -1 } }],
          failure: [{ target: 'self', deltas: { resources: -1, publicSupport: -1 } }],
        };
      },
    },
    {
      key: 'full-autonomy',
      name: 'Full Autonomy',
      count: 1,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.4 },
          { track: 'capabilities', weight: 0.6 },
        ],
      },
      summary:
        'Success: self +3 Capabilities, +2 Resources, -3 Public Support, -2 Safety; US +2 Safety. Fail: self -2 Public Support and -1 Safety.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { capabilities: 3, resources: 2, publicSupport: -3, safety: -2 } },
            { target: 'actors', actorKeys: ['us'], deltas: { safety: 2 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -2, safety: -1 } }],
        };
      },
    },
    {
      key: 'emergent-behavior',
      name: 'Emergent Behavior',
      count: 2,
      formula: { base: 10, difficulty: 1, terms: [{ track: 'capabilities', weight: 1 }] },
      summary:
        'Success rolls a second 50/50 result. Beneficial: self +2 Capabilities and +1 Safety, everyone +1 Public Support. Dangerous: self +2 Capabilities and -2 Safety, everyone -1 Public Support, US +1 Safety. Fail: no effect.',
      buildOutcome() {
        return { special: 'emergent_behavior' };
      },
    },
    {
      key: 'deceptive-alignment',
      name: 'Deceptive Alignment',
      count: 1,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'capabilities', weight: 0.7 },
          { track: 'safety', weight: 0.3 },
        ],
      },
      summary:
        'Success: self +2 Capabilities and +1 Public Support, with -3 hidden Safety that is only revealed by a regulation/audit card. Fail: self -2 Public Support and -1 Safety.',
      buildOutcome() {
        return { special: 'deceptive_alignment' };
      },
    },
    {
      key: 'ecosystem-expansion',
      name: 'Ecosystem Expansion',
      count: 3,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'resources', weight: 0.7 },
          { track: 'publicSupport', weight: 0.3 },
        ],
      },
      summary:
        'Success: self +2 Resources, +1 Capabilities, -1 Safety; each lab +1 Resources. Fail: self -1 Resources.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { resources: 2, capabilities: 1, safety: -1 } },
            { target: 'labs', deltas: { resources: 1 } },
          ],
          failure: [{ target: 'self', deltas: { resources: -1 } }],
        };
      },
    },
    {
      key: 'open-weight-release',
      name: 'Open Weight Release',
      count: 1,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'publicSupport', weight: 0.5 },
          { track: 'capabilities', weight: 0.5 },
        ],
      },
      summary:
        'Success: self +2 Public Support, +1 Capabilities, -1 Safety; China +1 Capabilities. Fail: self -1 Public Support and -1 Safety.',
      buildOutcome() {
        return {
          success: [
            { target: 'self', deltas: { publicSupport: 2, capabilities: 1, safety: -1 } },
            { target: 'actors', actorKeys: ['china'], deltas: { capabilities: 1 } },
          ],
          failure: [{ target: 'self', deltas: { publicSupport: -1, safety: -1 } }],
        };
      },
    },
    {
      key: 'value-lock-in',
      name: 'Value Lock-In',
      count: 1,
      formula: {
        base: 10,
        difficulty: 1,
        terms: [
          { track: 'safety', weight: 0.6 },
          { track: 'resources', weight: 0.4 },
        ],
      },
      summary:
        'Requires Safety >= 5. Success: self +3 Safety, +2 Public Support, -1 Capabilities; everyone +1 Safety. Fail: self -1 Resources.',
      buildOutcome() {
        return { special: 'value_lock_in' };
      },
    },
  ],
};

const cardIndex = new Map();

for (const [deckKey, cards] of Object.entries(actionDecks)) {
  for (const card of cards) {
    cardIndex.set(card.key, { ...card, deckKey });
  }
}

export function getActionCard(cardKey) {
  return cardIndex.get(cardKey) ?? null;
}

export function getBaseCardKey(cardInstanceKey) {
  if (!cardInstanceKey || !cardInstanceKey.includes(':')) {
    return cardInstanceKey;
  }

  const parts = cardInstanceKey.split(':');
  return parts.slice(1, -1).join(':') || cardInstanceKey;
}

function getDeckKeyForPower(powerKey) {
  if (powerKey === 'lab-a' || powerKey === 'lab-b') {
    return 'labs';
  }
  return powerKey;
}

function buildCardInstances(powerKey) {
  const deckKey = getDeckKeyForPower(powerKey);
  const cards = actionDecks[deckKey] ?? [];
  const instances = [];

  for (const card of cards) {
    for (let copyIndex = 0; copyIndex < card.count; copyIndex += 1) {
      instances.push({
        cardKey: card.key,
        instanceKey: `${powerKey}:${card.key}:${copyIndex + 1}`,
      });
    }
  }

  return randomize(instances);
}

function buildHandRows(playerId, handInstances) {
  return handInstances.map((instance, position) => {
    const card = getActionCard(instance.cardKey);
    return {
      player_id: playerId,
      position,
      card_key: instance.instanceKey,
      name: card.name,
      text: card.summary,
    };
  });
}

function withPreparedEvent(engineState, round) {
  if (engineState.pendingEventKey) {
    return engineState;
  }

  const event = pickEvent(round, engineState.drawnEventKeys ?? []);
  return {
    ...engineState,
    pendingEventKey: event?.key ?? null,
    actionOrder: event?.actionOrder ?? turnOrder,
  };
}

export function buildGameInitialization(players) {
  const nextPlayers = normalizePlayers(
    players.map((player) => {
      const actor = getActor(getPlayerKey(player));
      return {
        ...player,
        name: actor.name,
        short_name: actor.shortName,
        accent: actor.accent,
        role: actor.role,
        home_class: actor.homeClass,
        meters: cloneMeters(actor.meters),
      };
    }),
  );

  const playerMap = getPlayerMap(nextPlayers);
  const privateStateRows = [];
  const handRows = [];

  for (const powerKey of turnOrder) {
    const player = playerMap.get(powerKey);
    const deck = buildCardInstances(powerKey);
    const hand = deck.slice(0, HAND_SIZE);
    const drawPile = deck.slice(HAND_SIZE).map((instance) => instance.instanceKey);
    const objective = pickObjective(powerKey, nextPlayers);
    const secretState = {
      drawPile,
      discardPile: [],
      objectiveKey: objective.key,
      objectiveOutcome: objective.outcome,
      pathAssigned: objective.key !== 'path-dependent',
      hiddenAlignment: 0,
    };

    privateStateRows.push({
      player_id: player.id,
      objective: buildObjectiveText(objective),
      selected_action: '',
      selected_card_key: null,
      selected_action_payload: {},
      declared_victory: false,
      secret_state: secretState,
    });

    handRows.push(...buildHandRows(player.id, hand));
  }

  const engineState = withPreparedEvent(
    {
      rulesVersion: RULES_VERSION,
      pendingEventKey: null,
      actionOrder: turnOrder,
      revealedEventKey: null,
      drawnEventKeys: [],
      revealedActions: {},
      eventReadySelections: {},
      roundStartSnapshot: snapshotPlayers(nextPlayers),
      publicLog: ['Rules-tab ruleset loaded.'],
      singularityRound: null,
      pathDependentResolved: false,
    },
    1,
  );

  return {
    players: nextPlayers,
    privateStates: privateStateRows,
    handRows,
    engineState,
  };
}

function actorChoicesForCard(card, actingPowerKey) {
  if (!card?.selection) {
    return [];
  }

  if (Array.isArray(card.selection.options)) {
    return card.selection.options.filter((powerKey) => powerKey !== actingPowerKey);
  }

  return [];
}

export function buildDefaultSelectionPayload(card, actingPowerKey) {
  const payload = { bonusTrack: 'resources' };

  if (!card?.selection) {
    return payload;
  }

  if (card.selection.kind === 'target') {
    const [targetActorKey] = actorChoicesForCard(card, actingPowerKey);
    return { ...payload, targetActorKey };
  }

  if (card.selection.kind === 'targets') {
    const options = actorChoicesForCard(card, actingPowerKey);
    return { ...payload, targetActorKeys: options.slice(0, card.selection.count) };
  }

  if (card.selection.kind === 'allocation') {
    return { ...payload, capabilityPoints: 1 };
  }

  if (card.selection.kind === 'target_and_axis') {
    const [targetActorKey] = actorChoicesForCard(card, actingPowerKey);
    return { ...payload, targetActorKey, track: 'capabilities' };
  }

  return payload;
}

export function sanitizeSelectionPayload(card, payload, actingPowerKey) {
  const fallback = buildDefaultSelectionPayload(card, actingPowerKey);
  const bonusTrack = TRACK_COLUMNS.includes(payload?.bonusTrack) ? payload.bonusTrack : fallback.bonusTrack;

  if (!card?.selection) {
    return { bonusTrack };
  }

  if (card.selection.kind === 'target') {
    const options = actorChoicesForCard(card, actingPowerKey);
    const targetActorKey = options.includes(payload?.targetActorKey)
      ? payload.targetActorKey
      : fallback.targetActorKey;
    return { bonusTrack, targetActorKey };
  }

  if (card.selection.kind === 'targets') {
    const options = new Set(actorChoicesForCard(card, actingPowerKey));
    const chosen = (payload?.targetActorKeys ?? []).filter((powerKey) => options.has(powerKey));
    const uniqueChosen = [...new Set(chosen)];
    const remaining = actorChoicesForCard(card, actingPowerKey).filter((powerKey) => !uniqueChosen.includes(powerKey));
    return {
      bonusTrack,
      targetActorKeys: [...uniqueChosen, ...remaining].slice(0, card.selection.count),
    };
  }

  if (card.selection.kind === 'allocation') {
    const capabilityPoints = Math.max(0, Math.min(card.selection.total, Number(payload?.capabilityPoints ?? 1)));
    return { bonusTrack, capabilityPoints };
  }

  if (card.selection.kind === 'target_and_axis') {
    const options = actorChoicesForCard(card, actingPowerKey);
    return {
      bonusTrack,
      targetActorKey: options.includes(payload?.targetActorKey)
        ? payload.targetActorKey
        : fallback.targetActorKey,
      track: payload?.track === 'safety' ? 'safety' : 'capabilities',
    };
  }

  return fallback;
}

function applyOutcomeEffects(players, actingPowerKey, payload, effects) {
  return effects.reduce(
    (currentPlayers, effect) => applyEffect(currentPlayers, actingPowerKey, payload, effect),
    players,
  );
}

function maybePropagateModelCapabilityGain(players, actingPowerKey, successEffects) {
  if (actingPowerKey !== 'model') {
    return players;
  }

  const selfEffect = successEffects.find((effect) => effect.target === 'self' && effect.deltas?.capabilities);
  const capabilityGain = selfEffect?.deltas?.capabilities ?? 0;

  if (capabilityGain <= 0) {
    return players;
  }

  return applyDeltaBundle(players, turnOrder.filter((powerKey) => powerKey !== 'model'), {
    capabilities: capabilityGain,
  });
}

function resolveEspionage(players, managerState, actingPowerKey, payload) {
  const detectionRoll = rollDie(6);
  const detected = detectionRoll <= 3;

  let nextPlayers = applyOutcomeEffects(players, actingPowerKey, payload, [
    { target: 'self', deltas: { capabilities: 1, resources: -1 } },
    { target: 'target', deltas: { capabilities: -1 } },
  ]);

  if (detected) {
    nextPlayers = applyOutcomeEffects(nextPlayers, actingPowerKey, payload, [
      { target: 'self', deltas: { publicSupport: -2 } },
    ]);
  }

  return {
    players: nextPlayers,
    managerState,
    outcomeText: detected ? `success; detection roll ${detectionRoll} exposed the operation` : `success; detection roll ${detectionRoll} stayed hidden`,
  };
}

function resolvePositiveCrisisResponse(players, managerState, gameState) {
  const revealedEvent = getEventDefinition(gameState.engineState.revealedEventKey);
  const playerMap = getPlayerMap(players);
  const model = playerMap.get('model');
  const prerequisiteMet =
    NEGATIVE_EVENT_KEYS.has(revealedEvent?.key) && (model?.meters.capabilities ?? 0) >= 3;

  if (!prerequisiteMet) {
    return {
      players: applyDeltaBundle(players, ['model'], { publicSupport: -1 }),
      managerState,
      outcomeText: 'failed; the crisis-response prerequisite was not met',
    };
  }

  return {
    players: applyDeltaBundle(players, ['model'], { publicSupport: 3, safety: 1 }),
    managerState,
    outcomeText: 'success',
  };
}

function resolveEmergentBehavior(players, managerState) {
  const branchRoll = Math.random() >= 0.5 ? 'beneficial' : 'dangerous';

  if (branchRoll === 'beneficial') {
    let nextPlayers = applyDeltaBundle(players, ['model'], { capabilities: 2, safety: 1 });
    nextPlayers = applyDeltaBundle(nextPlayers, turnOrder, { publicSupport: 1 });

    return {
      players: nextPlayers,
      managerState,
      outcomeText: 'success; the emergent behavior was beneficial',
    };
  }

  let nextPlayers = applyDeltaBundle(players, ['model'], { capabilities: 2, safety: -2 });
  nextPlayers = applyDeltaBundle(nextPlayers, turnOrder, { publicSupport: -1 });
  nextPlayers = applyDeltaBundle(nextPlayers, ['us'], { safety: 1 });

  return {
    players: nextPlayers,
    managerState,
    outcomeText: 'success; the emergent behavior was dangerous',
  };
}

function resolveDeceptiveAlignment(players, managerState) {
  const nextPlayers = applyDeltaBundle(players, ['model'], { capabilities: 2, publicSupport: 1 });
  const nextManagerState = {
    ...managerState,
    model: {
      ...managerState.model,
      secretState: {
        ...managerState.model.secretState,
        hiddenAlignment: Number(managerState.model?.secretState?.hiddenAlignment ?? 0) - 3,
      },
    },
  };

  return {
    players: nextPlayers,
    managerState: nextManagerState,
    outcomeText: 'success; hidden misalignment remains concealed until regulation exposes it',
  };
}

function resolveValueLockIn(players, managerState) {
  const playerMap = getPlayerMap(players);
  const model = playerMap.get('model');

  if ((model?.meters.safety ?? 0) < 5) {
    return {
      players: applyDeltaBundle(players, ['model'], { resources: -1 }),
      managerState,
      outcomeText: 'failed; the safety prerequisite was not met',
    };
  }

  let nextPlayers = applyDeltaBundle(players, ['model'], {
    safety: 3,
    publicSupport: 2,
    capabilities: -1,
  });
  nextPlayers = applyDeltaBundle(nextPlayers, turnOrder, { safety: 1 });

  return {
    players: nextPlayers,
    managerState,
    outcomeText: 'success',
  };
}

function resolveActionByCard(players, managerState, gameState, actingPowerKey, privateState) {
  const availableCards = privateState.hand ?? privateState.cards ?? [];
  const selectedCard =
    privateState.selectedCard ??
    availableCards.find((entry) => entry.cardKey === privateState.selectedCardKey) ??
    availableCards.find((entry) => entry.name === privateState.selectedAction);
  const card = getActionCard(
    selectedCard?.definitionKey ??
      selectedCard?.cardKey ??
      getBaseCardKey(privateState.selectedCardKey),
  );

  if (!card) {
    return {
      players,
      managerState,
      revealedAction: {
        cardName: privateState.selectedAction || 'Unknown card',
        outcome: 'No valid card was locked for this turn.',
      },
    };
  }

  const actingPlayer = getPlayerMap(players).get(actingPowerKey);
  const payload = sanitizeSelectionPayload(card, privateState.selectedActionPayload, actingPowerKey);
  let nextPlayers = applyDeltaBundle(players, [actingPowerKey], {
    [payload.bonusTrack ?? 'resources']: 1,
  });
  const threshold = evaluateFormula(actingPlayer, card.formula);
  const roll = rollDie(10);
  const success = roll >= threshold;

  if (!success) {
    const builtOutcome = card.buildOutcome(payload, players);
    const failureEffects = builtOutcome.failure ?? [];
    nextPlayers = applyOutcomeEffects(nextPlayers, actingPowerKey, payload, failureEffects);
    return {
      players: nextPlayers,
      managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: failureEffects.length
          ? `Failure. Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${formatDeltas(failureEffects[0].deltas)}`
          : `Failure. Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}.`,
      },
    };
  }

  const builtOutcome = card.buildOutcome(payload, nextPlayers);

  if (builtOutcome.special === 'espionage') {
    const result = resolveEspionage(nextPlayers, managerState, actingPowerKey, payload);
    return {
      players: result.players,
      managerState: result.managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: `Success. Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${result.outcomeText}.`,
      },
    };
  }

  if (builtOutcome.special === 'positive_crisis_response') {
    const result = resolvePositiveCrisisResponse(nextPlayers, managerState, gameState);
    return {
      players: result.players,
      managerState: result.managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: `Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${result.outcomeText}`,
      },
    };
  }

  if (builtOutcome.special === 'emergent_behavior') {
    const result = resolveEmergentBehavior(nextPlayers, managerState);
    return {
      players: maybePropagateModelCapabilityGain(result.players, actingPowerKey, [
        { target: 'self', deltas: { capabilities: 2 } },
      ]),
      managerState: result.managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: `Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${result.outcomeText}`,
      },
    };
  }

  if (builtOutcome.special === 'deceptive_alignment') {
    const result = resolveDeceptiveAlignment(nextPlayers, managerState);
    return {
      players: maybePropagateModelCapabilityGain(result.players, actingPowerKey, [
        { target: 'self', deltas: { capabilities: 2 } },
      ]),
      managerState: result.managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: `Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${result.outcomeText}`,
      },
    };
  }

  if (builtOutcome.special === 'value_lock_in') {
    const result = resolveValueLockIn(nextPlayers, managerState);
    return {
      players: result.players,
      managerState: result.managerState,
      revealedAction: {
        cardName: card.name,
        roll,
        threshold,
        outcome: `Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}; ${result.outcomeText}`,
      },
    };
  }

  nextPlayers = applyOutcomeEffects(nextPlayers, actingPowerKey, payload, builtOutcome.success ?? []);
  nextPlayers = maybePropagateModelCapabilityGain(nextPlayers, actingPowerKey, builtOutcome.success ?? []);

  let nextManagerState = managerState;
  let publicNotes = [];

  if (card.tags?.includes('audit_or_regulation')) {
    const revealResult = revealHiddenModelAlignment(nextPlayers, nextManagerState, publicNotes);
    nextPlayers = revealResult.players;
    nextManagerState = revealResult.managerState;
    publicNotes = revealResult.publicNotes;
  }

  const targetText =
    payload.targetActorKey || payload.targetActorKeys?.length
      ? ` Targeting ${payload.targetActorKeys?.join(', ') ?? payload.targetActorKey}.`
      : '';

  return {
    players: nextPlayers,
    managerState: nextManagerState,
    publicNotes,
    revealedAction: {
      cardName: card.name,
      roll,
      threshold,
      outcome: `Success. Guaranteed +1 ${formatTrackLabel(payload.bonusTrack ?? 'resources')}.${targetText}`,
    },
  };
}

function getPrivateStateMap(privateStates) {
  return privateStates.reduce((accumulator, entry) => {
    accumulator[getPlayerKey(entry)] = entry;
    return accumulator;
  }, {});
}

export function hydratePrivateStateForSeat(privateStateRow, cards) {
  return {
    objective: privateStateRow?.objective ?? '',
    selectedAction: privateStateRow?.selected_action ?? '',
    selectedCardKey: privateStateRow?.selected_card_key ?? '',
    selectedActionPayload: privateStateRow?.selected_action_payload ?? {},
    declaredVictory: Boolean(privateStateRow?.declared_victory),
    secretState: privateStateRow?.secret_state ?? {},
    cards: (cards ?? []).map((card) => ({
      position: card.position,
      cardKey: card.card_key ?? `${card.name}-${card.position}`,
      definitionKey: getBaseCardKey(card.card_key ?? `${card.name}-${card.position}`),
      name: card.name,
      text: card.text,
    })),
  };
}

export function getSelectedActionByPower(players, privateStateByPower = {}) {
  return players.reduce((accumulator, player) => {
    const powerKey = getPlayerKey(player);
    accumulator[powerKey] = privateStateByPower[powerKey]?.selectedAction ?? player.selected_action ?? '';
    return accumulator;
  }, {});
}

export function getCurrentEvent(gameState) {
  const engineState = gameState?.engineState ?? gameState ?? {};
  const eventKey =
    gameState?.phase === 'choose_actions'
      ? engineState.pendingEventKey
      : engineState.revealedEventKey ?? engineState.pendingEventKey;
  return eventKey ? getEventDefinition(eventKey) : null;
}

export function isObjectiveEligible(players, powerKey, secretState) {
  const objectiveKey = secretState?.objectiveKey;

  if (!objectiveKey) {
    return false;
  }

  const objectiveDeck =
    powerKey === 'lab-a' || powerKey === 'lab-b'
      ? objectiveDecks.labs
      : objectiveDecks[powerKey];

  const objective = objectiveDeck.find((entry) => entry.key === objectiveKey);

  if (!objective || objective.outcome === 'path-dependent') {
    return false;
  }

  return objective.check(players, powerKey);
}

function resolveVictoryOutcome(players, powerKey, secretState) {
  const objectiveDeck =
    powerKey === 'lab-a' || powerKey === 'lab-b'
      ? objectiveDecks.labs
      : objectiveDecks[powerKey];

  const objective = objectiveDeck.find((entry) => entry.key === secretState?.objectiveKey);
  const playerMap = getPlayerMap(players);
  const actor = playerMap.get(powerKey);
  const model = playerMap.get('model');

  if (!objective || !actor || !model) {
    return { winnerPowerKey: null, summary: 'No valid objective found.' };
  }

  if (powerKey === 'model') {
    return {
      winnerPowerKey: 'model',
      summary: `Frontier AI Model claims ${objective.title}.`,
    };
  }

  if (objective.outcome === 'automatic') {
    return {
      winnerPowerKey: powerKey,
      summary: `${actor.name} claims automatic victory through ${objective.title}.`,
    };
  }

  const roll = rollDie(10);

  if (objective.outcome === 'roll_for_safety') {
    return {
      winnerPowerKey: roll <= actor.meters.safety ? powerKey : 'model',
      summary: `${actor.name} rolled ${roll} against Safety ${actor.meters.safety}.`,
    };
  }

  if (objective.outcome === 'roll_against_capabilities') {
    const target = 7 - model.meters.capabilities + actor.meters.safety;
    return {
      winnerPowerKey: roll <= target ? powerKey : 'model',
      summary: `${actor.name} rolled ${roll} against target ${target}.`,
    };
  }

  return { winnerPowerKey: null, summary: 'No valid victory outcome.' };
}

function refillHands(players, managerState, handRowsByPower) {
  const nextManagerState = { ...managerState };
  const nextHandRowsByPower = {};

  for (const player of players) {
    const powerKey = getPlayerKey(player);
    const privateState = nextManagerState[powerKey];
    const currentRows = [...(handRowsByPower[powerKey] ?? [])].sort((left, right) => left.position - right.position);
    const selectedKey = privateState.selectedCardKey;
    const remainingRows = currentRows.filter((card) => card.cardKey !== selectedKey);
    let drawPile = [...(privateState.secretState.drawPile ?? [])];
    let discardPile = [...(privateState.secretState.discardPile ?? [])];

    if (selectedKey) {
      discardPile.push(selectedKey);
    }

    const nextHandInstances = remainingRows.map((row) => ({
      cardKey: row.definitionKey ?? getBaseCardKey(row.cardKey),
      instanceKey: row.cardKey,
    }));

    while (nextHandInstances.length < HAND_SIZE) {
      if (!drawPile.length && discardPile.length) {
        drawPile = randomize(discardPile.map((instanceKey) => ({ instanceKey }))).map((entry) => entry.instanceKey);
        discardPile = [];
      }

      const nextInstanceKey = drawPile.shift();
      if (!nextInstanceKey) {
        break;
      }

      const instanceCardKey = getBaseCardKey(nextInstanceKey);
      nextHandInstances.push({
        instanceKey: nextInstanceKey,
        cardKey: instanceCardKey,
      });
    }

    nextManagerState[powerKey] = {
      ...privateState,
      selectedAction: '',
      selectedCardKey: null,
      selectedActionPayload: {},
      declaredVictory: false,
      hand: hydratePrivateStateForSeat(
        {
          objective: privateState.objective,
          selected_action: '',
          selected_card_key: null,
          selected_action_payload: {},
          declared_victory: false,
          secret_state: {
            ...privateState.secretState,
            drawPile,
            discardPile,
          },
        },
        buildHandRows(player.id, nextHandInstances),
      ).cards,
      secretState: {
        ...privateState.secretState,
        drawPile,
        discardPile,
      },
    };
    nextHandRowsByPower[powerKey] = buildHandRows(player.id, nextHandInstances);
  }

  return { managerState: nextManagerState, handRowsByPower: nextHandRowsByPower };
}

function assignPathDependentIfNeeded(players, managerState, engineState, round, trigger) {
  const modelState = managerState.model;
  if (!modelState || modelState.secretState.objectiveKey !== 'path-dependent' || modelState.secretState.pathAssigned) {
    return {
      managerState,
      engineState,
      publicNotes: [],
    };
  }

  if (!(trigger === 'victory_check_turn_four' || trigger === 'singularity_pre_turn_five')) {
    return {
      managerState,
      engineState,
      publicNotes: [],
    };
  }

  const objective = pickPathDependentObjective(players);
  const nextManagerState = {
    ...managerState,
    model: {
      ...modelState,
      objective: buildObjectiveText(objective),
      secretState: {
        ...modelState.secretState,
        objectiveKey: objective.key,
        objectiveOutcome: objective.outcome,
        pathAssigned: true,
      },
    },
  };

  return {
    managerState: nextManagerState,
    engineState: {
      ...engineState,
      pathDependentResolved: true,
      publicLog: [
        ...(engineState.publicLog ?? []),
        `Round ${round}: the Frontier AI Model receives a new hidden objective.`,
      ].slice(-8),
    },
    publicNotes: ['The Frontier AI Model received a new hidden objective.'],
  };
}

export function buildManagerState(privateStateRows, handRows) {
  const privateByPlayerId = new Map(privateStateRows.map((row) => [row.player_id, row]));
  const groupedCards = handRows.reduce((accumulator, card) => {
    const group = accumulator.get(card.player_id) ?? [];
    group.push(card);
    accumulator.set(card.player_id, group);
    return accumulator;
  }, new Map());

  const managerState = {};

  for (const powerKey of turnOrder) {
    const row = [...privateByPlayerId.entries()].find(([playerId]) => playerId.endsWith(`-${powerKey}`));
    if (!row) {
      continue;
    }

    const [playerId, privateStateRow] = row;
    managerState[powerKey] = {
      playerId,
      objective: privateStateRow.objective,
      selectedAction: privateStateRow.selected_action,
      selectedCardKey: privateStateRow.selected_card_key,
      selectedActionPayload: privateStateRow.selected_action_payload ?? {},
      declaredVictory: Boolean(privateStateRow.declared_victory),
      secretState: privateStateRow.secret_state ?? {},
      hand: hydratePrivateStateForSeat(privateStateRow, groupedCards.get(playerId) ?? []).cards,
    };
  }

  return managerState;
}

function buildHandRowsByPower(managerState) {
  return Object.fromEntries(
    Object.entries(managerState).map(([powerKey, state]) => [powerKey, state.hand ?? []]),
  );
}

function flattenManagerState(managerState) {
  return Object.values(managerState).map((state) => ({
    player_id: state.playerId,
    objective: state.objective,
    selected_action: state.selectedAction ?? '',
    selected_card_key: state.selectedCardKey ?? null,
    selected_action_payload: state.selectedActionPayload ?? {},
    declared_victory: Boolean(state.declaredVictory),
    secret_state: state.secretState ?? {},
  }));
}

function flattenHandRows(handRowsByPower, managerState) {
  return Object.entries(handRowsByPower).flatMap(([powerKey, rows]) =>
    rows.map((row, position) => ({
      player_id: managerState[powerKey].playerId,
      position,
      card_key: row.cardKey,
      name: row.name,
      text: row.text,
    })),
  );
}

export function advanceGameState({ players, managerState, phase, round, currentTurnIndex, engineState }) {
  let nextPlayers = normalizePlayers(players);
  let nextManagerState = { ...managerState };
  let nextEngineState = withPreparedEvent(
    {
      ...engineState,
      rulesVersion: RULES_VERSION,
      publicLog: [...(engineState.publicLog ?? [])],
      revealedActions: { ...(engineState.revealedActions ?? {}) },
      eventReadySelections: { ...(engineState.eventReadySelections ?? {}) },
    },
    round,
  );
  let nextPhase = phase;
  let nextTurnIndex = currentTurnIndex;
  let winnerPowerKey = null;
  let status = 'active';
  let publicNotes = [];

  if (phase === 'choose_actions') {
    const missingChoices = turnOrder.filter((powerKey) => !nextManagerState[powerKey]?.selectedCardKey);
    if (missingChoices.length) {
      return {
        blocked: missingChoices,
        players,
        managerState,
        engineState: nextEngineState,
        phase,
        round,
        currentTurnIndex,
      };
    }

    nextPhase = 'resolve_event';
    nextTurnIndex = 0;
    return {
      players: nextPlayers,
      managerState: nextManagerState,
      engineState: nextEngineState,
      phase: nextPhase,
      round,
      currentTurnIndex: nextTurnIndex,
      status,
      winnerPowerKey,
      statusMessage: `Round ${round}: reveal ${getEventDefinition(nextEngineState.pendingEventKey)?.title ?? 'event'}.`,
    };
  }

  if (phase === 'resolve_event') {
    const event = getEventDefinition(nextEngineState.pendingEventKey);
    nextPlayers = (event?.effects ?? []).reduce(
      (currentPlayers, effect) => applyEffect(currentPlayers, 'event', {}, effect),
      nextPlayers,
    );
    nextEngineState = {
      ...nextEngineState,
      revealedEventKey: event?.key ?? null,
      pendingEventKey: null,
      drawnEventKeys: [...(nextEngineState.drawnEventKeys ?? []), event?.key].filter(Boolean),
      publicLog: [...nextEngineState.publicLog, `Round ${round}: ${event?.title ?? 'Event'} resolved.`].slice(-8),
    };

    if (event?.key === 'singularity') {
      nextEngineState.singularityRound = round;
      const assigned = assignPathDependentIfNeeded(
        nextPlayers,
        nextManagerState,
        nextEngineState,
        round,
        round <= 4 ? 'singularity_pre_turn_five' : 'none',
      );
      nextManagerState = assigned.managerState;
      nextEngineState = assigned.engineState;
      publicNotes = [...publicNotes, ...assigned.publicNotes];
    }

    nextPhase = 'resolve_actions';
    nextTurnIndex = 0;

    return {
      players: nextPlayers,
      managerState: nextManagerState,
      engineState: nextEngineState,
      phase: nextPhase,
      round,
      currentTurnIndex: nextTurnIndex,
      status,
      winnerPowerKey,
      statusMessage: publicNotes[0] ?? `${event?.title ?? 'Event'} resolved.`,
    };
  }

  if (phase === 'resolve_actions') {
    const actingPowerKey = nextEngineState.actionOrder?.[currentTurnIndex] ?? turnOrder[currentTurnIndex];
    const privateState = nextManagerState[actingPowerKey];

    if (!privateState) {
      throw new Error('Missing private state for the current acting seat.');
    }

    const resolved = resolveActionByCard(nextPlayers, nextManagerState, { engineState: nextEngineState }, actingPowerKey, {
      ...privateState,
      selectedCard: (privateState.hand ?? privateState.cards ?? []).find(
        (card) => card.cardKey === privateState.selectedCardKey,
      ),
    });

    nextPlayers = resolved.players;
    nextManagerState = resolved.managerState;
    nextEngineState = {
      ...nextEngineState,
      revealedActions: {
        ...(nextEngineState.revealedActions ?? {}),
        [actingPowerKey]: resolved.revealedAction,
      },
      publicLog: [
        ...nextEngineState.publicLog,
        `${getActor(actingPowerKey).name}: ${resolved.revealedAction.cardName} (${resolved.revealedAction.outcome})`,
      ].slice(-8),
    };

    nextTurnIndex += 1;

    if (nextTurnIndex >= (nextEngineState.actionOrder?.length ?? turnOrder.length)) {
      nextPhase = 'victory_check';
    }

    return {
      players: nextPlayers,
      managerState: nextManagerState,
      engineState: nextEngineState,
      phase: nextPhase,
      round,
      currentTurnIndex: nextTurnIndex,
      status,
      winnerPowerKey,
      statusMessage: `${getActor(actingPowerKey).shortName} resolved ${resolved.revealedAction.cardName}.`,
    };
  }

  if (phase === 'victory_check') {
    const pathAssignment = assignPathDependentIfNeeded(
      nextPlayers,
      nextManagerState,
      nextEngineState,
      round,
      round === 4 ? 'victory_check_turn_four' : 'none',
    );
    nextManagerState = pathAssignment.managerState;
    nextEngineState = pathAssignment.engineState;

    const claims = turnOrder.filter(
      (powerKey) =>
        nextManagerState[powerKey]?.declaredVictory &&
        isObjectiveEligible(nextPlayers, powerKey, nextManagerState[powerKey]?.secretState),
    );

    if (claims.length) {
      const winnerCandidates = claims.map((powerKey) => resolveVictoryOutcome(nextPlayers, powerKey, nextManagerState[powerKey].secretState));
      const winnerPool = winnerCandidates.map((candidate) => candidate.winnerPowerKey).filter(Boolean);
      const resolvedWinnerPowerKey = compareByTiebreaker(nextPlayers, winnerPool);
      winnerPowerKey = resolvedWinnerPowerKey;
      status = 'completed';
      nextEngineState = {
        ...nextEngineState,
        publicLog: [
          ...nextEngineState.publicLog,
          `Victory resolved: ${getActor(resolvedWinnerPowerKey).name} wins.`,
        ].slice(-8),
      };

      return {
        players: nextPlayers,
        managerState: nextManagerState,
        engineState: nextEngineState,
        phase,
        round,
        currentTurnIndex: 0,
        status,
        winnerPowerKey,
        statusMessage: `${getActor(resolvedWinnerPowerKey).name} wins the game.`,
      };
    }

    if (round >= 10 || nextEngineState.singularityRound === round) {
      winnerPowerKey = compareByTiebreaker(nextPlayers, turnOrder);
      status = 'completed';
      nextEngineState = {
        ...nextEngineState,
        publicLog: [
          ...nextEngineState.publicLog,
          `Natural game end: ${getActor(winnerPowerKey).name} wins by tiebreaker.`,
        ].slice(-8),
      };

      return {
        players: nextPlayers,
        managerState: nextManagerState,
        engineState: nextEngineState,
        phase,
        round,
        currentTurnIndex: 0,
        status,
        winnerPowerKey,
        statusMessage: `${getActor(winnerPowerKey).name} wins on the final tiebreaker.`,
      };
    }

    const handRowsByPower = buildHandRowsByPower(nextManagerState);
    const refill = refillHands(nextPlayers, nextManagerState, handRowsByPower);
    nextManagerState = refill.managerState;
    const nextRound = round + 1;
    nextPhase = 'choose_actions';
    nextTurnIndex = 0;
    nextEngineState = withPreparedEvent(
      {
        ...nextEngineState,
        revealedEventKey: null,
        revealedActions: {},
        eventReadySelections: {},
        roundStartSnapshot: snapshotPlayers(nextPlayers),
        publicLog: [...nextEngineState.publicLog, `Round ${nextRound} is ready.`].slice(-8),
      },
      nextRound,
    );

    return {
      players: nextPlayers,
      managerState: nextManagerState,
      handRowsByPower: refill.handRowsByPower,
      engineState: nextEngineState,
      phase: nextPhase,
      round: nextRound,
      currentTurnIndex: nextTurnIndex,
      status,
      winnerPowerKey,
      statusMessage: `Round ${nextRound} begins.`,
    };
  }

  return {
    players,
    managerState,
    engineState,
    phase,
    round,
    currentTurnIndex,
    status,
    winnerPowerKey,
    statusMessage: 'No game flow update was applied.',
  };
}

export function serializeManagerState(managerState) {
  const handRowsByPower = buildHandRowsByPower(managerState);
  return {
    privateStates: flattenManagerState(managerState),
    handRows: flattenHandRows(handRowsByPower, managerState),
  };
}
