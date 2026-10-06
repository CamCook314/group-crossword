import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTriviaMessage, type TriviaSettings } from '../../../../shared/games/trivia';
import { TriviaHost } from './triviaHost';

const everyone = ['host', 'sam', 'ana'];
const settings: TriviaSettings = { category: 9, difficulty: 'easy', questions: 2, seconds: 20 };

/** A question as Open Trivia DB sends it, URL-encoded. */
const fromApi = (question: string, right: string, wrong: string[], type = 'multiple') => ({
  type,
  difficulty: 'easy',
  category: encodeURIComponent('General Knowledge'),
  question: encodeURIComponent(question),
  correct_answer: encodeURIComponent(right),
  incorrect_answers: wrong.map(encodeURIComponent),
});
const twoQuestions = {
  response_code: 0,
  results: [fromApi('Which is the capital of France?', 'Paris', ['Lyon', 'Nice', 'Lille']), fromApi('The Earth is flat.', 'False', ['True'], 'boolean')],
};

/** A host whose shuffle always swaps with the first answer, which puts Paris last. */
function setUp(questions: unknown = twoQuestions) {
  const io = { changed: vi.fn(), tell: vi.fn() };
  const getJson = vi.fn(async (url: string) => (url.endsWith('api_category.php') ? { trivia_categories: [{ id: 9, name: 'General Knowledge' }] } : questions));
  return { trivia: new TriviaHost(io, { getJson, random: () => 0 }), io, getJson };
}

