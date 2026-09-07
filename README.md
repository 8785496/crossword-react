# Crossword (React + PWA)

A crossword app for tablets in portrait orientation. It installs as a PWA and
works offline. The crossword is built from a word list that the user opens
with the **New** button — a CSV or XLSX file where the first column is the
word and the second column is the question; the grid is generated on the
device.

## Features

- 📱 Portrait layout for tablets, installable as a PWA (Chrome/Edge: "Install app"), works offline
- 📂 The **New** button opens a word list — CSV or XLSX (column 1 = word,
  column 2 = question) — and builds the grid automatically, tuned to the
  screen (taller and narrower on phones)
- ✅ The **Check** button marks wrong letters in red and shows a report; checked words stay highlighted in green
- 👁 The **Show answers** button reveals the full solution; pressing it again hides it
- 📊 Filled-word counters sit next to the across/down clue headings (there is no header above the grid — the puzzle title lives in the browser tab)
- ⚙️ The **Settings** button offers 6 color themes (light, dark, paper, ocean, contrast, rose); the choice is persisted
- 💬 Clicking a cell or a clue opens a dialog for entering the whole word; if two words pass through the cell, the direction can be switched with a chip
- 💾 The current crossword, entered letters, and theme are stored in `localStorage` — everything is restored after a restart
- 🔢 Word numbers are computed automatically using standard crossword numbering rules

## Getting started

```bash
npm install
npm run dev        # development: http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # preview of the build: http://localhost:4173
npm run test       # unit tests (Vitest) for the lib/ modules
npm run samples    # regenerate the sample crosswords
npm run icons      # regenerate the PWA icons
```

The PWA (service worker, home-screen install, offline support) works in the
production build — open `npm run preview` or host `dist/` on any HTTPS origin.

## Word lists (CSV / XLSX)

The **New** button accepts a plain two-column word list: **first column —
the answer word, second column — the question**. The app generates the
crossword grid itself at load time and then treats it exactly like a
ready-made puzzle (check, reveal, persistence).

Shared rules:

- An optional header row («Слово»/«Вопрос», «Word»/«Question», …) is detected
  and skipped; a row whose word cell has fewer than two letters (e.g. «№»)
  is treated as a header too.
- Words are normalized: uppercase, `Ё` → `Е`, letters only (spaces and
  hyphens are dropped), minimum length 2. Duplicate words are an error, as is
  a row without a question.
- Limits: at most 60 words, a word is at most 60 letters.
- The puzzle title is the file name without the extension.

CSV specifics:

- Delimiters `;`, `,`, and tab are auto-detected per file; fields may be quoted
  with `"` (a doubled `""` is an escape), so questions may contain commas and
  newlines. If a question contains a bare delimiter in a hand-written file,
  the extra columns are glued back into the question.
- Encoding: UTF-8 (with or without BOM) or Windows-1251 (the Excel default for
  Cyrillic locales).

XLSX specifics:

- Only the **first worksheet** of the book is read; the second column (plus
  any extra columns, glued with spaces) forms the question.
- Shared strings, inline strings and literal values (numbers, formula
  results) are read as their text; encrypted (password-protected) files are
  rejected with a clear error.
- The file is unpacked and parsed in the browser with hand-rolled
  `src/lib/zip.ts` + `src/lib/xml.ts` — the project has no runtime
  dependencies.

The grid is generated on the device: phones (short side < 480 px) get a narrow,
vertically elongated grid targeting a height ≈ 1.5 × width; other screens
target ≈ 1.2. The same file always produces the same layout — the RNG is
seeded from the word list. Words that cannot cross anything are placed
standalone (which the contract allows) and reported in a notice after loading.
The generated layout is stored as JSON, so progress survives a restart and is
independent of later screen-size changes.

## Puzzle contract (generated JSON)

Internally a crossword is a single JSON object — this is what the generator
emits, what the bundled samples contain, and what `localStorage` persists.
It is validated on load by `src/lib/puzzle.ts`; if there are problems, a list
of concrete issues is shown (letter conflicts, out-of-bounds words, touching
words, etc.) and the crossword is not loaded.

```json
{
  "version": "1.0",
  "meta": {
    "title": "English Vocabulary",
    "author": "…",
    "language": "en"
  },
  "grid": { "width": 15, "height": 15 },
  "words": [
    {
      "id": "1a",
      "answer": "COURTHOUSE",
      "clue": "The place where legal trials take place and a judge works",
      "row": 1,
      "col": 1,
      "direction": "across"
    }
  ]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `version` | string? | Format version, currently `"1.0"` |
| `meta.title` | string? | Crossword title (shown in the browser tab) |
| `meta.author`, `meta.language` | string? | Metadata |
| `grid.width` | 2–40 | Grid width in cells |
| `grid.height` | 2–60 | Grid height in cells |
| `words[]` | array | The crossword words (at least one) |

Word fields: `answer` (letters only, ≥ 2, case-insensitive, `Ё` counts as
`Е`), `clue`, `row`/`col` — 1-based coordinates of the **first** letter,
`direction` (`"across"` \| `"down"`), optional `id`.

Layout rules enforced by validation:

- `across`: `col + length − 1 ≤ grid.width`; `down`: `row + length − 1 ≤ grid.height`
- Letters must match at every intersection
- Words in the same direction must not overlap, touch, or merge into one line
- A `number` field is not needed — numbering is computed automatically
  (in reading order; a cell where words of both directions start gets a
  single shared number)

### Samples

Two examples are bundled from `src/samples/` and offered on the welcome
screen:

- `english.json` — 20 words from the reference screenshot, a 15×15 grid
- `cosmos.json` — "Space", 10 Russian words, an 11×12 grid

Regenerate them with `npm run samples`.

## Project structure

```
src/
  types.ts               # Puzzle contract (types)
  lib/puzzle.ts          # Parsing, validation, numbering
  lib/csv.ts             # CSV word-list parsing (delimiters, encodings)
  lib/xlsx.ts            # XLSX word-list parsing (first worksheet)
  lib/zip.ts             # Minimal ZIP reader (stored + deflate entries)
  lib/xml.ts             # Minimal XML parser for the xlsx parts
  lib/generator.ts       # Grid generation from a word list
  lib/storage.ts         # Persisting state to localStorage
  lib/*.test.ts          # Unit tests for the lib modules (Vitest)
  themes.ts              # Theme list, applying themes
  components/
    CrosswordGrid.tsx    # The grid (CSS Grid, container queries)
    WordDialog.tsx       # Whole-word entry dialog
    SettingsDialog.tsx   # Settings: theme picker
    ClueLists.tsx        # Clue lists (across / down)
    Footer.tsx           # Footer: New / Check / Settings
    Welcome.tsx          # Welcome screen
    ErrorDialog.tsx      # Load errors and post-load notices
  App.tsx                # App state and logic
scripts/
  build-samples.mjs      # Sample generator (backtracking search)
  generate-icons.mjs     # PWA icons (PNG without dependencies)
  verify-csv.mjs         # CSV/XLSX -> generate -> validate checks
public/
  manifest.webmanifest   # PWA manifest (portrait, standalone)
  sw.js                  # Service worker (cache + offline)
  icons/                 # Icons 180/192/512 + maskable
```
