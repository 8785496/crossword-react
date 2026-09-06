import type { ValidatedPuzzle } from '../types';
import { compareByNumber } from '../lib/puzzle';

interface Props {
  puzzle: ValidatedPuzzle;
  checkedWordIds: Set<string>;
  activeWordId: string | null;
  /** Заполненных слов по направлениям. */
  filled: { across: number; down: number };
  onPick: (id: string) => void;
}

export default function ClueLists({ puzzle, checkedWordIds, activeWordId, filled, onPick }: Props) {
  const across = puzzle.words.filter((w) => w.direction === 'across').sort(compareByNumber);
  const down = puzzle.words.filter((w) => w.direction === 'down').sort(compareByNumber);

  return (
    <div className="clue-columns">
      <ClueSection
        title="По горизонтали"
        words={across}
        filled={filled.across}
        checkedWordIds={checkedWordIds}
        activeWordId={activeWordId}
        onPick={onPick}
      />
      <ClueSection
        title="По вертикали"
        words={down}
        filled={filled.down}
        checkedWordIds={checkedWordIds}
        activeWordId={activeWordId}
        onPick={onPick}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  words: ValidatedPuzzle['words'];
  filled: number;
  checkedWordIds: Set<string>;
  activeWordId: string | null;
  onPick: (id: string) => void;
}

function ClueSection({ title, words, filled, checkedWordIds, activeWordId, onPick }: SectionProps) {
  if (words.length === 0) return null;
  return (
    <section className="clue-section">
      <div className="clue-head">
        <h3>{title}</h3>
        <span className="clue-progress" title="Заполнено слов">
          {filled}/{words.length}
        </span>
      </div>
      {words.map((w) => {
        const checked = checkedWordIds.has(w.id);
        const cls = ['clue'];
        if (checked) cls.push('solved');
        if (w.id === activeWordId) cls.push('active');
        return (
          <button key={w.id} type="button" className={cls.join(' ')} onClick={() => onPick(w.id)}>
            <span className="clue-num">{w.number}</span>
            <span className="clue-text">{w.clue}</span>
            <span className="clue-len">
              {checked ? '✓ ' : ''}
              {w.answer.length}
            </span>
          </button>
        );
      })}
    </section>
  );
}