/** Lets the fake fetch finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);

async function started(questions?: unknown) {
  const game = setUp(questions);
  game.trivia.command({ type: 'start', settings }, everyone);
  await settle();
  return game;
}

describe('trivia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('loads the categories once, for the setup', async () => {
    const { trivia, io, getJson } = setUp();
    expect(trivia.state()).toMatchObject({ phase: 'setup', categories: [], settings: { questions: 10, seconds: 20 } });
    trivia.command({ type: 'categories' }, everyone);
    trivia.command({ type: 'categories' }, everyone);
    await settle();
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(trivia.state().categories).toEqual([{ id: 9, name: 'General Knowledge' }]);
    expect(io.changed).toHaveBeenCalled();
  });

  it('fetches the questions once, then asks the first with its answers shuffled and the right one hidden', async () => {
    const { trivia, io, getJson } = setUp();
    trivia.command({ type: 'start', settings }, everyone);
    expect(trivia.state().phase).toBe('loading');
    await settle();
    // At least 5 questions.
    expect(getJson).toHaveBeenCalledWith('https://opentdb.com/api.php?amount=5&encode=url3986&category=9&difficulty=easy');
    expect(io.changed).toHaveBeenCalled();
    const s = trivia.state();
    expect(s).toMatchObject({ phase: 'question', index: 0, total: 2, msLeft: 20_000, correct: null, picks: null, answered: [] });
    expect(s.question).toEqual({ text: 'Which is the capital of France?', category: 'General Knowledge', difficulty: 'easy', answers: ['Lyon', 'Nice', 'Lille', 'Paris'] });
    vi.advanceTimersByTime(5000);
    expect(trivia.state().msLeft).toBe(15_000);
  });

  it('asks for any category and difficulty by leaving them out', async () => {
    const { trivia, getJson } = setUp();
    trivia.command({ type: 'start', settings: { category: null, difficulty: null, questions: 50, seconds: 5 } }, everyone);
    await settle();
    expect(getJson).toHaveBeenCalledWith('https://opentdb.com/api.php?amount=20&encode=url3986');
    expect(trivia.state()).toMatchObject({ settings: { questions: 20, seconds: 10 }, msLeft: 10_000 });
  });

  it('takes private answers that can change, and reveals once everyone has answered', async () => {
    const { trivia } = await started();
    trivia.message('sam', { t: 'trivia-pick', answer: 0 }, everyone);
    trivia.message('sam', { t: 'trivia-pick', answer: 3 }, everyone); // changes his mind
    trivia.message('host', { t: 'trivia-pick', answer: 1 }, everyone);
    expect(trivia.state()).toMatchObject({ phase: 'question', answered: ['sam', 'host'], correct: null, picks: null });
    trivia.message('ana', { t: 'trivia-pick', answer: 3 }, everyone);
    expect(trivia.state()).toMatchObject({ phase: 'revealed', correct: 3, picks: { sam: 3, host: 1, ana: 3 }, scores: { sam: 1, ana: 1 } });
    // Too late to change.
    trivia.message('host', { t: 'trivia-pick', answer: 3 }, everyone);
    expect(trivia.state()).toMatchObject({ picks: { host: 1 }, scores: { sam: 1, ana: 1 } });
  });

  it('reveals when the time is up, or when the host says', async () => {
    const { trivia, io } = await started();
    trivia.message('sam', { t: 'trivia-pick', answer: 3 }, everyone);
    io.changed.mockClear();
    vi.advanceTimersByTime(19_999);
    expect(trivia.state().phase).toBe('question');
    vi.advanceTimersByTime(1);
    expect(io.changed).toHaveBeenCalled();
    expect(trivia.state()).toMatchObject({ phase: 'revealed', correct: 3, picks: { sam: 3 }, scores: { sam: 1 } });

    trivia.command({ type: 'next' }, everyone);
    trivia.command({ type: 'reveal' }, everyone);
    expect(trivia.state()).toMatchObject({ phase: 'revealed', index: 1, correct: 1, picks: {} });
  });

  it('keeps score to the end, then starts again', async () => {
    const { trivia } = await started();
    trivia.message('sam', { t: 'trivia-pick', answer: 3 }, everyone);
    trivia.command({ type: 'reveal' }, everyone);
    trivia.command({ type: 'next' }, everyone);
    // True or False, in that order.
    expect(trivia.state().question!.answers).toEqual(['True', 'False']);
    trivia.message('sam', { t: 'trivia-pick', answer: 1 }, everyone);
    trivia.message('ana', { t: 'trivia-pick', answer: 0 }, everyone);
    trivia.message('host', { t: 'trivia-pick', answer: 3 }, everyone); // not an answer here: ignored
    expect(trivia.state().answered).toEqual(['sam', 'ana']);
    trivia.command({ type: 'reveal' }, everyone);
    trivia.command({ type: 'next' }, everyone);
    expect(trivia.state()).toMatchObject({ phase: 'done', question: null, scores: { sam: 2 } });

    trivia.command({ type: 'again' }, everyone);
    expect(trivia.state()).toMatchObject({ phase: 'setup', scores: {}, total: 0, settings: { ...settings, questions: 5 } });
  });

  it('tells the host why there are no questions, and lets them try again', async () => {
    const { trivia } = await started({ response_code: 1, results: [] });
    expect(trivia.state()).toMatchObject({ phase: 'setup', error: expect.stringContaining('try fewer') });

    const offline = setUp();
    offline.getJson.mockRejectedValueOnce(new Error('offline'));
    offline.trivia.command({ type: 'start', settings }, everyone);
    await settle();
    expect(offline.trivia.state()).toMatchObject({ phase: 'setup', error: expect.stringContaining('Couldn’t reach') });
    offline.trivia.command({ type: 'start', settings }, everyone);
    await settle();
    expect(offline.trivia.state()).toMatchObject({ phase: 'question', error: null });
  });

  it('carries on mid-question after a reload, the clock still running', async () => {
    const { trivia } = await started();
    trivia.message('sam', { t: 'trivia-pick', answer: 3 }, everyone);
    vi.advanceTimersByTime(5000);
    const io = { changed: vi.fn(), tell: vi.fn() };
    const again = new TriviaHost(io);
    again.restore(JSON.parse(JSON.stringify(trivia.save())));
    expect(again.state()).toEqual(trivia.state());
    expect(again.state()).toMatchObject({ msLeft: 15_000, answered: ['sam'], correct: null });
    vi.advanceTimersByTime(15_000);
    expect(io.changed).toHaveBeenCalled();
    expect(again.state()).toMatchObject({ phase: 'revealed', correct: 3, scores: { sam: 1 } });
  });

  it('copes with nothing saved, or questions that were still loading', () => {
    const { trivia } = setUp();
    trivia.restore(null);
    trivia.restore(undefined);
    expect(trivia.state().phase).toBe('setup');
    trivia.command({ type: 'start', settings }, everyone);
    const again = setUp().trivia;
    again.restore(JSON.parse(JSON.stringify(trivia.save())));
    expect(again.state().phase).toBe('setup');
  });

  it('only accepts sensible messages', () => {
    expect(parseTriviaMessage({ t: 'trivia-pick', answer: 2 })).toEqual({ t: 'trivia-pick', answer: 2 });
    expect(parseTriviaMessage({ t: 'trivia-pick', answer: 4 })).toBeNull();
    expect(parseTriviaMessage({ t: 'trivia-pick', answer: -1 })).toBeNull();
    expect(parseTriviaMessage({ t: 'trivia-pick', answer: 1.5 })).toBeNull();
    expect(parseTriviaMessage({ t: 'trivia-pick', answer: '1' })).toBeNull();
    expect(parseTriviaMessage({ t: 'something-else' })).toBeNull();
  });
});
