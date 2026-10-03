// A race, run by the host's background page. Holds the answers and every racer's grid; racers only ever get
// RaceState (no answers, no % correct) until the race is over.
import type { Solutions } from '../../shared/answers';
import type { RacePhase, RaceResults, RaceState } from '../../shared/protocol';
import type { Puzzle } from '../../shared/puzzle';
import { DEFAULT_SETTINGS, newRacer, places, progress, raceTime, squareStatus, updateLetters, type Racer, type RaceSettings } from '../../shared/race';

export const COUNTDOWN_MS = 3000;

/** Everything about one racer, for the host's race view. */
export interface RacerDetail {
  id: string;
  letters: string[];
  status: ('' | 'right' | 'wrong')[];
  filled: number;
  correct: number;
  total: number;
  finishedAt: number | null;
  timeMs: number | null;
  penaltyMs: number;
  place: number | null;
}

export class RaceHost {
  phase: RacePhase = 'lobby';
  settings: RaceSettings = DEFAULT_SETTINGS;
  /** The puzzle and answers, fixed when the race starts. */
  puzzle: Puzzle | null = null;
  solutions: Solutions | null = null;
  /** When the race starts (in the future during the countdown) and ended. Host clock. */
  goAt: number | null = null;
  endedAt: number | null = null;
  racers = new Map<string, Racer>();
  results: RaceResults | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `changed` is called whenever the race moves on by itself (the countdown finishing). */
  constructor(private changed: () => void) {}

  get running() {
    return this.phase === 'countdown' || this.phase === 'racing';
  }

  start(puzzle: Puzzle, solutions: Solutions, racerIds: string[], now: number) {
    this.reset();
    this.puzzle = puzzle;
    this.solutions = solutions;
    for (const id of racerIds) this.racers.set(id, newRacer(puzzle.blocks.length));
    this.phase = 'countdown';
    this.goAt = now + COUNTDOWN_MS;
    this.timer = setTimeout(() => {
      this.phase = 'racing';
      this.changed();
    }, COUNTDOWN_MS);
  }

  /** A guest joined or came back. Late joiners get an empty grid; returning racers get their grid back. */
  join(id: string): string[] | null {
    if (!this.running || !this.puzzle) return null;
    const racer = this.racers.get(id);
    if (racer) return racer.letters.some(Boolean) ? racer.letters : null;
    this.racers.set(id, newRacer(this.puzzle.blocks.length));
    return null;
  }

  /** A racer's grid changed. Returns what to tell them if it was full but wrong. */
  letters(id: string, letters: string[], now: number): { penaltyMs: number; cooldownMs: number } | null {
    const racer = this.racers.get(id);
    if (this.phase !== 'racing' || !racer || !this.solutions || letters.length !== racer.letters.length) return null;
    const result = updateLetters(racer, letters, this.solutions, this.settings, now);
    this.racers.set(id, result.racer);
    if (result.outcome !== 'not-quite') return null;
    return { penaltyMs: result.penalised ? this.settings.penaltySeconds * 1000 : 0, cooldownMs: Math.max(0, result.racer.cooldownUntil - now) };
  }

  /** Has everyone still connected finished? */
  allFinished(onlineIds: string[]) {
    const online = [...this.racers].filter(([id]) => onlineIds.includes(id));
    return online.length > 0 && online.every(([, r]) => r.finishedAt !== null);
  }

  end(now: number) {
    if (!this.running || !this.solutions || this.goAt === null) return;
    clearTimeout(this.timer);
    const ranked = places(this.racers, this.goAt);
    const winner = [...ranked].find(([, place]) => place === 1)?.[0] ?? null;
    this.results = {
      solution: winner ? this.racers.get(winner)!.letters : this.solutions[0],
      winner,
      boards: Object.fromEntries([...this.racers].map(([id, r]) => [id, r.letters])),
    };
    this.phase = 'done';
    this.endedAt = now;
  }

  /** Back to the lobby for another race. */
  reset() {
    clearTimeout(this.timer);
    this.phase = 'lobby';
    this.puzzle = this.solutions = this.goAt = this.endedAt = this.results = null;
    this.racers = new Map();
  }

  private clockMs(now: number) {
    if (this.goAt === null) return 0;
    if (this.phase === 'countdown') return this.goAt - now;
    return (this.endedAt ?? now) - this.goAt;
  }

  details(): RacerDetail[] {
    if (!this.solutions || this.goAt === null) return [];
    const ranked = places(this.racers, this.goAt);
    return [...this.racers].map(([id, r]) => ({
      id,
      letters: r.letters,
      status: squareStatus(this.solutions!, r.letters),
      ...progress(this.solutions!, r.letters),
      finishedAt: r.finishedAt,
      timeMs: raceTime(r, this.goAt!),
      penaltyMs: r.penaltyMs,
      place: ranked.get(id) ?? null,
    }));
  }

  /** What racers see: progress only as "% filled" (and only if the host allows it), never answers before the end. */
  stateForRacers(now: number): RaceState {
    return {
      phase: this.phase,
      settings: this.settings,
      clockMs: this.clockMs(now),
      racers: this.details().map(d => ({
        id: d.id,
        filled: this.settings.showOthersProgress ? d.filled : null,
        total: d.total,
        timeMs: d.timeMs,
        penaltyMs: d.penaltyMs,
        place: d.place,
      })),
      results: this.results,
    };
  }
}
