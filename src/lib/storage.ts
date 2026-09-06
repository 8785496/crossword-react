const STATE_KEY = 'crossword.state.v1';

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
