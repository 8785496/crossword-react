import type { CellInfo, Direction, PlacedWord, Puzzle, ValidatedPuzzle } from '../types';

/** Crossword file parse/validation error with a list of issues. */
export class PuzzleError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join(' '));
    this.name = 'PuzzleError';
    this.issues = issues;
  }
}

export const cellKey = (row: number, col: number): string => `${row}:${col}`;

/** Normalize an answer to canonical form: uppercase, Ё→Е, letters only. */
export function normalizeAnswer(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[^A-ZА-Я]/g, '');
}

export function parsePuzzle(text: string): ValidatedPuzzle {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new PuzzleError([
      `Файл не является корректным JSON: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }
  return validatePuzzle(data);
}

export function validatePuzzle(data: unknown): ValidatedPuzzle {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new PuzzleError([
      'Корень JSON должен быть объектом с полями grid и words.',
    ]);
  }
  const root = data as Record<string, unknown>;
  const issues: string[] = [];

  const gridRaw = (root.grid ?? {}) as Record<string, unknown>;
  const width = Math.round(Number(gridRaw.width));
  const height = Math.round(Number(gridRaw.height));
  if (!Number.isFinite(width) || width < 2 || width > 40) {
    issues.push('Поле grid.width должно быть целым числом от 2 до 40.');
  }
  if (!Number.isFinite(height) || height < 2 || height > 60) {
    issues.push('Поле grid.height должно быть целым числом от 2 до 60.');
  }
  if (!Array.isArray(root.words) || root.words.length === 0) {
    issues.push('Поле words должно быть непустым массивом слов.');
  }
  if (issues.length > 0) throw new PuzzleError(issues);

  interface Basic {
    answer: string;
    clue: string;
    row: number;
    col: number;
    direction: Direction;
    index: number;
  }
  const basics: Basic[] = [];

  (root.words as unknown[]).forEach((item, i) => {
    const label = `Слово №${i + 1}`;
    if (typeof item !== 'object' || item === null) {
      issues.push(`${label}: должен быть объектом.`);
      return;
    }
    const w = item as Record<string, unknown>;
    const answer = normalizeAnswer(String(w.answer ?? ''));
    const clue = String(w.clue ?? '').trim();
    const row = Math.round(Number(w.row));
    const col = Math.round(Number(w.col));
    const direction: Direction | null =
      w.direction === 'down' ? 'down' : w.direction === 'across' ? 'across' : null;

    if (answer.length < 2) {
      issues.push(
        `${label}: некорректный ответ «${String(w.answer ?? '')}» — нужно минимум 2 буквы, только буквы без пробелов.`,
      );
    }
    if (!clue) issues.push(`${label}: отсутствует текст вопроса (clue).`);
    if (!direction) {
      issues.push(`${label}: поле direction должно быть "across" или "down".`);
    }
    if (!Number.isFinite(row) || row < 1) {
      issues.push(`${label}: поле row должно быть целым числом ≥ 1.`);
    }
    if (!Number.isFinite(col) || col < 1) {
      issues.push(`${label}: поле col должно быть целым числом ≥ 1.`);
    }

    if (answer.length >= 2 && direction && row >= 1 && col >= 1) {
      const endRow = direction === 'down' ? row + answer.length - 1 : row;
      const endCol = direction === 'across' ? col + answer.length - 1 : col;
      if (endRow > height || endCol > width) {
        issues.push(
          `${label} («${answer}»): слово не помещается в сетку ${width}×${height} — начинается в клетке (${row}, ${col}) и выходит за границу.`,
        );
      } else {
        basics.push({ answer, clue, row, col, direction, index: i });
      }
    }
  });

  // Duplicates: two words sharing the same start cell and direction.
  const seenStarts = new Set<string>();
  for (const w of basics) {
    const k = `${w.row},${w.col},${w.direction}`;
    if (seenStarts.has(k)) {
      issues.push(`Два слова начинаются в клетке (${w.row}, ${w.col}) с одинаковым направлением.`);
    }
    seenStarts.add(k);
  }

  // Fill the cells and check that intersecting letters match.
  const cells = new Map<string, CellInfo>();
  for (const w of basics) {
    const id = `w${w.index}`;
    for (let i = 0; i < w.answer.length; i++) {
      const r = w.direction === 'down' ? w.row - 1 + i : w.row - 1;
      const c = w.direction === 'across' ? w.col - 1 + i : w.col - 1;
      const k = cellKey(r, c);
      const existing = cells.get(k);
      if (!existing) {
        cells.set(k, {
          row: r,
          col: c,
          solution: w.answer[i],
          wordIds: [id],
          acrossId: w.direction === 'across' ? id : undefined,
          downId: w.direction === 'down' ? id : undefined,
        });
      } else {
        if (existing.solution !== w.answer[i]) {
          issues.push(
            `Конфликт букв в клетке (строка ${r + 1}, столбец ${c + 1}): «${existing.solution}» и «${w.answer[i]}».`,
          );
        }
        if (!existing.wordIds.includes(id)) existing.wordIds.push(id);
        if (w.direction === 'across') existing.acrossId = id;
        else existing.downId = id;
      }
    }
  }

  // Words in the same direction must not touch or overlap:
  // every maximal horizontal/vertical run of occupied cells must match
  // exactly one word.
  const acrossWords = basics.filter((w) => w.direction === 'across');
  const downWords = basics.filter((w) => w.direction === 'down');
  const acrossRuns = new Set(
    acrossWords.map((w) => `${w.row - 1},${w.col - 1},${w.col - 1 + w.answer.length - 1}`),
  );
  const downRuns = new Set(
    downWords.map((w) => `${w.col - 1},${w.row - 1},${w.row - 1 + w.answer.length - 1}`),
  );

  let foundAcross = 0;
  for (let r = 0; r < height; r++) {
    let c = 0;
    while (c < width) {
      if (!cells.has(cellKey(r, c))) {
        c++;
        continue;
      }
      const start = c;
      while (c < width && cells.has(cellKey(r, c))) c++;
      // A single cell is just a letter of a perpendicular word, not a word itself.
      if (c - start < 2) continue;
      foundAcross++;
      if (!acrossRuns.has(`${r},${start},${c - 1}`)) {
        issues.push(
          `Недопустимое соприкосновение по горизонтали в строке ${r + 1} (клетки ${start + 1}–${c}).`,
        );
      }
    }
  }
  let foundDown = 0;
  for (let c = 0; c < width; c++) {
    let r = 0;
    while (r < height) {
      if (!cells.has(cellKey(r, c))) {
        r++;
        continue;
      }
      const start = r;
      while (r < height && cells.has(cellKey(r, c))) r++;
      if (r - start < 2) continue;
      foundDown++;
      if (!downRuns.has(`${c},${start},${r - 1}`)) {
        issues.push(
          `Недопустимое соприкосновение по вертикали в столбце ${c + 1} (клетки ${start + 1}–${r}).`,
        );
      }
    }
  }
  if (foundAcross !== acrossRuns.size) {
    issues.push('Часть слов по горизонтали слилась в одну линию — проверьте расположение слов.');
  }
  if (foundDown !== downRuns.size) {
    issues.push('Часть слов по вертикали слилась в одну линию — проверьте расположение слов.');
  }

  if (issues.length > 0) throw new PuzzleError(issues);

  // Numbering: standard crossword numbering in reading order.
  let counter = 1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const info = cells.get(cellKey(r, c));
      if (!info) continue;
      const startsAcross =
        info.acrossId !== undefined &&
        basics[Number(info.acrossId.slice(1))].row - 1 === r &&
        basics[Number(info.acrossId.slice(1))].col - 1 === c;
      const startsDown =
        info.downId !== undefined &&
        basics[Number(info.downId.slice(1))].row - 1 === r &&
        basics[Number(info.downId.slice(1))].col - 1 === c;
      if (startsAcross || startsDown) {
        info.number = counter;
        counter++;
      }
    }
  }

  const words: PlacedWord[] = basics.map((w) => {
    const id = `w${w.index}`;
    const startInfo = cells.get(
      cellKey(w.direction === 'down' ? w.row - 1 : w.row - 1, w.direction === 'across' ? w.col - 1 : w.col - 1),
    );
    const wordCells: { row: number; col: number }[] = [];
    for (let i = 0; i < w.answer.length; i++) {
      const r = w.direction === 'down' ? w.row - 1 + i : w.row - 1;
      const c = w.direction === 'across' ? w.col - 1 + i : w.col - 1;
      wordCells.push({ row: r, col: c });
    }
    return {
      id,
      answer: w.answer,
      clue: w.clue,
      row: w.row - 1,
      col: w.col - 1,
      direction: w.direction,
      number: startInfo?.number ?? 0,
      cells: wordCells,
    };
  });

  const meta: Puzzle['meta'] = {};
  if (root.meta && typeof root.meta === 'object') {
    const m = root.meta as Record<string, unknown>;
    if (typeof m.title === 'string') meta.title = m.title;
    if (typeof m.author === 'string') meta.author = m.author;
    if (typeof m.language === 'string') meta.language = m.language;
  }

  return { meta, width, height, words, cells };
}

/** Comparison for sorting clue lists by word number. */
export function compareByNumber(a: PlacedWord, b: PlacedWord): number {
  return a.number - b.number;
}
