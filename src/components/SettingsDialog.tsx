import { useEffect } from 'react';
import { IconX } from './icons';
import { THEMES } from '../themes';
import { clearPersistedState } from '../lib/storage';

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

  // Drop every cached asset and the service worker itself, reset the solving
  // progress and reload: the app then starts from the welcome screen. The
  // theme is a preference, not progress, so it survives the reset.
  const clearCache = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      clearPersistedState();
    } catch {
      /* best effort: reload anyway */
    }
    window.location.reload();
  };

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

        <h3 className="settings-subtitle">Приложение</h3>
        <button type="button" className="btn ghost settings-cache-btn" onClick={clearCache}>
          Очистить кеш
        </button>
        <p className="settings-hint">
          Сбрасывает кеш приложения и прогресс решения, после перезагрузки открывается начальный
          экран. Тема оформления сохраняется.
        </p>
      </div>
    </div>
  );
}
