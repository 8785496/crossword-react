/**
 * XLSX word-list support: an .xlsx file is a ZIP archive of XML parts, and
 * the user's sheet is the same two-column list as in a CSV (first column —
 * the answer word, second column — the clue); the grid is generated
 * afterwards by `src/lib/generator.ts`.
 *
 * Rules (documented in README.md):
 *  - only the FIRST worksheet of the book is read;
 *  - the first column holds words, the second (plus any extra columns,
 *    glued with spaces) holds questions — the same row loop as CSV
 *    (`parseWordRows`), so headers, limits and per-row errors match;
 *  - shared strings, inline strings and literal values (numbers, formula
 *    results) are all read as their text.
 *
 * The archive is unpacked by `src/lib/zip.ts` and the XML is parsed by
 * `src/lib/xml.ts` — both hand-rolled, the project has no runtime
 * dependencies.
 */

import { parseWordRows, type CsvWord, type WordRow } from './csv';
import { PuzzleError } from './puzzle';
import { unzipEntries } from './zip';
import { childOf, parseXml, type XmlNode } from './xml';

/** Safety cap so a pathological sheet cannot exhaust memory. */
const MAX_SHEET_ROWS = 10000;

const NOT_XLSX = 'Не удалось прочитать файл: это не книга Excel (XLSX).';

function decodeXml(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Resolve an OPC part target («worksheets/sheet1.xml») against «xl». */
function resolvePart(target: string): string {
  const combined = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const out: string[] = [];
  for (const part of combined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** Text of a shared-string item, skipping phonetic («rPh») runs. */
function sharedItemText(si: XmlNode): string {
  let text = '';
  const walk = (node: XmlNode): void => {
    for (const child of node.children) {
      if (child.name === 'rPh') continue;
      if (child.name === 't') text += child.text;
      walk(child);
    }
  };
  walk(si);
  return text;
}

/** Spreadsheet column letters («A», «AA») → 0-based index. */
function columnIndex(cellRef: string): number | undefined {
  const m = /^([A-Za-z]+)\d+$/.exec(cellRef.trim());
  if (!m) return undefined;
  let index = 0;
  for (const ch of m[1].toUpperCase()) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function cellValue(cell: XmlNode, shared: string[]): string {
  if (cell.attrs['t'] === 'inlineStr') {
    const is = childOf(cell, 'is');
    if (!is) return '';
    let text = '';
    const walk = (node: XmlNode): void => {
      for (const child of node.children) {
        if (child.name === 't') text += child.text;
        walk(child);
      }
    };
    walk(is);
    return text;
  }
  const raw = childOf(cell, 'v')?.text ?? '';
  if (cell.attrs['t'] === 's') {
    if (!raw.trim()) return '';
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && index < shared.length
      ? (shared[index] ?? '')
      : '';
  }
  // Numbers, formula results, booleans — as their literal text.
  return raw;
}

function sheetRows(sheet: XmlNode, shared: string[]): WordRow[] {
  const sheetData = childOf(sheet, 'sheetData');
  if (!sheetData) return [];
  const rows: WordRow[] = [];
  let nextRow = 1;
  for (const rowNode of sheetData.children) {
    if (rowNode.name !== 'row') continue;
    if (rows.length >= MAX_SHEET_ROWS) {
      throw new PuzzleError([
        `В файле больше ${MAX_SHEET_ROWS} строк — оставьте только список слов.`,
      ]);
    }
    const asked = Number(rowNode.attrs['r']);
    const rowNum = Number.isInteger(asked) && asked > 0 ? asked : nextRow;
    nextRow = rowNum + 1;

    const cells: string[] = [];
    let nextCol = 0;
    for (const cell of rowNode.children) {
      if (cell.name !== 'c') continue;
      const col = columnIndex(cell.attrs['r'] ?? '') ?? nextCol;
      nextCol = col + 1;
      const value = cellValue(cell, shared);
      if (value) cells[col] = value;
    }
    // Densify: cells past the last filled one stay empty, which lets
    // parseWordRows treat fully empty rows as blank.
    for (let i = 0; i < cells.length; i++) cells[i] ??= '';
    rows.push({ line: rowNum, cells });
  }
  return rows;
}

/**
 * Parse an XLSX word list (the first worksheet); throws PuzzleError with
 * per-row issues.
 */
export async function parseXlsxWords(buffer: ArrayBuffer): Promise<CsvWord[]> {
  let entries: Map<string, Uint8Array>;
  try {
    entries = await unzipEntries(buffer);
  } catch (e) {
    if (e instanceof PuzzleError) throw e;
    throw new PuzzleError([NOT_XLSX]);
  }

  const workbookPart = entries.get('xl/workbook.xml');
  const relsPart = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbookPart || !relsPart) throw new PuzzleError([NOT_XLSX]);

  try {
    const workbook = parseXml(decodeXml(workbookPart));
    const firstSheet = childOf(workbook, 'sheets')?.children.find((n) => n.name === 'sheet');
    const sheetRef = firstSheet?.attrs['r:id'] ?? firstSheet?.attrs['id'];

    const rels = parseXml(decodeXml(relsPart));
    const target = sheetRef
      ? rels.children.find((n) => n.name === 'Relationship' && n.attrs['Id'] === sheetRef)?.attrs[
          'Target'
        ]
      : undefined;
    if (!target) throw new PuzzleError(['В книге не найден первый лист.']);

    const sheetPart = entries.get(resolvePart(target));
    if (!sheetPart) throw new PuzzleError(['В книге не найден первый лист.']);
    const sheet = parseXml(decodeXml(sheetPart));

    const shared: string[] = [];
    const sharedPart = entries.get('xl/sharedStrings.xml');
    if (sharedPart) {
      for (const si of parseXml(decodeXml(sharedPart)).children) {
        if (si.name === 'si') shared.push(sharedItemText(si));
      }
    }
    return parseWordRows(sheetRows(sheet, shared), ' ');
  } catch (e) {
    if (e instanceof PuzzleError) throw e;
    throw new PuzzleError([NOT_XLSX]);
  }
}
