// The host's screens: the session, a mode switch, your name and colour, and the co-op board (with the suggestion
// queue and tools), the race, or a game that needs no puzzle. Hosting itself runs in this tab (host.ts).
import { useEffect, useState } from 'preact/hooks';
import { ColorPicker } from '../../../shared/ColorPicker';
import { GameScreen } from '../games/GameScreen';
import { CoopView } from './CoopView';
import { startHosting } from './host';
import { RaceView } from './RaceView';
import type { Command, HostProfile, HostScreens, Mode } from './types';

const MODES: [Mode, string][] = [
  ['coop', 'Co-op'],
  ['race', 'Race'],
  ['clues', 'Clue race'],
  ['trivia', 'Trivia'],
  ['bracket', 'Bracket'],
];

let send: (cmd: Command) => void = () => {};

export function HostApp() {
  const [screens, setScreens] = useState<HostScreens | null>(null);
  const [connector, setConnector] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<HostScreens['note']>(null);
  // A game's word for the host, for a moment.
  useEffect(() => {
    setNote(screens?.note ?? null);
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [screens?.note?.at]);
  useEffect(() => {
    // The host's own stylesheets, on top of the guests' ones.
    for (const href of ['panel.css', 'host.css']) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
    send = startHosting(setScreens, setConnector);
  }, []);
  if (!screens) return null;
  const { status } = screens;
  const { session, mode, host } = status;
  const racing = status.racePhase === 'countdown' || status.racePhase === 'racing';

  return (
    <main class={mode === 'coop' ? 'fill' : ''}>
      <header class="top">
        <h1>Group Crossword</h1>
        <div class="modes" title={racing ? 'Finish or end the race first' : undefined}>
          {MODES.map(([m, label]) => (
            <button class={m === mode ? 'mode picked' : 'mode'} disabled={racing} onClick={() => send({ type: 'mode', mode: m })}>
              {label}
            </button>
          ))}
        </div>
        {session ? (
          <div class="link">
            <input readOnly value={session.link} onFocus={e => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(session.link)}>Copy</button>
            <span class="hint session-status">{session.status}</span>
            <button class="secondary" onClick={() => send({ type: 'stop' })}>
              End session
            </button>
          </div>
        ) : (
          <button onClick={() => send({ type: 'start' })}>Start session</button>
        )}
        <button class="secondary you" onClick={() => setEditing(true)} title="Your name and colour">
          <span class="dot" style={{ background: host.color }} /> {host.name}
        </button>
      </header>
      {connector === null && !status.pagePuzzle && (mode === 'coop' || mode === 'race') && (
        <p class="hint connector-missing">
          To play a crossword from Crosshare or Courier Mail, install the Group Crossword extension and open the crossword in
          another tab.
        </p>
      )}
      {mode === 'coop' && <CoopView status={status} replay={screens.replay} send={send} />}
      {mode === 'race' && <RaceView status={screens.race} send={send} />}
      <GameScreen
        state={status.state}
        me="host"
        send={msg => send({ type: 'play', msg })}
        host={{ clues: cmd => send({ type: 'clues', cmd }), trivia: cmd => send({ type: 'trivia', cmd }), bracket: cmd => send({ type: 'bracket', cmd }) }}
      />
      {note && <div class="toast">{note.text}</div>}
      {editing && <YouDialog host={host} onSave={h => (send({ type: 'host', host: h }), setEditing(false))} onClose={() => setEditing(false)} />}
    </main>
  );
}

function YouDialog({ host, onSave, onClose }: { host: HostProfile; onSave: (host: HostProfile) => void; onClose: () => void }) {
  const [name, setName] = useState(host.name);
  const [color, setColor] = useState(host.color);
  return (
    <div class="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <form
        class="modal you-dialog"
        onSubmit={e => {
          e.preventDefault();
          onSave({ name: name.trim() || 'Host', color });
        }}
      >
        <h2>Your name and colour</h2>
        <input class="name" autoFocus maxLength={24} value={name} onInput={e => setName(e.currentTarget.value)} />
        <ColorPicker value={color} onPick={setColor} />
        <div class="actions">
          <button type="submit">Save</button>
          <button type="button" class="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
