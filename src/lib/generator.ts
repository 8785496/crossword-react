/**
 * Crossword grid generator for CSV word lists.
 *
 * Ported from scripts/build-samples.mjs: places the words with a
 * backtracking search (letter crossings only, no touching of parallel
 * words), so every layout it produces satisfies the JSON contract
 * invariants checked by validatePuzzle.
 *
 * Differences from the script version:
 *  - the RNG is seeded from the word list, so the same file always yields
 *    the same grid;
 *  - the layout scoring targets a device-specific height/width ratio
 *    (a ratio below 1 spreads the grid horizontally, more cells across);
 *  - a relaxed fallback pass places words standalone (isolated, with one
 *    empty cell around) when no fully crossing layout exists;
 *  - a time budget keeps a pathological word list from freezing the UI.
 */

import type { Direction, Puzzle, PuzzleMeta } from '../types';
import { PuzzleError, cellKey } from './puzzle';

/** A word to place; `answer` must already be normalized. */
export interface GeneratorWord {
  answer: string;
  clue: string;
}

/** Grid shape limits and the preferred height/width ratio (< 1 means wide). */
export interface GridProfile {
  maxW: number;
  maxH: number;
  targetRatio: number;
}

export interface GeneratedPuzzle {
  puzzle: Puzzle;
  /** Answers placed without a single crossing (valid, but standalone). */
  isolated: string[];
}

/** Hard limits of the JSON contract enforced by validatePuzzle. */
const MAX_GRID_W = 40;
const MAX_GRID_H = 60;
/** Safety net: generation must never freeze the UI for long. */
const TIME_BUDGET_MS = 6000;

interface Placement {
  answer: string;
  row: number;
  col: number;
  dir: Direction;
}

interface Box {
  minR: number;
  minC: number;
  w: number;
  h: number;
}

/** Thrown when the time budget runs out mid-search. */
class TimeBudget extends Error {}

// ---------- Seeded RNG (deterministic per word list) ----------
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Word order for one attempt: longest first, ties shuffled. */
function orderByLength(answers: string[], rng: () => number): number[] {
  const order = shuffle(answers.map((_, i) => i), rng);
  order.sort((x, y) => answers[y].length - answers[x].length);
  return order;
}

function boundingBox(placements: Placement[]): Box {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const p of placements) {
    const endR = p.dir === 'down' ? p.row + p.answer.length - 1 : p.row;
    const endC = p.dir === 'across' ? p.col + p.answer.length - 1 : p.col;
    minR = Math.min(minR, p.row);
    maxR = Math.max(maxR, endR);
    minC = Math.min(minC, p.col);
    maxC = Math.max(maxC, endC);
  }
  return { minR, minC, w: maxC - minC + 1, h: maxR - minR + 1 };
}

/** Compactness plus a penalty for missing the target height/width ratio. */
function layoutScore(box: Box, targetRatio: number): number {
  return box.w * box.h * 0.5 + Math.abs(box.h - targetRatio * box.w) * 12;
}

function isGoodEnough(box: Box, targetRatio: number): boolean {
  return Math.abs(box.h / box.w - targetRatio) <= 0.25;
}

function placementCells(p: Placement): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  const dr = p.dir === 'down' ? 1 : 0;
  const dc = p.dir === 'across' ? 1 : 0;
  for (let i = 0; i < p.answer.length; i++) {
    cells.push({ row: p.row + dr * i, col: p.col + dc * i });
  }
  return cells;
}

/**
 * One placement attempt. Returns the placements when every word is placed,
 * null otherwise. With `allowIsolated`, a word with no possible crossing may
 * be placed standalone (a one-cell moat keeps the layout contract-valid).
 */
