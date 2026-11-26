import { DIFFICULTIES, GAME_MODES, TABLES, topTenByMode, type Difficulty, type GameMode, type GameSummary } from './game';
import { type FactProgress, type LearningProfile } from './learning';

export const STORAGE_KEY = 'multiplica-y-vuela:v3';
export const PREVIOUS_STORAGE_KEY = 'multiplica-y-vuela:v2';
export const LEGACY_STORAGE_KEY = 'multiplica-y-vuela:v1';

export interface SavedData {
  version: 3;
  playerName: string;
  selectedTables: number[];
  difficulty: Difficulty;
  selectedMode: GameMode;
  muted: boolean;
  profiles: LearningProfile[];
  selectedProfileId: string | null;
  recentGames: GameSummary[];
  highScores: GameSummary[];
}

export function createLearningProfile(name: string, id: string = crypto.randomUUID()): LearningProfile {
  return { id, name: name.trim().replace(/\s+/g, ' ').slice(0, 20), tables: [2], facts: {} };
}

export function defaultData(): SavedData {
  return {
    version: 3,
    playerName: '',
    selectedTables: [...TABLES],
    difficulty: 'easy',
    selectedMode: 'review',
    muted: false,
    profiles: [],
    selectedProfileId: null,
    recentGames: [],
    highScores: [],
  };
}

function validTables(value: unknown, fallback: number[]): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((table): table is number =>
        typeof table === 'number' && TABLES.includes(table as typeof TABLES[number]),
      ))].sort((a, b) => a - b)
    : fallback;
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

function parseFactProgress(value: unknown): FactProgress | null {
  if (!value || typeof value !== 'object') return null;
  const fact = value as Partial<FactProgress>;
  if (!Number.isInteger(fact.stage) || fact.stage! < 0 || fact.stage! > 5
    || typeof fact.dueOn !== 'string' || (fact.stage !== 5 && !/^\d{4}-\d{2}-\d{2}$/.test(fact.dueOn))
    || !Number.isInteger(fact.attempts) || fact.attempts! < 0
    || !Number.isInteger(fact.correct) || fact.correct! < 0) return null;
  return fact as FactProgress;
}

function parseProfile(value: unknown): LearningProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Partial<LearningProfile>;
  if (typeof profile.id !== 'string' || !profile.id || typeof profile.name !== 'string' || !profile.name.trim()) return null;
  const facts: Record<string, FactProgress> = {};
  if (profile.facts && typeof profile.facts === 'object' && !Array.isArray(profile.facts)) {
    for (const [key, entry] of Object.entries(profile.facts)) {
      if (!/^(?:[1-9]|10)x(?:[1-9]|10)$/.test(key)) continue;
      const parsed = parseFactProgress(entry);
      if (parsed) facts[key] = parsed;
    }
  }
  return {
    id: profile.id,
    name: profile.name.trim().replace(/\s+/g, ' ').slice(0, 20),
    tables: validTables(profile.tables, [2]),
    facts,
  };
}

export function parseData(raw: string | null): SavedData {
  if (!raw) return defaultData();
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultData();
    const version = (data as { version?: unknown }).version;
    if (version !== 1 && version !== 2 && version !== 3) return defaultData();
    const legacy = version === 1;
    const value = data as Partial<SavedData>;
    const playerName = typeof value.playerName === 'string' ? value.playerName.trim().slice(0, 20) : '';
    const profiles = version === 3 && Array.isArray(value.profiles)
      ? value.profiles.map(parseProfile).filter((profile): profile is LearningProfile => profile !== null)
      : playerName ? [createLearningProfile(playerName, 'legacy-player')] : [];
    const selectedProfileId = profiles.some((profile) => profile.id === value.selectedProfileId)
      ? value.selectedProfileId! : profiles[0]?.id ?? null;
    return {
      version: 3,
      playerName: profiles.find((profile) => profile.id === selectedProfileId)?.name ?? playerName,
      selectedTables: validTables(value.selectedTables, [...TABLES]),
      difficulty: typeof value.difficulty === 'string' && value.difficulty in DIFFICULTIES
        ? value.difficulty as Difficulty : 'easy',
      selectedMode: !legacy && typeof value.selectedMode === 'string' && value.selectedMode in GAME_MODES
        ? value.selectedMode : 'review',
      muted: value.muted === true,
      profiles,
      selectedProfileId,
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
    return parseData(storage.getItem(STORAGE_KEY)
      ?? storage.getItem(PREVIOUS_STORAGE_KEY)
      ?? storage.getItem(LEGACY_STORAGE_KEY));
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
