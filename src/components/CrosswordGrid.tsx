import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ValidatedPuzzle } from '../types';
import { cellKey } from '../lib/puzzle';

interface Props {
  puzzle: ValidatedPuzzle;
  entries: Record<string, string>;
  marks: Record<string, boolean>;
  checkedWordIds: Set<string>;
  activeWordId: string | null;
  /** Показывать правильные буквы во всех клетках (режим «Показать ответы»). */
  showAnswers: boolean;
  onCellClick: (row: number, col: number) => void;
}

export default function CrosswordGrid({
  puzzle,
  entries,
  marks,
  checkedWordIds,
  activeWordId,
  showAnswers,
  onCellClick,
}: Props) {
  const activeCells = useMemo(() => {
    const set = new Set<string>();
    const word = puzzle.words.find((w) => w.id === activeWordId);
    if (word) for (const c of word.cells) set.add(cellKey(c.row, c.col));
    return set;
  }, [puzzle, activeWordId]);

  const checkedCells = useMemo(() => {
    const set = new Set<string>();
    for (const w of puzzle.words) {
      if (!checkedWordIds.has(w.id)) continue;
      for (const c of w.cells) set.add(cellKey(c.row, c.col));
    }
    return set;
  }, [puzzle, checkedWordIds]);

  const style = { '--gw': puzzle.width, '--gh': puzzle.height } as CSSProperties;

  const rows = [];
  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      const key = cellKey(r, c);
      const info = puzzle.cells.get(key);
      const pos = { gridRow: r + 1, gridColumn: c + 1 };
      if (!info) {
        rows.push(<div key={key} className="cell-void" style={pos} />);
        continue;
      }
      const cls = ['cell'];
      if (activeCells.has(key)) cls.push('active');
      // В режиме показа ответов подсветка «верно/ошибочно» скрывается.
      if (showAnswers) cls.push('revealed');
      else if (marks[key]) cls.push('wrong');
      else if (checkedCells.has(key)) cls.push('solved');
      rows.push(
        <button
          key={key}
          type="button"
          className={cls.join(' ')}
          style={pos}
          onClick={() => onCellClick(r, c)}
          aria-label={`Строка ${r + 1}, столбец ${c + 1}`}
        >
          {info.number !== undefined && <span className="cell-number">{info.number}</span>}
          <span className="cell-letter">{showAnswers ? info.solution : entries[key] || '\u00A0'}</span>
        </button>,
      );
    }
  }

  return (
    <div className="grid-wrap">
      <div className="crossword-grid" style={style} role="grid" aria-label="Сетка кроссворда">
        {rows}
      </div>
    </div>
  );
}
