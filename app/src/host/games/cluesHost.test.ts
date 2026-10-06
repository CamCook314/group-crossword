import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseClueRaceMessage } from '../../../../shared/games/clues';
import { ClueRaceHost, toClue } from './cluesHost';

// Made-up clues, as the dataset's API returns them.
const row = (clue: string, answer: string, definition: string | null) => ({ clue, answer, definition, puzzle_name: 'Test 1', source_url: `https://example.com/${answer}` });
const fit = [
  row('Bird and knight out for a party before the wedding (3,5)', 'HEN NIGHT', 'party before the wedding'),
  row('Stop a cork (4)', 'PLUG', 'Stop/a cork'),
  row('Worthy sort in a dog order, oddly (2-6)', 'DO-GOODER', 'Worthy sort'),
  row('Feline sat on the mat (3)', 'CAT', null),
  row('Deity seen in reverse dog (3)', 'GOD', 'Deity'),
];
const unfit = [row('No enumeration here', 'HERE', null), row('Wrong count (4)', 'COUNT', null), row('Odd answer (3)', 'A1B', null)];
const everyone = ['host', 'sam', 'ana', 'lee'];
const guess = (guess: string) => ({ t: 'clues-guess' as const, guess });

/** A host whose fetch returns each page of rows in turn. */
function setUp(...pages: object[][]) {
  const io = { changed: vi.fn(), tell: vi.fn() };
  const get = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => pages.shift() ?? [] }) as Response);
  return { io, get, host: new ClueRaceHost(io, get) };
}

/** Starts a game of five clues, a minute each, and waits for the clues to arrive. */
async function started(...pages: object[][]) {
  const t = setUp(...(pages.length ? pages : [fit]));
  const loaded = new Promise(resolve => t.io.changed.mockImplementationOnce(resolve));
  t.host.command({ type: 'start', count: 5, seconds: 60 }, everyone);
  expect(t.host.state().phase).toBe('loading');
  await loaded;
  return t;
}

