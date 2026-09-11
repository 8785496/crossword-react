import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearHistory,
  clearPersistedState,
  HISTORY_LIMIT,
  loadGeneratorSettings,
  loadHistory,
  loadSavedState,
  persistGeneratorSettings,
  persistHistory,
  persistState,
  pushHistoryEntry,
  type HistoryEntry,
} from './storage';

/** Minimal localStorage stand-in for the Node test environment. */
class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saved state', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSavedState()).toBeNull();
  });

  it('round-trips the raw file and entered letters', () => {
    const state = { raw: '{"grid":{"width":5,"height":5}}', entries: { '0:0': 'К' } };
    persistState(state);
    expect(loadSavedState()).toEqual(state);
  });

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('crossword.state.v1', '{broken');
    expect(loadSavedState()).toBeNull();
  });

  it('returns null when the stored shape is wrong', () => {
    localStorage.setItem('crossword.state.v1', JSON.stringify({ entries: {} }));
    expect(loadSavedState()).toBeNull();
    localStorage.setItem('crossword.state.v1', JSON.stringify({ raw: 42, entries: {} }));
    expect(loadSavedState()).toBeNull();
  });

  it('clears the stored state', () => {
    persistState({ raw: 'x', entries: {} });
    clearPersistedState();
    expect(loadSavedState()).toBeNull();
  });

  it('swallows storage failures (quota, missing backend)', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => persistState({ raw: 'x', entries: {} })).not.toThrow();
    expect(() => clearPersistedState()).not.toThrow();
  });
});

describe('crossword history', () => {
  const entry = (raw: string, savedAt = 1000): HistoryEntry => ({
    raw,
    title: `title-${raw}`,
    entries: { '0:0': 'К' },
    savedAt,
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('round-trips saved entries', () => {
    const list = [entry('a'), entry('b')];
    persistHistory(list);
    expect(loadHistory()).toEqual(list);
  });

  it('returns an empty list for corrupted JSON', () => {
    localStorage.setItem('crossword.history.v1', '{broken');
    expect(loadHistory()).toEqual([]);
  });

  it('drops malformed records and non-string entry letters', () => {
    localStorage.setItem(
      'crossword.history.v1',
      JSON.stringify([
        42,
        { raw: '', title: 'x', entries: {} },
        { raw: 'ok', entries: { '0:0': 'К', '1:1': 7 }, savedAt: 'nope' },
      ]),
    );
    expect(loadHistory()).toEqual([
      { raw: 'ok', title: '', entries: { '0:0': 'К' }, savedAt: 0 },
    ]);
  });

  it('caps the stored list length', () => {
    persistHistory(Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => entry(`r${i}`)));
    expect(loadHistory()).toHaveLength(HISTORY_LIMIT);
  });

  it('pushes to the front and dedupes by raw', () => {
    let list = pushHistoryEntry([], entry('a'));
    list = pushHistoryEntry(list, entry('b'));
    expect(list.map((e) => e.raw)).toEqual(['b', 'a']);
    const again = pushHistoryEntry(list, entry('a', 2000));
    expect(again.map((e) => e.raw)).toEqual(['a', 'b']);
    expect(again).toHaveLength(2);
    expect(again[0].savedAt).toBe(2000);
  });

  it('caps pushed history to HISTORY_LIMIT', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) list = pushHistoryEntry(list, entry(`r${i}`));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].raw).toBe(`r${HISTORY_LIMIT + 2}`);
  });

  it('clears the stored history', () => {
    persistHistory([entry('a')]);
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it('swallows storage failures (quota, missing backend)', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => persistHistory([entry('a')])).not.toThrow();
    expect(() => clearHistory()).not.toThrow();
  });
});

describe('generator settings', () => {
  it('returns automatic defaults when nothing is stored', () => {
    expect(loadGeneratorSettings()).toEqual({ maxW: null, maxH: null, attempts: null });
  });

  it('round-trips manual overrides', () => {
    const settings = { maxW: 12, maxH: 24, attempts: 500 };
    persistGeneratorSettings(settings);
    expect(loadGeneratorSettings()).toEqual(settings);
  });

  it('falls back to automatic for out-of-range values', () => {
    localStorage.setItem(
      'crossword.generator.v1',
      JSON.stringify({ maxW: 999, maxH: -3, attempts: 0 }),
    );
    expect(loadGeneratorSettings()).toEqual({ maxW: null, maxH: null, attempts: null });
  });

  it('falls back to automatic for corrupted JSON', () => {
    localStorage.setItem('crossword.generator.v1', '{broken');
    expect(loadGeneratorSettings()).toEqual({ maxW: null, maxH: null, attempts: null });
  });

  it('swallows storage failures (quota, missing backend)', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => persistGeneratorSettings({ maxW: 10, maxH: null, attempts: null })).not.toThrow();
  });
});
