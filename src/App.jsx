import React from 'react';
import { supabase } from './lib/supabase.js';
import { applyRound, phases, powerOptions, tracks } from './lib/game-data.js';
import {
  claimSeat,
  createGame,
  fetchAccountContext,
  fetchGameBoard,
  fetchPrivateSeat,
  joinGameByCode,
  persistRoundState,
  updateGameStatus,
} from './lib/game-api.js';
import worldMap from '../world.svg';

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
                    {player.short_name}
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
          Google Auth is the only sign-in path. For now, <strong>sethlifland11@gmail.com</strong> is
          treated as <strong>admin</strong> and every other account is created as a
          <strong> player</strong>.
        </p>
        <button type="button" className="auth-button" onClick={onLogin} disabled={loading}>
          {loading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>
        <p className="mini-label">{errorMessage ?? 'Private game data stays locked until you sign in.'}</p>
      </section>
    </main>
  );
}

function GameList({ title, games, memberships, selectedGameId, onSelect, emptyMessage }) {
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
            return (
              <button
                type="button"
                key={game.id}
                className={game.id === selectedGameId ? 'game-tab active' : 'game-tab'}
                onClick={() => onSelect(game.id)}
              >
                <strong>{game.name}</strong>
                <span>{game.status}</span>
                <small>
                  {membership?.power_key
                    ? `Seat: ${membership.power_key}`
                    : membership?.membership_role === 'observer'
                      ? 'Observer'
                      : 'No seat claimed'}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="empty-copy">{emptyMessage}</p>
      )}
    </section>
  );
}

function getDisplayName(profile, user) {
  return profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Unknown player';
}

