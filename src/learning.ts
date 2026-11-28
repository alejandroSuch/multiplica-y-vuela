import { TABLES } from './game';

export interface FactProgress {
  stage: number;
  dueOn: string;
  attempts: number;
  correct: number;
}

export interface LearningProfile {
  id: string;
  name: string;
  tables: number[];
  facts: Record<string, FactProgress>;
}

export interface LearningFact {
  table: number;
  multiplier: number;
  key: string;
  answer: number;
}

export const SESSION_LENGTH = 12;
const MIN_REPEATS = 2;
const MAX_REPEATS = 4;
const REVIEW_INTERVALS = [1, 3, 7, 14];

export function factKey(table: number, multiplier: number): string {
  return `${table}x${multiplier}`;
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function factsForTables(tables: number[]): LearningFact[] {
  return [...new Set(tables.filter((table) => TABLES.includes(table as typeof TABLES[number])))].flatMap((table) =>
    Array.from({ length: 10 }, (_, index) => ({
      table, multiplier: index + 1, key: factKey(table, index + 1), answer: table * (index + 1),
    })),
  );
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function planLearningSession(
  profile: LearningProfile, day = localDay(), random: () => number = Math.random,
): LearningFact[] {
  const all = factsForTables(profile.tables);
  if (!all.length) return [];
  const randomized = shuffle([...all], random);
  const attempts = (fact: LearningFact) => profile.facts[fact.key]?.attempts ?? 0;
  const leastPracticed = [...randomized].sort((a, b) => attempts(a) - attempts(b));
  const due = randomized.filter((fact) => {
    const progress = profile.facts[fact.key];
    return progress && progress.stage < 5 && progress.dueOn <= day;
  }).sort((a, b) => profile.facts[a.key].dueOn.localeCompare(profile.facts[b.key].dueOn));
  const repeatCount = Math.min(MAX_REPEATS, MIN_REPEATS + Math.floor(due.length / 2));
  const coreSize = Math.min(SESSION_LENGTH - repeatCount, all.length);
  const unseen = leastPracticed.filter((fact) => attempts(fact) === 0);
  const selected = unseen.slice(0, Math.min(4, coreSize));
  const selectedKeys = new Set(selected.map((fact) => fact.key));
  for (const fact of [...due, ...leastPracticed]) {
    if (selected.length >= coreSize) break;
    if (!selectedKeys.has(fact.key)) {
      selected.push(fact);
      selectedKeys.add(fact.key);
    }
  }

  // Show every selected fact once before the two to four reinforcements.
  const order = shuffle(selected, random);
  const repeatCandidates = shuffle([...selected], random).sort((a, b) => {
    const isDue = (fact: LearningFact) => {
      const progress = profile.facts[fact.key];
      return progress && progress.stage < 5 && progress.dueOn <= day ? 1 : 0;
    };
    return isDue(b) - isDue(a) || attempts(a) - attempts(b);
  });
  while (order.length < SESSION_LENGTH) {
    const repeated = new Set(order.slice(coreSize).map((fact) => fact.key));
    const next = repeatCandidates.find((fact) => fact.key !== order.at(-1)?.key && !repeated.has(fact.key))
      ?? repeatCandidates.find((fact) => fact.key !== order.at(-1)?.key)
      ?? repeatCandidates[0];
    order.push(next);
  }
  return order;
}

export function insertDelayedRetry(
  queue: LearningFact[], index: number, fact: LearningFact, alternatives: LearningFact[],
): void {
  const fillers = alternatives.filter((candidate) => candidate.key !== fact.key);
  for (let position = queue.length - 1; position > index; position -= 1) {
    if (queue[position].key === fact.key) queue.splice(position, 1);
  }
  let others = queue.slice(index + 1).filter((candidate) => candidate.key !== fact.key).length;
  while (others < 2) {
    const alternative = fillers[(index + others) % fillers.length];
    if (!alternative) throw new Error('El repaso necesita al menos otra operación.');
    queue.push(alternative);
    others += 1;
  }
  queue.push(fact);
}

export function recordExtraPractice(previous: FactProgress): FactProgress {
  return { ...previous, attempts: previous.attempts + 1, correct: previous.correct + 1 };
}

export function updateFactProgress(
  previous: FactProgress | undefined, success: boolean, day: string,
): FactProgress {
  const stage = previous?.stage ?? 0;
  return {
    stage: success ? Math.min(5, stage + 1) : Math.min(stage, 4),
    dueOn: success ? (stage >= 4 ? '' : addDays(day, REVIEW_INTERVALS[stage])) : addDays(day, 1),
    attempts: (previous?.attempts ?? 0) + 1,
    correct: (previous?.correct ?? 0) + Number(success),
  };
}

export function markNeedsReview(previous: FactProgress, day: string): FactProgress {
  return { ...previous, stage: Math.min(previous.stage, 4), dueOn: addDays(day, 1) };
}

export function learningStats(profile: LearningProfile, day = localDay()): {
  total: number; introduced: number; inProgress: number; mastered: number; due: number; nextDue: string | null;
} {
  const all = factsForTables(profile.tables);
  const progress = all.map((fact) => profile.facts[fact.key]).filter((fact): fact is FactProgress => Boolean(fact));
  const dates = progress.filter((fact) => fact.stage < 5 && fact.dueOn > day).map((fact) => fact.dueOn);
  return {
    total: all.length,
    introduced: progress.length,
    inProgress: progress.filter((fact) => fact.stage > 0 && fact.stage < 5).length,
    mastered: progress.filter((fact) => fact.stage === 5).length,
    due: progress.filter((fact) => fact.stage < 5 && fact.dueOn <= day).length,
    nextDue: dates.length ? dates.sort()[0] : null,
  };
}

export function learningHint(fact: LearningFact): string {
  const { table, multiplier } = fact;
  return `${multiplier} ${multiplier === 1 ? 'grupo' : 'grupos'} de ${table}: ${Array(multiplier).fill(table).join(' + ')} = ${fact.answer}.`;
}
