import { useEffect, useMemo, useRef, useState } from 'react';
import CrosswordGrid from './components/CrosswordGrid';
import WordDialog from './components/WordDialog';
import SettingsDialog from './components/SettingsDialog';
import ClueLists from './components/ClueLists';
import Footer from './components/Footer';
import Welcome from './components/Welcome';
import ErrorDialog from './components/ErrorDialog';
import { IconX } from './components/icons';
import { PuzzleError, cellKey, normalizeAnswer, parsePuzzle, validatePuzzle } from './lib/puzzle';
import { parseCsvWords, readFileText } from './lib/csv';
import { generatePuzzle, type GridProfile } from './lib/generator';
import { clearPersistedState, loadSavedState, persistState } from './lib/storage';
import { applyTheme, loadTheme } from './themes';
import type { Direction, PlacedWord, ValidatedPuzzle } from './types';
import sampleCosmos from './samples/cosmos.json';
import sampleEnglish from './samples/english.json';

interface DialogState {
  wordId: string;
  altId: string | null;
}

interface Report {
  solvedCount: number;
  total: number;
  wrongLetters: number;
  complete: boolean;
}

export default function App() {
  const saved = useRef(loadSavedState()).current;

  const [puzzle, setPuzzle] = useState<ValidatedPuzzle | null>(() => {
    if (!saved) return null;
    try {
      return validatePuzzle(JSON.parse(saved.raw));
    } catch {
      return null;
    }
  });
  const [rawJson, setRawJson] = useState<string | null>(() => {
    if (!saved) return null;
    try {
      validatePuzzle(JSON.parse(saved.raw));
      return saved.raw;
    } catch {
      return null;
    }
  });
  const [entries, setEntries] = useState<Record<string, string>>(() => saved?.entries ?? {});

  const [theme, setTheme] = useState<string>(() => loadTheme());
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  // Words confirmed by the Check button (never computed on the fly).
  const [checkedWordIds, setCheckedWordIds] = useState<Set<string>>(new Set());
  const [answersShown, setAnswersShown] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string[] | null>(null);
  const [loadWarning, setLoadWarning] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply the theme and persist it.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Without an in-app header, the crossword title lives in the browser tab.
  useEffect(() => {
    document.title = puzzle?.meta.title ?? 'Кроссворд';
  }, [puzzle]);

  // Persist the crossword state (file + entered letters).
  useEffect(() => {
    if (puzzle && rawJson) persistState({ raw: rawJson, entries });
    else clearPersistedState();
  }, [puzzle, rawJson, entries]);

  // Auto-hide the check report.
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => setReport(null), 9000);
    return () => clearTimeout(t);
  }, [report]);

  const byId = (id: string): PlacedWord | undefined => puzzle?.words.find((w) => w.id === id);

  const isWordCorrect = (w: PlacedWord, e: Record<string, string>) =>
    w.cells.every((c, i) => (e[cellKey(c.row, c.col)] ?? '') === w.answer[i]);

  // Draft prefill: contiguous letters from the start only — a position in the
  // draft must match its position in the word, so gaps are not skipped over.
  const wordValue = (w: PlacedWord): string => {
    const letters: string[] = [];
    for (const c of w.cells) {
      const v = entries[cellKey(c.row, c.col)];
      if (!v) break;
      letters.push(v);
    }
    return letters.join('');
  };

  // Filled-word counters shown next to the clue list headings.
  const progress = useMemo(() => {
    const filled = (dir: Direction) =>
      puzzle
        ? puzzle.words.filter(
            (w) => w.direction === dir && w.cells.every((c) => entries[cellKey(c.row, c.col)]),
          ).length
        : 0;
    return { across: filled('across'), down: filled('down') };
  }, [puzzle, entries]);

  const applyLoaded = (vp: ValidatedPuzzle, raw: string) => {
    setPuzzle(vp);
    setRawJson(raw);
    setEntries({});
    setMarks({});
    setCheckedWordIds(new Set());
    setAnswersShown(false);
    setReport(null);
    setDialog(null);
    setLoadWarning(null);
  };

  // Grid shape preferences for the current device, read once per CSV load:
  // phones get a compact, slightly vertical grid, tablets a wide layout
  // with more cells across than down (targetRatio is height / width).
  const gridProfile = (): GridProfile => {
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    return shortSide < 480
      ? { maxW: 14, maxH: 26, targetRatio: 1.1 }
      : { maxW: 20, maxH: 32, targetRatio: 0.8 };
  };

  const handleFile = async (file: File) => {
    try {
      const text = await readFileText(file);
      if (/\.csv$/i.test(file.name)) {
        const words = parseCsvWords(text);
        const { puzzle, isolated } = generatePuzzle(words, gridProfile(), {
          title: file.name.replace(/\.[^.]+$/, ''),
        });
        // The generated layout is persisted as normal JSON, so progress
        // survives a restart and is restored through validatePuzzle.
        applyLoaded(validatePuzzle(puzzle), JSON.stringify(puzzle));
        if (isolated.length > 0) {
          setLoadWarning([
            `Эти слова удалось разместить без пересечений с другими: ${isolated.join(', ')}.`,
          ]);
        }
      } else {
        applyLoaded(parsePuzzle(text), text);
      }
    } catch (e) {
      setLoadError(e instanceof PuzzleError ? e.issues : [`Прочитать файл не удалось: ${String(e)}`]);
    }
  };

  const handleCellClick = (row: number, col: number) => {
    if (!puzzle) return;
    const info = puzzle.cells.get(cellKey(row, col));
    if (!info) return;
    const across = info.acrossId ? byId(info.acrossId) : undefined;
    const down = info.downId ? byId(info.downId) : undefined;
    // If two words pass through the cell, open the unconfirmed one,
    // on a tie prefer the across word.
    const pick =
      across && down
        ? checkedWordIds.has(across.id)
          ? down
          : across
        : (across ?? down);
    if (!pick) return;
    const other = pick === across ? down : across;
    setDialog({ wordId: pick.id, altId: other?.id ?? null });
    setDraft(wordValue(pick));
  };

  const openWordById = (id: string) => {
    const w = byId(id);
    if (!w || !puzzle) return;
    const startInfo = puzzle.cells.get(cellKey(w.row, w.col));
    const crossId = w.direction === 'across' ? startInfo?.downId : startInfo?.acrossId;
    setDialog({ wordId: id, altId: crossId ?? null });
    setDraft(wordValue(w));
  };

  const switchDialogWord = (id: string) => {
    const w = byId(id);
    if (!w || !dialog || !puzzle) return;
    const startInfo = puzzle.cells.get(cellKey(w.row, w.col));
    const crossId = w.direction === 'across' ? startInfo?.downId : startInfo?.acrossId;
    setDialog({ wordId: id, altId: crossId === id ? dialog.altId : (crossId ?? null) });
    setDraft(wordValue(w));
  };

  const submitWord = () => {
    if (!puzzle || !dialog) return;
    const w = byId(dialog.wordId);
    if (!w) return;
    const letters = normalizeAnswer(draft);
    const nextEntries = { ...entries };
    const changed = new Set<string>();
    // The draft covers the word from its first cell; cells past the typed
    // prefix keep their letters so crossing words are not wiped.
    w.cells.forEach((c, i) => {
      if (i >= letters.length) return;
      const k = cellKey(c.row, c.col);
      const v = letters[i];
      if ((nextEntries[k] ?? '') !== v) changed.add(k);
      nextEntries[k] = v;
    });
    setEntries(nextEntries);
    // Editing cells clears stale error marks and check highlights.
    if (changed.size > 0) {
      setMarks((prev) => {
        const next = { ...prev };
        for (const k of changed) delete next[k];
        return next;
      });
      setCheckedWordIds((prev) => {
        const next = new Set(prev);
        for (const id of prev) {
          const word = byId(id);
          if (!word || !isWordCorrect(word, nextEntries)) next.delete(id);
        }
        return next;
      });
    }
    setDialog(null);
  };

  // Clear empties the input and wipes the whole word's letters at once —
  // submit no longer erases cells past the typed prefix, so this is the
  // only way to blank a word.
  const clearWord = () => {
    if (!puzzle || !dialog) return;
    const w = byId(dialog.wordId);
    if (!w) return;
    const nextEntries = { ...entries };
    const changed = new Set<string>();
    w.cells.forEach((c) => {
      const k = cellKey(c.row, c.col);
      if (nextEntries[k]) {
        changed.add(k);
        delete nextEntries[k];
      }
    });
    setDraft('');
    if (changed.size > 0) {
      setEntries(nextEntries);
      setMarks((prev) => {
        const next = { ...prev };
        for (const k of changed) delete next[k];
        return next;
      });
      setCheckedWordIds((prev) => {
        const next = new Set(prev);
        for (const id of prev) {
          const word = byId(id);
          if (!word || !isWordCorrect(word, nextEntries)) next.delete(id);
        }
        return next;
      });
    }
  };

  const handleCheck = () => {
    if (!puzzle) return;
    const nextMarks: Record<string, boolean> = {};
    let wrongLetters = 0;
    for (const [k, info] of puzzle.cells) {
      const v = entries[k] ?? '';
      if (v && v !== info.solution) {
        nextMarks[k] = true;
        wrongLetters++;
      }
    }
    const solved = new Set<string>();
    for (const w of puzzle.words) {
      if (isWordCorrect(w, entries)) solved.add(w.id);
    }
    setMarks(nextMarks);
    setCheckedWordIds(solved);
    setReport({
      solvedCount: solved.size,
      total: puzzle.words.length,
      wrongLetters,
      complete: solved.size === puzzle.words.length && wrongLetters === 0,
    });
  };

  const dialogWord = dialog ? byId(dialog.wordId) : undefined;
  const dialogAlt = dialog?.altId ? byId(dialog.altId) : undefined;

  return (
    <div className="app">
      <main className="main">
        {!puzzle ? (
          <Welcome
            onOpen={() => fileInputRef.current?.click()}
            onSampleCosmos={() => {
              const raw = JSON.stringify(sampleCosmos, null, 2);
              applyLoaded(validatePuzzle(sampleCosmos), raw);
            }}
            onSampleEnglish={() => {
              const raw = JSON.stringify(sampleEnglish, null, 2);
              applyLoaded(validatePuzzle(sampleEnglish), raw);
            }}
          />
        ) : (
          <>
            <CrosswordGrid
              puzzle={puzzle}
              entries={entries}
              marks={marks}
              checkedWordIds={checkedWordIds}
              activeWordId={dialog?.wordId ?? null}
              showAnswers={answersShown}
              onCellClick={handleCellClick}
            />

            {report && (
              <div className={`report${report.complete ? ' complete' : ''}`} role="status">
                <span className="report-text">
                  {report.complete
                    ? '🎉 Всё верно! Кроссворд решён полностью.'
                    : `Верно заполнено слов: ${report.solvedCount} из ${report.total}.` +
                      (report.wrongLetters > 0
                        ? ` Ошибочных букв: ${report.wrongLetters} (выделены красным).`
                        : ' Ошибок в заполненных клетках нет.')}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setReport(null)}
                  aria-label="Скрыть"
                >
                  <IconX size={18} />
                </button>
              </div>
            )}

            <ClueLists
              puzzle={puzzle}
              checkedWordIds={checkedWordIds}
              activeWordId={dialog?.wordId ?? null}
              filled={progress}
              onPick={openWordById}
            />
          </>
        )}
      </main>

      <Footer
        hasPuzzle={puzzle !== null}
        answersShown={answersShown}
        onNew={() => fileInputRef.current?.click()}
        onCheck={handleCheck}
        onToggleAnswers={() => setAnswersShown((v) => !v)}
        onSettings={() => setSettingsOpen(true)}
      />

      {dialog && dialogWord && (
        <WordDialog
          word={dialogWord}
          altWord={dialogAlt ?? null}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submitWord}
          onClear={clearWord}
          onClose={() => setDialog(null)}
          onSwitchWord={switchDialogWord}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onThemeChange={setTheme}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {loadError && <ErrorDialog issues={loadError} onClose={() => setLoadError(null)} />}

      {loadWarning && (
        <ErrorDialog
          title="Обратите внимание"
          issues={loadWarning}
          onClose={() => setLoadWarning(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
