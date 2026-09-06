import { describe, expect, it } from 'vitest';

import type { PlacedWord, Puzzle } from '../types';
import {
  cellKey,
  compareByNumber,
  displayClue,
  normalizeAnswer,
  parsePuzzle,
  PuzzleError,
  validatePuzzle,
} from './puzzle';

const baseWord = {
  answer: 'КОТ',
  clue: 'Пушистый питомец',
  row: 1,
  col: 1,
  direction: 'across',
} as const;

const basePuzzle: Puzzle = {
  version: '1.0',
  meta: { title: 'Тестовый кроссворд', author: 'Аноним', language: 'ru' },
  grid: { width: 5, height: 5 },
  words: [{ ...baseWord }],
};

/** КОТ across at (1,1) crossing ТОК down at (1,3) — a minimal valid layout. */
function crossingPuzzle(): Puzzle {
  return {
    ...basePuzzle,
    words: [
      { ...baseWord },
      { answer: 'ТОК', clue: 'Путь движения тока', row: 1, col: 3, direction: 'down' },
    ],
  };
}

function issuesOf(data: unknown): string[] {
  try {
    validatePuzzle(data);
  } catch (e) {
    expect(e).toBeInstanceOf(PuzzleError);
    return (e as PuzzleError).issues;
  }
  throw new Error('expected validatePuzzle to throw, but the puzzle passed');
}

describe('normalizeAnswer', () => {
  it('uppercases and strips non-letters', () => {
    expect(normalizeAnswer('кот')).toBe('КОТ');
    expect(normalizeAnswer('К0-Т юг!')).toBe('КТЮГ');
    expect(normalizeAnswer('Cat-dog 12')).toBe('CATDOG');
  });

  it('maps Ё and ё to Е', () => {
    expect(normalizeAnswer('Ёлка ёлка')).toBe('ЕЛКАЕЛКА');
  });

  it('returns an empty string when there are no letters', () => {
    expect(normalizeAnswer('123 -- ??')).toBe('');
  });
});

describe('parsePuzzle', () => {
  it('reports broken JSON as a PuzzleError', () => {
    expect(() => parsePuzzle('{not json')).toThrow(PuzzleError);
    try {
      parsePuzzle('{not json');
    } catch (e) {
      expect((e as PuzzleError).issues[0]).toContain('JSON');
    }
  });

  it('parses a valid file', () => {
    const vp = parsePuzzle(JSON.stringify(basePuzzle));
    expect(vp.words).toHaveLength(1);
    expect(vp.words[0].answer).toBe('КОТ');
  });
});

describe('validatePuzzle: valid layouts', () => {
  it('builds cells and word info for a crossing', () => {
    const vp = validatePuzzle(crossingPuzzle());
    expect(vp.width).toBe(5);
    expect(vp.height).toBe(5);
    expect(vp.words.map((w) => w.answer)).toEqual(['КОТ', 'ТОК']);

    // Coordinates become 0-based.
    expect(vp.words[0]).toMatchObject({ row: 0, col: 0, direction: 'across' });
    expect(vp.words[1]).toMatchObject({ row: 0, col: 2, direction: 'down' });

    expect(vp.cells.get(cellKey(0, 0))).toMatchObject({ solution: 'К', acrossId: 'w0' });

    const cross = vp.cells.get(cellKey(0, 2));
    expect(cross).toMatchObject({ solution: 'Т', acrossId: 'w0', downId: 'w1' });
    expect(cross?.wordIds).toEqual(['w0', 'w1']);
  });

  it('numbers words in reading order', () => {
    const vp = validatePuzzle(crossingPuzzle());
    expect(vp.words.find((w) => w.answer === 'КОТ')?.number).toBe(1);
    expect(vp.words.find((w) => w.answer === 'ТОК')?.number).toBe(2);
  });

  it('gives both words the same number when they start in one cell', () => {
    const vp = validatePuzzle({
      ...basePuzzle,
      grid: { width: 6, height: 6 },
      words: [
        { ...baseWord },
        { answer: 'КОТ', clue: 'Второй кот', row: 1, col: 1, direction: 'down' },
        { answer: 'СОК', clue: 'Напиток', row: 4, col: 4, direction: 'across' },
      ],
    });
    expect(vp.words.map((w) => w.number)).toEqual([1, 1, 2]);
  });

  it('keeps only string meta fields', () => {
    const vp = validatePuzzle({
      ...basePuzzle,
      meta: { title: 'Заголовок', language: 'ru', author: 42 },
    });
    expect(vp.meta).toEqual({ title: 'Заголовок', language: 'ru' });
  });

  it('returns empty meta when absent', () => {
    expect(validatePuzzle({ ...basePuzzle, meta: undefined }).meta).toEqual({});
  });

  it('ignores ids from the file and assigns w0, w1, …', () => {
    const vp = validatePuzzle(crossingPuzzle());
    expect(vp.words.map((w) => w.id)).toEqual(['w0', 'w1']);
  });

  it('rounds fractional row/col to whole cells', () => {
    const vp = validatePuzzle({
      ...basePuzzle,
      words: [{ ...baseWord, row: 1.4, col: 1.6 }],
    });
    expect(vp.words[0]).toMatchObject({ row: 0, col: 1 });
  });
});

