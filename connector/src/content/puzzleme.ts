// Amuse Labs' PuzzleMe player, which Courier Mail embeds in an iframe.
import { puzzleMeSolutions } from '../../../shared/answers';
import { spaceBeforeEnumeration } from '../../../shared/clues';
import { buildPuzzle, type Dir } from '../../../shared/puzzle';
import { decodeRawc } from '../../../shared/rawc';
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

/** An element's own text, ignoring its child elements. */
const ownText = (el: Element | null) =>
  [...(el?.childNodes ?? [])]
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent)
    .join('')
    .trim();

const clueItems = () =>
  LISTS.flatMap(([list, dir]) =>
    [...document.querySelectorAll(`${list} .clueDiv`)].map(div => ({
      div,
      dir,
      // A linked clue shows the clue it links to inside its number: <div class="clueNum">4<div class="linkedClueNum">7</div></div>.
      num: Number(ownText(div.querySelector('.clueNum'))),
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
      .map(({ div, num, dir }) => ({ num, dir, text: spaceBeforeEnumeration(div.querySelector('.clue')?.textContent?.trim() ?? '') }));
    const active = clueItems().find(c => c.div.classList.contains('hilited-clue'));
    return { puzzle: buildPuzzle(document.title, g.rows, g.cols, blocks, clues), letters, clueId: active ? active.num + active.dir : null };
  },

  setLetter(cell, letter) {
    const box = grid()?.cells[cell];
    if (!box) return;
    // PuzzleMe selects on mousedown/mouseup (a plain click() does nothing), and reads letters from a hidden input.
    mouse(box, 'mousedown');
    mouse(box, 'mouseup');
    const input = document.querySelector<HTMLInputElement>('input.dummy');
    if (!input) return;
    if (letter) {
      input.value = letter;
      input.dispatchEvent(new InputEvent('input', { data: letter, inputType: 'insertText', bubbles: true }));
    } else {
      // Typed letters arrive as input events, but Delete is a keydown; it clears the selected square.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, which: 46, bubbles: true, cancelable: true }));
    }
  },

  async readAnswers() {
    // The whole puzzle, answers included, is embedded scrambled as "rawc": usually a page variable (which Firefox
    // content scripts reach through wrappedJSObject), sometimes inside a JSON script tag.
    const page = (window as unknown as { wrappedJSObject?: { puzzleEnv?: { rawc?: unknown }; rawc?: unknown } }).wrappedJSObject;
    const params = document.getElementById('params')?.textContent;
    const rawc = page?.puzzleEnv?.rawc ?? page?.rawc ?? (params ? JSON.parse(params).rawc : undefined);
    return typeof rawc === 'string' ? puzzleMeSolutions(decodeRawc(rawc)) : null;
  },
};

runAdapter(adapter);
