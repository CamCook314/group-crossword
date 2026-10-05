import { describe, expect, it } from 'vitest';
import { parseBracketMessage } from '../../../../shared/games/bracket';
import { BracketHost } from './bracketHost';

/** A host whose shuffle leaves the order alone and whose coin always comes up heads (a). */
const setUp = () => new BracketHost(() => 0.99);
const everyone = ['host', 'sam', 'ana'];

function withOptions(texts: Record<string, string>) {
  const b = setUp();
  b.command({ type: 'category', text: 'Best biscuit' });
  for (const [id, text] of Object.entries(texts)) b.message(id, { t: 'bracket-option', text }, everyone);
  b.command({ type: 'make-bracket' });
  return b;
}

describe('the bracket game', () => {
  it('collects one option each, hiding them and who sent them until voting', () => {
    const b = setUp();
    b.command({ type: 'category', text: '  Best biscuit ' });
    b.message('sam', { t: 'bracket-option', text: 'Hobnob' }, everyone);
    b.message('sam', { t: 'bracket-option', text: 'Jaffa cake' }, everyone); // replaces his first
    expect(b.state()).toMatchObject({ phase: 'options', category: 'Best biscuit', submitted: ['sam'], options: [] });
    b.command({ type: 'make-bracket' }); // needs two
    expect(b.state().phase).toBe('options');
  });

  it('votes match by match, with byes, until one is left; then says who suggested what', () => {
    const b = withOptions({ host: 'Hobnob', sam: 'Jaffa cake', ana: 'Bourbon' });
    let s = b.state();
    expect(s.phase).toBe('voting');
    expect(s.options.every(o => o.by === null)).toBe(true);
    // Three options: one match and a bye.
    expect(s.rounds[0].map(m => [m.a, m.b])).toEqual([
      [0, 1],
      [2, null],
    ]);
    expect(s.current).toBe(0);

    b.message('host', { t: 'bracket-vote', pick: 'b' }, everyone);
    b.message('sam', { t: 'bracket-vote', pick: 'b' }, everyone);
    expect(b.state().voted).toEqual(['host', 'sam']);
    b.message('ana', { t: 'bracket-vote', pick: 'a' }, everyone); // everyone has voted: decided
    s = b.state();
    expect(s.rounds[0][0]).toMatchObject({ votesA: 1, votesB: 2, winner: 1, coinToss: false });
    expect(s.rounds[1].map(m => [m.a, m.b])).toEqual([[1, 2]]);

    for (const id of everyone) b.message(id, { t: 'bracket-vote', pick: 'a' }, everyone);
    s = b.state();
    expect(s.phase).toBe('done');
    expect(s.options[s.winner!]).toEqual({ text: 'Jaffa cake', by: 'sam' });
  });

  it('lets the host settle a match early, a tie by a coin toss', () => {
    const b = withOptions({ host: 'Hobnob', sam: 'Jaffa cake' });
    b.message('sam', { t: 'bracket-vote', pick: 'b' }, everyone);
    b.message('host', { t: 'bracket-vote', pick: 'a' }, everyone);
    b.command({ type: 'decide' });
    const s = b.state();
    expect(s.rounds[0][0]).toMatchObject({ votesA: 1, votesB: 1, coinToss: true, winner: 1 }); // the coin: 0.99 → b
    expect(s.phase).toBe('done');
  });

  it('carries on after a reload, and starts again', () => {
    const b = withOptions({ host: 'Hobnob', sam: 'Jaffa cake' });
    b.message('sam', { t: 'bracket-vote', pick: 'b' }, everyone);
    const again = setUp();
    again.restore(JSON.parse(JSON.stringify(b.save())));
    expect(again.state()).toEqual(b.state());
    again.command({ type: 'again' });
    expect(again.state()).toMatchObject({ phase: 'category', category: '', rounds: [] });
  });

  it('only accepts sensible messages', () => {
    expect(parseBracketMessage({ t: 'bracket-option', text: '  Hobnob ' })).toEqual({ t: 'bracket-option', text: 'Hobnob' });
    expect(parseBracketMessage({ t: 'bracket-option', text: '   ' })).toBeNull();
    expect(parseBracketMessage({ t: 'bracket-vote', pick: 'c' })).toBeNull();
    expect(parseBracketMessage({ t: 'something-else' })).toBeNull();
  });
});
