/**
 * CSV word-list support: the user opens a plain two-column CSV where the
 * first column is the answer word and the second column is the clue; the
 * grid is generated afterwards by `src/lib/generator.ts`.
 *
 * The parser is hand-rolled (the project has no runtime dependencies) and
 * follows the rules documented in README.md:
 *  - delimiters `;`, `,` or tab, auto-detected per file;
 *  - quoted fields with `""` escapes, newlines allowed inside quotes;
 *  - UTF-8 (with or without BOM) or Windows-1251 input (the Excel default
 *    for Cyrillic locales);
 *  - an optional header row («Слово/Вопрос», «Word/Question», …) is skipped.
 */

import { normalizeAnswer, PuzzleError } from './puzzle';

/** A validated word-list entry ready for grid generation. */
export interface CsvWord {
  answer: string;
  clue: string;
  /** 1-based line number in the CSV file, for error messages. */
  line: number;
}

/** Header names recognized in the first column. */
const HEADER_FIRST = new Set([
  'слово',
  'word',
  'words',
  'ответ',
  'answer',
  'термин',
  'term',
  'выражение',
]);

/** Header names recognized in the second column. */
const HEADER_SECOND = new Set([
  'вопрос',
  'question',
  'перевод',
  'translation',
  'определение',
  'definition',
  'значение',
  'meaning',
  'описание',
  'description',
  'подсказка',
  'hint',
  'clue',
]);

const MAX_WORDS = 60;
const MAX_ANSWER_LENGTH = 60;
const MAX_ISSUES = 30;

/** Decode a file as UTF-8, falling back to Windows-1251 (Excel Cyrillic). */
export async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(buffer);
    } catch {
      return new TextDecoder().decode(buffer);
    }
  }
}

interface CsvRow {
  /** 1-based line number where the row starts. */
  line: number;
  cells: string[];
}

/** RFC-4180-style split with quoted fields and CR/LF/CRLF row ends. */
function splitCsv(text: string, delimiter: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}

/** Pick the delimiter whose field count is most consistent across rows. */
function sniffDelimiter(text: string): string {
  const sample = text.length > 64 * 1024 ? text.slice(0, 64 * 1024) : text;
  let best = ',';
  let bestScore = 0;
  for (const d of [';', ',', '\t']) {
    const rows = splitCsv(sample, d);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.cells.length, (counts.get(r.cells.length) ?? 0) + 1);
    let modalLen = 0;
    let modalRows = 0;
    for (const [len, n] of counts) {
      if (n > modalRows || (n === modalRows && len > modalLen)) {
        modalLen = len;
        modalRows = n;
      }
    }
    const score = modalLen >= 2 ? modalRows : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function isHeaderRow(wordRaw: string, clueRaw: string): boolean {
  // A row is a header only when both columns look like header names, or when
  // the word cell holds no letters at all («№», «—»). A real data row keeps
  // its word even if the clue happens to look like a column name.
  const word = wordRaw.toLowerCase().replace(/ё/g, 'е');
  const clue = clueRaw.trim().toLowerCase();
  if (normalizeAnswer(wordRaw).length < 2) return true;
  return HEADER_FIRST.has(word) && HEADER_SECOND.has(clue);
}

/** Parse a CSV word list; throws PuzzleError with per-line issues. */
export function parseCsvWords(text: string): CsvWord[] {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) {
    throw new PuzzleError([
      'Файл пустой — нужна таблица: первый столбец слово, второй вопрос.',
    ]);
  }
  const delimiter = sniffDelimiter(clean);
  const rows = splitCsv(clean, delimiter);

  const issues: string[] = [];
  const words: CsvWord[] = [];
  const seen = new Map<string, number>();
  let dataRows = 0;

  rows.forEach((row, i) => {
    const wordRaw = (row.cells[0] ?? '').trim();
    // Everything after the first column counts as the clue, so a question
    // with a bare (unquoted) delimiter still survives in hand-written files.
    const clue = row.cells
      .slice(1)
      .join(delimiter)
      .trim();
    if (!wordRaw && !clue) return; // blank row
    dataRows++;
    if (i === 0 && isHeaderRow(wordRaw, row.cells[1] ?? '')) return;

    const answer = normalizeAnswer(wordRaw);
    if (!wordRaw) {
      issues.push(`Строка ${row.line}: пустая ячейка слова в первом столбце.`);
      return;
    }
    if (answer.length < 2) {
      issues.push(`Строка ${row.line}: «${wordRaw}» не подходит — нужно слово минимум из 2 букв.`);
      return;
    }
    if (answer.length > MAX_ANSWER_LENGTH) {
      issues.push(`Строка ${row.line}: слово «${answer}» длиннее ${MAX_ANSWER_LENGTH} букв.`);
      return;
    }
    if (!clue) {
      issues.push(`Строка ${row.line}: у слова «${answer}» нет вопроса во втором столбце.`);
      return;
    }
    const firstAt = seen.get(answer);
    if (firstAt !== undefined) {
      issues.push(`Строка ${row.line}: слово «${answer}» уже было в строке ${firstAt}.`);
      return;
    }
    seen.set(answer, row.line);
    words.push({ answer, clue, line: row.line });
  });

  if (dataRows === 0) {
    issues.push('В файле нет ни одной строки со словами.');
  } else if (words.length === 0 && issues.length === 0) {
    issues.push('Не удалось распознать слова: нужен столбец со словами и столбец с вопросами.');
  }
  if (words.length > MAX_WORDS) {
    issues.push(`В файле ${words.length} слов — максимум ${MAX_WORDS}. Удалите лишние строки.`);
  }
  if (issues.length > 0) {
    const shown = issues.slice(0, MAX_ISSUES);
    if (issues.length > MAX_ISSUES) shown.push(`…и ещё ${issues.length - MAX_ISSUES} проблем.`);
    throw new PuzzleError(shown);
  }
  return words;
}
