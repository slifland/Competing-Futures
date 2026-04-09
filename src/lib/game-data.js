export const initialPowers = [
  {
    id: 'us',
    name: 'US Government',
    shortName: 'US',
    accent: '#7dd3fc',
    role: 'State actor',
    homeClass: 'north-america',
    meters: { capabilities: 7, safety: 8, market: 5, support: 7 },
    objective: 'Finish with capabilities at 8+, safety at 6+, and public support at 6+.',
    hand: [
      { name: 'Federal AI Package', text: '+1 capability, +1 safety' },
      { name: 'Export Controls', text: '-1 China capability, -1 market' },
      { name: 'Public Oversight Push', text: '+1 support, -1 capability' },
    ],
    selectedAction: 'Federal AI Package',
  },
  {
    id: 'china',
    name: 'China & Adversaries',
    shortName: 'CN',
    accent: '#f97316',
    role: 'State actor',
    homeClass: 'east-asia',
    meters: { capabilities: 7, safety: 4, market: 4, support: 4 },
    objective: 'Surpass the US on capabilities by 2 or more at any point.',
    hand: [
      { name: 'Strategic Tech Surge', text: '+1 capability, -1 safety' },
      { name: 'Propaganda Campaign', text: '+1 support, -1 opponent support' },
      { name: 'Researcher Poach', text: '+1 capability, -1 Lab capability' },
    ],
    selectedAction: 'Strategic Tech Surge',
  },
  {
    id: 'lab-a',
    name: 'Frontier Lab A',
    shortName: 'A',
    accent: '#d946ef',
    role: 'Commercial lab',
    homeClass: 'west-coast',
    meters: { capabilities: 6, safety: 5, market: 8, support: 6 },
    objective: 'End with market cap at 9 and higher capability than Frontier Lab B.',
    hand: [
      { name: 'Flagship Release', text: '+1 market, +1 capability' },
      { name: 'Safety Team Expansion', text: '+1 safety, -1 market' },
      { name: 'Enterprise Alliance', text: '+1 market, +1 support' },
    ],
    selectedAction: 'Flagship Release',
  },
  {
    id: 'lab-b',
    name: 'Frontier Lab B',
    shortName: 'B',
    accent: '#22c55e',
    role: 'Research lab',
    homeClass: 'europe',
    meters: { capabilities: 6, safety: 6, market: 7, support: 5 },
    objective: 'End with capability at 8+ and above Frontier Lab A.',
    hand: [
      { name: 'Research Breakthrough', text: '+1 capability, +1 safety' },
      { name: 'Benchmark Demo', text: '+1 support, +1 market' },
      { name: 'Compute Expansion', text: '+1 capability, -1 support' },
    ],
    selectedAction: 'Research Breakthrough',
  },
  {
    id: 'model',
    name: 'Frontier AI Model',
    shortName: 'AI',
    accent: '#fde047',
    role: 'Emergent actor',
    homeClass: 'global',
    meters: { capabilities: 8, safety: 4, market: 3, support: 4 },
    objective: 'Reach capability 9+ while keeping safety and support at 4+.',
    hand: [
      { name: 'Self-Optimization', text: '+1 capability' },
      { name: 'Helpful Deployment', text: '+1 support, +1 market' },
      { name: 'Autonomous Research', text: '+1 capability, -1 safety' },
    ],
    selectedAction: 'Self-Optimization',
  },
];

export const phaseOrder = ['choose_actions', 'resolve_event', 'resolve_actions', 'victory_check'];

export const phases = [
  { id: 'choose_actions', label: 'Each player selects one action card.' },
  { id: 'resolve_event', label: 'One global event is drawn and resolves.' },
  { id: 'resolve_actions', label: 'Players resolve their chosen action cards in turn order.' },
  { id: 'victory_check', label: 'Victory is checked before the next round begins.' },
];

export const turnOrder = ['us', 'china', 'lab-a', 'lab-b', 'model'];

export const events = [
  {
    title: 'Deepfake Election Crisis',
    text: 'Public trust drops and governments lean harder on safety oversight.',
    effects: { support: -1, safety: +1 },
  },
  {
    title: 'Global Semiconductor Trade Shock',
    text: 'Capability growth slows while corporate value gets squeezed.',
    effects: { capabilities: -1, market: -1 },
  },
  {
    title: 'Medical AI Breakthrough',
    text: 'Public support rises as AI delivers a visible social benefit.',
    effects: { support: +1, market: +1 },
  },
  {
    title: 'Autonomous Weapons Flashpoint',
    text: 'Capability pressure rises while public confidence falls.',
    effects: { capabilities: +1, support: -1 },
  },
];

export const tracks = [
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'safety', label: 'Safety Investment' },
  { key: 'market', label: 'Market Cap' },
  { key: 'support', label: 'Public Support' },
];

