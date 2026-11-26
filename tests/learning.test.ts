import { describe, expect, it } from 'vitest';
import {
  addDays, factsForTables, insertDelayedRetry, learningHint, learningStats, markNeedsReview,
  planLearningSession, recordExtraPractice, updateFactProgress,
} from '../src/learning';
import { createLearningProfile, loadData, PREVIOUS_STORAGE_KEY, STORAGE_KEY } from '../src/storage';

const day = '2026-11-26';

describe('guided learning', () => {
  it('shows all ten facts of a single table, then reinforces two different facts', () => {
    const profile = createLearningProfile('Ana', 'ana');
    const session = planLearningSession(profile, day, () => 0.37);
    expect(session).toHaveLength(12);
    expect(new Set(session.slice(0, 10).map((fact) => fact.key)).size).toBe(10);
    expect(new Set(session.map((fact) => fact.key)).size).toBe(10);
    expect(session[10].key).not.toBe(session[11].key);
    expect(session.every((fact) => fact.table === 2)).toBe(true);
  });

  it('uses four repetitions and covers eight facts when many reviews are due', () => {
    const profile = createLearningProfile('Ana', 'ana');
    for (const fact of factsForTables([2])) {
      profile.facts[fact.key] = { stage: 1, dueOn: day, attempts: 1, correct: 1 };
    }
    const session = planLearningSession(profile, day, () => 0.37);
    const core = session.slice(0, 8);
    const repeats = session.slice(8);
    expect(new Set(core.map((fact) => fact.key)).size).toBe(8);
    expect(new Set(repeats.map((fact) => fact.key)).size).toBe(4);
    expect(repeats.every((fact) => core.some((item) => item.key === fact.key))).toBe(true);
  });

  it('uses three repetitions when two reviews are due', () => {
    const profile = createLearningProfile('Ana', 'ana');
    for (const fact of factsForTables([2]).slice(0, 2)) {
      profile.facts[fact.key] = { stage: 1, dueOn: day, attempts: 1, correct: 1 };
    }
    const session = planLearningSession(profile, day, () => 0.37);
    expect(new Set(session.slice(0, 9).map((fact) => fact.key)).size).toBe(9);
    expect(new Set(session.slice(9).map((fact) => fact.key)).size).toBe(3);
    expect(session.slice(0, 9).filter((fact) => profile.facts[fact.key])).toHaveLength(2);
  });

  it('balances pending reviews with at most four unseen facts when several tables are selected', () => {
    const profile = createLearningProfile('Ana', 'ana');
    profile.tables = [2, 3];
    for (const fact of factsForTables([2]).slice(0, 10)) {
      profile.facts[fact.key] = { stage: 2, dueOn: day, attempts: 2, correct: 2 };
    }
    const session = planLearningSession(profile, day, () => 0.42);
    expect(session).toHaveLength(12);
    expect(new Set(session.slice(0, 8).map((fact) => fact.key)).size).toBe(8);
    expect(session.slice(0, 8).filter((fact) => fact.key.startsWith('2x'))).toHaveLength(4);
    expect(session.slice(0, 8).filter((fact) => fact.key.startsWith('3x'))).toHaveLength(4);
    expect(new Set(session.slice(8).map((fact) => fact.key)).size).toBe(4);
    expect(session.slice(8).every((fact) => fact.key.startsWith('2x'))).toBe(true);
    expect(factsForTables([3]).find((fact) => fact.key === '3x2')?.key).not.toBe('2x3');
  });

  it('gives omitted facts priority in later sessions while covering both tables', () => {
    const profile = createLearningProfile('Ana', 'ana');
    profile.tables = [2, 3];
    const seen = new Set<string>();
    for (let sessionNumber = 0; sessionNumber < 4; sessionNumber += 1) {
      const sessionDay = addDays(day, sessionNumber);
      const session = planLearningSession(profile, sessionDay, () => 0.25 + sessionNumber * 0.15);
      expect(new Set(session.map((fact) => fact.key)).size).toBeGreaterThanOrEqual(8);
      expect(new Set(session.map((fact) => fact.key)).size).toBeLessThanOrEqual(10);
      for (const fact of new Map(session.map((fact) => [fact.key, fact])).values()) {
        seen.add(fact.key);
        profile.facts[fact.key] = updateFactProgress(profile.facts[fact.key], true, sessionDay);
      }
    }
    expect(seen.size).toBe(20);
  });

  it('schedules successful first attempts across days before mastery', () => {
    let progress = updateFactProgress(undefined, true, day);
    expect(progress).toMatchObject({ stage: 1, dueOn: '2026-11-27' });
    progress = updateFactProgress(progress, true, progress.dueOn);
    expect(progress).toMatchObject({ stage: 2, dueOn: '2026-11-30' });
    progress = updateFactProgress(progress, true, progress.dueOn);
    expect(progress).toMatchObject({ stage: 3, dueOn: '2026-12-07' });
    progress = updateFactProgress(progress, true, progress.dueOn);
    expect(progress).toMatchObject({ stage: 4, dueOn: '2026-12-21' });
    progress = updateFactProgress(progress, true, progress.dueOn);
    expect(progress).toMatchObject({ stage: 5, dueOn: '' });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('does not advance after an error or hint, and reopens a missed mastered fact', () => {
    const first = updateFactProgress(undefined, false, day);
    expect(first).toMatchObject({ stage: 0, dueOn: '2026-11-27' });
    const reviewed = updateFactProgress({ ...first, stage: 3 }, false, day);
    expect(reviewed).toMatchObject({ stage: 3, dueOn: '2026-11-27' });
    expect(markNeedsReview({ stage: 5, dueOn: '', attempts: 5, correct: 5 }, day))
      .toMatchObject({ stage: 4, dueOn: '2026-11-27' });
  });

  it('places a retry after at least two other questions even at the end', () => {
    const [failed, other, third] = factsForTables([2]).slice(0, 3);
    const queue = [failed, failed];
    insertDelayedRetry(queue, 0, failed, [other, third]);
    expect(queue.slice(1, 3).every((fact) => fact.key !== failed.key)).toBe(true);
    expect(queue[3].key).toBe(failed.key);
  });

  it('keeps all ten distinct questions ahead of an error retry', () => {
    const queue = factsForTables([2]);
    const failed = queue[0];
    insertDelayedRetry(queue, 0, failed, queue.slice(1));
    expect(new Set(queue.slice(0, 10).map((fact) => fact.key)).size).toBe(10);
    expect(queue.at(-1)?.key).toBe(failed.key);
    expect(queue.length).toBe(11);
  });

  it('records optional early practice without advancing the review date', () => {
    const scheduled = updateFactProgress(undefined, true, day);
    expect(recordExtraPractice(scheduled)).toMatchObject({ stage: 1, dueOn: '2026-11-27', attempts: 2, correct: 2 });
  });

  it('explains 2 × 10 as ten groups of two', () => {
    const fact = factsForTables([2]).find((item) => item.key === '2x10')!;
    expect(learningHint(fact)).toBe('10 grupos de 2: 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 2 = 20.');
  });

  it('keeps each child’s progress separate after saving and loading', () => {
    const ana = createLearningProfile('Ana', 'ana');
    const leo = createLearningProfile('Leo', 'leo');
    ana.facts['2x3'] = updateFactProgress(undefined, true, day);
    const old = {
      version: 3, playerName: 'Ana', selectedTables: [2], difficulty: 'easy', selectedMode: 'review',
      muted: false, profiles: [ana, leo], selectedProfileId: 'ana', recentGames: [], highScores: [],
    };
    const loaded = loadData({ getItem: (key) => key === STORAGE_KEY ? JSON.stringify(old) : null });
    expect(loaded.profiles.find((profile) => profile.id === 'ana')?.facts['2x3']?.stage).toBe(1);
    expect(loaded.profiles.find((profile) => profile.id === 'leo')?.facts['2x3']).toBeUndefined();
    expect(learningStats(loaded.profiles[0], day).introduced).toBe(1);
  });

  it('migrates v2 player and scores into v3 without changing the leaderboard', () => {
    const old = {
      version: 2, playerName: 'Ana', selectedTables: [2, 7], difficulty: 'medium',
      selectedMode: 'calculate', muted: false, recentGames: [],
      highScores: [{ id: 'old', mode: 'calculate', playerName: 'Ana', score: 90, correct: 4,
        mistakes: 5, difficulty: 'medium', tables: [2, 7], completedAt: '2026-11-25T12:00:00Z' }],
    };
    const loaded = loadData({ getItem: (key) => key === PREVIOUS_STORAGE_KEY ? JSON.stringify(old) : null });
    expect(loaded.version).toBe(3);
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0].name).toBe('Ana');
    expect(loaded.selectedProfileId).toBe(loaded.profiles[0].id);
    expect(loaded.highScores[0]).toMatchObject({ id: 'old', mode: 'calculate', score: 90 });
    expect(loaded.selectedTables).toEqual([2, 7]);
  });
});
