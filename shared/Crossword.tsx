// The crossword grid, clue lists, and keyboard/mouse navigation, shared by the co-op view, the racer's view and the
// host's race view. Styles are in grid.css.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { normalizeLetter } from './protocol';
import { answerOf, clueAt, type CellBreaks, type Clue, type Dir, type Puzzle } from './puzzle';

const other = (dir: Dir): Dir => (dir === 'A' ? 'D' : 'A');

export interface CursorOptions {
  /** Is this square still empty? Clicking a clue puts the cursor on its first empty square. */
  isEmpty(cell: number): boolean;
  /** Does this square hold one of your own letters, which Backspace should delete? */
  hasLetter(cell: number): boolean;
  /** Types a letter into a square, or clears it with ''. */
  setLetter(cell: number, letter: string): void;
  /** Keys other than typing and moving (Enter, Escape); return true if handled. */
  onKey?(key: string): boolean;
  /** Ignore the keyboard, e.g. once a racer has finished. */
  disabled?: boolean;
}

/** The selected square and direction, moved by clicks and the keyboard. */
export function useCursor(puzzle: Puzzle, opts: CursorOptions) {
  const first = puzzle.clues[0];
  const [sel, setSel] = useState({ cell: first?.cells[0] ?? 0, dir: first?.dir ?? ('A' as Dir) });
  const clue = clueAt(puzzle, sel.cell, sel.dir) ?? clueAt(puzzle, sel.cell, other(sel.dir));
  /** The whole answer the cursor is in: one entry, or several for a linked answer ("See 13"). */
  const answer = clue ? answerOf(puzzle, clue) : [];
  const squares = squaresOf(answer);
  const index = clue ? squares.findIndex(s => s.cell === sel.cell && s.dir === clue.dir) : -1;
  const crossing = clue && clueAt(puzzle, sel.cell, other(clue.dir));
  const refs = [...new Set(answer.flatMap(part => puzzle.refs[part.id] ?? []))];
  const answerCells = new Set(squares.map(s => s.cell));
  const refCells = new Set(refs.flatMap(id => puzzle.clues.find(c => c.id === id)?.cells ?? []));

  const go = (square?: Square) => square && setSel({ cell: square.cell, dir: square.dir });
  /** Answers in clue order, each listed once (by its first entry). */
  const answers = () => puzzle.clues.filter(c => answerOf(puzzle, c)[0] === c);

  function selectCell(cell: number) {
    if (puzzle.blocks[cell]) return;
    if (cell === sel.cell) {
      // Clicking the selected square again switches direction.
      if (clueAt(puzzle, cell, other(sel.dir))) setSel({ cell, dir: other(sel.dir) });
      return;
    }
    setSel({ cell, dir: clueAt(puzzle, cell, sel.dir) ? sel.dir : other(sel.dir) });
  }

  function selectClue(c: Clue) {
    const all = squaresOf(answerOf(puzzle, c));
    go(all.find(s => opts.isEmpty(s.cell)) ?? all[0]);
  }

  /** The first empty square of the next answer (in clue order) that isn't finished. */
  function nextUnfinished(): Square | undefined {
    const list = answers();
    const start = list.indexOf(answer[0]);
    for (let i = 1; i < list.length; i++) {
      const empty = squaresOf(answerOf(puzzle, list[(start + i) % list.length])).find(s => opts.isEmpty(s.cell));
      if (empty) return empty;
    }
  }

  /** Moves one square in a direction, jumping over black squares. */
  function step(dr: number, dc: number) {
    let r = Math.floor(sel.cell / puzzle.cols) + dr;
    let c = (sel.cell % puzzle.cols) + dc;
    for (; r >= 0 && r < puzzle.rows && c >= 0 && c < puzzle.cols; r += dr, c += dc) {
      const cell = r * puzzle.cols + c;
      if (!puzzle.blocks[cell]) return setSel({ cell, dir: clueAt(puzzle, cell, sel.dir) ? sel.dir : other(sel.dir) });
    }
  }

  function arrow(dir: Dir, dr: number, dc: number) {
    if (sel.dir !== dir && clueAt(puzzle, sel.cell, dir)) setSel({ cell: sel.cell, dir });
    else step(dr, dc);
  }

  function onKey(key: string, shift: boolean): boolean {
    if (opts.disabled) return false;
    const letter = normalizeLetter(key);
    if (letter) {
      const wasEmpty = opts.isEmpty(sel.cell);
      opts.setLetter(sel.cell, letter);
      if (index < 0) return true;
      // Filling an empty square skips over filled ones; overwriting moves on one square. At the end of the answer,
      // go back to any square still empty in it, else on to the next unfinished answer.
      const emptyAt = (i: number) => i !== index && opts.isEmpty(squares[i].cell);
      const later = wasEmpty ? squares.findIndex((_, i) => i > index && emptyAt(i)) : index + 1 < squares.length ? index + 1 : -1;
      const earlier = squares.findIndex((_, i) => i < index && emptyAt(i));
      go(later >= 0 ? squares[later] : earlier >= 0 ? squares[earlier] : nextUnfinished());
      return true;
    }
    switch (key) {
      case 'Backspace':
        if (opts.hasLetter(sel.cell) || index <= 0) opts.setLetter(sel.cell, '');
        else {
          opts.setLetter(squares[index - 1].cell, '');
          go(squares[index - 1]);
        }
        return true;
      case 'Delete':
        opts.setLetter(sel.cell, '');
        return true;
      case ' ':
        if (clueAt(puzzle, sel.cell, other(sel.dir))) setSel({ cell: sel.cell, dir: other(sel.dir) });
        return true;
      case 'Tab': {
        const list = answers();
        const i = list.indexOf(answer[0]);
        selectClue(list[(i + (shift ? -1 : 1) + list.length) % list.length]);
        return true;
      }
      case 'ArrowLeft':
        arrow('A', 0, -1);
        return true;
      case 'ArrowRight':
        arrow('A', 0, 1);
        return true;
      case 'ArrowUp':
        arrow('D', -1, 0);
        return true;
      case 'ArrowDown':
        arrow('D', 1, 0);
        return true;
    }
    return opts.onKey?.(key) ?? false;
  }

  // Keys can arrive faster than effects run, so the listener always calls the handler from the latest render.
  const latestOnKey = useRef(onKey);
  latestOnKey.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (latestOnKey.current(e.key, e.shiftKey)) e.preventDefault();
    };
    addEventListener('keydown', listener);
    return () => removeEventListener('keydown', listener);
  }, []);
  useEffect(() => document.querySelector('.clue-list li.current')?.scrollIntoView({ block: 'nearest' }), [clue?.id]);

  return { sel, clue, answer, crossing, refs, answerCells, refCells, selectCell, selectClue };
}

