import { useEffect, useRef } from 'react';
import type { PlacedWord } from '../types';
import { cellKey, displayClue } from '../lib/puzzle';

interface Props {
  word: PlacedWord;
  /** The crossing word in the same cell (for switching direction). */
  altWord: PlacedWord | null;
  /** Entered letters by cell key — crossing letters shown in the slots. */
  entries: Record<string, string>;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onClose: () => void;
  onSwitchWord: (id: string) => void;
}

function clean(value: string): string {
  return value
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[^A-ZА-Я]/g, '');
}

export default function WordDialog({
  word,
  altWord,
  entries,
  draft,
  onDraftChange,
  onSubmit,
  onClear,
  onClose,
  onSwitchWord,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Continue typing after the prefilled prefix, not at position 0.
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }, 60);
    return () => clearTimeout(t);
  }, [word.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const letters = clean(draft);
  // Each slot shows the typed letter, falling back to the letter already in
  // the cell from a crossing word. When both exist they always agree or the
  // input would overwrite the crossing on submit — so flag it right away.
  const slots = Array.from({ length: word.answer.length }, (_, i) => {
    const cell = word.cells[i];
    const inCell = (cell && entries[cellKey(cell.row, cell.col)]) || '';
    const typed = letters[i] ?? '';
    const state = typed && inCell ? (typed === inCell ? ' solved' : ' wrong') : '';
    return { ch: typed || inCell, state };
  });

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Ввод слова №${word.number}`}>
        <div className="word-switch">
          <span className="chip chip-active">
            №{word.number} {word.direction === 'across' ? '→' : '↓'}
          </span>
          {altWord && (
            <button
              type="button"
              className="chip chip-btn"
              onClick={() => onSwitchWord(altWord.id)}
              title={displayClue(altWord.clue)}
            >
              №{altWord.number} {altWord.direction === 'across' ? '→' : '↓'}
            </button>
          )}
        </div>

        <div className="dialog-meta">
          {word.direction === 'across' ? 'По горизонтали' : 'По вертикали'} · {word.answer.length}{' '}
          {plural(word.answer.length)}
        </div>
        <p className="dialog-clue">{displayClue(word.clue)}</p>

        <div className="slots" aria-hidden="true">
          {slots.map((s, i) => (
            <span key={i} className={`slot${s.ch ? ' filled' : ''}${s.state}`}>
              {s.ch || '\u00A0'}
            </span>
          ))}
        </div>

        <input
          ref={inputRef}
          className="word-input"
          value={draft}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={word.answer.length}
          placeholder="Введите слово целиком"
          onChange={(e) => onDraftChange(clean(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
        />

        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClear}>
            Очистить
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn primary" onClick={onSubmit}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function plural(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'буква';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'буквы';
  return 'букв';
}
