// The cryptic clue race, run in the host's tab (the rules are in shared/games/clues.ts). A game's clues are fetched
// from cryptics.georgeho.org when it starts, and their answers stay here until each one is revealed.
import { COUNT, enumerationLength, lettersOf, SECONDS, type ClueRaceCommand, type ClueRaceMessage, type ClueRacePhase, type ClueRaceState } from '../../../../shared/games/clues';
import type { GameIO } from './io';

const API = 'https://cryptics.georgeho.org/data.json';
/** The dataset's highest rowid (a few below it are missing). */
const MAX_ROWID = 663652;
const MAX_CLUE = 150;

/** A clue fit to play, with its answer. */
export interface Clue {
  text: string;
  enumeration: string;
  answer: string;
  /** '' if the dataset doesn't say. */
  definition: string;
  hint: [number, number][];
  puzzle: string;
  source: string | null;
}

export interface SavedClueRace {
  phase: ClueRacePhase;
  count: number;
  seconds: number;
  clues: Clue[];
  index: number;
  hintAt: number;
  endsAt: number;
  solved: { id: string; points: number }[];
  scores: Record<string, number>;
  error: string | null;
}

/**
 * A row from the dataset as a clue, or null if it isn't fit to play: it needs an enumeration that adds up to the
 * answer, and an answer of letters (spaces and hyphens allowed).
 */
export function toClue(row: Record<string, unknown>): Clue | null {
  const { clue, answer, definition, puzzle_name, source_url } = row;
  if (typeof clue !== 'string' || typeof answer !== 'string' || clue.length > MAX_CLUE || !/^[A-Z][A-Z -]*$/i.test(answer)) return null;
  const m = clue.replace(/\s+/g, ' ').trim().match(/^(.+?) ?\(([\d ,-]+)\)$/);
  if (!m || enumerationLength(m[2]) !== lettersOf(answer).length) return null;
  const text = m[1];
  const def = typeof definition === 'string' ? definition.replace(/\s+/g, ' ').trim() : '';
  // Two definitions come as "School/torment".
  const hint = def
    .split('/')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((d): [number, number][] => {
      const at = text.toLowerCase().indexOf(d);
      return at < 0 ? [] : [[at, at + d.length]];
    })
    .sort((a, b) => a[0] - b[0]);
  return {
    text,
    enumeration: m[2].replace(/ /g, ''),
    answer: answer.toUpperCase(),
    definition: def,
    hint,
    puzzle: typeof puzzle_name === 'string' ? puzzle_name : '',
    source: typeof source_url === 'string' && /^https?:\/\//.test(source_url) ? source_url : null,
  };
}

const clamp = (n: number, range: { min: number; max: number; default: number }) => (Number.isFinite(n) ? Math.min(range.max, Math.max(range.min, Math.round(n))) : range.default);

export class ClueRaceHost {
  private phase: ClueRacePhase = 'setup';
  private count = COUNT.default;
  private seconds = SECONDS.default;
  private clues: Clue[] = [];
  private index = 0;
  /** When the current clue's hint shows and its time is up. Host clock. */
  private hintAt = 0;
  private endsAt = 0;
  private solved: { id: string; points: number }[] = [];
  private scores: Record<string, number> = {};
  private error: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** `get` is fetch, swapped for a fake in tests. */
  constructor(
    private io: GameIO,
    private get: (url: string) => Promise<Response> = url => fetch(url),
  ) {}

  state(): ClueRaceState {
    const now = Date.now();
    const clue = this.phase === 'clue' || this.phase === 'reveal' ? this.clues[this.index] : null;
    const revealed = this.phase === 'reveal';
    return {
      phase: this.phase,
      count: this.count,
      seconds: this.seconds,
      index: this.index,
      clue: clue && {
        text: clue.text,
        enumeration: clue.enumeration,
        puzzle: clue.puzzle,
        hint: revealed || now >= this.hintAt ? clue.hint : [],
        answer: revealed ? clue.answer : null,
        definition: revealed ? clue.definition : null,
        source: revealed ? clue.source : null,
      },
      msLeft: this.phase === 'clue' ? Math.max(0, this.endsAt - now) : 0,
      solved: this.solved,
      scores: this.scores,
      error: this.error,
    };
  }

