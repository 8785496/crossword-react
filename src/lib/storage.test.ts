import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPersistedState,
  loadGeneratorSettings,
  loadSavedState,
  persistGeneratorSettings,
  persistState,
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
