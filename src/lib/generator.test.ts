import { describe, expect, it } from 'vitest';

import { generatePuzzle } from './generator';
import type { GeneratorWord, GridProfile } from './generator';
import { PuzzleError, validatePuzzle } from './puzzle';

// Device profiles from App.tsx gridProfile(): phones get a narrow vertical
// grid, larger screens a wide one.
const PHONE: GridProfile = { maxW: 14, maxH: 30, targetRatio: 1.1 };
const TABLET: GridProfile = { maxW: 20, maxH: 30, targetRatio: 0.8 };

const cosmos: GeneratorWord[] = [
  { answer: 'КОСМОНАВТ', clue: 'Человек, совершающий полёты в космос' },
  { answer: 'СКАФАНДР', clue: 'Специальный герметичный костюм' },
  { answer: 'ТЕЛЕСКОП', clue: 'Прибор для наблюдения за звёздами' },
  { answer: 'СПУТНИК', clue: 'Аппарат на орбите вокруг Земли' },
  { answer: 'ПЛАНЕТА', clue: 'Небесное тело вокруг звезды' },
  { answer: 'ОРБИТА', clue: 'Путь вокруг планеты' },
  { answer: 'КОМЕТА', clue: 'Небесное тело с хвостом' },
  { answer: 'ЗВЕЗДА', clue: 'Раскалённый шар газа' },
  { answer: 'РАКЕТА', clue: 'Летательный аппарат с двигателем' },
  { answer: 'ЛУНА', clue: 'Естественный спутник Земли' },
];

function issuesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(PuzzleError);
    return (e as PuzzleError).issues;
  }
  throw new Error('expected generatePuzzle to throw, but it succeeded');
}

describe('generatePuzzle', () => {
  it(
    'places every word and satisfies the JSON contract',
    () => {
      const { puzzle, isolated } = generatePuzzle(cosmos, PHONE, { title: 'Космос' });
      const vp = validatePuzzle(puzzle);
      expect(vp.words).toHaveLength(cosmos.length);
      const answers = new Set(vp.words.map((w) => w.answer));
      for (const w of cosmos) expect(answers.has(w.answer)).toBe(true);
      expect(isolated).toEqual([]);
      expect(puzzle.meta?.title).toBe('Космос');
    },
    20_000,
  );

  it(
    'is deterministic for the same word list',
    () => {
      const a = generatePuzzle(cosmos, PHONE).puzzle;
      const b = generatePuzzle(cosmos, PHONE).puzzle;
      expect(a).toEqual(b);
    },
    20_000,
  );

  it(
    'honors the manual attempts override and still satisfies the contract',
    () => {
      const { puzzle, isolated } = generatePuzzle(cosmos, PHONE, {}, { attempts: 50 });
      const vp = validatePuzzle(puzzle);
      expect(vp.words).toHaveLength(cosmos.length);
      expect(isolated).toEqual([]);
    },
    20_000,
  );

  it(
    'is deterministic for a manual seed (the «обновить» path)',
    () => {
      const a = generatePuzzle(cosmos, PHONE, {}, { seed: 12345 }).puzzle;
      const b = generatePuzzle(cosmos, PHONE, {}, { seed: 12345 }).puzzle;
      expect(a).toEqual(b);
      validatePuzzle(a);
    },
    20_000,
  );

  it(
    'keeps the grid width within the profile cap',
    () => {
      expect(generatePuzzle(cosmos, PHONE).puzzle.grid.width).toBeLessThanOrEqual(PHONE.maxW);
      expect(generatePuzzle(cosmos, TABLET).puzzle.grid.width).toBeLessThanOrEqual(TABLET.maxW);
    },
    20_000,
  );

  it(
    'targets a taller grid with the phone profile than with the tablet one',
    () => {
      const phone = generatePuzzle(cosmos, PHONE).puzzle.grid;
      const tablet = generatePuzzle(cosmos, TABLET).puzzle.grid;
      const phoneRatio = phone.height / phone.width;
      const tabletRatio = tablet.height / tablet.width;
      expect(phoneRatio).toBeGreaterThan(tabletRatio);
      expect(phoneRatio).toBeGreaterThan(1); // phone grids are vertical
      expect(tabletRatio).toBeLessThan(1); // tablet grids are wide
    },
    20_000,
  );

  it(
    'places words with no shared letters standalone and reports them',
    () => {
      const { puzzle, isolated } = generatePuzzle(
        [
          { answer: 'СТОЛ', clue: 'Мебель' },
          { answer: 'МЯЧ', clue: 'Игрушка' },
        ],
        PHONE,
      );
      expect([...isolated].sort()).toEqual(['МЯЧ', 'СТОЛ']);
      expect(validatePuzzle(puzzle).words).toHaveLength(2);
    },
    20_000,
  );

  it(
    'keeps a mix of crossing and standalone words contract-valid',
    () => {
      const { puzzle, isolated } = generatePuzzle(
        [
          { answer: 'СТОЛ', clue: 'Мебель' },
          { answer: 'СТУЛ', clue: 'Мебель со спинкой' },
          { answer: 'МЯЧ', clue: 'Игрушка' },
        ],
        PHONE,
      );
      const vp = validatePuzzle(puzzle);
      expect(vp.words).toHaveLength(3);
      expect(isolated).toContain('МЯЧ'); // shares no letters, so it cannot cross
    },
    20_000,
  );

  it(
    'builds a minimal grid for a single word',
    () => {
      const { puzzle, isolated } = generatePuzzle([{ answer: 'КИНО', clue: 'Фильм' }], PHONE);
      const vp = validatePuzzle(puzzle);
      expect(vp.width).toBeGreaterThanOrEqual(2);
      expect(vp.height).toBeGreaterThanOrEqual(2);
      expect(vp.words.map((w) => w.answer)).toEqual(['КИНО']);
      expect(isolated).toEqual(['КИНО']);
    },
    20_000,
  );

  it(
    'places a word longer than the width cap vertically',
    () => {
      const long = 'А'.repeat(20) + 'Б'.repeat(25);
      const { puzzle } = generatePuzzle(
        [
          { answer: long, clue: 'Длинное слово' },
          { answer: 'КОТ', clue: 'Зверь' },
        ],
        PHONE,
      );
      const vp = validatePuzzle(puzzle);
      const longWord = vp.words.find((w) => w.answer === long);
      expect(longWord?.direction).toBe('down');
      expect(vp.height).toBeGreaterThanOrEqual(45);
      expect(vp.width).toBeLessThanOrEqual(PHONE.maxW);
    },
    20_000,
  );

  it('rejects an empty word list', () => {
    const issues = issuesOf(() => generatePuzzle([], PHONE));
    expect(issues[0]).toContain('пуст');
  });

  it('rejects a word longer than 60 letters', () => {
    const issues = issuesOf(() => generatePuzzle([{ answer: 'А'.repeat(61), clue: 'x' }], PHONE));
    expect(issues[0]).toContain('61');
  });
});
