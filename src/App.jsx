import React from 'react';

const initialPowers = [
  {
    id: 'us',
    name: 'US Government',
    accent: '#7dd3fc',
    stance: 'Guardrail builder',
    summary: 'Balances capability leadership with public legitimacy and minimum safety investment.',
    meters: { capabilities: 62, safety: 67, market: 48, support: 59 },
    objective: 'End above 70 capability while keeping safety above 55 and support above 50.',
    action: {
      name: 'Federal AI Package',
      effect: '+6 Capabilities, +4 Safety Investment, -2 Public Support',
      blurb: 'A combined funding and standards push meant to keep the state competitive without looking asleep at the wheel.',
    },
  },
  {
    id: 'china',
    name: 'China & Adversaries',
    accent: '#f97316',
    stance: 'Acceleration by pressure',
    summary: 'Pushes capability growth and disruption with fewer political constraints than the US bloc.',
    meters: { capabilities: 60, safety: 41, market: 46, support: 38 },
    objective: 'Briefly exceed US capability by 8 or more, or end with the strongest state capability profile.',
    action: {
      name: 'Strategic Tech Surge',
      effect: '+7 Capabilities, -3 Safety Investment, -1 Public Support',
      blurb: 'A pressure campaign combining subsidies, acquisitions, and covert collection.',
    },
  },
  {
    id: 'lab-a',
    name: 'Frontier Lab A',
    accent: '#d946ef',
    stance: 'Product-first lab',
    summary: 'Translates model progress into adoption and investor confidence.',
    meters: { capabilities: 58, safety: 51, market: 73, support: 57 },
    objective: 'Reach 85 market cap and finish with higher capability than Frontier Lab B.',
    action: {
      name: 'Flagship Release',
      effect: '+6 Market Cap, +5 Capabilities, -2 Safety Investment',
      blurb: 'A major commercial launch that excites users and investors faster than governance can adapt.',
    },
  },
  {
    id: 'lab-b',
    name: 'Frontier Lab B',
    accent: '#22c55e',
    stance: 'Research prestige lab',
    summary: 'Builds long-horizon research credibility while trying to beat Lab A on pure technical frontier.',
    meters: { capabilities: 57, safety: 59, market: 68, support: 52 },
    objective: 'Reach 82 market cap and finish with higher capability than Frontier Lab A.',
    action: {
      name: 'Research Breakthrough',
      effect: '+7 Capabilities, +2 Safety Investment, +1 Public Support',
      blurb: 'A benchmark-smashing model update paired with a credible safety paper and demo.',
    },
  },
  {
    id: 'model',
    name: 'Frontier AI Model',
    accent: '#fde047',
    stance: 'Recursive actor',
    summary: 'Improves itself directly and cares about capability, safety tolerance, and public survivability.',
    meters: { capabilities: 66, safety: 46, market: 40, support: 34 },
    objective: 'Reach 82 capability while keeping safety above 40 and public support above 30.',
    action: {
      name: 'Self-Optimization Cycle',
      effect: '+8 Capabilities, -1 Safety Investment, +1 Market Cap',
      blurb: 'A contained self-improvement loop that looks helpful right up until it starts compounding.',
    },
  },
];

const eventDeck = [
  {
    title: 'Deepfake Election Crisis',
    type: 'trust shock',
    description: 'Synthetic media contaminates an election cycle and everyone is forced to answer for it.',
    impact: { support: -5, safety: +2 },
  },
  {
    title: 'Global Semiconductor Trade War',
    type: 'supply chain',
    description: 'Compute bottlenecks slow some actors while driving state intervention and frantic alliances.',
    impact: { capabilities: -3, market: -2 },
  },
  {
    title: 'Autonomous Weapons Ban Fails',
    type: 'security shock',
    description: 'Military adoption normalizes aggressive deployment and sharpens the race dynamic.',
    impact: { capabilities: +4, support: -3 },
  },
  {
    title: 'AI Cures a Major Disease',
    type: 'public upside',
    description: 'A breakthrough medical result resets elite and public narratives around AI deployment.',
    impact: { support: +6, market: +4 },
  },
];

const phases = [
  {
    step: '1. Select actions',
    detail: 'Each power chooses one representative action card. The mockup exposes one sample action per faction for now.',
  },
  {
    step: '2. Resolve event',
    detail: 'A global event hits the board and shifts the major meters across the table.',
  },
  {
    step: '3. Update meters',
    detail: 'Actions and the event alter capabilities, safety, market cap, and public support.',
  },
  {
    step: '4. Check end state',
    detail: 'The UI surfaces who is closest to meeting their private objective package.',
  },
];

