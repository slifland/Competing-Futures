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

export const phases = [
  'Choose 1 action card from hand',
  'Reveal the round event',
  'Resolve actions in turn order',
  'Update shared tracks and check win states',
];

export const events = [
  {
    title: 'Deepfake Election Crisis',
    text: 'Public trust drops and governments lean harder on safety oversight.',
  },
  {
    title: 'Global Semiconductor Trade Shock',
    text: 'Capability growth slows while corporate value gets squeezed.',
  },
  {
    title: 'Medical AI Breakthrough',
    text: 'Public support rises as AI delivers a visible social benefit.',
  },
  {
    title: 'Autonomous Weapons Flashpoint',
    text: 'Capability pressure rises while public confidence falls.',
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

function shiftValue(value, delta) {
  return Math.max(1, Math.min(10, value + delta));
}

function getDeltas(powerId, eventIndex) {
  const eventPattern = [
    { support: -1, safety: +1 },
    { capabilities: -1, market: -1 },
    { support: +1, market: +1 },
    { capabilities: +1, support: -1 },
  ][eventIndex];

  const personalPatterns = {
    us: { capabilities: +1, safety: +1 },
    china: { capabilities: +1, safety: -1 },
    'lab-a': { market: +1, capabilities: +1 },
    'lab-b': { capabilities: +1, safety: +1 },
    model: { capabilities: +1 },
  };

  return { ...eventPattern, ...personalPatterns[powerId] };
}

export function applyRound(currentPowers, eventIndex) {
  return currentPowers.map((power) => {
    const deltas = getDeltas(power.power_key ?? power.id, eventIndex);
    const nextMeters = { ...power.meters };

    Object.entries(deltas).forEach(([key, delta]) => {
      nextMeters[key] = shiftValue(nextMeters[key], delta);
    });

    return { ...power, meters: nextMeters };
  });
}
