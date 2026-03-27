import React from 'react';
import { supabase } from './lib/supabase.js';

const powers = [
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

const phases = [
  'Choose 1 action card from hand',
  'Reveal the round event',
  'Resolve actions in turn order',
  'Update shared tracks and check win states',
];

const events = [
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

const tracks = [
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'safety', label: 'Safety Investment' },
  { key: 'market', label: 'Market Cap' },
  { key: 'support', label: 'Public Support' },
];

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

function applyRound(currentPowers, eventIndex) {
  return currentPowers.map((power) => {
    const deltas = getDeltas(power.id, eventIndex);
    const nextMeters = { ...power.meters };

    Object.entries(deltas).forEach(([key, delta]) => {
      nextMeters[key] = shiftValue(nextMeters[key], delta);
    });

    return { ...power, meters: nextMeters };
  });
}

function TrackRow({ label, trackKey, players }) {
  return (
    <div className="track-row">
      <div className="track-title">
        <span>{label}</span>
        <small>1-10 shared board track</small>
      </div>
      <div className="track-cells" role="img" aria-label={`${label} shared track`}>
        {Array.from({ length: 10 }, (_, index) => {
          const value = index + 1;
          const occupants = players.filter((player) => player.meters[trackKey] === value);

          return (
            <div className="track-cell" key={value}>
              <span className="cell-number">{value}</span>
              <div className="cell-pieces">
                {occupants.map((player) => (
                  <span
                    key={player.id}
                    className="piece-token"
                    style={{ '--token': player.accent }}
                    title={player.name}
                  >
                    {player.shortName}
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

function App() {
  const [activePlayerId, setActivePlayerId] = React.useState('us');
  const [round, setRound] = React.useState(2);
  const [eventIndex, setEventIndex] = React.useState(0);
  const [state, setState] = React.useState(powers);
  const [supabaseStatus, setSupabaseStatus] = React.useState('Checking Supabase connection...');

  const activePlayer = state.find((player) => player.id === activePlayerId);
  const currentEvent = events[eventIndex];

  React.useEffect(() => {
    let isMounted = true;

    async function checkSupabase() {
      const { error } = await supabase.from('games').select('id', { head: true, count: 'exact' });

      if (!isMounted) {
        return;
      }

      if (error) {
        setSupabaseStatus(`Supabase connected, but the games table is not ready yet: ${error.message}`);
        return;
      }

      setSupabaseStatus('Supabase connected. The games table is reachable.');
    }

    checkSupabase();

    return () => {
      isMounted = false;
    };
  }, []);

  function simulateRound() {
    const nextEventIndex = (eventIndex + 1) % events.length;
    setState((current) => applyRound(current, nextEventIndex));
    setEventIndex(nextEventIndex);
    setRound((current) => current + 1);
  }

  function resetScenario() {
    setState(powers);
    setRound(2);
    setEventIndex(0);
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">Competing Futures / board mockup</p>
          <h1>Put the board at the center and treat everything else as table support.</h1>
        </div>

        <div className="topbar-status">
          <div className="status-chip">
            <span>Round</span>
            <strong>{round}</strong>
          </div>
          <div className="status-chip event">
            <span>Current event</span>
            <strong>{currentEvent.title}</strong>
          </div>
          <div className="status-chip">
            <span>Perspective</span>
            <strong>{activePlayer.shortName}</strong>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={simulateRound}>
              Simulate next round
            </button>
            <button type="button" className="ghost" onClick={resetScenario}>
              Reset scenario
            </button>
          </div>
        </div>
      </section>

      <section className="board-panel">
        <div className="section-heading">
          <p className="eyebrow">Shared board</p>
          <h2>Common tracks and central world board</h2>
        </div>

        <div className="tracks-panel">
          {tracks.map((track) => (
            <TrackRow key={track.key} label={track.label} trackKey={track.key} players={state} />
          ))}
        </div>

        <div className="world-board">
          <div className="map-surface" aria-hidden="true">
            <svg
              className="board-map"
              viewBox="0 0 1200 700"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="landFill" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(214,191,143,0.82)" />
                  <stop offset="100%" stopColor="rgba(124,98,58,0.88)" />
                </linearGradient>
              </defs>
              <g className="map-routes">
                <path d="M120 210C260 170 360 185 455 240" />
                <path d="M470 260C565 235 640 220 760 245" />
                <path d="M770 250C885 230 980 250 1085 300" />
                <path d="M300 430C455 400 610 405 815 455" />
              </g>
              <g className="map-land">
                <path d="M106 154l66-34 96 15 57 31 30 37-8 30-40 10-21 40-53 3-18 48-47 10-40-24-10-47-38-21-8-46 34-52z" />
                <path d="M332 386l42-25 45 19 18 55-25 72-36 65-41-16 7-69-33-41 23-60z" />
                <path d="M526 153l63-20 101 12 65 22 36 31 0 27-48 12-22 30 22 25-38 24-91 4-67-21-53 11-31-38 19-40 55-23-11-32z" />
                <path d="M781 178l82-26 99 17 64 43 17 53-43 31-74 3-67 27-18 58-43 16-56-24-27-58 17-55 40-39 9-46z" />
                <path d="M915 470l55-12 57 20 37 49-18 39-60 16-68-22-35-39 32-51z" />
              </g>
            </svg>
            <div className="grid-lines" />
          </div>

          {state.map((player) => (
            <div
              key={player.id}
              className={`board-piece ${player.homeClass}${player.id === activePlayerId ? ' active' : ''}`}
              style={{ '--accent': player.accent }}
            >
              <span>{player.shortName}</span>
              <small>{player.name}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="lower-grid">
        <div className="selector-panel">
          <div className="section-heading">
            <p className="eyebrow">Perspective switch</p>
            <h2>Choose which player you are viewing</h2>
          </div>
          <div className="player-tabs">
            {state.map((player) => (
              <button
                type="button"
                key={player.id}
                className={player.id === activePlayerId ? 'player-tab active' : 'player-tab'}
                style={{ '--accent': player.accent }}
                onClick={() => setActivePlayerId(player.id)}
              >
                <span>{player.shortName}</span>
                {player.name}
              </button>
            ))}
          </div>

          <div className="event-panel compact">
            <p className="event-label">Global event</p>
            <h2>{currentEvent.title}</h2>
            <p>{currentEvent.text}</p>
            <p className="mini-label">{supabaseStatus}</p>
          </div>
        </div>

        <div className="private-panel">
          <div className="section-heading">
            <p className="eyebrow">Private area</p>
            <h2>{activePlayer.name} hand and objective</h2>
          </div>

          <div className="private-objective">
            <p className="mini-label">Hidden win condition</p>
            <p>{activePlayer.objective}</p>
          </div>

          <div className="hand-grid">
            {activePlayer.hand.map((card) => {
              const isSelected = card.name === activePlayer.selectedAction;
              return (
                <article key={card.name} className={isSelected ? 'hand-card selected' : 'hand-card'}>
                  <p className="mini-label">{isSelected ? 'Selected action' : 'Action card'}</p>
                  <h3>{card.name}</h3>
                  <p>{card.text}</p>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="info-panel">
          <div className="section-heading">
            <p className="eyebrow">Table rhythm</p>
            <h2>Mocked round flow</h2>
          </div>
          <div className="phase-list">
            {phases.map((phase) => (
              <article key={phase}>
                <p>{phase}</p>
              </article>
            ))}
          </div>

          <div className="concealed-panel">
            <p className="mini-label">Other players</p>
            {state
              .filter((player) => player.id !== activePlayerId)
              .map((player) => (
                <div className="concealed-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>Objective hidden / hand hidden</span>
                </div>
              ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
