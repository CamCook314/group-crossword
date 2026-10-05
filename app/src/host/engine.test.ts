import { describe, expect, it } from 'vitest';
import type { FromApp, PageSnapshot } from '../../../shared/connector';
import type { HostMessage, RoomState } from '../../../shared/protocol';
import { buildPuzzle, puzzleKey } from '../../../shared/puzzle';
import { HostEngine, HOST_ID } from './engine';

// 3x3 ring:   1 . 2
//             . # .
//             3 . .
const blocks = [false, false, false, false, true, false, false, false, false];
const ring = buildPuzzle('Ring', 3, 3, blocks, [
  { num: 1, dir: 'A', text: 'Top (3)' },
  { num: 3, dir: 'A', text: 'Bottom (3)' },
  { num: 1, dir: 'D', text: 'Left (3)' },
  { num: 2, dir: 'D', text: 'Right (3)' },
]);
const other = buildPuzzle('Other', 3, 3, blocks, [{ num: 1, dir: 'A', text: 'Different (3)' }]);
const ANSWERS = ['C', 'A', 'T', 'O', '', 'O', 'W', 'E', 'B'];
const page = (letters = Array(9).fill(''), puzzle = ring): PageSnapshot => ({ puzzle, letters, clueId: null });

function setUp() {
  const guests: { msg: HostMessage; to?: string }[] = [];
  const connector: FromApp[] = [];
  const engine = new HostEngine(
    { toGuests: (msg, to) => guests.push({ msg, to }), toConnector: msg => connector.push(msg), changed: () => {} },
    { host: { name: 'Host', color: '#000000' }, acceptMode: 'manual' },
  );
  const state = () => engine.roomState();
  return { engine, state, guests, connector };
}

const letters = (s: RoomState) => s.letters.join('') || '';

describe('the host engine', () => {
  it('follows the site until play starts here, then leaves it alone and says so on the page', () => {
    const { engine, state, connector } = setUp();
    engine.pageReport('p1', page(['C', '', '', '', '', '', '', '', '']));
    expect(letters(state())).toBe('C');
    engine.pageReport('p1', page(['C', 'A', '', '', '', '', '', '', '']));
    expect(letters(state())).toBe('CA');

    engine.command({ type: 'type', cells: [{ cell: 2, letter: 't' }] });
    expect(letters(state())).toBe('CAT');
    expect(connector.at(-1)).toMatchObject({ type: 'notice', pageId: 'p1' });
    // Typing on the site is no longer shared.
    engine.pageReport('p1', page(['C', 'A', 'X', '', '', '', '', '', '']));
    expect(letters(state())).toBe('CAT');
  });

  it('sticks to its puzzle during a session and offers another one instead', () => {
    const { engine, state } = setUp();
    engine.pageReport('p1', page());
    engine.session = { link: 'x', status: 'Live' };
    engine.pageReport('p2', page(undefined, other));
    expect(state().puzzle?.title).toBe('Ring');
    expect(engine.screens().status.otherPuzzle?.title).toBe('Other');
    engine.command({ type: 'switch-puzzle' });
    expect(state().puzzle?.title).toBe('Other');
  });

  it('accepts a suggestion into the grid, and undoes it', () => {
    const { engine, state } = setUp();
    engine.pageReport('p1', page());
    engine.guestHello('sam', 'Sam', '#111111');
    engine.guestMessage('sam', { t: 'suggest', clueId: '1A', letters: ['C', 'A', 'T'] });
    expect(state().suggestions).toHaveLength(1);
    engine.command({ type: 'accept', clueId: '1A', letters: ['C', 'A', 'T'] });
    expect(letters(state())).toBe('CAT');
    expect(state().suggestions).toHaveLength(0);
    engine.command({ type: 'undo' });
    expect(letters(state())).toBe('');
  });

  it('waits for someone to agree with the host, even with trusted friends', () => {
    const { engine, state } = setUp();
    engine.pageReport('p1', page());
    engine.command({ type: 'accept-mode', acceptMode: 'trusted' });
    engine.guestHello('sam', 'Sam', '#111111');
    engine.command({ type: 'suggest', clueId: '1A', letters: ['C', 'A', 'T'] });
    expect(letters(state())).toBe('');
    engine.guestMessage('sam', { t: 'suggest', clueId: '1D', letters: ['C', 'O', 'W'] });
    expect(letters(state())).toBe('COW'); // a trusted friend's goes straight in
    engine.guestMessage('sam', { t: 'suggest', clueId: '1A', letters: ['C', 'A', 'T'] });
    expect(letters(state())).toBe('CATOW');
  });

  it('checks against the answers, says when it is solved, and fills in the site', () => {
    const { engine, state, connector } = setUp();
    engine.pageReport('p1', page());
    engine.pageAnswers(puzzleKey(ring), [ANSWERS]);
    engine.command({ type: 'type', cells: [{ cell: 0, letter: 'C' }, { cell: 1, letter: 'X' }] });
    engine.command({ type: 'check', cells: [0, 1, 2], label: '1A' });
    expect(state().wrong).toEqual([1]);
    expect(state().check).toMatchObject({ label: '1A', wrong: 1 });

    engine.command({ type: 'type', cells: ANSWERS.map((letter, cell) => ({ cell, letter })) });
    expect(state().finished).toBe('solved');
    expect(state().wrong).toEqual([]);
    expect(engine.screens().status.fillIn).toBe('ready');
    engine.command({ type: 'fill-site' });
    expect(connector.at(-1)).toMatchObject({ type: 'fill', pageId: 'p1' });
    expect((connector.at(-1) as { cells: unknown[] }).cells).toHaveLength(8);
  });

  it('carries on after a reload, with everyone away until they reconnect', () => {
    const first = setUp();
    first.engine.pageReport('p1', page());
    first.engine.guestHello('sam', 'Sam', '#111111');
    first.engine.command({ type: 'type', cells: [{ cell: 0, letter: 'C' }] });
    first.engine.guestMessage('sam', { t: 'suggest', clueId: '1D', letters: ['C', 'O', 'W'] });
    const saved = JSON.parse(JSON.stringify(first.engine.save()));

    const second = setUp();
    second.engine.restore(saved, Date.now());
    const state = second.state();
    expect(letters(state)).toBe('C');
    expect(state.suggestions).toHaveLength(1);
    expect(state.players.find(p => p.id === 'sam')?.online).toBe(false);
    expect(state.players.find(p => p.id === HOST_ID)?.online).toBe(true);
    second.engine.guestHello('sam', 'Sam', '#111111');
    expect(second.state().players.find(p => p.id === 'sam')?.online).toBe(true);
  });
});