interface Square {
  cell: number;
  dir: Dir;
}

const squaresOf = (parts: Clue[]): Square[] => parts.flatMap(part => part.cells.map(cell => ({ cell, dir: part.dir })));

/** "6A", or "1A/3A" for a linked answer. */
export const answerLabel = (answer: Clue[]) => answer.map(c => c.id).join('/');

/** Classes for the selected answer's squares, the cursor square, and squares of clues the answer refers to. */
export const cursorClass = (cursor: { sel: { cell: number }; answerCells: Set<number>; refCells: Set<number> }, cell: number) =>
  [cursor.answerCells.has(cell) ? 'in-clue' : cursor.refCells.has(cell) && 'ref', cell === cursor.sel.cell && 'cursor'].filter(Boolean).join(' ');

const breakClasses = (b?: CellBreaks) =>
  [b?.right === 'word' && 'brk-r', b?.right === 'hyphen' && 'hyp-r', b?.bottom === 'word' && 'brk-b', b?.bottom === 'hyphen' && 'hyp-b']
    .filter(Boolean)
    .join(' ');

export function Grid({
  puzzle,
  renderCell,
  cellClass,
  onCellDown,
  breaks,
}: {
  puzzle: Puzzle;
  /** What goes inside a white square. */
  renderCell(cell: number): ComponentChildren;
  cellClass?(cell: number): string;
  onCellDown?(cell: number): void;
  /** Word breaks to draw (see wordBreaks). */
  breaks?: Map<number, CellBreaks>;
}) {
  return (
    <div class="grid" style={{ '--cols': puzzle.cols }}>
      {puzzle.blocks.map((block, cell) =>
        block ? (
          <div class="cell block" />
        ) : (
          <div
            class={`cell ${cellClass?.(cell) ?? ''} ${breakClasses(breaks?.get(cell))}`}
            data-cell={cell}
            onMouseDown={
              onCellDown &&
              (e => {
                e.preventDefault();
                onCellDown(cell);
              })
            }
          >
            {renderCell(cell)}
          </div>
        ),
      )}
    </div>
  );
}

export function ClueLists({
  puzzle,
  current = [],
  crossing,
  refs = [],
  onSelect,
  after,
}: {
  puzzle: Puzzle;
  /** The selected answer's entries. */
  current?: string[];
  /** The clue crossing the cursor square. */
  crossing?: string;
  /** Clues the selected answer refers to. */
  refs?: string[];
  onSelect(clue: Clue): void;
  /** Anything to show after a clue's text, e.g. player badges. */
  after?(clue: Clue): ComponentChildren;
}) {
  const classOf = (id: string) => (current.includes(id) ? 'current' : id === crossing ? 'crossing' : refs.includes(id) ? 'ref' : '');
  return (
    <div class="clues">
      {(['A', 'D'] as const).map(dir => (
        <div class="clue-list">
          <h3>{dir === 'A' ? 'Across' : 'Down'}</h3>
          <ol>
            {puzzle.clues
              .filter(c => c.dir === dir)
              .map(c => (
                <li class={classOf(c.id)} data-clue={c.id} onClick={() => onSelect(c)}>
                  <span class="n">{c.num}</span>
                  <span class="t">{c.text}</span>
                  {after?.(c)}
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** A small read-only board: just the letters, with wrong ones marked if `status` is given. */
export function MiniBoard({ puzzle, letters, status }: { puzzle: Puzzle; letters: string[]; status?: ('' | 'right' | 'wrong')[] }) {
  return (
    <div class="board">
      <Grid puzzle={puzzle} cellClass={cell => status?.[cell] ?? ''} renderCell={cell => <span class="letter">{letters[cell]}</span>} />
    </div>
  );
}
