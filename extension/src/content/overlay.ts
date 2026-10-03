// Draws other players' suggestions and clue badges on top of the real crossword.
// Mouse events pass straight through to the site.
import { textOn } from '../../../shared/color';
import type { RoomState } from '../../../shared/protocol';
import { cornerMarks } from '../../../shared/suggestions';
import type { SiteAdapter } from './run';

const STYLE = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: system-ui, sans-serif; }
  .mark { position: absolute; font-family: ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace; font-weight: 800;
          line-height: 1; opacity: 0.9; }
  .badge { position: absolute; width: 18px; height: 18px; border-radius: 50%; font: 700 11px/18px system-ui, sans-serif;
           text-align: center; box-shadow: 0 0 0 2px #fff; }
`;

export class Overlay {
  private layer: HTMLDivElement;
  private state: RoomState | null = null;
  private queued = false;

  constructor(private adapter: SiteAdapter) {
    const host = document.createElement('div');
    host.id = 'group-crossword-overlay';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    root.append(style, this.layer);
    document.documentElement.append(host);
    addEventListener('scroll', () => this.redraw(), { capture: true, passive: true });
    addEventListener('resize', () => this.redraw());
  }

  setState(state: RoomState | null) {
    this.state = state;
    this.redraw();
  }

  redraw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  private draw() {
    const items: HTMLElement[] = [];
    const { state } = this;
    if (state?.puzzle) {
      const cells = this.adapter.cells();
      for (const [cell, marks] of cornerMarks(state.puzzle, state.suggestions, state.players)) {
        const r = cells[cell] && visibleRect(cells[cell]);
        if (!r) continue;
        const size = r.width * 0.36;
        const pad = r.width * 0.05;
        // Anchor to the cell's own edges (right/bottom for the right/bottom corners) so letters never spill over.
        const right = this.layer.clientWidth - r.right + pad;
        const bottom = this.layer.clientHeight - r.bottom + pad;
        const afterNumber = numberRight(cells[cell], state.puzzle.numbers[cell]) ?? r.left;
        const spots = [
          `right:${right}px;top:${r.top + pad}px`, // top-right
          `left:${afterNumber + pad}px;top:${r.top + pad}px`, // top-left, after the clue number
          `left:${r.left + pad}px;bottom:${bottom}px`, // bottom-left
          `right:${right}px;bottom:${bottom}px`, // bottom-right
        ];
        marks.forEach((m, i) => {
          const el = div('mark', m.text);
          el.dataset.cell = String(cell);
          el.style.cssText = `${spots[i]};font-size:${m.text.length > 1 ? size * 0.7 : size}px;color:${m.color}`;
          items.push(el);
        });
      }
      // One badge per guest on the clue they've selected.
      const byClue = new Map<string, typeof state.players>();
      for (const p of state.players) {
        if (p.host || !p.online || !p.clueId) continue;
        byClue.set(p.clueId, [...(byClue.get(p.clueId) ?? []), p]);
      }
      for (const [clueId, players] of byClue) {
        const el = this.adapter.clueElement(clueId);
        const r = el && visibleRect(el);
        if (!r) continue;
        players.forEach((p, i) => {
          const badge = div('badge', p.name.slice(0, 1).toUpperCase());
          badge.title = p.name;
          const left = this.adapter.badgeSide === 'left' ? r.left + 4 + i * 20 : r.right - 22 - i * 20;
          badge.style.cssText = `left:${left}px;top:${r.top + 3}px;background:${p.color};color:${textOn(p.color)}`;
          items.push(badge);
        });
      }
    }
    this.layer.replaceChildren(...items);
  }
}

function div(className: string, text: string) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

/** Where the clue number printed in a cell ends, measured on the text itself (its element may be wider). */
function numberRight(cell: Element, num: number | null): number | null {
  if (num === null) return null;
  for (const el of cell.querySelectorAll('*')) {
    if (el.childElementCount || el.textContent?.replace(/\D/g, '') !== String(num)) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().right;
  }
  return null;
}

/** The element's on-screen box, or null if it's hidden or scrolled out of view inside a scrolling panel. */
function visibleRect(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const clip = p.getBoundingClientRect();
    if (r.bottom <= clip.top || r.top >= clip.bottom || r.right <= clip.left || r.left >= clip.right) return null;
  }
  return r;
}
