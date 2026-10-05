// What a co-op square shows, for guests and the host alike: the letter (a draft or a letter on its way
// in is shown in the player's own colour), the clue number, and suggestions in the corners.
import type { Puzzle } from './puzzle';
import type { CornerMark } from './suggestions';

export function CoopCell({ puzzle, cell, letter, draft, marks = [] }: { puzzle: Puzzle; cell: number; letter: string; draft?: string; marks?: CornerMark[] }) {
  // Corners fill top-right, top-left, bottom-left, bottom-right; the top-left one sits after the clue number.
  const mark = (i: number) => marks[i] && <span class={`mark m${i}`} style={{ color: marks[i].color }}>{marks[i].text}</span>;
  return (
    <>
      <span class={draft !== undefined ? 'letter draft' : 'letter'}>{draft ?? letter}</span>
      <span class="top-left">
        {puzzle.numbers[cell] && <span class="num">{puzzle.numbers[cell]}</span>}
        {mark(1)}
      </span>
      {mark(0)}
      {mark(2)}
      {mark(3)}
    </>
  );
}
