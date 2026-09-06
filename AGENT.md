# AGENT.md

Guidance for AI coding agents working in this repository.

## What this project is

A crossword app for tablets in portrait orientation, installable as a PWA.
Crosswords come from JSON files opened by the user (see the contract in
`README.md`, validated in `src/lib/puzzle.ts`). Built with Vite + React +
TypeScript. No runtime dependencies besides `react` / `react-dom`.

## Commands

```bash
npm install
npm run dev        # dev server on :5173
npm run build      # tsc --noEmit && vite build — run before finishing any change
npm run preview    # serves dist/ on :4173 (PWA works here)
npm run samples    # regenerate sample crosswords (do not hand-edit them)
npm run icons      # regenerate PWA icons
```

There are no tests; the minimum verification bar is a clean `npm run build`
plus manually loading a sample in `npm run preview` (grid renders, word dialog
opens, Check marks wrong letters).

## Architecture

Data flow: a JSON file (or a bundled sample) → `parsePuzzle` / `validatePuzzle`
in `src/lib/puzzle.ts` → a `ValidatedPuzzle` (`words` + a `cells` map keyed by
`"row:col"`, 0-based) → `CrosswordGrid`. Entered letters live in
`App.tsx` state as `entries: Record<"row:col", letter>`.

- `src/lib/puzzle.ts` — the single source of truth for contract validation and automatic numbering.
- `src/App.tsx` — all app state: puzzle, entries, marks, checked words, answers reveal, dialogs, theme.
- `src/components/icons.tsx` — inline SVG icons stroked with `currentColor`, so icon color always follows the active theme.
- `src/themes.ts` + `src/styles.css` — themes are CSS variables on
  `[data-theme=…].` To add a theme: extend `THEMES` (with swatch colors) and add
  a CSS variable block.
- `public/sw.js` — service worker (network-first navigations, cache-first
  assets). Bump the `CACHE` version constant when the shell changes, so
  installed PWAs pick up the new build.
- `public/manifest.webmanifest` — `display: standalone`, `orientation: portrait`.

## JSON contract invariants (enforced in `src/lib/puzzle.ts`)

- `row`/`col` are **1-based** in JSON and point to the first letter; internally
  everything is 0-based.
- Answers are normalized: uppercase, `Ё` → `Е`, letters only (Cyrillic + Latin),
  minimum length 2.
- Intersections must match letter-for-letter.
- Words in the same direction must not touch, overlap, or merge: every maximal
  run of occupied cells with **length ≥ 2** must correspond to exactly one word
  (length-1 runs are just letters of perpendicular words and are ignored).
- Word numbers are computed automatically in reading order — never store them.

## Conventions

- Comments, `README.md`, and this file are in English.
- **User-facing UI strings are intentionally in Russian** (buttons, dialogs,
  reports, validation messages, sample titles). Do not translate or "fix" them
  unless explicitly asked.
- The input dialog filters to letters and clamps to the answer's length
  (`maxLength`); normalize input the same way answers are normalized.
- Correct words are highlighted **only after Check**: `checkedWordIds` is a
  snapshot taken when the user presses Check; editing a word (or any cell it
  crosses) drops it from the snapshot. Wrong-letter `marks` behave the same
  way. Neither is persisted.
- `answersShown` toggles a display-only reveal of the solution: cells render
  `info.solution` instead of `entries`, never mutating the entries themselves;
  the toggle resets when a new puzzle loads.

## Persistence

- `localStorage["crossword.state.v1"]` = `{ raw, entries }` — the raw JSON text
  of the loaded file plus entered letters; re-validated on restore.
- `localStorage["crossword.theme"]` — the theme id; falls back to
  `prefers-color-scheme: dark`.

## Samples

`scripts/build-samples.mjs` generates `english.json` (20 words, 15×15) and
`cosmos.json` (10 Russian words, 11×12) into both `public/samples/` and
`src/samples/` using seeded backtracking. Regenerate with `npm run samples`
instead of editing the JSON by hand — the generator guarantees the layout rules
above.
