import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ColorPicker } from '../../shared/ColorPicker';
import type { CoopReplay } from '../../shared/CoopSolver';
import { isSudoku } from '../../shared/puzzle';
import { COLORS, type GuestMessage, type Player, type RacerBoard, type RoomState } from '../../shared/protocol';
import { Board } from './Board';
import { GameScreen, isGameMode } from './games/GameScreen';
import { HostApp } from './host/HostApp';
import { connect, type Connection } from './connection';
import { PlayerList } from './PlayerList';
import { Race, type NotQuite } from './Race';

// The link is #<room id>, optionally followed by ?name=…&color=… to fill in the join form (the host's Play button).
// The address picks the screen: #host to host, #<room id> to join (optionally followed by ?name=…&color=… to fill in
// the join form, as the host's "Join as a racer" does), or nothing for the home screen.
const [roomId, query = ''] = location.hash.slice(1).split('?');
const invite = new URLSearchParams(query);

interface Profile {
  clientId: string;
  name: string;
  color: string;
}

function loadProfile(): Profile {
  let profile: Profile = { clientId: crypto.randomUUID(), name: '', color: COLORS[1] };
  try {
    const saved = JSON.parse(localStorage.getItem('profile') ?? '');
    if (saved.clientId) profile = saved;
  } catch {}
  const name = invite.get('name');
  const color = invite.get('color');
  return { ...profile, name: name ?? profile.name, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : profile.color };
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem('profile', JSON.stringify(p));
  } catch {}
}

function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [joined, setJoined] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RoomState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<NotQuite | null>(null);
  const [restore, setRestore] = useState<string[] | null>(null);
  const [replay, setReplay] = useState<CoopReplay | null>(null);
  const [boards, setBoards] = useState<RacerBoard[] | null>(null);
  const conn = useRef<Connection | null>(null);
  /** The hello to send whenever the connection opens: only once you've joined. */
  const hello = useRef<GuestMessage | null>(null);

  // Connect straight away, so the join screen can show who's already here.
  useEffect(() => {
    if (!roomId) return;
    setProblem('Connecting…');
    const c = connect(
      roomId,
      () => hello.current,
      msg => {
        if (msg.t === 'state') {
          // Extensions before 0.5.0 send puzzles without linked answers or cross-references, and before 0.6.0 no checks.
          const { puzzle } = msg.state;
          const state = { ...msg.state, wrong: msg.state.wrong ?? [], check: msg.state.check ?? null, finished: msg.state.finished ?? null };
          setState(puzzle && !isSudoku(puzzle) && !puzzle.links ? { ...state, puzzle: { ...puzzle, links: [], refs: {} } } : state);
          if (msg.state.race?.phase !== 'racing') setBoards(null);
          // A new race starts clean.
          if (msg.state.race?.phase === 'countdown') {
            setNotice(null);
            setRestore(null);
          }
        }
        if (msg.t === 'not-quite') setNotice({ penaltyMs: msg.penaltyMs, cooldownMs: msg.cooldownMs, at: Date.now() });
        if (msg.t === 'race-letters') setRestore(msg.letters);
        if (msg.t === 'replay') setReplay({ events: msg.events, durationMs: msg.durationMs });
        if (msg.t === 'race-boards') setBoards(msg.boards);
        if (msg.t === 'rejected' || msg.t === 'note') {
          setToast(msg.t === 'note' ? msg.text : `The host rejected your ${msg.clueId} suggestion.`);
          setTimeout(() => setToast(null), 4000);
        }
      },
      setProblem,
    );
    conn.current = c;
    return () => c.close();
  }, [attempt]);

  /** Joins, or tells the host your new name or colour. */
  function join(p: Profile) {
    saveProfile(p);
    setProfile(p);
    setJoined(true);
    setEditing(false);
    hello.current = { t: 'hello', ...p };
    conn.current?.send(hello.current);
  }

  if (!joined) return <Join profile={profile} players={state?.players} problem={problem} onJoin={join} />;
  return (
    <>
      {problem && (
        <div class="banner">
          {problem} {problem !== 'Connecting…' && <button onClick={() => setAttempt(a => a + 1)}>Reconnect</button>}
        </div>
      )}
      {state?.mode === 'race' && (
        <Race state={state} me={profile.clientId} send={m => conn.current?.send(m)} notice={notice} restore={restore} boards={boards} />
      )}
      {state && isGameMode(state.mode) && <GameScreen state={state} me={profile.clientId} send={m => conn.current?.send(m)} />}
      {/* Extensions before race mode (0.3.0 and earlier) don't send a mode: that's co-op. */}
      {state && state.mode !== 'race' && !isGameMode(state.mode) && (
        <Board
          state={state}
          me={profile.clientId}
          send={m => conn.current?.send(m)}
          replay={replay}
          requestReplay={() => {
            setReplay(null);
            conn.current?.send({ t: 'get-replay' });
          }}
          editProfile={() => setEditing(true)}
        />
      )}
      {toast && <div class="toast">{toast}</div>}
      {editing && (
        <div class="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditing(false)}>
          <div class="modal">
            <Join profile={profile} players={state?.players.filter(p => p.id !== profile.clientId)} onJoin={join} onCancel={() => setEditing(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** The join form, also used to change your name or colour later (with onCancel). */
function Join({
  profile,
  players,
  problem,
  onJoin,
  onCancel,
}: {
  profile: Profile;
  /** Who's already here. */
  players?: Player[];
  problem?: string | null;
  onJoin: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const here = players?.filter(p => p.online) ?? [];
  return (
    <form
      class="join"
      onSubmit={e => {
        e.preventDefault();
        if (name.trim()) onJoin({ ...profile, name: name.trim(), color });
      }}
    >
      <h1>{onCancel ? 'Your name and colour' : 'Group Crossword'}</h1>
      {here.length > 0 ? (
        <div class="already">
          <span class="hint">Already here:</span>
          <PlayerList players={here} />
        </div>
      ) : (
        problem && problem !== 'Connecting…' && <p class="hint">{problem}</p>
      )}
      <label>
        Your name
        <input autoFocus maxLength={24} value={name} onInput={e => setName(e.currentTarget.value)} />
      </label>
      <ColorPicker value={color} onPick={setColor} />
      <div class="join-buttons">
        <button type="submit" disabled={!name.trim()}>
          {onCancel ? 'Save' : 'Join'}
        </button>
        {onCancel && (
          <button type="button" class="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** No room in the address: host a game, or join one with its link or room code. */
function Home() {
  const [code, setCode] = useState('');
  return (
    <form
      class="join home"
      onSubmit={e => {
        e.preventDefault();
        const id = code.trim().split('#').pop();
        if (id) location.hash = id;
      }}
    >
      <h1>Group Crossword</h1>
      <button type="button" onClick={() => (location.hash = 'host')}>
        Host a game
      </button>
      <label>
        Or join with the link or room code
        <input value={code} onInput={e => setCode(e.currentTarget.value)} />
      </label>
      <button type="submit" class="secondary">
        Join
      </button>
    </form>
  );
}

// A different address is a different screen.
addEventListener('hashchange', () => location.reload());
render(roomId === 'host' ? <HostApp /> : roomId ? <App /> : <Home />, document.getElementById('app')!);
