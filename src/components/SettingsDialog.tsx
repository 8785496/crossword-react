import { useEffect } from 'react';
import { IconX } from './icons';
import { THEMES } from '../themes';

interface Props {
  theme: string;
  onThemeChange: (id: string) => void;
  onClose: () => void;
}

export default function SettingsDialog({ theme, onThemeChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Настройки">
        <div className="dialog-head">
          <h2>Настройки</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <IconX size={18} />
          </button>
        </div>

        <h3 className="settings-subtitle">Цветовая тема</h3>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card${theme === t.id ? ' active' : ''}`}
              onClick={() => onThemeChange(t.id)}
              aria-pressed={theme === t.id}
            >
              <span className="swatch-row">
                {t.swatch.map((color, i) => (
                  <span key={i} className="swatch-dot" style={{ background: color }} />
                ))}
              </span>
              <span className="theme-name">
                {t.name}
                {theme === t.id && <span className="theme-check">✓</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