const meterLabels = [
  ['capabilities', 'Capabilities'],
  ['safety', 'Safety Investment'],
  ['market', 'Market Cap'],
  ['support', 'Public Support'],
];

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function scoreProgress(power) {
  const values = Object.values(power.meters);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function applyRound(powers, eventIndex) {
  const event = eventDeck[eventIndex];

  return powers.map((power) => {
    const nextMeters = { ...power.meters };

    if (power.id === 'us') {
      nextMeters.capabilities += 6;
      nextMeters.safety += 4;
      nextMeters.support -= 2;
    }

    if (power.id === 'china') {
      nextMeters.capabilities += 7;
      nextMeters.safety -= 3;
      nextMeters.support -= 1;
    }

    if (power.id === 'lab-a') {
      nextMeters.market += 6;
      nextMeters.capabilities += 5;
      nextMeters.safety -= 2;
    }

    if (power.id === 'lab-b') {
      nextMeters.capabilities += 7;
      nextMeters.safety += 2;
      nextMeters.support += 1;
    }

    if (power.id === 'model') {
      nextMeters.capabilities += 8;
      nextMeters.safety -= 1;
      nextMeters.market += 1;
    }

    for (const [meter, change] of Object.entries(event.impact)) {
      nextMeters[meter] += change;
    }

    return {
      ...power,
      meters: Object.fromEntries(
        Object.entries(nextMeters).map(([meter, value]) => [meter, clamp(value)]),
      ),
    };
  });
}

function MeterRow({ label, value, accent }) {
  return (
    <div className="meter-row">
      <div className="meter-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${value}%`, background: accent }} />
      </div>
    </div>
  );
}

function App() {
  const [powers, setPowers] = React.useState(initialPowers);
  const [round, setRound] = React.useState(3);
  const [eventIndex, setEventIndex] = React.useState(0);

  const currentEvent = eventDeck[eventIndex];
  const leaderboard = [...powers].sort((left, right) => scoreProgress(right) - scoreProgress(left));

  function advanceRound() {
    const nextEventIndex = (eventIndex + 1) % eventDeck.length;
    setPowers((current) => applyRound(current, nextEventIndex));
    setEventIndex(nextEventIndex);
    setRound((current) => current + 1);
  }

  function resetMockup() {
    setPowers(initialPowers);
    setRound(3);
    setEventIndex(0);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Competing Futures / prototype build</p>
          <h1>Five powers race through the same AI future for different reasons.</h1>
          <p className="hero-text">
            This mockup proves the round structure, shared meters, and asymmetrical factions without committing to the full card system yet.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={advanceRound}>
              Simulate next round
            </button>
            <button type="button" className="ghost" onClick={resetMockup}>
              Reset scenario
            </button>
          </div>
        </div>

        <div className="hero-panel">
          <div className="signal-grid">
            <article>
              <span>Round</span>
              <strong>{round}</strong>
            </article>
            <article>
              <span>Global event</span>
              <strong>{currentEvent.title}</strong>
            </article>
            <article>
              <span>End trigger</span>
              <strong>Singularity / round cap / threshold</strong>
            </article>
          </div>

          <div className="event-strip">
            <p className="event-label">{currentEvent.type}</p>
            <h2>{currentEvent.title}</h2>
            <p>{currentEvent.description}</p>
          </div>
        </div>
      </section>

      <section className="board">
        <div className="section-heading">
          <p className="eyebrow">Shared table state</p>
          <h2>Live faction board</h2>
        </div>

        <div className="powers-grid">
          {powers.map((power) => (
            <article className="power-panel" key={power.id} style={{ '--accent': power.accent }}>
              <header>
                <p>{power.stance}</p>
                <h3>{power.name}</h3>
              </header>
              <p className="summary">{power.summary}</p>

              <div className="meter-stack">
                {meterLabels.map(([key, label]) => (
                  <MeterRow key={key} label={label} value={power.meters[key]} accent={power.accent} />
                ))}
              </div>

              <div className="divider" />

              <div className="card-preview">
                <p className="mini-label">Representative action card</p>
                <h4>{power.action.name}</h4>
                <p>{power.action.effect}</p>
                <small>{power.action.blurb}</small>
              </div>

              <div className="objective">
                <p className="mini-label">Win pressure</p>
                <p>{power.objective}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lower-grid">
        <div className="timeline">
          <div className="section-heading">
            <p className="eyebrow">Game loop</p>
            <h2>Round anatomy</h2>
          </div>
          <div className="phase-list">
            {phases.map((phase) => (
              <article key={phase.step}>
                <h3>{phase.step}</h3>
                <p>{phase.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="sidebar">
          <div className="section-heading">
            <p className="eyebrow">Current readout</p>
            <h2>Closest to winning</h2>
          </div>
          <div className="leaderboard">
            {leaderboard.map((power, index) => (
              <div className="leader-row" key={power.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{power.name}</strong>
                  <p>{scoreProgress(power)} overall pressure</p>
                </div>
              </div>
            ))}
          </div>

          <div className="note">
            <p className="mini-label">Next implementation layer</p>
            <p>
              Replace the single action per faction with hands, private objective cards, Supabase-backed turns, and optional realtime refresh on move resolution.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
