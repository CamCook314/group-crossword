// The crossword grid, clue lists, and keyboard/mouse navigation, shared by the co-op view, the racer's view and the
// host's race view. Styles are in grid.css.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { normalizeLetter } from './protocol';
import { clueAt, type Clue, type Dir, type Puzzle } from './puzzle';

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
    setSel({ cell: c.cells.find(x => opts.isEmpty(x)) ?? c.cells[0], dir: c.dir });
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
    const index = clue ? clue.cells.indexOf(sel.cell) : -1;
    const letter = normalizeLetter(key);
    if (letter) {
      opts.setLetter(sel.cell, letter);
      if (clue && index < clue.cells.length - 1) setSel({ cell: clue.cells[index + 1], dir: clue.dir });
      return true;
    }
    switch (key) {
      case 'Backspace':
        if (opts.hasLetter(sel.cell) || !clue || index <= 0) opts.setLetter(sel.cell, '');
        else {
          opts.setLetter(clue.cells[index - 1], '');
          setSel({ cell: clue.cells[index - 1], dir: clue.dir });
        }
        return true;
      case 'Delete':
        opts.setLetter(sel.cell, '');
        return true;
      case 'Tab': {
        const i = clue ? puzzle.clues.indexOf(clue) : -1;
        const n = puzzle.clues.length;
        selectClue(puzzle.clues[(i + (shift ? -1 : 1) + n) % n]);
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

  return { sel, clue, selectCell, selectClue };
}

/** Classes for the selected clue's squares and the cursor square. */
export const cursorClass = (cursor: { sel: { cell: number }; clue?: Clue }, cell: number) =>
  [cursor.clue?.cells.includes(cell) && 'in-clue', cell === cursor.sel.cell && 'cursor'].filter(Boolean).join(' ');

export function Grid({
  puzzle,
  renderCell,
  cellClass,
  onCellDown,
}: {
  puzzle: Puzzle;
  /** What goes inside a white square. */
  renderCell(cell: number): ComponentChildren;
  cellClass?(cell: number): string;
  onCellDown?(cell: number): void;
}) {
  return (
    <div class="grid" style={{ '--cols': puzzle.cols }}>
      {puzzle.blocks.map((block, cell) =>
        block ? (
          <div class="cell block" />
        ) : (
          <div
            class={`cell ${cellClass?.(cell) ?? ''}`}
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
  current,
  onSelect,
  after,
}: {
  puzzle: Puzzle;
  current?: string;
  onSelect(clue: Clue): void;
  /** Anything to show after a clue's text, e.g. player badges. */
  after?(clue: Clue): ComponentChildren;
}) {
  return (
    <div class="clues">
      {(['A', 'D'] as const).map(dir => (
        <div class="clue-list">
          <h3>{dir === 'A' ? 'Across' : 'Down'}</h3>
          <ol>
            {puzzle.clues
              .filter(c => c.dir === dir)
              .map(c => (
                <li class={c.id === current ? 'current' : ''} data-clue={c.id} onClick={() => onSelect(c)}>
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
