// The bracket game, run in the host's tab (the rules are in shared/games/bracket.ts). Players include the host.
import type { BracketCommand, BracketMatch, BracketMessage, BracketPhase, BracketState } from '../../../../shared/games/bracket';

export interface SavedBracket {
  phase: BracketPhase;
  category: string;
  submissions: [string, string][];
  options: { text: string; by: string }[];
  rounds: BracketMatch[][];
  current: number | null;
  votes: [string, 'a' | 'b'][];
  winner: number | null;
}

export class BracketHost {
  private phase: BracketPhase = 'category';
  private category = '';
  /** Each player's option, while they come in. */
  private submissions = new Map<string, string>();
  private options: { text: string; by: string }[] = [];
  private rounds: BracketMatch[][] = [];
  private current: number | null = null;
  /** Votes on the current match, by player id. */
  private votes = new Map<string, 'a' | 'b'>();
  private winner: number | null = null;

  constructor(private random = Math.random) {}

  state(): BracketState {
    return {
      phase: this.phase,
      category: this.category,
      submitted: [...this.submissions.keys()],
      options: this.phase === 'category' || this.phase === 'options' ? [] : this.options.map(o => ({ text: o.text, by: this.phase === 'done' ? o.by : null })),
      rounds: this.rounds,
      current: this.current,
      voted: [...this.votes.keys()],
      winner: this.winner,
    };
  }

  /** `online` is everyone who can vote, the host included. */
  message(playerId: string, msg: BracketMessage, online: string[]) {
    if (msg.t === 'bracket-option' && this.phase === 'options') this.submissions.set(playerId, msg.text);
    if (msg.t === 'bracket-vote' && this.phase === 'voting' && this.current !== null) {
      this.votes.set(playerId, msg.pick);
      if (online.every(id => this.votes.has(id))) this.decide();
    }
  }

  command(cmd: BracketCommand) {
    switch (cmd.type) {
      case 'category':
        if ((this.phase !== 'category' && this.phase !== 'options') || !cmd.text.trim()) return;
        this.category = cmd.text.trim().slice(0, 80);
        this.phase = 'options';
        return;
      case 'make-bracket': {
        if (this.phase !== 'options' || this.submissions.size < 2) return;
        // Shuffled, so neither the seeding nor the order gives away who suggested what.
        const entries = [...this.submissions].map(([by, text]) => ({ by, text }));
        for (let i = entries.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [entries[i], entries[j]] = [entries[j], entries[i]];
        }
        this.options = entries;
        this.rounds = [pairUp(entries.map((_, i) => i))];
        this.phase = 'voting';
        this.current = this.nextMatch(0);
        return;
      }
      case 'decide':
        if (this.phase === 'voting' && this.current !== null) this.decide();
        return;
      case 'again':
        this.reset();
        return;
    }
  }

  /** The first match from `from` on in the latest round that still needs deciding. */
  private nextMatch(from: number): number | null {
    const round = this.rounds.at(-1)!;
    const i = round.findIndex((m, idx) => idx >= from && m.winner === null);
    return i < 0 ? null : i;
  }

  /** Settles the current match by the votes (a tie by a coin toss), then moves on: the next match, round or the end. */
  private decide() {
    const round = this.rounds.at(-1)!;
    const match = round[this.current!];
    const votes = [...this.votes.values()];
    const votesA = votes.filter(v => v === 'a').length;
    const votesB = votes.length - votesA;
    const coinToss = votesA === votesB;
    const pickA = coinToss ? this.random() < 0.5 : votesA > votesB;
    round[this.current!] = { ...match, votesA, votesB, coinToss, winner: pickA ? match.a : match.b };
    this.votes.clear();
    this.current = this.nextMatch(this.current! + 1);
    if (this.current !== null) return;
    const winners = round.map(m => m.winner!);
    if (winners.length === 1) {
      this.phase = 'done';
      this.winner = winners[0];
      return;
    }
    this.rounds = [...this.rounds.slice(0, -1), round, pairUp(winners)];
    this.current = this.nextMatch(0);
  }

  reset() {
    this.phase = 'category';
    this.category = '';
    this.submissions = new Map();
    this.options = [];
    this.rounds = [];
    this.current = null;
    this.votes = new Map();
    this.winner = null;
  }

  save(): SavedBracket {
    const { phase, category, options, rounds, current, winner } = this;
    return { phase, category, submissions: [...this.submissions], options, rounds, current, votes: [...this.votes], winner };
  }

  restore(saved: SavedBracket) {
    Object.assign(this, saved, { submissions: new Map(saved.submissions), votes: new Map(saved.votes) });
  }
}

/** Pairs options up in order; with an odd number, the last gets a bye. */
function pairUp(options: number[]): BracketMatch[] {
  const matches: BracketMatch[] = [];
  for (let i = 0; i < options.length; i += 2) {
    const b = i + 1 < options.length ? options[i + 1] : null;
    matches.push({ a: options[i], b, votesA: 0, votesB: 0, coinToss: false, winner: b === null ? options[i] : null });
  }
  return matches;
}
