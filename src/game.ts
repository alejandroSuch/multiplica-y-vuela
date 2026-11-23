export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  table: number;
  multiplier: number;
  answer: number;
  options: [number, number, number];
  key: string;
}

export interface GameSummary {
  id: string;
  playerName: string;
  score: number;
  correct: number;
  mistakes: number;
  difficulty: Difficulty;
  tables: number[];
  completedAt: string;
}

export const TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const MAX_LIVES = 5;
export const DIFFICULTIES: Record<Difficulty, { label: string; seconds: number; multiplier: number; emoji: string }> = {
  easy: { label: 'Fácil', seconds: 13, multiplier: 1, emoji: '☁️' },
  medium: { label: 'Medio', seconds: 10, multiplier: 2, emoji: '🌤️' },
  hard: { label: 'Difícil', seconds: 8, multiplier: 3, emoji: '⚡' },
};

const PRODUCT_POOL = Array.from(new Set(TABLES.flatMap((table) =>
  Array.from({ length: 10 }, (_, index) => table * (index + 1)),
)));

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function makeQuestion(table: number, multiplier: number, random: () => number): Question {
  const answer = table * multiplier;
  // Nearby real multiplication products make the wrong answers plausible.
  const nearby = PRODUCT_POOL.filter((value) => value !== answer && Math.abs(value - answer) <= 15);
  const candidates = nearby.length >= 2 ? nearby : PRODUCT_POOL.filter((value) => value !== answer);
  const choices = [...candidates];
  const distractors: number[] = [];
  while (distractors.length < 2) {
    const index = Math.floor(random() * choices.length);
    distractors.push(choices.splice(index, 1)[0]);
  }

  return {
    table,
    multiplier,
    answer,
    options: shuffle([answer, distractors[0], distractors[1]], random) as Question['options'],
    key: `${table}x${multiplier}`,
  };
}

export function createQuestion(
  selectedTables: number[],
  previousKey: string | null = null,
  random: () => number = Math.random,
): Question {
  const tables = selectedTables.filter((table) => TABLES.includes(table as typeof TABLES[number]));
  if (tables.length === 0) throw new Error('Selecciona al menos una tabla.');

  const pairs = tables.flatMap((table) =>
    Array.from({ length: 10 }, (_, index) => ({ table, multiplier: index + 1 })),
  ).filter(({ table, multiplier }) => `${table}x${multiplier}` !== previousKey);
  const { table, multiplier } = pick(pairs, random);
  return makeQuestion(table, multiplier, random);
}

export class QuestionDeck {
  private readonly tables: number[];
  private readonly random: () => number;
  private tableCounts = new Map<number, number>();
  private multiplierCounts = new Map<number, Map<number, number>>();
  private lastTable: number | null = null;
  private recentKeys: string[] = [];

  constructor(selectedTables: number[], random: () => number = Math.random) {
    this.tables = [...new Set(selectedTables.filter((table) => TABLES.includes(table as typeof TABLES[number])))];
    if (!this.tables.length) throw new Error('Selecciona al menos una tabla.');
    this.random = random;
    this.tables.forEach((table) => {
      this.tableCounts.set(table, 0);
      this.multiplierCounts.set(table, new Map(Array.from({ length: 10 }, (_, index) => [index + 1, 0])));
    });
  }

  next(): Question {
    // A one-count cushion permits repeats before every table has appeared.
    // Lower counts have much higher weight, while immediate repeats are avoided.
    const minTableCount = Math.min(...this.tableCounts.values());
    const balancedTables = this.tables.filter((table) => this.tableCounts.get(table)! <= minTableCount + 1);
    const nonRepeatedTables = balancedTables.filter((table) => table !== this.lastTable);
    const table = this.weightedPick(
      nonRepeatedTables.length ? nonRepeatedTables : balancedTables,
      (candidate) => 1 / (1 + this.tableCounts.get(candidate)! - minTableCount) ** 3,
    );
    this.tableCounts.set(table, this.tableCounts.get(table)! + 1);
    this.lastTable = table;

    const counts = this.multiplierCounts.get(table)!;
    const minMultiplierCount = Math.min(...counts.values());
    const balancedMultipliers = [...counts.keys()].filter((multiplier) => counts.get(multiplier)! <= minMultiplierCount + 1);
    const freshMultipliers = balancedMultipliers.filter((multiplier) =>
      !this.recentKeys.includes(`${table}x${multiplier}`),
    );
    const multiplier = this.weightedPick(
      freshMultipliers.length ? freshMultipliers : balancedMultipliers,
      (candidate) => 1 / (1 + counts.get(candidate)! - minMultiplierCount) ** 3,
    );
    counts.set(multiplier, counts.get(multiplier)! + 1);
    this.recentKeys.unshift(`${table}x${multiplier}`);
    this.recentKeys.length = Math.min(this.recentKeys.length, 8);
    return makeQuestion(table, multiplier, this.random);
  }

  private weightedPick<T>(items: T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let choice = this.random() * total;
    for (const item of items) {
      choice -= weight(item);
      if (choice < 0) return item;
    }
    return items.at(-1)!;
  }
}

export function speedTier(correct: number): number {
  return Math.floor(Math.max(0, correct) / 10);
}

export function roundSeconds(difficulty: Difficulty, correct: number): number {
  return Math.max(4, DIFFICULTIES[difficulty].seconds / (1.1 ** speedTier(correct)));
}

export function pointsForCorrect(difficulty: Difficulty, correctBefore: number): number {
  return 10 * DIFFICULTIES[difficulty].multiplier + 5 * speedTier(correctBefore);
}

export function topTen(games: GameSummary[]): GameSummary[] {
  return [...games].sort((a, b) =>
    b.score - a.score || b.correct - a.correct || a.completedAt.localeCompare(b.completedAt),
  ).slice(0, 10);
}
