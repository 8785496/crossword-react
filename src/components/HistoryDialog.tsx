import { useEffect, useMemo } from 'react';
import { IconTrash, IconX } from './icons';
import { cellKey, validatePuzzle } from '../lib/puzzle';
import type { HistoryEntry } from '../lib/storage';

interface Props {
  items: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
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

export default function HistoryDialog({ items, onOpen, onDelete, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Progress per entry: the stored raw is re-validated so a damaged record
  // degrades to a label instead of crashing the dialog.
  const views = useMemo(
    () =>
      items.map((entry) => {
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
            ok: true,
            label: `Решено ${solved} из ${vp.words.length} · ${formatDate(entry.savedAt)}`,
          };
        } catch {
          return { entry, ok: false, label: 'Запись повреждена' };
        }
      }),
    [items],
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
            {views.map(({ entry, label }) => (
              <li key={entry.raw} className="history-item">
                <button type="button" className="history-open" onClick={() => onOpen(entry)}>
                  <span className="history-title">
                    {entry.title.trim() !== '' ? entry.title : 'Без названия'}
                  </span>
                  <span className="history-meta">{label}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn history-delete"
                  onClick={() => onDelete(entry)}
                  aria-label="Удалить из истории"
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
