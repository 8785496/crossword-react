export interface Theme {
  id: string;
  name: string;
  /** Three colors for the settings preview: background, cell, accent. */
  swatch: [string, string, string];
}

export const THEMES: Theme[] = [
  { id: 'light', name: 'Светлая', swatch: ['#f1f3f7', '#ffffff', '#4f46e5'] },
  { id: 'dark', name: 'Тёмная', swatch: ['#0e1320', '#1f2940', '#818cf8'] },
  { id: 'paper', name: 'Бумага', swatch: ['#efe4cf', '#faf3e0', '#b45309'] },
  { id: 'ocean', name: 'Океан', swatch: ['#d9ecfa', '#f2f9ff', '#0369a1'] },
  { id: 'contrast', name: 'Контраст', swatch: ['#000000', '#ffffff', '#ffd400'] },
  { id: 'rose', name: 'Роза', swatch: ['#fbe9f1', '#fff7fb', '#db2777'] },
];

const THEME_KEY = 'crossword.theme';

/** Used when the user has not picked a theme yet. */
export const DEFAULT_THEME = 'paper';

export function loadTheme(): string {
  try {
    const id = localStorage.getItem(THEME_KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    /* localStorage is unavailable */
  }
  return DEFAULT_THEME;
}

export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}
