/** Direction of a word in the grid. */
export type Direction = 'across' | 'down';

/**
 * Crossword JSON file contract.
 *
 * {
 *   "version": "1.0",
 *   "meta":   { "title": "...", "author": "...", "language": "en" },
 *   "grid":   { "width": 15, "height": 22 },
 *   "words": [
 *     { "id": "3a", "answer": "ARMY", "clue": "The question…",
 *       "row": 1, "col": 4, "direction": "across" }
 *   ]
 * }
 *
 * The row/col coordinates are 1-based and point to the FIRST letter of the
 * word (row counts from the top, col counts from the left).
 */
export interface PuzzleWord {
  /** Optional unique identifier. */
  id?: string;
  /** Answer: letters only (case-insensitive, Ё is treated as Е). */
  answer: string;
  /** Question / hint. */
  clue: string;
  /** Row of the first letter, starting at 1. */
  row: number;
  /** Column of the first letter, starting at 1. */
  col: number;
  /** across — horizontal, down — vertical. */
  direction: Direction;
}

export interface PuzzleMeta {
  title?: string;
  author?: string;
  language?: string;
}

export interface Puzzle {
  meta?: PuzzleMeta;
  version?: string;
  grid: { width: number; height: number };
  words: PuzzleWord[];
}

/** Word after normalization and validation, with its computed number. */
export interface PlacedWord {
  id: string;
  answer: string;
  clue: string;
  /** 0-based coordinates of the first letter. */
  row: number;
  col: number;
  direction: Direction;
  /** Crossword number (computed automatically). */
  number: number;
  cells: { row: number; col: number }[];
}

/** Grid cell covered by a word. */
export interface CellInfo {
  row: number;
  col: number;
  solution: string;
  wordIds: string[];
  acrossId?: string;
  downId?: string;
  /** Number shown in the cell when a word starts there. */
  number?: number;
}

export interface ValidatedPuzzle {
  meta: PuzzleMeta;
  width: number;
  height: number;
  words: PlacedWord[];
  cells: Map<string, CellInfo>;
}