export const powerOptions = initialPowers.map((power) => ({
  id: power.id,
  name: power.name,
  shortName: power.shortName,
  role: power.role,
}));

const actionEffects = {
  us: {
    'Federal AI Package': { self: { capabilities: +1, safety: +1 } },
    'Export Controls': { targets: [{ powerKey: 'china', deltas: { capabilities: -1 } }], self: { market: -1 } },
    'Public Oversight Push': { self: { support: +1, capabilities: -1 } },
  },
  china: {
    'Strategic Tech Surge': { self: { capabilities: +1, safety: -1 } },
    'Propaganda Campaign': { self: { support: +1 }, targets: [{ powerKey: 'us', deltas: { support: -1 } }] },
    'Researcher Poach': { self: { capabilities: +1 }, targets: [{ group: 'labs', metric: 'capabilities', delta: -1 }] },
  },
  'lab-a': {
    'Flagship Release': { self: { market: +1, capabilities: +1 } },
    'Safety Team Expansion': { self: { safety: +1, market: -1 } },
    'Enterprise Alliance': { self: { market: +1, support: +1 } },
  },
  'lab-b': {
    'Research Breakthrough': { self: { capabilities: +1, safety: +1 } },
    'Benchmark Demo': { self: { support: +1, market: +1 } },
    'Compute Expansion': { self: { capabilities: +1, support: -1 } },
  },
  model: {
    'Self-Optimization': { self: { capabilities: +1 } },
    'Helpful Deployment': { self: { support: +1, market: +1 } },
    'Autonomous Research': { self: { capabilities: +1, safety: -1 } },
  },
};

function shiftValue(value, delta) {
  return Math.max(1, Math.min(10, value + delta));
}

function applyMeterDeltas(player, deltas) {
  if (!deltas) {
    return player;
  }

  const nextMeters = { ...player.meters };

  Object.entries(deltas).forEach(([key, delta]) => {
    nextMeters[key] = shiftValue(nextMeters[key], delta);
  });

  return { ...player, meters: nextMeters };
}

function getPlayerMap(players) {
  return new Map(players.map((player) => [player.power_key ?? player.id, player]));
}

export function getCurrentEvent(eventIndex) {
  return events[eventIndex % events.length] ?? events[0];
}

export function resolveEvent(players, eventIndex) {
  const event = getCurrentEvent(eventIndex);
  return players.map((player) => applyMeterDeltas(player, event.effects));
}

export function resolveSelectedAction(players, actingPowerKey, selectedAction) {
  const rules = actionEffects[actingPowerKey]?.[selectedAction];

  if (!rules) {
    return players;
  }

  return players.map((player) => {
    const powerKey = player.power_key ?? player.id;
    let nextPlayer = player;

    if (powerKey === actingPowerKey) {
      nextPlayer = applyMeterDeltas(nextPlayer, rules.self);
    }

    for (const target of rules.targets ?? []) {
      if (target.powerKey && target.powerKey === powerKey) {
        nextPlayer = applyMeterDeltas(nextPlayer, target.deltas);
      }

      if (target.group === 'labs' && (powerKey === 'lab-a' || powerKey === 'lab-b')) {
        nextPlayer = applyMeterDeltas(nextPlayer, { [target.metric]: target.delta });
      }
    }

    return nextPlayer;
  });
}

export function getSelectedActionByPower(players, resolutionState = {}) {
  return players.reduce((accumulator, player) => {
    const powerKey = player.power_key ?? player.id;
    accumulator[powerKey] = resolutionState[powerKey] ?? player.selected_action ?? '';
    return accumulator;
  }, {});
}

export function checkVictory(players) {
  const playerMap = getPlayerMap(players);
  const us = playerMap.get('us');
  const china = playerMap.get('china');
  const labA = playerMap.get('lab-a');
  const labB = playerMap.get('lab-b');
  const model = playerMap.get('model');

  const winner =
    (us &&
      us.meters.capabilities >= 8 &&
      us.meters.safety >= 6 &&
      us.meters.support >= 6 &&
      us) ||
    (china && us && china.meters.capabilities >= us.meters.capabilities + 2 && china) ||
    (labA && labB && labA.meters.market >= 9 && labA.meters.capabilities > labB.meters.capabilities && labA) ||
    (labB && labB.meters.capabilities >= 8 && labA && labB.meters.capabilities > labA.meters.capabilities && labB) ||
    (model &&
      model.meters.capabilities >= 9 &&
      model.meters.safety >= 4 &&
      model.meters.support >= 4 &&
      model);

  return winner
    ? {
        powerKey: winner.power_key ?? winner.id,
        name: winner.name,
      }
    : null;
}
