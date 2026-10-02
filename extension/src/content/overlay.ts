// Draws other players' suggestions and clue badges on top of the real crossword.
// Mouse events pass straight through to the site.
import type { RoomState } from '../../../shared/protocol';
import { cornerMarks } from '../../../shared/suggestions';
import type { SiteAdapter } from './run';

const STYLE = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: system-ui, sans-serif; }
  .mark { position: fixed; font-weight: 800; line-height: 1; opacity: 0.85; text-shadow: 0 0 3px rgba(255, 255, 255, 0.8); }
  .badge { position: fixed; width: 18px; height: 18px; border-radius: 50%; color: #fff; font: 700 11px/18px system-ui, sans-serif;
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
        const size = r.width * 0.33;
        // top-right, bottom-right, bottom-left (top-left holds the clue number)
        const spots = [[r.right - size * 0.85, r.top + 2], [r.right - size * 0.85, r.bottom - size - 2], [r.left + 3, r.bottom - size - 2]];
        marks.forEach((m, i) => {
          const el = div('mark', m.text);
          el.style.cssText = `left:${spots[i][0]}px;top:${spots[i][1]}px;font-size:${size}px;color:${m.color}`;
          if (m.text.length > 1) el.style.fontSize = `${size * 0.7}px`;
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
          badge.style.cssText = `left:${left}px;top:${r.top + 3}px;background:${p.color}`;
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