  /** `online` is everyone playing, the host included. */
  message(playerId: string, msg: ClueRaceMessage, online: string[]) {
    const clue = this.clues[this.index];
    if (this.phase !== 'clue' || this.solved.some(s => s.id === playerId)) return;
    if (lettersOf(msg.guess) !== lettersOf(clue.answer)) return this.io.tell(playerId, 'Not it', 'bad');
    // 3 for the first, 2 for the second, 1 after; a point less once the hint is showing (if there is one).
    const hinted = clue.hint.length > 0 && Date.now() >= this.hintAt;
    const points = Math.max(1, 3 - this.solved.length - (hinted ? 1 : 0));
    this.solved.push({ id: playerId, points });
    this.scores[playerId] = (this.scores[playerId] ?? 0) + points;
    this.io.tell(playerId, `Right! +${points}`, 'good');
    if (online.every(id => this.solved.some(s => s.id === id))) this.reveal();
  }

  command(cmd: ClueRaceCommand, _online: string[]) {
    switch (cmd.type) {
      case 'start':
        if (this.phase !== 'setup') return;
        this.count = clamp(cmd.count, COUNT);
        this.seconds = clamp(cmd.seconds, SECONDS);
        this.phase = 'loading';
        this.error = null;
        this.fetchClues();
        return;
      case 'reveal':
        if (this.phase === 'clue') this.reveal();
        return;
      case 'next':
        if (this.phase !== 'clue' && this.phase !== 'reveal') return;
        if (this.index + 1 < this.clues.length) this.play(this.index + 1);
        else this.end();
        return;
      case 'again':
        this.reset();
        return;
    }
  }

  /** Fetches the game's clues, then plays the first. */
  private async fetchClues() {
    try {
      const clues = await this.load();
      if (this.phase !== 'loading') return;
      if (!clues.length) throw new Error('none came back');
      this.clues = clues;
      this.count = clues.length;
      this.play(0);
    } catch (e) {
      if (this.phase !== 'loading') return;
      this.phase = 'setup';
      this.error = `Couldn’t get clues from cryptics.georgeho.org (${e instanceof Error ? e.message : e}).`;
    }
    this.io.changed();
  }

  /** Random clues, fit to play: plenty are asked for, since some aren't, and more if that wasn't enough. */
  private async load(): Promise<Clue[]> {
    const clues: Clue[] = [];
    for (let tries = 0; tries < 3 && clues.length < this.count; tries++) {
      const ids = Array.from({ length: 4 * (this.count - clues.length) }, () => 1 + Math.floor(Math.random() * MAX_ROWID));
      const sql = `select rowid, clue, answer, definition, puzzle_name, source_url from clues where rowid in (${ids.join(',')})`;
      const res = await this.get(`${API}?sql=${encodeURIComponent(sql)}&_shape=array`);
      if (!res.ok) throw new Error(`error ${res.status}`);
      const rows: unknown = await res.json();
      for (const row of Array.isArray(rows) ? rows : []) {
        const clue = row && typeof row === 'object' ? toClue(row) : null;
        if (clue && !clues.some(c => c.answer === clue.answer)) clues.push(clue);
      }
    }
    return clues.slice(0, this.count);
  }

  private play(index: number) {
    const now = Date.now();
    this.phase = 'clue';
    this.index = index;
    this.solved = [];
    this.hintAt = now + this.seconds * 500;
    this.endsAt = now + this.seconds * 1000;
    this.startClock();
  }

  /** Sends the hint at half time and reveals the answer when time's up. */
  private startClock() {
    this.stopClock();
    const now = Date.now();
    if (this.hintAt > now) this.timers.push(setTimeout(() => this.io.changed(), this.hintAt - now));
    this.timers.push(
      setTimeout(
        () => {
          this.reveal();
          this.io.changed();
        },
        Math.max(0, this.endsAt - now),
      ),
    );
  }

  private stopClock() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private reveal() {
    this.stopClock();
    this.phase = 'reveal';
  }

  private end() {
    this.stopClock();
    this.phase = 'done';
  }

  /** Back to the setup, keeping the settings. */
  private reset() {
    this.stopClock();
    this.phase = 'setup';
    this.clues = [];
    this.index = 0;
    this.solved = [];
    this.scores = {};
    this.error = null;
  }

  save(): SavedClueRace {
    const { phase, count, seconds, clues, index, hintAt, endsAt, solved, scores, error } = this;
    return { phase, count, seconds, clues, index, hintAt, endsAt, solved, scores, error };
  }

  /** Carries on from a save: a clue being played keeps its time, and clues being fetched are fetched again. */
  restore(saved: unknown) {
    this.reset();
    if (!saved) return;
    Object.assign(this, saved as SavedClueRace);
    if (this.phase === 'clue') this.startClock();
    if (this.phase === 'loading') this.fetchClues();
  }
}
