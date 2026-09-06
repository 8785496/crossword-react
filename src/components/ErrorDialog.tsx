import { IconX } from './icons';

interface Props {
  issues: string[];
  onClose: () => void;
}

export default function ErrorDialog({ issues, onClose }: Props) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Ошибка загрузки">
        <div className="dialog-head">
          <h2>Не удалось открыть файл</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <IconX size={18} />
          </button>
        </div>
        <ul className="error-list">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
