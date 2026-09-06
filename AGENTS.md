# AGENTS.md

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
npm run test       # unit tests (Vitest) for the lib/ modules
npm run test:watch # unit tests in watch mode
npm run verify     # node checks for the CSV/generator pipeline (uses esbuild
                   # from Vite's dependencies; no extra installs)
```

Unit tests live next to the sources as `src/lib/*.test.ts` (puzzle
validation, CSV parsing, grid generation, storage); there is no React
component testing. The minimum verification bar is a clean
`npm run build`, `npm run test`, `npm run verify` (covers CSV parsing and
grid generation end to end, including contract validation of every generated
layout), plus manually loading a sample in `npm run preview` (grid renders,
word dialog opens, Check marks wrong letters). CI runs test + verify + build
on every push to `main`.

## Deployment

Pushes to `main` build and deploy to GitHub Pages via
`.github/workflows/deploy.yml`. `vite.config.ts` sets `base: './'` so the
bundle works from a project subpath — keep it relative. The PWA needs HTTPS
(or `npm run preview`), not the plain dev server.

## Architecture

Data flow: a JSON file (or a bundled sample) → `parsePuzzle` / `validatePuzzle`
in `src/lib/puzzle.ts` → a `ValidatedPuzzle` (`words` + a `cells` map keyed by
`"row:col"`, 0-based) → `CrosswordGrid`. Entered letters live in
`App.tsx` state as `entries: Record<"row:col", letter>`.

CSV word lists take a different front path: `src/lib/csv.ts` parses the file
(words + clues, per-line errors) → `src/lib/generator.ts` places the words and
emits a contract JSON → that JSON goes through the normal `validatePuzzle`
path and is persisted as `raw`, so restore/check/persistence are unchanged.

- `src/lib/puzzle.ts` — the single source of truth for contract validation and automatic numbering.
- `src/lib/csv.ts` — CSV parsing: delimiter sniffing (`;` `,` tab), quoted
  fields, UTF-8 with a Windows-1251 fallback, header-row detection, errors by
  line number.
- `src/lib/generator.ts` — runtime grid generation: backtracking search
  ported from `scripts/build-samples.mjs` with an incremental placement-validity
  check (cell keys are `cellKey()` "r:c" everywhere — do not mix in "r,c").
  The RNG is seeded from the word list (same file → same grid). Layout scoring
  targets a device-specific height/width ratio from `GridProfile`
  (`src/App.tsx` `gridProfile()`: phone short side < 480 px → maxW 14,
  target ratio 1.1; else maxW 20, target ratio 0.8 — a ratio below 1 means
  the grid is wider than tall). If no
  fully crossing layout exists, a relaxed pass places leftover words
  standalone (one-cell moat); `generatePuzzle` returns them as `isolated` and
  App shows them in a notice dialog. Time budget: 3 s safety net; attempt
  counts shrink with word count.
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
- `ErrorDialog` doubles as the post-load notice dialog: pass `title`
  (e.g. «Обратите внимание» for the isolated-words warning) and keep the
  Russian strings.
- The file input accepts `.json` and `.csv`; `handleFile` branches on the
  file extension. Non-CSV files keep the raw text as `raw`; CSV loads store
  the generated JSON instead.

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
