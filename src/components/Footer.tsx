import type { ReactNode } from 'react';
import {
  IconCheckCircle,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconGear,
  IconHistory,
} from './icons';

interface Props {
  hasPuzzle: boolean;
  answersShown: boolean;
  /** Сколько кроссвордов лежит в истории; 0 — кнопка неактивна. */
  historyCount: number;
  onNew: () => void;
  onHistory: () => void;
  onCheck: () => void;
  onToggleAnswers: () => void;
  onSettings: () => void;
}

interface ButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function FooterButton({ icon, label, onClick, disabled, active }: ButtonProps) {
  return (
    <button
      type="button"
      className={`footer-btn${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="footer-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function Footer({
  hasPuzzle,
  answersShown,
  historyCount,
  onNew,
  onHistory,
  onCheck,
  onToggleAnswers,
  onSettings,
}: Props) {
  return (
    <footer className="footer">
      <FooterButton icon={<IconFolder />} label="Новый" onClick={onNew} />
      <FooterButton
        icon={<IconHistory />}
        label="История"
        onClick={onHistory}
        disabled={historyCount === 0}
      />
      <FooterButton
        icon={<IconCheckCircle />}
        label="Проверить"
        onClick={onCheck}
        disabled={!hasPuzzle}
      />
      <FooterButton
        icon={answersShown ? <IconEyeOff /> : <IconEye />}
        label={answersShown ? 'Скрыть' : 'Ответы'}
        onClick={onToggleAnswers}
        disabled={!hasPuzzle}
        active={answersShown}
      />
      <FooterButton icon={<IconGear />} label="Настройки" onClick={onSettings} />
    </footer>
  );
}
