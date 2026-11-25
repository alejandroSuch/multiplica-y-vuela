import { DIFFICULTIES, GAME_MODES, TABLES, topTenByMode, type Difficulty, type GameMode, type GameSummary } from './game';

export const STORAGE_KEY = 'multiplica-y-vuela:v2';
export const LEGACY_STORAGE_KEY = 'multiplica-y-vuela:v1';

export interface SavedData {
  version: 2;
  playerName: string;
  selectedTables: number[];
  difficulty: Difficulty;
  selectedMode: GameMode;
  muted: boolean;
  recentGames: GameSummary[];
  highScores: GameSummary[];
}

export function defaultData(): SavedData {
  return {
    version: 2,
    playerName: '',
    selectedTables: [...TABLES],
    difficulty: 'easy',
    selectedMode: 'review',
    muted: false,
    recentGames: [],
    highScores: [],
  };
}

function parseGameSummary(value: unknown, legacy: boolean): GameSummary | null {
  if (!value || typeof value !== 'object') return null;
  const game = value as Partial<GameSummary>;
  const valid = typeof game.id === 'string'
    && typeof game.playerName === 'string'
    && typeof game.score === 'number'
    && Number.isFinite(game.score)
    && typeof game.correct === 'number'
    && typeof game.mistakes === 'number'
    && typeof game.completedAt === 'string'
    && Array.isArray(game.tables)
    && game.tables.every((table) => TABLES.includes(table as typeof TABLES[number]))
    && typeof game.difficulty === 'string'
    && game.difficulty in DIFFICULTIES
    && (legacy || (typeof game.mode === 'string' && game.mode in GAME_MODES));
  return valid ? { ...game, mode: legacy ? 'review' : game.mode } as GameSummary : null;
}

export function parseData(raw: string | null): SavedData {
  if (!raw) return defaultData();
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultData();
    const version = (data as { version?: unknown }).version;
    if (version !== 1 && version !== 2) return defaultData();
    const legacy = version === 1;
    const value = data as Partial<SavedData>;
    const selectedTables = Array.isArray(value.selectedTables)
      ? [...new Set(value.selectedTables.filter((table): table is number =>
          typeof table === 'number' && TABLES.includes(table as typeof TABLES[number]),
        ))].sort((a, b) => a - b)
      : [...TABLES];
    return {
      version: 2,
      playerName: typeof value.playerName === 'string' ? value.playerName.trim().slice(0, 20) : '',
      selectedTables,
      difficulty: typeof value.difficulty === 'string' && value.difficulty in DIFFICULTIES
        ? value.difficulty as Difficulty : 'easy',
      selectedMode: !legacy && typeof value.selectedMode === 'string' && value.selectedMode in GAME_MODES
        ? value.selectedMode : 'review',
      muted: value.muted === true,
      recentGames: Array.isArray(value.recentGames)
        ? value.recentGames.map((game) => parseGameSummary(game, legacy)).filter((game): game is GameSummary => game !== null).slice(0, 200) : [],
      highScores: Array.isArray(value.highScores)
        ? topTenByMode(value.highScores.map((game) => parseGameSummary(game, legacy)).filter((game): game is GameSummary => game !== null)) : [],
    };
  } catch {
    return defaultData();
  }
}

export function loadData(storage: Pick<Storage, 'getItem'> = localStorage): SavedData {
  try {
    return parseData(storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY));
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
    highScores: topTenByMode([...data.highScores, game]),
  };
}
