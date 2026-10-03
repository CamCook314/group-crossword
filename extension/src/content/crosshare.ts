// Crosshare (crosshare.org). Its class names are CSS-module hashes like
// "Cell-module__JMEMxa__cellContainer", so we only match on the stable part.
import { crosshareSolutions } from '../../../shared/answers';
import { buildPuzzle, type Dir } from '../../../shared/puzzle';
import { runAdapter, type SiteAdapter } from './run';

function grid() {
  const found = [...document.querySelectorAll('[aria-label^="cell"]')].flatMap(el => {
    const m = el.getAttribute('aria-label')!.match(/^cell(\d+)x(\d+)$/);
    return m ? [{ el, r: Number(m[1]), c: Number(m[2]) }] : [];
  });
  if (!found.length) return null;
  const rows = Math.max(...found.map(f => f.r)) + 1;
  const cols = Math.max(...found.map(f => f.c)) + 1;
  const cells: Element[] = [];
  for (const f of found) cells[f.r * cols + f.c] = f.el;
  return { rows, cols, cells };
}

const clueItems = () =>
  [...document.querySelectorAll('li[class*="ClueList"][class*="__item"]')].flatMap(li => {
    const m = li.querySelector('[class*="__label"]')?.textContent?.trim().match(/^(\d+)([AD])$/);
    return m ? [{ li, num: Number(m[1]), dir: m[2] as Dir }] : [];
  });

const adapter: SiteAdapter = {
  read() {
    const g = grid();
    if (!g || g.cells.length !== g.rows * g.cols) return null;
    const blocks = g.cells.map(el => /__cellContainerBlock/.test(el.parentElement?.className ?? ''));
    const letters = g.cells.map(el => el.querySelector('[class*="__contents"]')?.textContent?.trim().toUpperCase() ?? '');
    const seen = new Set<string>();
    const clues = clueItems().flatMap(({ li, num, dir }) => {
      if (seen.has(num + dir)) return [];
      seen.add(num + dir);
      return [{ num, dir, text: li.querySelector('[class*="__clueText"]')?.textContent?.trim() ?? '' }];
    });
    const active = clueItems().find(({ li }) => li.getAttribute('data-active') === 'true');
    const title = document.title.replace(/\s*\|\s*Crosshare.*$/i, '');
    return { puzzle: buildPuzzle(title, g.rows, g.cols, blocks, clues), letters, clueId: active ? active.num + active.dir : null };
  },

  cells: () => grid()?.cells ?? [],

  clueElement(clueId) {
    return clueItems().find(({ num, dir }) => num + dir === clueId)?.li ?? null;
  },

  // Clue numbers are right-aligned in a wide column, leaving space on the left; the text runs to the right edge.
  badgeSide: 'left',

  setLetter(cell, letter) {
    (grid()?.cells[cell] as HTMLElement | undefined)?.click();
    // Crosshare listens for keydown on window; it ignores events dispatched on window itself, so send it via body.
    // Delete clears the selected square without moving.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: letter || 'Delete', bubbles: true, cancelable: true }));
  },

  async readAnswers() {
    // The page's JSON holds the answers, but the copy in the DOM goes stale after in-app navigation,
    // so fetch the current page again.
    const html = await (await fetch(location.href)).text();
    const json = new DOMParser().parseFromString(html, 'text/html').getElementById('__NEXT_DATA__')?.textContent;
    const puzzle = json ? JSON.parse(json).props?.pageProps?.puzzle : null;
    return Array.isArray(puzzle?.grid) ? crosshareSolutions(puzzle) : null;
  },
};

runAdapter(adapter);
