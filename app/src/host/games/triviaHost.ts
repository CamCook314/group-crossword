// Trivia, run in the host's tab (the rules are in shared/games/trivia.ts). Players include the host. The questions come
// from Open Trivia DB, which allows one request every 5 seconds, so each game asks for all of its questions at once.
import { QUESTIONS, SECONDS, type TriviaCommand, type TriviaMessage, type TriviaPhase, type TriviaQuestion, type TriviaSettings, type TriviaState } from '../../../../shared/games/trivia';
import type { GameIO } from './io';

const API = 'https://opentdb.com';
const DEFAULTS: TriviaSettings = { category: null, difficulty: null, questions: 10, seconds: 20 };

/** What Open Trivia DB's response codes mean, for the host. */
const ERRORS: Record<number, string> = {
  1: 'Open Trivia DB hasn’t that many questions for this category and difficulty: try fewer, or another choice.',
  5: 'Open Trivia DB allows one request every 5 seconds: try again in a moment.',
};

/** One of Open Trivia DB's questions, every field URL-encoded. */
interface ApiQuestion {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

/** A question with its right answer, which stays here until the reveal. */
type Question = TriviaQuestion & { correct: number };

export interface SavedTrivia {
  phase: TriviaPhase;
  settings: TriviaSettings;
  questions: Question[];
  index: number;
  endsAt: number;
  picks: [string, number][];
  scores: [string, number][];
}

export class TriviaHost {
  private phase: TriviaPhase = 'setup';
  private settings = DEFAULTS;
  private categories: { id: number; name: string }[] | null = null;
  private error: string | null = null;
  private questions: Question[] = [];
  private index = 0;
  /** When the current question's time is up, on this tab's clock. */
  private endsAt = 0;
  /** Answers to the current question, by player id. */
  private picks = new Map<string, number>();
  private scores = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Tests pass their own `getJson` (fetches a URL and parses it) and `random` (for the shuffle). */
  constructor(
    private io: GameIO,
    private env = { getJson: (url: string): Promise<unknown> => fetch(url).then(r => r.json()), random: Math.random },
  ) {}

  state(): TriviaState {
    const q = this.questions[this.index];
    const asking = this.phase === 'question' || this.phase === 'revealed';
    const revealed = this.phase === 'revealed';
    return {
      phase: this.phase,
      settings: this.settings,
      categories: this.categories ?? [],
      error: this.error,
      index: this.index,
      total: this.questions.length,
      question: asking ? { text: q.text, category: q.category, difficulty: q.difficulty, answers: q.answers } : null,
      msLeft: this.phase === 'question' ? Math.max(0, this.endsAt - Date.now()) : 0,
      answered: [...this.picks.keys()],
      correct: revealed ? q.correct : null,
      picks: revealed ? Object.fromEntries(this.picks) : null,
      scores: Object.fromEntries(this.scores),
    };
  }

  /** `online` is everyone playing, the host included. */
  message(playerId: string, msg: TriviaMessage, online: string[]) {
    if (this.phase !== 'question' || msg.answer >= this.questions[this.index].answers.length) return;
    this.picks.set(playerId, msg.answer);
    if (online.every(id => this.picks.has(id))) this.reveal();
  }

  command(cmd: TriviaCommand, _online: string[]) {
    switch (cmd.type) {
      case 'categories':
        if (this.categories) return;
        this.categories = [];
        // If they can't be had, "Any" still works.
        this.env.getJson(`${API}/api_category.php`).then(
          data => {
            this.categories = (data as { trivia_categories?: { id: number; name: string }[] }).trivia_categories ?? [];
            this.io.changed();
          },
          () => {},
        );
        return;
      case 'start':
        if (this.phase !== 'setup') return;
        this.settings = { ...cmd.settings, questions: clamp(cmd.settings.questions, QUESTIONS), seconds: clamp(cmd.settings.seconds, SECONDS) };
        this.phase = 'loading';
        this.error = null;
        void this.load();
        return;
      case 'reveal':
        if (this.phase === 'question') this.reveal();
        return;
      case 'next':
        if (this.phase !== 'revealed') return;
        if (this.index + 1 < this.questions.length) this.ask(this.index + 1);
        else this.phase = 'done';
        return;
      case 'again':
        clearTimeout(this.timer);
        this.phase = 'setup';
        this.questions = [];
        this.index = 0;
        this.picks = new Map();
        this.scores = new Map();
        return;
    }
  }

  /** Gets the game's questions, then asks the first; or says why not. */
  private async load() {
    const { category, difficulty, questions: amount } = this.settings;
    const url = `${API}/api.php?amount=${amount}&encode=url3986${category ? `&category=${category}` : ''}${difficulty ? `&difficulty=${difficulty}` : ''}`;
    let questions: Question[] = [];
    let error: string | null = null;
    try {
      const data = (await this.env.getJson(url)) as { response_code: number; results: ApiQuestion[] };
      if (data.response_code === 0) questions = data.results.map(q => this.toQuestion(q));
      else error = ERRORS[data.response_code] ?? `Open Trivia DB couldn’t give questions (code ${data.response_code}).`;
    } catch {
      error = 'Couldn’t reach Open Trivia DB: check the connection and try again.';
    }
    if (this.phase !== 'loading') return; // started over meanwhile
    if (error) {
      this.phase = 'setup';
      this.error = error;
    } else {
      this.questions = questions;
      this.ask(0);
    }
    this.io.changed();
  }

  private toQuestion(q: ApiQuestion): Question {
    const right = decodeURIComponent(q.correct_answer);
    const answers = decodeURIComponent(q.type) === 'boolean' ? ['True', 'False'] : shuffle([right, ...q.incorrect_answers.map(decodeURIComponent)], this.env.random);
    return {
      text: decodeURIComponent(q.question),
      category: decodeURIComponent(q.category),
      difficulty: decodeURIComponent(q.difficulty),
      answers,
      correct: answers.indexOf(right),
    };
  }

  private ask(index: number) {
    this.phase = 'question';
    this.index = index;
    this.picks = new Map();
    this.endsAt = Date.now() + this.settings.seconds * 1000;
    this.startClock();
  }

  /** Reveals the answer when the time is up. */
  private startClock() {
    this.timer = setTimeout(
      () => {
        this.reveal();
        this.io.changed();
      },
      Math.max(0, this.endsAt - Date.now()),
    );
  }

  private reveal() {
    clearTimeout(this.timer);
    this.phase = 'revealed';
    const { correct } = this.questions[this.index];
    for (const [id, pick] of this.picks) if (pick === correct) this.scores.set(id, (this.scores.get(id) ?? 0) + 1);
  }

  save(): SavedTrivia {
    const { phase, settings, questions, index, endsAt } = this;
    return { phase, settings, questions, index, endsAt, picks: [...this.picks], scores: [...this.scores] };
  }

  /** Carries on from a save, if there is one. A question's clock keeps running; questions still loading are lost. */
  restore(saved: unknown) {
    const s = saved as SavedTrivia | null | undefined;
    if (!s) return;
    clearTimeout(this.timer);
    Object.assign(this, s, { phase: s.phase === 'loading' ? 'setup' : s.phase, picks: new Map(s.picks), scores: new Map(s.scores) });
    if (this.phase === 'question') this.startClock();
  }
}

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, Math.round(n) || min));

/** Shuffles in place. */
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
