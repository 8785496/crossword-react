# Crossword (React + PWA)

A crossword app for tablets in portrait orientation. It installs as a PWA and
works offline. The crossword is built from a JSON file that the user opens with
the **New** button.

## Features

- 📱 Portrait layout for tablets, installable as a PWA (Chrome/Edge: "Install app"), works offline
- 📂 The **New** button opens a JSON file with a crossword — or a CSV word list
  (column 1 = word, column 2 = question) and builds the grid automatically,
  tuned to the screen (taller and narrower on phones)
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

## JSON contract

A crossword is described by a single JSON file:

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

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `version` | string? | Format version, currently `"1.0"` |
| `meta.title` | string? | Crossword title (shown in the header) |
| `meta.author`, `meta.language` | string? | Metadata |
| `grid.width` | 2–40 | Grid width in cells |
| `grid.height` | 2–60 | Grid height in cells |
| `words[]` | array | The crossword words (at least one) |

### Word fields

| Field | Type | Description |
| --- | --- | --- |
| `answer` | string | The answer: letters only, at least 2; case-insensitive, `Ё` counts as `Е`, no spaces or hyphens |
| `clue` | string | The question/hint, shown in the dialog and in the clue lists |
| `row` | ≥ 1 | Row of the **first** letter (counted from the top, 1-based) |
| `col` | ≥ 1 | Column of the **first** letter (counted from the left, 1-based) |
| `direction` | `"across"` \| `"down"` | Horizontal / vertical |
| `id` | string? | Arbitrary identifier; assigned automatically if missing |

### Layout rules

- `across`: `col + length − 1 ≤ grid.width`; `down`: `row + length − 1 ≤ grid.height`
- Letters must match at every intersection
- Words in the same direction must not overlap, touch, or merge into one line
- A `number` field is not needed in the file — numbering is computed
  automatically (in reading order; a cell where words of both directions start
  gets a single shared number)

The file is validated on open: if there are problems, a list of concrete issues
is shown (letter conflicts, out-of-bounds words, touching words, etc.) and the
crossword is not loaded.

## CSV word lists

Instead of a ready-made JSON crossword, the **New** button also accepts a CSV
file with a plain word list: **first column — the answer word, second column —
the question**. The app generates the crossword grid itself at load time and
then treats it exactly like a JSON crossword (check, reveal, persistence).

Rules:

- Delimiters `;`, `,`, and tab are auto-detected per file; fields may be quoted
  with `"` (a doubled `""` is an escape), so questions may contain commas and
  newlines. If a question contains a bare delimiter in a hand-written file,
  the extra columns are glued back into the question.
- Encoding: UTF-8 (with or without BOM) or Windows-1251 (the Excel default for
  Cyrillic locales).
- An optional header row («Слово»/«Вопрос», «Word»/«Question», …) is detected
  and skipped; a row whose word cell has fewer than two letters (e.g. «№»)
  is treated as a header too.
- Words are normalized like JSON answers: uppercase, `Ё` → `Е`, letters only
  (spaces and hyphens are dropped), minimum length 2. Duplicate words are an
  error, as is a row without a question.
- Limits: at most 60 words, a word is at most 60 letters.
- The puzzle title is the file name without the extension.

The grid is generated on the device: phones (short side < 480 px) get a narrow,
vertically elongated grid targeting a height ≈ 1.5 × width; other screens
target ≈ 1.2. The same file always produces the same layout — the RNG is
seeded from the word list. Words that cannot cross anything are placed
standalone (which the contract allows) and reported in a notice after loading.
The generated layout is stored like a JSON file, so progress survives
a restart and is independent of later screen-size changes.

### Samples

Ready-made files live in `public/samples/` (they can be opened in the app) and
are copied into `src/samples/` (bundled as examples on the welcome screen):

- `english.json` — 20 words from the reference screenshot, a 15×15 grid
- `cosmos.json` — "Space", 10 Russian words, an 11×12 grid

## Project structure

```
src/
  types.ts               # JSON contract (types)
  lib/puzzle.ts          # Parsing, validation, numbering
  lib/csv.ts             # CSV word-list parsing (delimiters, encodings)
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
public/
  manifest.webmanifest   # PWA manifest (portrait, standalone)
  sw.js                  # Service worker (cache + offline)
  icons/                 # Icons 180/192/512 + maskable
```
