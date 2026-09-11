import { MAX_GRID_H, MAX_GRID_W } from './generator';

const STATE_KEY = 'crossword.state.v1';
const GENERATOR_KEY = 'crossword.generator.v1';

export interface SavedState {
  /** Исходный текст JSON-файла кроссворда. */
  raw: string;
  /** Введённые буквы по ключам клеток «row:col». */
  entries: Record<string, string>;
}

export function loadSavedState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (typeof parsed.raw !== 'string' || typeof parsed.entries !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistState(state: SavedState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

/** Manual grid-generation overrides; null means «pick automatically». */
export interface GeneratorSettings {
  /** Максимальная ширина сетки в клетках. */
  maxW: number | null;
  /** Максимальная высота сетки в клетках. */
  maxH: number | null;
  /** Попыток на раскладку (больше — плотнее сетка, но дольше генерация). */
  attempts: number | null;
}

/** Allowed ranges for the manual generator fields (enforced by the settings UI). */
export const GENERATOR_LIMITS = {
  maxW: { min: 5, max: MAX_GRID_W },
  maxH: { min: 5, max: MAX_GRID_H },
  attempts: { min: 1, max: 100000 },
} as const;

export function loadGeneratorSettings(): GeneratorSettings {
  // Out-of-range stored values fall back to automatic instead of clamping,
  // so a corrupt record can never pin a broken grid size.
  const manual = (v: unknown, { min, max }: { min: number; max: number }): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const n = Math.round(v);
    return n >= min && n <= max ? n : null;
  };
  try {
    const raw = localStorage.getItem(GENERATOR_KEY);
    if (!raw) return { maxW: null, maxH: null, attempts: null };
    const parsed = JSON.parse(raw) as Partial<GeneratorSettings>;
    return {
      maxW: manual(parsed.maxW, GENERATOR_LIMITS.maxW),
      maxH: manual(parsed.maxH, GENERATOR_LIMITS.maxH),
      attempts: manual(parsed.attempts, GENERATOR_LIMITS.attempts),
    };
  } catch {
    return { maxW: null, maxH: null, attempts: null };
  }
}

export function persistGeneratorSettings(settings: GeneratorSettings): void {
  try {
    localStorage.setItem(GENERATOR_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
