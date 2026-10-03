// Shared plumbing for the per-site content scripts: watches the page, reports it to the
// background page, reads the answers, draws the overlay, and types accepted answers.
import { solutionsFit, type Solutions } from '../../../shared/answers';
import { puzzleKey } from '../../../shared/puzzle';
import type { FromAdapter, PageSnapshot, ToAdapter } from '../messages';
import { Overlay } from './overlay';

export interface SiteAdapter {
  /** What the page shows right now, or null if there's no crossword on it. */
  read(): PageSnapshot | null;
  /** The grid's cell elements, row-major (same indexing as the puzzle). */
  cells(): Element[];
  /** The element for a clue in the site's clue list. */
  clueElement(clueId: string): Element | null;
  /** Which end of a clue has room for player badges without covering the clue text. */
  badgeSide: 'left' | 'right';
  /** Selects a cell on the site and types a letter into it, or clears it if letter is ''. */
  setLetter(cell: number, letter: string): void;
  /** The puzzle's answers from the data the site embeds, or null if they aren't there. */
  readAnswers(): Promise<Solutions | null>;
}

export function runAdapter(adapter: SiteAdapter) {
  let overlay: Overlay | null = null; // created once a crossword shows up
  let port: browser.runtime.Port | null = null;
  let lastSent = '';
  let answersFor = ''; // puzzleKey of the puzzle we last read answers for
  let typing = Promise.resolve();
  const send = (msg: FromAdapter) => port?.postMessage(msg);

  async function sendAnswers(snapshot: PageSnapshot) {
    const key = puzzleKey(snapshot.puzzle);
    let solutions: Solutions | null = null;
    try {
      solutions = await adapter.readAnswers();
    } catch {}
    // Only answers that match the puzzle on screen (guards against stale page data).
    send({ type: 'answers', puzzleKey: key, solutions: solutions && solutionsFit(snapshot.puzzle, solutions) ? solutions : null });
  }

  async function applyLetters(cells: { cell: number; letter: string }[]) {
    for (const { cell, letter } of cells) {
      adapter.setLetter(cell, letter);
      // Let the site re-render before the next square: Crosshare decides when it renders whether clicking a square
      // selects it or flips direction. A microtask, not a timer, because timers are throttled in out-of-view frames.
      await Promise.resolve();
    }
  }

  function connect() {
    overlay ??= new Overlay(adapter);
    const p = browser.runtime.connect({ name: 'adapter' });
    p.onMessage.addListener(m => {
      const msg = m as ToAdapter;
      if (msg.type === 'overlay') overlay?.setState(msg.state);
      if (msg.type === 'apply') typing = typing.then(() => applyLetters(msg.cells));
    });
    p.onDisconnect.addListener(() => {
      port = null;
      answersFor = ''; // a new connection needs them again
      overlay?.setState(null);
    });
    return p;
  }

  function check() {
    const snapshot = adapter.read();
    if (!snapshot) return;
    const json = JSON.stringify(snapshot);
    if (port && json === lastSent) return;
    port ??= connect();
    lastSent = json;
    send({ type: 'page', ...snapshot });
    if (puzzleKey(snapshot.puzzle) !== answersFor) {
      answersFor = puzzleKey(snapshot.puzzle);
      sendAnswers(snapshot);
    }
  }

  let queued = false;
  new MutationObserver(() => {
    overlay?.redraw();
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      check();
    }, 100);
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  check();
}
