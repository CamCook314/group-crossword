// Amuse Labs' PuzzleMe player, which Courier Mail embeds in an iframe.
import { buildPuzzle, type Dir } from '../../../shared/puzzle';
import { runAdapter, type SiteAdapter } from './run';

function grid() {
  const root = document.querySelector('.crossword');
  if (!root) return null;
  const children = [...root.children];
  const cells = children.filter(el => el.classList.contains('box'));
  // Each row of boxes is followed by an .endRow marker.
  const cols = children.findIndex(el => el.classList.contains('endRow'));
  if (!cells.length || cols <= 0 || cells.length % cols) return null;
  return { rows: cells.length / cols, cols, cells };
}

const LISTS: [string, Dir][] = [
  ['.aclues', 'A'],
  ['.dclues', 'D'],
];

const clueItems = () =>
  LISTS.flatMap(([list, dir]) =>
    [...document.querySelectorAll(`${list} .clueDiv`)].map(div => ({
      div,
      dir,
      num: Number(div.querySelector('.clueNum')?.textContent?.trim()),
    })),
  );

const mouse = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));

const adapter: SiteAdapter = {
  read() {
    const g = grid();
    if (!g) return null;
    const blocks = g.cells.map(el => el.classList.contains('empty'));
    const letters = g.cells.map(el => el.querySelector('.letter-in-box')?.textContent?.trim().toUpperCase() ?? '');
    const clues = clueItems()
      .filter(c => c.num > 0)
      .map(({ div, num, dir }) => ({ num, dir, text: div.querySelector('.clue')?.textContent?.trim() ?? '' }));
    const active = clueItems().find(c => c.div.classList.contains('hilited-clue'));
    return { puzzle: buildPuzzle(document.title, g.rows, g.cols, blocks, clues), letters, clueId: active ? active.num + active.dir : null };
  },

  cells: () => grid()?.cells ?? [],

  clueElement(clueId) {
    return clueItems().find(c => c.num + c.dir === clueId)?.div ?? null;
  },

  // Clue numbers sit right at the left edge.
  badgeSide: 'right',

  typeLetter(cell, letter) {
    const box = grid()?.cells[cell];
    if (!box) return;
    // PuzzleMe selects on mousedown/mouseup (a plain click() does nothing), and reads letters from a hidden input.
    mouse(box, 'mousedown');
    mouse(box, 'mouseup');
    const input = document.querySelector<HTMLInputElement>('input.dummy');
    if (!input) return;
    input.value = letter;
    input.dispatchEvent(new InputEvent('input', { data: letter, inputType: 'insertText', bubbles: true }));
  },
};

runAdapter(adapter);
