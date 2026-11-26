import { describe, expect, it } from 'vitest';
import { calculateSeconds, createQuestion, pointsForCorrect, QuestionDeck, roundSeconds, topTen, type GameSummary } from '../src/game';
import { defaultData, LEGACY_STORAGE_KEY, loadData, parseData, recordGame, saveData, STORAGE_KEY } from '../src/storage';

describe('questions', () => {
  it('uses only selected tables and a multiplier from 1 to 10', () => {
    for (let index = 0; index < 100; index += 1) {
      const question = createQuestion([3, 7]);
      expect([3, 7]).toContain(question.table);
      expect(question.multiplier).toBeGreaterThanOrEqual(1);
      expect(question.multiplier).toBeLessThanOrEqual(10);
      expect(question.options).toHaveLength(3);
      expect(new Set(question.options).size).toBe(3);
      expect(question.options.filter((value) => value === question.answer)).toHaveLength(1);
    }
  });

  it('avoids repeating the previous operation', () => {
    const first = createQuestion([1], null, () => 0);
    const second = createQuestion([1], first.key, () => 0);
    expect(second.key).not.toBe(first.key);
  });

  it('includes the tenth table and products up to one hundred', () => {
    const question = createQuestion([10], null, () => 0.999);
    expect(question).toMatchObject({ table: 10, multiplier: 10, answer: 100 });
  });

  it('rejects an empty selection', () => {
    expect(() => createQuestion([])).toThrow();
  });

  it('balances tables and avoids recent repeated operations without a rigid shuffle bag', () => {
    const deck = new QuestionDeck([2, 5, 7]);
    const questions = Array.from({ length: 300 }, () => deck.next());
    for (let index = 1; index < questions.length; index += 1) {
      expect(questions[index].table).not.toBe(questions[index - 1].table);
      expect(questions.slice(Math.max(0, index - 8), index).map((question) => question.key))
        .not.toContain(questions[index].key);
    }
    for (let index = 10; index < questions.length; index += 1) {
      const counts = [2, 5, 7].map((table) => questions.slice(0, index).filter((question) => question.table === table).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    }
  });

  it('allows a table to repeat before all selected tables have appeared', () => {
    const deck = new QuestionDeck([1, 2, 3], () => 0);
    expect([deck.next().table, deck.next().table, deck.next().table]).toEqual([1, 2, 1]);
  });

  it('avoids repeating the same operation with only one selected table', () => {
    const deck = new QuestionDeck([8]);
    const questions = Array.from({ length: 40 }, () => deck.next());
    for (let index = 1; index < questions.length; index += 1) {
      expect(questions[index].key).not.toBe(questions[index - 1].key);
    }
  });
});

describe('progression', () => {
  it('increases speed every 10 correct answers with a 4-second floor', () => {
    expect(roundSeconds('easy', 0)).toBe(13);
    expect(roundSeconds('easy', 9)).toBe(13);
    expect(roundSeconds('easy', 10)).toBeCloseTo(13 / 1.1);
    expect(roundSeconds('hard', 500)).toBe(4);
  });

  it('awards difficulty and speed bonuses', () => {
    expect(pointsForCorrect('easy', 0)).toBe(10);
    expect(pointsForCorrect('medium', 10)).toBe(25);
    expect(pointsForCorrect('hard', 20)).toBe(40);
  });

  it('gives calculate mode 18/15/12 seconds, reduces time every 10 hits, and stops at 3 seconds', () => {
    expect(calculateSeconds('easy', 0)).toBe(18);
    expect(calculateSeconds('medium', 0)).toBe(15);
    expect(calculateSeconds('hard', 0)).toBe(12);
    expect(calculateSeconds('easy', 9)).toBe(18);
    expect(calculateSeconds('easy', 10)).toBeCloseTo(16.2);
    expect(calculateSeconds('hard', 500)).toBe(3);
  });
});

describe('persistence and leaderboard', () => {
  const game = (id: string, score: number): GameSummary => ({
    id, mode: 'review', playerName: 'Ana', score, correct: score / 10, mistakes: 5,
    difficulty: 'easy', tables: [1, 2], completedAt: '2026-11-23T12:00:00.000Z',
  });

  it('keeps only the ten best scores', () => {
    expect(topTen(Array.from({ length: 12 }, (_, i) => game(String(i), i * 10))).map((entry) => entry.score))
      .toEqual([110, 100, 90, 80, 70, 60, 50, 40, 30, 20]);
  });

  it('keeps a high score even after the recent history reaches 200 games', () => {
    let data = recordGame(defaultData(), game('best', 999));
    for (let index = 0; index < 201; index += 1) data = recordGame(data, game(String(index), 10));
    expect(data.recentGames).toHaveLength(200);
    expect(data.recentGames.some((entry) => entry.id === 'best')).toBe(false);
    expect(data.highScores[0].id).toBe('best');
  });

  it('recovers from damaged data and storage failures', () => {
    expect(parseData('{')).toEqual(defaultData());
    expect(parseData(JSON.stringify({ ...defaultData(), selectedTables: [] })).selectedTables).toEqual([]);
    expect(saveData(defaultData(), { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });

  it('preserves the old leaderboard and migrates its games to review mode', () => {
    const oldGame = (({ mode: _mode, ...rest }) => rest)(game('old', 120));
    const legacy = { ...defaultData(), version: 1, highScores: [oldGame], recentGames: [oldGame] };
    const storage = { getItem: (key: string) => key === LEGACY_STORAGE_KEY ? JSON.stringify(legacy) : null };
    const migrated = loadData(storage);
    expect(migrated.version).toBe(3);
    expect(migrated.highScores[0]).toMatchObject({ id: 'old', mode: 'review' });
    expect(migrated.recentGames[0]).toMatchObject({ id: 'old', mode: 'review' });
    expect(migrated.selectedMode).toBe('review');
    expect(STORAGE_KEY).not.toBe(LEGACY_STORAGE_KEY);
  });

  it('keeps ten best scores for each mode independently', () => {
    let data = defaultData();
    for (let index = 0; index < 12; index += 1) {
      data = recordGame(data, game(`review-${index}`, index));
      data = recordGame(data, { ...game(`calculate-${index}`, index + 100), mode: 'calculate' });
    }
    expect(data.highScores.filter((entry) => entry.mode === 'review')).toHaveLength(10);
    expect(data.highScores.filter((entry) => entry.mode === 'calculate')).toHaveLength(10);
    expect(data.highScores.find((entry) => entry.id === 'review-11')?.score).toBe(11);
    expect(data.highScores.find((entry) => entry.id === 'calculate-11')?.score).toBe(111);
  });
});