function App() {
  const [authReady, setAuthReady] = React.useState(false);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [session, setSession] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [games, setGames] = React.useState([]);
  const [memberships, setMemberships] = React.useState([]);
  const [selectedGameId, setSelectedGameId] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [gameState, setGameState] = React.useState(null);
  const [activePowerKey, setActivePowerKey] = React.useState('');
  const [privateState, setPrivateState] = React.useState({ objective: '', selectedAction: '', cards: [] });
  const [createGameName, setCreateGameName] = React.useState('');
  const [createSeatKey, setCreateSeatKey] = React.useState('');
  const [joinCode, setJoinCode] = React.useState('');
  const [joinSeatKey, setJoinSeatKey] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState('Checking Supabase session...');
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;

    async function loadSession() {
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
      setSelectedGameId('');
      setGameState(null);
      setActivePowerKey('');
      setPrivateState({ objective: '', selectedAction: '', cards: [] });
      setStatusMessage(authReady ? 'Sign in to load your game access.' : 'Checking Supabase session...');
      return;
    }

    let isMounted = true;

    async function loadAccount() {
      try {
        setStatusMessage('Loading your account, games, and memberships...');
        setErrorMessage('');
        const data = await fetchAccountContext(session.user);

        if (!isMounted) {
          return;
        }

        setProfile(data.profile);
        setGames(data.games);
        setMemberships(data.memberships);

        if (!data.games.some((game) => game.id === selectedGameId)) {
          setSelectedGameId(data.games[0]?.id ?? '');
        }

        if (!data.games.length) {
          setStatusMessage('No games yet. Create one or join with a code.');
        }
      } catch (error) {
        if (!isMounted) {
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

  const activeGame = games.find((game) => game.id === selectedGameId) ?? null;
  const activeMembership = memberships.find((membership) => membership.game_id === selectedGameId) ?? null;
  const isAdmin = profile?.app_role === 'admin';
  const canManageGame = Boolean(isAdmin || (activeGame && session?.user && activeGame.created_by === session.user.id));

  React.useEffect(() => {
    if (!session?.user || !activeGame) {
      setGameState(null);
      setActivePowerKey('');
      return;
    }

    let isMounted = true;

    async function loadGame() {
      try {
        setStatusMessage(`Loading ${activeGame.name}...`);
        const board = await fetchGameBoard(activeGame.id);

        if (!isMounted) {
          return;
        }

        const nextPowerKey = isAdmin
          ? board.players.some((player) => player.power_key === activePowerKey)
            ? activePowerKey
            : board.players[0]?.power_key ?? ''
          : activeMembership?.power_key ?? '';

        setGameState({
          ...board,
          round: activeGame.round,
          eventIndex: activeGame.event_index,
        });
        setActivePowerKey(nextPowerKey);
        setStatusMessage(`Loaded ${activeGame.name}.`);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error.message);
      }
    }

    loadGame();

    return () => {
      isMounted = false;
    };
  }, [activeGame, activeMembership?.power_key, isAdmin, refreshKey, session?.user]);

  React.useEffect(() => {
    if (!session?.user || !gameState || !activePowerKey) {
      setPrivateState({ objective: '', selectedAction: '', cards: [] });
      return;
    }

    const activePlayer = gameState.players.find((player) => player.power_key === activePowerKey);

    if (!activePlayer) {
      setPrivateState({ objective: '', selectedAction: '', cards: [] });
      return;
    }

    let isMounted = true;

    async function loadPrivateSeatData() {
      try {
        const data = await fetchPrivateSeat(activePlayer.id);

        if (!isMounted) {
          return;
        }

        setPrivateState(data);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setPrivateState({ objective: '', selectedAction: '', cards: [] });
        setErrorMessage(error.message);
      }
    }

    loadPrivateSeatData();

    return () => {
      isMounted = false;
    };
  }, [activePowerKey, gameState, refreshKey, session?.user]);

  const boardPlayers = gameState?.players ?? [];
  const activePlayer = boardPlayers.find((player) => player.power_key === activePowerKey) ?? null;
  const currentEvent = gameState?.events?.[gameState.eventIndex] ?? null;
  const takenPowerKeys = new Set(
    (gameState?.assignments ?? [])
      .filter((assignment) => assignment.user_id !== session?.user?.id)
      .map((assignment) => assignment.power_key)
      .filter(Boolean),
  );
  const availableSeats = boardPlayers.filter(
    (player) => !takenPowerKeys.has(player.power_key) || player.power_key === activeMembership?.power_key,
  );
  const activeGames = games.filter((game) => game.status === 'active');
  const pastGames = games.filter((game) => game.status !== 'active');

  async function signInWithGoogle() {
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
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedGameId('');
    setAuthLoading(false);
  }

  async function handleCreateGame(event) {
    event.preventDefault();

    try {
      setActionLoading(true);
      setErrorMessage('');
      const gameId = await createGame(createGameName.trim(), createSeatKey);
      setCreateGameName('');
      setCreateSeatKey('');
      setSelectedGameId(gameId);
      setRefreshKey((current) => current + 1);
      setStatusMessage('Game created.');
    } catch (error) {
      setErrorMessage(error.message);
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
      await updateGameStatus(activeGame.id, activeGame.status === 'completed' ? 'active' : 'completed');
      setRefreshKey((current) => current + 1);
      setStatusMessage(
        activeGame.status === 'completed' ? 'Game moved back to active.' : 'Game marked as completed.',
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function simulateRound() {
    if (!canManageGame || !activeGame || !gameState?.players?.length || !gameState.events.length) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');

      const nextEventIndex = (gameState.eventIndex + 1) % gameState.events.length;
      const nextPlayers = applyRound(gameState.players, nextEventIndex);
      const nextRound = gameState.round + 1;

      await persistRoundState(activeGame.id, nextRound, nextEventIndex, nextPlayers);

      setGameState((current) =>
        current
          ? {
              ...current,
              round: nextRound,
              eventIndex: nextEventIndex,
              players: nextPlayers,
            }
          : current,
      );
      setStatusMessage(`Saved round ${nextRound} for ${activeGame.name}.`);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setActionLoading(false);
    }
  }

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

  if (!session) {
    return <LoginPage loading={authLoading} onLogin={signInWithGoogle} errorMessage={errorMessage} />;
  }

  return (
    <main className="shell">
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
            <h2>Launch a new game or join with a code</h2>
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
              placeholder="Spring strategy session"
              required
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
              Join code
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
            <button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Working...' : 'Join game'}
            </button>
          </form>
        </aside>

        <section className="board-panel board-panel-wide">
          <div className="dashboard-stack">
            <GameList
              title="Active games"
              games={activeGames}
              memberships={memberships}
              selectedGameId={selectedGameId}
              onSelect={setSelectedGameId}
              emptyMessage="No active games yet."
            />
            <GameList
              title="Past games you played"
              games={pastGames}
              memberships={memberships}
              selectedGameId={selectedGameId}
              onSelect={setSelectedGameId}
              emptyMessage="Finished games will appear here."
            />
          </div>
        </section>

        <aside className="info-panel">
          <div className="section-heading">
            <p className="eyebrow">Status</p>
            <h2>Account and game state</h2>
          </div>
          <div className="event-panel compact">
            <p className="event-label">Current status</p>
            <h2>{activeGame?.status ?? 'No game selected'}</h2>
            <p>{errorMessage || statusMessage}</p>
            <p className="mini-label">
              {activeGame?.join_code ? `Join code: ${activeGame.join_code}` : 'Create or join a game to continue.'}
            </p>
          </div>
        </aside>
      </section>

      {activeGame && gameState ? (
        <>
          <section className="board-panel">
            <div className="section-heading">
              <p className="eyebrow">Shared board</p>
              <h2>Common tracks and central world board</h2>
            </div>

            <div className="board-toolbar">
              <div className="game-meta">
                <span>Round {gameState.round}</span>
                <span>{currentEvent?.title ?? 'No event loaded'}</span>
                <span>Join code {activeGame.join_code}</span>
              </div>
              <div className="hero-actions">
                <button type="button" onClick={simulateRound} disabled={!canManageGame || actionLoading}>
                  Simulate next round
                </button>
                {canManageGame ? (
                  <button type="button" className="ghost" onClick={handleCompleteGame} disabled={actionLoading}>
                    {activeGame.status === 'completed' ? 'Reopen game' : 'Complete game'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="tracks-panel">
              {tracks.map((track) => (
                <TrackRow key={track.key} label={track.label} trackKey={track.key} players={boardPlayers} />
              ))}
            </div>

            <div className="world-board">
              <div className="map-surface" aria-hidden="true">
                <img className="board-map-image" src={worldMap} alt="" />
                <div className="grid-lines" />
              </div>

              {boardPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`board-piece ${player.home_class}${player.power_key === activePowerKey ? ' active' : ''}`}
                  style={{ '--accent': player.accent }}
                >
                  <span>{player.short_name}</span>
                  <small>{player.name}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="lower-grid">
            <div className="selector-panel">
              <div className="section-heading">
                <p className="eyebrow">Perspective</p>
                <h2>{isAdmin ? 'Switch to any seat' : 'Seats and claims in this game'}</h2>
              </div>
              <div className="player-tabs">
                {(isAdmin ? boardPlayers : availableSeats).map((player) => (
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

              {!isAdmin && activeGame.status === 'active' ? (
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

              <div className="event-panel compact">
                <p className="event-label">Global event</p>
                <h2>{currentEvent?.title ?? 'No event loaded'}</h2>
                <p>{currentEvent?.text ?? 'No game event is available for this board yet.'}</p>
                <p className="mini-label">{activeGame.status}</p>
              </div>
            </div>

            <div className="private-panel">
              <div className="section-heading">
                <p className="eyebrow">Private area</p>
                <h2>{activePlayer?.name ?? 'No seat selected'} hand and objective</h2>
              </div>

              <div className="private-objective">
                <p className="mini-label">Hidden win condition</p>
                <p>{privateState.objective || 'This seat has no private objective available for your account.'}</p>
              </div>

              <div className="hand-grid">
                {privateState.cards.map((card) => {
                  const isSelected = card.name === privateState.selectedAction;
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
                <h2>Round flow and seat history</h2>
              </div>
              <div className="phase-list">
                {phases.map((phase) => (
                  <article key={phase}>
                    <p>{phase}</p>
                  </article>
                ))}
              </div>
              <div className="concealed-panel">
                <p className="mini-label">Seat assignments</p>
                {(gameState.assignments ?? []).map((assignment) => (
                  <div className="concealed-row" key={`${assignment.user_id}-${assignment.game_id}`}>
                    <strong>{assignment.power_key ?? 'observer'}</strong>
                    <span>{assignment.membership_role}</span>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}

export default App;
