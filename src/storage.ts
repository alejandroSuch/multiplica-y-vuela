import { DIFFICULTIES, TABLES, topTen, type Difficulty, type GameSummary } from './game';

export const STORAGE_KEY = 'multiplica-y-vuela:v1';

export interface SavedData {
  version: 1;
  playerName: string;
  selectedTables: number[];
  difficulty: Difficulty;
  muted: boolean;
  recentGames: GameSummary[];
  highScores: GameSummary[];
}

export function defaultData(): SavedData {
  return {
    version: 1,
    playerName: '',
    selectedTables: [...TABLES],
    difficulty: 'easy',
    muted: false,
    recentGames: [],
    highScores: [],
  };
}

function isGameSummary(value: unknown): value is GameSummary {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<GameSummary>;
  return typeof game.id === 'string'
    && typeof game.playerName === 'string'
    && typeof game.score === 'number'
    && Number.isFinite(game.score)
    && typeof game.correct === 'number'
    && typeof game.mistakes === 'number'
    && typeof game.completedAt === 'string'
    && Array.isArray(game.tables)
    && game.tables.every((table) => TABLES.includes(table as typeof TABLES[number]))
    && typeof game.difficulty === 'string'
    && game.difficulty in DIFFICULTIES;
}

export function parseData(raw: string | null): SavedData {
  if (!raw) return defaultData();
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1) return defaultData();
    const value = data as Partial<SavedData>;
    const selectedTables = Array.isArray(value.selectedTables)
      ? [...new Set(value.selectedTables.filter((table): table is number =>
          typeof table === 'number' && TABLES.includes(table as typeof TABLES[number]),
        ))].sort((a, b) => a - b)
      : [...TABLES];
    return {
      version: 1,
      playerName: typeof value.playerName === 'string' ? value.playerName.trim().slice(0, 20) : '',
      selectedTables,
      difficulty: typeof value.difficulty === 'string' && value.difficulty in DIFFICULTIES
        ? value.difficulty as Difficulty : 'easy',
      muted: value.muted === true,
      recentGames: Array.isArray(value.recentGames) ? value.recentGames.filter(isGameSummary).slice(0, 200) : [],
      highScores: Array.isArray(value.highScores) ? topTen(value.highScores.filter(isGameSummary)) : [],
    };
  } catch {
    return defaultData();
  }
}

export function loadData(storage: Pick<Storage, 'getItem'> = localStorage): SavedData {
  try {
    return parseData(storage.getItem(STORAGE_KEY));
  } catch {
    return defaultData();
  }
}

export function saveData(data: SavedData, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function recordGame(data: SavedData, game: GameSummary): SavedData {
  return {
    ...data,
    recentGames: [game, ...data.recentGames].slice(0, 200),
    highScores: topTen([...data.highScores, game]),
  };
}
