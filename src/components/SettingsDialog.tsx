import { useEffect, useRef, useState } from 'react';
import { IconX } from './icons';
import { THEMES } from '../themes';
import {
  clearHistory,
  clearPersistedState,
  GENERATOR_LIMITS,
  type GeneratorSettings,
} from '../lib/storage';

interface Props {
  theme: string;
  onThemeChange: (id: string) => void;
  generator: GeneratorSettings;
  onGeneratorChange: (settings: GeneratorSettings) => void;
  /** Есть ли загруженный кроссворд, который можно пересобрать. */
  canRegenerate: boolean;
  onRegenerate: () => void;
  onClose: () => void;
}

type Tab = 'basic' | 'advanced';
type GeneratorField = keyof GeneratorSettings;

const TABS: { id: Tab; label: string }[] = [
  { id: 'basic', label: 'Основные' },
  { id: 'advanced', label: 'Продвинутые' },
];

export default function SettingsDialog({
  theme,
  onThemeChange,
  generator,
  onGeneratorChange,
  canRegenerate,
  onRegenerate,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('basic');
  // «Очистить кеш» wipes history and progress, so it asks first.
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Regeneration is a synchronous search that can hold the main thread for
  // seconds: flip the button first and give the browser a frame to paint it.
  const [regenLoading, setRegenLoading] = useState(false);
  const regenTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (regenTimer.current !== null) clearTimeout(regenTimer.current);
    },
    [],
  );

  const handleRegenerate = () => {
    if (regenLoading) return;
    setRegenLoading(true);
    regenTimer.current = window.setTimeout(() => {
      regenTimer.current = null;
      onRegenerate();
      setRegenLoading(false);
    }, 50);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape dismisses only the confirmation while it is open.
        if (confirmingClear) setConfirmingClear(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmingClear]);

  // Drop every cached asset and the service worker itself, reset the solving
  // progress and reload: the app then starts from the welcome screen. The
  // theme and generator settings are preferences, not progress, so they
  // survive the reset.
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
      clearHistory();
    } catch {
      /* best effort: reload anyway */
    }
    window.location.reload();
  };

  const patch = (field: GeneratorField, value: number | null) =>
    onGeneratorChange({ ...generator, [field]: value });

  // While typing, the raw value is kept (clamping mid-input would fight the
  // user typing "25" into a min-5 field); the limits are enforced when the
  // field loses focus. Empty or unparseable input means «automatic».
  const setNumber = (field: GeneratorField) => (value: string) => {
    const n = Number(value);
    patch(field, value.trim() === '' || !Number.isFinite(n) ? null : Math.round(n));
  };

  const blurNumber = (field: GeneratorField) => () => {
    const current = generator[field];
    if (current === null) return;
    const { min, max } = GENERATOR_LIMITS[field];
    patch(field, Math.min(max, Math.max(min, current)));
  };

  const outOfRange = (field: GeneratorField) => {
    const v = generator[field];
    if (v === null) return false;
    const { min, max } = GENERATOR_LIMITS[field];
    return v < min || v > max;
  };

  const numberField = (id: string, label: string, field: GeneratorField) => (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`settings-input${outOfRange(field) ? ' invalid' : ''}`}
        type="number"
        inputMode="numeric"
        min={GENERATOR_LIMITS[field].min}
        max={GENERATOR_LIMITS[field].max}
        placeholder="авто"
        aria-invalid={outOfRange(field)}
        value={generator[field] ?? ''}
        onChange={(e) => setNumber(field)(e.target.value)}
        onBlur={blurNumber(field)}
      />
    </div>
  );

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

        <div className="settings-tabs" role="tablist" aria-label="Разделы настроек">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'basic' ? (
          <>
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
            <button
              type="button"
              className="btn ghost settings-wide-btn"
              onClick={() => setConfirmingClear(true)}
            >
              Очистить кеш
            </button>
            <p className="settings-hint">
              Сбрасывает кеш приложения, историю кроссвордов и прогресс решения, после
              перезагрузки открывается начальный экран. Тема оформления сохраняется.
            </p>
          </>
        ) : (
          <>
            <h3 className="settings-subtitle">Генерация кроссворда</h3>
            {numberField('set-max-w', 'Ширина сетки, клеток', 'maxW')}
            {numberField('set-max-h', 'Высота сетки, клеток', 'maxH')}
            {numberField('set-attempts', 'Попыток генерации', 'attempts')}

            <div className="settings-actions">
              <button
                type="button"
                className={`btn primary settings-wide-btn${regenLoading ? ' loading' : ''}`}
                disabled={!canRegenerate || regenLoading}
                onClick={handleRegenerate}
              >
                {regenLoading && <span className="btn-spinner" aria-hidden="true" />}
                {regenLoading ? 'Собираю…' : 'Обновить кроссворд'}
              </button>
              <button
                type="button"
                className="btn ghost settings-wide-btn"
                onClick={() => onGeneratorChange({ maxW: null, maxH: null, attempts: null })}
              >
                Вернуть автоматику
              </button>
            </div>
            <p className="settings-hint">
              Пустое поле — подобрать автоматически под экран. «Обновить кроссворд» строит
              новую сетку из тех же слов с этими настройками; введённые буквы сбрасываются.
            </p>
          </>
        )}
      </div>

      {confirmingClear && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmingClear(false);
          }}
        >
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Очистить кеш?">
            <div className="dialog-head">
              <h2>Очистить кеш?</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setConfirmingClear(false)}
                aria-label="Закрыть"
              >
                <IconX size={18} />
              </button>
            </div>
            <p className="dialog-text">
              История кроссвордов и прогресс решения будут удалены без возможности
              восстановления.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmingClear(false)}>
                Отмена
              </button>
              <button type="button" className="btn primary" onClick={clearCache}>
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
