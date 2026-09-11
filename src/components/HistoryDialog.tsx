import { useEffect, useMemo } from 'react';
import { IconRotateCcw, IconTrash, IconX } from './icons';
import { cellKey, validatePuzzle } from '../lib/puzzle';
import type { HistoryEntry } from '../lib/storage';

interface Props {
  items: HistoryEntry[];
  /** id записи кроссворда, открытого сейчас, — она помечается в списке. */
  currentId: string | null;
  onOpen: (entry: HistoryEntry) => void;
  /** Открыть кроссворд заново: создаёт пустую копию записи. */
  onRestart: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return `Сегодня, ${time}`;
  if (days === 1) return `Вчера, ${time}`;
  return `${d.toLocaleDateString('ru-RU')}, ${time}`;
}

export default function HistoryDialog({
  items,
  currentId,
  onOpen,
  onRestart,
  onDelete,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Progress per entry: the stored raw is re-validated so a damaged record
  // degrades to a label instead of crashing the dialog.
  // Newest changes first; the date only moves when a crossword's letters do.
  const views = useMemo(
    () =>
      items
        .map((entry) => {
          const current = entry.id === currentId;
          const suffix = current ? ' · сейчас открыт' : ` · ${formatDate(entry.savedAt)}`;
          try {
            const vp = validatePuzzle(JSON.parse(entry.raw));
            let solved = 0;
            for (const w of vp.words) {
              if (
                w.cells.every(
                  (c, i) => (entry.entries[cellKey(c.row, c.col)] ?? '') === w.answer[i],
                )
              ) {
                solved++;
              }
            }
            return {
              entry,
              current,
              label: `Решено ${solved} из ${vp.words.length}${suffix}`,
            };
          } catch {
            return { entry, current, label: `Запись повреждена${suffix}` };
          }
        })
        .sort((a, b) => b.entry.savedAt - a.entry.savedAt),
    [items, currentId],
  );

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="История">
        <div className="dialog-head">
          <h2>История</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <IconX size={18} />
          </button>
        </div>
        {views.length === 0 ? (
          <p className="history-empty">
            История пуста: здесь появятся кроссворды, открытые ранее.
          </p>
        ) : (
          <ul className="history-list">
            {views.map(({ entry, current, label }) => (
              <li key={entry.raw} className="history-item">
                <button
                  type="button"
                  className={`history-open${current ? ' current' : ''}`}
                  onClick={() => onOpen(entry)}
                >
                  <span className="history-title">
                    {entry.title.trim() !== '' ? entry.title : 'Без названия'}
                  </span>
                  <span className="history-meta">{label}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn history-action"
                  onClick={() => onRestart(entry)}
                  aria-label="Начать заново"
                  title="Начать заново"
                >
                  <IconRotateCcw size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn history-action"
                  onClick={() => onDelete(entry)}
                  aria-label="Удалить из истории"
                  title="Удалить из истории"
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