describe('validatePuzzle: rejections', () => {
  it('rejects a non-object root', () => {
    expect(issuesOf(null)[0]).toContain('Корень');
    expect(issuesOf([basePuzzle])[0]).toContain('Корень');
    expect(issuesOf('строка')[0]).toContain('Корень');
  });

  it('rejects grid sizes outside 2–40 × 2–60', () => {
    expect(
      issuesOf({ ...basePuzzle, grid: { width: 1, height: 5 } }).some((i) => i.includes('grid.width')),
    ).toBe(true);
    expect(
      issuesOf({ ...basePuzzle, grid: { width: 41, height: 5 } }).some((i) => i.includes('grid.width')),
    ).toBe(true);
    expect(
      issuesOf({ ...basePuzzle, grid: { width: 5, height: 1 } }).some((i) => i.includes('grid.height')),
    ).toBe(true);
    expect(
      issuesOf({ ...basePuzzle, grid: { width: 5, height: 61 } }).some((i) => i.includes('grid.height')),
    ).toBe(true);
  });

  it('requires a non-empty words array', () => {
    expect(issuesOf({ grid: { width: 5, height: 5 } })[0]).toContain('words');
    expect(issuesOf({ ...basePuzzle, words: [] })[0]).toContain('words');
  });

  it('rejects answers shorter than two letters', () => {
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, answer: 'Ю' }] }).some((i) =>
        i.includes('минимум 2 буквы'),
      ),
    ).toBe(true);
    // Digits are stripped, so a digits-only answer is effectively empty.
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, answer: '123' }] }).some((i) =>
        i.includes('минимум 2 буквы'),
      ),
    ).toBe(true);
  });

  it('requires a clue', () => {
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, clue: '   ' }] })[0],
    ).toContain('clue');
  });

  it('rejects unknown directions', () => {
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, direction: 'diagonal' }] }).some((i) =>
        i.includes('direction'),
      ),
    ).toBe(true);
  });

  it('rejects rows and columns below 1', () => {
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, row: 0 }] }).some((i) => i.includes('row')),
    ).toBe(true);
    expect(
      issuesOf({ ...basePuzzle, words: [{ ...baseWord, col: 0 }] }).some((i) => i.includes('col')),
    ).toBe(true);
  });

  it('rejects words that do not fit the grid', () => {
    const across = issuesOf({
      ...basePuzzle,
      words: [{ ...baseWord, col: 4 }],
    });
    expect(across.some((i) => i.includes('не помещается'))).toBe(true);

    const down = issuesOf({
      ...basePuzzle,
      words: [{ ...baseWord, direction: 'down', row: 4 }],
    });
    expect(down.some((i) => i.includes('не помещается'))).toBe(true);
  });

  it('rejects duplicate starts with the same direction', () => {
    const issues = issuesOf({
      ...basePuzzle,
      words: [{ ...baseWord }, { ...baseWord, clue: 'Дубль' }],
    });
    expect(issues[0]).toContain('Два слова начинаются');
  });

  it('rejects mismatched crossing letters', () => {
    const issues = issuesOf({
      ...basePuzzle,
      words: [
        { ...baseWord },
        { answer: 'СОК', clue: 'Напиток', row: 1, col: 1, direction: 'down' },
      ],
    });
    expect(issues[0]).toContain('Конфликт букв');
  });

  it('rejects parallel words that touch', () => {
    const issues = issuesOf({
      ...basePuzzle,
      grid: { width: 5, height: 6 },
      words: [
        { ...baseWord },
        { answer: 'ДОМ', clue: 'Здание', row: 2, col: 1, direction: 'across' },
      ],
    });
    expect(issues.some((i) => i.includes('соприкосновение по вертикали'))).toBe(true);
  });

  it('rejects same-direction words merging into one line', () => {
    const issues = issuesOf({
      ...basePuzzle,
      words: [
        { ...baseWord },
        { answer: 'ОТ', clue: 'Предлог', row: 1, col: 2, direction: 'across' },
      ],
    });
    expect(issues.some((i) => i.includes('слилась'))).toBe(true);
  });
});

describe('displayClue', () => {
  it('capitalizes the first letter', () => {
    expect(displayClue('пушистый питомец')).toBe('Пушистый питомец');
    expect(displayClue('a domestic animal')).toBe('A domestic animal');
  });

  it('keeps an already capitalized clue unchanged', () => {
    expect(displayClue('Пушистый питомец')).toBe('Пушистый питомец');
  });

  it('leaves non-letter starts and empty strings intact', () => {
    expect(displayClue('«кот» — кто это?')).toBe('«кот» — кто это?');
    expect(displayClue('3 героя былины')).toBe('3 героя былины');
    expect(displayClue('')).toBe('');
  });
});

describe('compareByNumber', () => {
  it('sorts words by their number', () => {
    const words = [{ number: 2 }, { number: 1 }, { number: 3 }] as PlacedWord[];
    expect([...words].sort(compareByNumber).map((w) => w.number)).toEqual([1, 2, 3]);
  });
});