describe('the cryptic clue race', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only plays clues whose enumeration fits a sensible answer', () => {
    expect(toClue(fit[0])).toEqual({
      text: 'Bird and knight out for a party before the wedding',
      enumeration: '3,5',
      answer: 'HEN NIGHT',
      definition: 'party before the wedding',
      hint: [[26, 50]],
      puzzle: 'Test 1',
      source: 'https://example.com/HEN NIGHT',
    });
    for (const r of unfit) expect(toClue(r)).toBeNull();
    expect(toClue(row(`${'Very long '.repeat(20)}(3)`, 'CAT', null))).toBeNull();
    expect(toClue({ clue: 'Missing answer (3)' })).toBeNull();
    // Two definitions; one that isn't in the clue; a source that isn't a web page.
    expect(toClue(fit[1])!.hint).toEqual([
      [0, 4],
      [5, 11],
    ]);
    expect(toClue(row('Feline sat on the mat (3)', 'CAT', 'Pet'))!.hint).toEqual([]);
    expect(toClue({ ...fit[3], source_url: 'javascript:alert(1)' })!.source).toBeNull();
  });

  it('fetches plenty of random clues once, and more if too few were fit to play', async () => {
    const { get, host } = await started([...fit.slice(0, 3), ...unfit], [fit[0], ...fit.slice(3)]);
    expect(get).toHaveBeenCalledTimes(2);
    const ids = (call: number) => decodeURIComponent(get.mock.calls[call][0]).match(/rowid in \(([\d,]+)\)/)![1].split(',');
    expect(get.mock.calls[0][0]).toMatch(/^https:\/\/cryptics\.georgeho\.org\/data\.json\?sql=/);
    expect(ids(0)).toHaveLength(20);
    expect(ids(1)).toHaveLength(8);
    expect(host.state()).toMatchObject({ phase: 'clue', count: 5, index: 0, msLeft: 60_000, solved: [] });
  });

  it('goes back to the setup if the clues can’t be fetched', async () => {
    const { io, host } = setUp();
    const failed = new Promise(resolve => io.changed.mockImplementationOnce(resolve));
    host['get'] = async () => ({ ok: false, status: 503 }) as Response;
    host.command({ type: 'start', count: 5, seconds: 60 }, everyone);
    await failed;
    expect(host.state()).toMatchObject({ phase: 'setup', error: expect.stringContaining('503') });
  });

  it('keeps the answer from everyone until the reveal', async () => {
    const { host } = await started();
    const state = host.state();
    expect(state.clue).toEqual({ text: fit[0].clue.slice(0, -6), enumeration: '3,5', puzzle: 'Test 1', hint: [], answer: null, definition: null, source: null });
    expect(JSON.stringify(state)).not.toMatch(/HEN ?NIGHT/);
    host.command({ type: 'reveal' }, everyone);
    expect(host.state().clue).toMatchObject({ answer: 'HEN NIGHT', definition: 'party before the wedding', source: 'https://example.com/HEN NIGHT' });
  });

  it('tells each guesser privately whether they’re right, comparing letters only', async () => {
    const { io, host } = await started();
    host.message('sam', guess('HENPARTY'), everyone);
    expect(io.tell).toHaveBeenLastCalledWith('sam', 'Not it', 'bad');
    expect(JSON.stringify(host.state())).not.toContain('HENPARTY');
    host.message('sam', guess('hen-night'), everyone);
    expect(io.tell).toHaveBeenLastCalledWith('sam', 'Right! +3', 'good');
    host.message('sam', guess('HENNIGHT'), everyone); // already solved: nothing more
    expect(io.tell).toHaveBeenCalledTimes(2);
    expect(host.state().solved).toEqual([{ id: 'sam', points: 3 }]);
  });

  it('scores 3, 2, then 1, and reveals once everyone has solved it', async () => {
    const { io, host } = await started();
    for (const id of everyone) host.message(id, guess('HEN NIGHT'), everyone);
    expect(io.tell.mock.calls.map(c => c[1])).toEqual(['Right! +3', 'Right! +2', 'Right! +1', 'Right! +1']);
    expect(host.state()).toMatchObject({ phase: 'reveal', scores: { host: 3, sam: 2, ana: 1, lee: 1 } });
  });

  it('underlines the definition at half time, and a solve after that scores a point less', async () => {
    const { io, host } = await started();
    vi.advanceTimersByTime(29_000);
    expect(host.state().clue!.hint).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(io.changed).toHaveBeenCalledTimes(2); // the clues arriving, then the hint
    expect(host.state().clue!.hint).toEqual([[26, 50]]);
    for (const id of ['sam', 'ana', 'lee']) host.message(id, guess('HENNIGHT'), everyone);
    expect(host.state().solved).toEqual([
      { id: 'sam', points: 2 },
      { id: 'ana', points: 1 },
      { id: 'lee', points: 1 },
    ]);
  });

  it('costs nothing at half time when there’s no definition to underline', async () => {
    const { host } = await started([fit[3], ...fit.slice(0, 3), fit[4]]);
    vi.advanceTimersByTime(45_000);
    host.message('sam', guess('CAT'), everyone);
    expect(host.state().solved).toEqual([{ id: 'sam', points: 3 }]);
  });

  it('reveals when time’s up, then moves on at the host’s word to the final scores', async () => {
    const { io, host } = await started();
    host.message('sam', guess('HENNIGHT'), everyone);
    vi.advanceTimersByTime(60_000);
    expect(io.changed).toHaveBeenCalledTimes(3);
    expect(host.state()).toMatchObject({ phase: 'reveal', msLeft: 0, clue: { answer: 'HEN NIGHT' } });
    host.message('ana', guess('HENNIGHT'), everyone); // too late
    expect(host.state().solved).toHaveLength(1);

    host.command({ type: 'next' }, everyone);
    expect(host.state()).toMatchObject({ phase: 'clue', index: 1, solved: [], msLeft: 60_000, clue: { enumeration: '4', answer: null } });
    for (let i = 1; i < 5; i++) host.command({ type: 'next' }, everyone); // skipped without a reveal
    expect(host.state()).toMatchObject({ phase: 'done', clue: null, scores: { sam: 3 } });
    host.command({ type: 'again' }, everyone);
    expect(host.state()).toMatchObject({ phase: 'setup', count: 5, seconds: 60, scores: {}, clue: null });
  });

  it('carries on mid-clue after a reload, on the same clock', async () => {
    const { host } = await started();
    vi.advanceTimersByTime(20_000);
    host.message('sam', guess('HENNIGHT'), everyone);
    const io = { changed: vi.fn(), tell: vi.fn() };
    const again = new ClueRaceHost(io, vi.fn());
    again.restore(JSON.parse(JSON.stringify(host.save())));
    host.command({ type: 'again' }, everyone); // the old tab's clock stops
    expect(again.state()).toMatchObject({ phase: 'clue', msLeft: 40_000, solved: [{ id: 'sam', points: 3 }], scores: { sam: 3 } });
    vi.advanceTimersByTime(10_000);
    expect(io.changed).toHaveBeenCalledTimes(1);
    expect(again.state().clue!.hint).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    expect(again.state().phase).toBe('reveal');

    for (const saved of [null, undefined]) {
      const fresh = new ClueRaceHost(io, vi.fn());
      fresh.restore(saved);
      expect(fresh.state()).toMatchObject({ phase: 'setup', count: 10, seconds: 90 });
    }
  });

  it('keeps the settings in range', async () => {
    const { host } = await started();
    host.command({ type: 'again' }, everyone);
    host.command({ type: 'start', count: 50, seconds: 5 }, everyone);
    expect(host.state()).toMatchObject({ count: 20, seconds: 30 });
  });

  it('only accepts sensible guesses', () => {
    expect(parseClueRaceMessage({ t: 'clues-guess', guess: ' hen-night ' })).toEqual({ t: 'clues-guess', guess: 'HENNIGHT' });
    expect(parseClueRaceMessage({ t: 'clues-guess', guess: '123' })).toBeNull();
    expect(parseClueRaceMessage({ t: 'clues-guess', guess: 'A'.repeat(61) })).toBeNull();
    expect(parseClueRaceMessage({ t: 'clues-guess', guess: 7 })).toBeNull();
    expect(parseClueRaceMessage({ t: 'clues-answer', guess: 'CAT' })).toBeNull();
  });
});
