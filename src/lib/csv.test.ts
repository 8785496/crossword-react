import { describe, expect, it } from 'vitest';

import { parseCsvWords, readFileText } from './csv';
import { PuzzleError } from './puzzle';

function issuesOf(text: string): string[] {
  try {
    parseCsvWords(text);
  } catch (e) {
    expect(e).toBeInstanceOf(PuzzleError);
    return (e as PuzzleError).issues;
  }
  throw new Error('expected parseCsvWords to throw, but the file parsed');
}

/** Windows-1251 bytes for Cyrillic text (test-only encoder). */
function toCp1251(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) bytes.push(code);
    else if (ch === 'Ё') bytes.push(0xa8);
    else if (ch === 'ё') bytes.push(0xb8);
    else if (code >= 0x410 && code <= 0x44f) bytes.push(code - 0x410 + 0xc0);
    else bytes.push(0x3f);
  }
  return Uint8Array.from(bytes);
}

describe('parseCsvWords: happy paths', () => {
  it('parses a semicolon file and skips the header row', () => {
    const words = parseCsvWords(
      ['Слово;Вопрос', 'КОШКА;домашнее животное', 'СОБАКА;друг человека'].join('\n'),
    );
    expect(words).toEqual([
      { answer: 'КОШКА', clue: 'домашнее животное', line: 2 },
      { answer: 'СОБАКА', clue: 'друг человека', line: 3 },
    ]);
  });

  it('normalizes answers: uppercase, Ё→Е, spaces and hyphens dropped', () => {
    const words = parseCsvWords('ёлка;дерево\nнью йорк;город');
    expect(words.map((w) => w.answer)).toEqual(['ЕЛКА', 'НЬЮЙОРК']);
  });

  it('parses comma-delimited quoted fields with commas and "" escapes', () => {
    const words = parseCsvWords(
      ['word,question', '"COURTHOUSE","The place, with a ""judge"""'].join('\n'),
    );
    expect(words[0].answer).toBe('COURTHOUSE');
    expect(words[0].clue).toBe('The place, with a "judge"');
  });

  it('parses tab-separated files', () => {
    const words = parseCsvWords('слово\tвопрос\nКИНО\tфильм');
    expect(words).toHaveLength(1);
    expect(words[0].answer).toBe('КИНО');
  });

  it('handles CRLF row ends', () => {
    const words = parseCsvWords('КИНО;фильм\r\nСОК;напиток\r\n');
    expect(words.map((w) => w.clue)).toEqual(['фильм', 'напиток']);
  });

  it('keeps newlines inside quoted fields and counts lines correctly', () => {
    const words = parseCsvWords('СЛОВО;"строка1\nстрока2"\nКИНО;фильм');
    expect(words[0].clue).toBe('строка1\nстрока2');
    expect(words[1].line).toBe(3);
  });

  it('glues a bare delimiter inside the question back', () => {
    const words = parseCsvWords('КОШКА,домашнее животное, с усами\nСОБАКА,друг человека');
    expect(words[0].clue).toBe('домашнее животное, с усами');
    expect(words[1].clue).toBe('друг человека');
  });

  it('skips header variants, including a «№» word cell', () => {
    expect(parseCsvWords('слово;определение\nКИНО;фильм')).toHaveLength(1);
    expect(parseCsvWords('Word,Question\nCAT,pet')).toHaveLength(1);
    expect(parseCsvWords('№;Слово;Вопрос\nКИНО;фильм')).toHaveLength(1);
  });

  it('keeps a data row whose word merely looks like a header name', () => {
    const words = parseCsvWords('ГРОМ;вопрос');
    expect(words).toEqual([{ answer: 'ГРОМ', clue: 'вопрос', line: 1 }]);
  });

  it('skips blank lines but keeps real line numbers', () => {
    const words = parseCsvWords('КИНО;фильм\n\n\nСОК;напиток');
    expect(words[1].line).toBe(4);
  });

  it('strips the UTF-8 BOM', () => {
    const words = parseCsvWords('\uFEFFКИНО;фильм');
    expect(words[0].answer).toBe('КИНО');
  });
});

describe('parseCsvWords: rejections', () => {
  it('rejects an empty or whitespace-only file', () => {
    expect(issuesOf('')[0]).toContain('Файл пустой');
    expect(issuesOf('   \n  ')[0]).toContain('Файл пустой');
  });

  it('rejects a single-column file', () => {
    const issues = issuesOf('СЛОВО\nДРУГОЕ');
    expect(issues.some((i) => i.includes('нет вопроса'))).toBe(true);
  });

  it('reports a short word with its line number', () => {
    const issues = issuesOf('КИНО;фильм\nA;буква');
    expect(issues[0]).toContain('Строка 2');
    expect(issues[0]).toContain('минимум из 2 букв');
  });

  it('rejects a word longer than 60 letters', () => {
    const issues = issuesOf(`${'А'.repeat(61)};длинное`);
    expect(issues[0]).toContain('длиннее 60 букв');
  });

  it('rejects a row without a question', () => {
    const issues = issuesOf('КИНО;фильм\nСОСИСКА;');
    expect(issues[0]).toContain('Строка 2');
    expect(issues[0]).toContain('нет вопроса');
  });

  it('rejects a row with an empty word cell', () => {
    const issues = issuesOf('КИНО;фильм\n;пусто');
    expect(issues[0]).toContain('Строка 2: пустая ячейка');
  });

  it('rejects duplicates case-insensitively and cites the first line', () => {
    const issues = issuesOf('КИНО;фильм\nкино;сеанс');
    expect(issues[0]).toContain('уже было в строке 1');
  });

  it('rejects more than 60 words', () => {
    // Answers keep only letters, so build distinct two-letter words.
    const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЫЭЮЯ';
    const rows = ['слово;вопрос'];
    for (let i = 0; i < 61; i++) {
      rows.push(`${LETTERS[i % 24]}${LETTERS[Math.floor(i / 24)]};вопрос${i}`);
    }
    expect(issuesOf(rows.join('\n')).some((i) => i.includes('максимум 60'))).toBe(true);
  });

  it('truncates long issue lists at 30 with a «…и ещё» line', () => {
    const rows = ['слово;вопрос'];
    for (let i = 0; i < 35; i++) rows.push('A;буква');
    const issues = issuesOf(rows.join('\n'));
    expect(issues).toHaveLength(31);
    expect(issues[30]).toContain('ещё 5');
  });
});

describe('readFileText', () => {
  it('decodes plain UTF-8', async () => {
    const file = new File(['КОШКА;зверь'], 'a.csv');
    expect(await readFileText(file)).toBe('КОШКА;зверь');
  });

  it('decodes UTF-8 with a BOM', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ЛИСА;зверь')]);
    const words = parseCsvWords(await readFileText(new File([bytes], 'a.csv')));
    expect(words[0].answer).toBe('ЛИСА');
  });

  it('falls back to Windows-1251 for Excel Cyrillic files', async () => {
    const file = new File([toCp1251('КОШКА;зверь\r\nЁЖИК;колючий')], 'a.csv');
    const words = parseCsvWords(await readFileText(file));
    expect(words.map((w) => w.answer)).toEqual(['КОШКА', 'ЕЖИК']);
  });
});
