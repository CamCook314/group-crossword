// The host's suggestion queue: how friends' answers go in, Undo, and one card per suggestion (identical ones combined,
// the most-agreed first) with Accept and Reject.
import type { AcceptMode } from '../../../shared/protocol';
import { AGREED_COLOR, clashes, groupSuggestions } from '../../../shared/suggestions';
import type { Command, HostStatus } from './types';

const ACCEPT_MODES: [AcceptMode, string][] = [
  ['manual', 'When I accept them'],
  ['agreed', 'Automatically once 2 or more agree'],
  ['trusted', 'Automatically (trusted friends)'],
];

export function SuggestionList({ status, send }: { status: HostStatus; send: (msg: Command) => void }) {
  const { state, undo } = status;
  const { puzzle } = state;
  const names = (ids: string[]) => ids.map(id => state.players.find(p => p.id === id)?.name ?? 'Someone').join(' + ');
  return (
    <>
      <fieldset class="accept-mode">
        <legend>Friends' answers go in</legend>
        {ACCEPT_MODES.map(([mode, label]) => (
          <label>
            <input type="radio" name="accept-mode" checked={state.acceptMode === mode} onChange={() => send({ type: 'accept-mode', acceptMode: mode })} />
            {label}
          </label>
        ))}
      </fieldset>
      {undo && (
        <button class="secondary undo" onClick={() => send({ type: 'undo' })}>
          Undo accept: {names(undo.playerIds)} · {undo.clueId}
        </button>
      )}
      {state.suggestions.length === 0 && <p class="hint">No suggestions waiting.</p>}
      {puzzle &&
        groupSuggestions(state.suggestions).map(g => {
          const clue = puzzle.clues.find(c => c.id === g.clueId);
          const players = g.playerIds.map(id => state.players.find(p => p.id === id));
          const clash = clashes(puzzle, state.letters, g);
          const agreed = players.length > 1;
          return (
            <div class={agreed ? 'suggestion agreed' : 'suggestion'} key={g.clueId + g.letters.join()} style={{ borderColor: agreed ? AGREED_COLOR : players[0]?.color }}>
              <div class="who">
                {players.map(p => (
                  <span class="dot" style={{ background: p?.color }} />
                ))}{' '}
                {names(g.playerIds)} · <b>{g.clueId}</b>
                {agreed && <span class="agree-count">{players.length} agree</span>}
              </div>
              <div class="clue">{clue?.text}</div>
              <div class="letters">
                {g.letters.map((l, i) => {
                  const existing = clue ? state.letters[clue.cells[i]] : '';
                  return (
                    <span class={clash[i] ? 'clash' : l ? '' : 'blank'} title={clash[i] ? `Replaces ${existing}` : undefined}>
                      {l || existing || '·'}
                    </span>
                  );
                })}
              </div>
              <div class="actions">
                <button onClick={() => send({ type: 'accept', clueId: g.clueId, letters: g.letters })}>Accept</button>
                <button class="secondary" onClick={() => send({ type: 'reject', clueId: g.clueId, letters: g.letters })}>
                  Reject
                </button>
              </div>
            </div>
          );
        })}
    </>
  );
}
