import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ColorPicker } from '../../shared/ColorPicker';
import { COLORS, type RoomState } from '../../shared/protocol';
import { Board } from './Board';
import { connect, type Connection } from './connection';

const roomId = location.hash.slice(1);

interface Profile {
  clientId: string;
  name: string;
  color: string;
}

function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem('profile') ?? '');
    if (saved.clientId) return saved;
  } catch {}
  return { clientId: crypto.randomUUID(), name: '', color: COLORS[1] };
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem('profile', JSON.stringify(p));
  } catch {}
}

function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [joined, setJoined] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RoomState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const conn = useRef<Connection | null>(null);

  useEffect(() => {
    if (!joined) return;
    setProblem('Connecting…');
    const c = connect(
      roomId,
      { t: 'hello', ...profile },
      msg => {
        if (msg.t === 'state') setState(msg.state);
        if (msg.t === 'rejected') {
          setToast(`The host rejected your ${msg.clueId} suggestion.`);
          setTimeout(() => setToast(null), 4000);
        }
      },
      setProblem,
    );
    conn.current = c;
    return () => c.close();
  }, [joined, attempt]);

  if (!roomId) return <p class="center">Ask the host for a link to their session.</p>;
  if (!joined) {
    return (
      <Join
        profile={profile}
        onJoin={p => {
          saveProfile(p);
          setProfile(p);
          setJoined(true);
        }}
      />
    );
  }
  return (
    <>
      {problem && (
        <div class="banner">
          {problem} {problem !== 'Connecting…' && <button onClick={() => setAttempt(a => a + 1)}>Reconnect</button>}
        </div>
      )}
      {state && <Board state={state} me={profile.clientId} send={m => conn.current?.send(m)} />}
      {toast && <div class="toast">{toast}</div>}
    </>
  );
}

function Join({ profile, onJoin }: { profile: Profile; onJoin: (p: Profile) => void }) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  return (
    <form
      class="join"
      onSubmit={e => {
        e.preventDefault();
        if (name.trim()) onJoin({ ...profile, name: name.trim(), color });
      }}
    >
      <h1>Group Crossword</h1>
      <label>
        Your name
        <input autoFocus maxLength={24} value={name} onInput={e => setName(e.currentTarget.value)} />
      </label>
      <ColorPicker value={color} onPick={setColor} />
      <button type="submit" disabled={!name.trim()}>
        Join
      </button>
    </form>
  );
}

render(<App />, document.getElementById('app')!);