function tryPlace(
  answers: string[],
  order: number[],
  rng: () => number,
  maxW: number,
  maxH: number,
  allowIsolated: boolean,
  deadline: number,
): Placement[] | null {
  const cells = new Map<string, string>(); // "r,c" -> letter
  const acrossCells = new Set<string>();
  const downCells = new Set<string>();
  const placements: Placement[] = [];

  const letterAt = (r: number, c: number) => cells.get(cellKey(r, c));

  /**
   * Incremental equivalent of the global run rules (every maximal run of
   * occupied cells with length >= 2 must be exactly one placed word): any
   * invalid run created by a placement passes through the placed cells, so
   * it is enough to check those cells, their perpendicular neighbours and
   * the two cells past the word ends — no full-board rescan needed.
   */
  function placementValid(answer: string, row: number, col: number, dir: Direction): boolean {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const len = answer.length;
    for (let i = 0; i < len; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const k = cellKey(r, c);
      if (cells.has(k)) {
        // Crossing cell: must belong to a perpendicular word only.
        if (dir === 'across' ? acrossCells.has(k) : downCells.has(k)) return false;
      } else {
        // A fresh cell must not touch an existing run perpendicularly.
        const p1 = dir === 'across' ? cellKey(r - 1, c) : cellKey(r, c - 1);
        const p2 = dir === 'across' ? cellKey(r + 1, c) : cellKey(r, c + 1);
        if (cells.has(p1) || cells.has(p2)) return false;
      }
    }
    // The run must not continue past either end of the word.
    if (cells.has(cellKey(row - dr, col - dc))) return false;
    if (cells.has(cellKey(row + dr * len, col + dc * len))) return false;
    return true;
  }

  function canPlace(answer: string, row: number, col: number, dir: Direction): boolean {
    if (row < 0 || col < 0) return false;
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    if (row + dr * (answer.length - 1) >= maxH) return false;
    if (col + dc * (answer.length - 1) >= maxW) return false;
    for (let i = 0; i < answer.length; i++) {
      const ch = letterAt(row + dr * i, col + dc * i);
      if (ch !== undefined && ch !== answer[i]) return false;
    }
    return true;
  }

  function commit(
    answer: string,
    row: number,
    col: number,
    dir: Direction,
  ): [string, boolean][] | null {
    if (!placementValid(answer, row, col, dir)) return null;
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    // [cell key, was empty before this word] — crossing cells keep the
    // perpendicular word's letter, so undo may not clear them.
    const touched: [string, boolean][] = [];
    const own = dir === 'across' ? acrossCells : downCells;
    for (let i = 0; i < answer.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const k = cellKey(r, c);
      touched.push([k, !cells.has(k)]);
      cells.set(k, answer[i]);
      own.add(k);
    }
    placements.push({ answer, row, col, dir });
    return touched;
  }

  function undo(touched: [string, boolean][], dir: Direction) {
    const own = dir === 'across' ? acrossCells : downCells;
    for (const [k, wasEmpty] of touched) {
      own.delete(k);
      if (wasEmpty) cells.delete(k);
    }
    placements.pop();
  }

  function boxAfter(cand: { row: number; col: number; dir: Direction }, len: number): Box {
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    for (const p of placements) {
      const pEndR = p.dir === 'down' ? p.row + p.answer.length - 1 : p.row;
      const pEndC = p.dir === 'across' ? p.col + p.answer.length - 1 : p.col;
      minR = Math.min(minR, p.row);
      maxR = Math.max(maxR, pEndR);
      minC = Math.min(minC, p.col);
      maxC = Math.max(maxC, pEndC);
    }
    const endR = cand.dir === 'down' ? cand.row + len - 1 : cand.row;
    const endC = cand.dir === 'across' ? cand.col + len - 1 : cand.col;
    minR = Math.min(minR, cand.row);
    maxR = Math.max(maxR, endR);
    minC = Math.min(minC, cand.col);
    maxC = Math.max(maxC, endC);
    return { minR, minC, w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  /** Positions crossing an existing letter. */
  function crossingCandidates(answer: string): { row: number; col: number; dir: Direction }[] {
    const list: { row: number; col: number; dir: Direction }[] = [];
    for (let i = 0; i < answer.length; i++) {
      for (const [k, ch] of cells) {
        if (ch !== answer[i]) continue;
        const [r, c] = k.split(':').map(Number);
        list.push({ row: r, col: c - i, dir: 'across' });
        list.push({ row: r - i, col: c, dir: 'down' });
      }
    }
    return shuffle(list, rng);
  }

  /** True when the word plus a one-cell moat around it is all empty. */
  function moatFree(answer: string, row: number, col: number, dir: Direction): boolean {
    if (row < 0 || col < 0) return false;
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    if (row + dr * (answer.length - 1) >= maxH) return false;
    if (col + dc * (answer.length - 1) >= maxW) return false;
    for (let i = 0; i < answer.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      for (let dRow = -1; dRow <= 1; dRow++) {
        for (let dCol = -1; dCol <= 1; dCol++) {
          if (letterAt(r + dRow, c + dCol) !== undefined) return false;
        }
      }
    }
    return true;
  }

  function isolatedCandidates(answer: string): { row: number; col: number; dir: Direction }[] {
    const list: { row: number; col: number; dir: Direction }[] = [];
    for (const dir of ['across', 'down'] as Direction[]) {
      for (let r = 0; r < maxH; r++) {
        for (let c = 0; c < maxW; c++) {
          if (moatFree(answer, r, c, dir)) list.push({ row: r, col: c, dir });
        }
      }
    }
    return shuffle(list, rng);
  }

  function solve(idx: number): boolean {
    if (Date.now() > deadline) throw new TimeBudget();
    if (idx === order.length) return true;
    const answer = answers[order[idx]];
    for (const cand of crossingCandidates(answer)) {
      if (!canPlace(answer, cand.row, cand.col, cand.dir)) continue;
      const box = boxAfter(cand, answer.length);
      if (box.w > maxW || box.h > maxH) continue;
      const touched = commit(answer, cand.row, cand.col, cand.dir);
      if (touched) {
        if (solve(idx + 1)) return true;
        undo(touched, cand.dir);
      }
    }
    if (allowIsolated) {
      for (const cand of isolatedCandidates(answer)) {
        const touched = commit(answer, cand.row, cand.col, cand.dir);
        if (touched) {
          if (solve(idx + 1)) return true;
          undo(touched, cand.dir);
        }
      }
    }
    return false;
  }

  // The first word anchors the board: across when it fits the width cap,
  // otherwise down.
  const first = answers[order[0]];
  try {
    if (!commit(first, 0, 0, first.length <= maxW ? 'across' : 'down')) return null;
    if (solve(1)) return placements.map((p) => ({ ...p }));
    return null;
  } catch (e) {
    if (e instanceof TimeBudget) return null;
    throw e;
  }
}

/**
 * Build a contract-valid puzzle from a normalized word list. Throws
 * PuzzleError when no layout exists; `meta` carries the title etc.
 */
export function generatePuzzle(
  words: GeneratorWord[],
  profile: GridProfile,
  meta: PuzzleMeta = {},
): GeneratedPuzzle {
  if (words.length === 0) {
    throw new PuzzleError(['Список слов пуст — кроссворд строить не из чего.']);
  }
  const answers = words.map((w) => w.answer);
  const longest = Math.max(...answers.map((a) => a.length));
  if (longest > MAX_GRID_H) {
    throw new PuzzleError([
      `Самое длинное слово состоит из ${longest} букв — максимум ${MAX_GRID_H}.`,
    ]);
  }
  // A word longer than the width cap simply goes down (maxH always covers
  // the longest word); widening the grid would shrink the cells on screen.
  const maxW = Math.min(MAX_GRID_W, profile.maxW);
  const maxH = Math.min(MAX_GRID_H, Math.max(profile.maxH, longest));

  const rng = mulberry32(hashSeed(answers.join('\n')));
  const deadline = Date.now() + TIME_BUDGET_MS;
  // Attempt counts shrink for long lists to stay quick; the deadline above
  // is only a safety net for pathological inputs.
  const crossingAttempts = Math.max(100, Math.min(2000, Math.round(30000 / answers.length)));
  const relaxedAttempts = Math.max(20, Math.round(crossingAttempts / 3));

  // Holder object (not a bare `let`) so assignments inside the closures
  // below keep working with TypeScript's control-flow analysis.
  const best = { placements: null as Placement[] | null, score: Infinity };
  for (let a = 0; a < crossingAttempts && Date.now() < deadline; a++) {
    const order = orderByLength(answers, rng);
    const placements = tryPlace(answers, order, rng, maxW, maxH, false, deadline);
    if (!placements) continue;
    const box = boundingBox(placements);
    const score = layoutScore(box, profile.targetRatio);
    if (score < best.score) {
      best.placements = placements;
      best.score = score;
      if (isGoodEnough(box, profile.targetRatio)) break;
    }
  }
  if (!best.placements) {
    // No fully crossing layout exists (rare letters, disjoint word sets) —
    // retry allowing standalone words.
    for (let a = 0; a < relaxedAttempts && Date.now() < deadline; a++) {
      const order = orderByLength(answers, rng);
      const placements = tryPlace(answers, order, rng, maxW, maxH, true, deadline);
      if (!placements) continue;
      const box = boundingBox(placements);
      const score = layoutScore(box, profile.targetRatio);
      if (score < best.score) {
        best.placements = placements;
        best.score = score;
        if (isGoodEnough(box, profile.targetRatio)) break;
      }
    }
  }
  if (!best.placements) {
    throw new PuzzleError([
      'Не удалось разместить все слова в одной сетке. Попробуйте сократить список или убрать очень длинные слова.',
    ]);
  }

  const { puzzle, isolated } = buildPuzzle(words, best.placements, meta);
  return { puzzle, isolated };
}

function buildPuzzle(
  words: GeneratorWord[],
  placements: Placement[],
  meta: PuzzleMeta,
): GeneratedPuzzle {
  const box = boundingBox(placements);
  const width = Math.max(box.w, 2);
  const height = Math.max(box.h, 2);
  const clueByAnswer = new Map(words.map((w) => [w.answer, w.clue]));

  // Sort across before down, then in reading order, for a tidy JSON file.
  const sorted = [...placements].sort((a, b) =>
    a.dir === b.dir ? a.row - b.row || a.col - b.col : a.dir === 'across' ? -1 : 1,
  );

  // A word is isolated when none of its cells is shared with another word.
  const owners = new Map<string, number>();
  for (const p of sorted) {
    for (const { row, col } of placementCells(p)) {
      const k = cellKey(row, col);
      owners.set(k, (owners.get(k) ?? 0) + 1);
    }
  }
  const isolated = sorted
    .filter((p) =>
      placementCells(p).every(({ row, col }) => (owners.get(cellKey(row, col)) ?? 0) < 2),
    )
    .map((p) => p.answer);

  const puzzle: Puzzle = {
    version: '1.0',
    meta,
    grid: { width, height },
    words: sorted.map((p) => ({
      answer: p.answer,
      clue: clueByAnswer.get(p.answer) ?? '',
      row: p.row - box.minR + 1, // 1-based, like the JSON contract
      col: p.col - box.minC + 1,
      direction: p.dir,
    })),
  };
  return { puzzle, isolated };
}
