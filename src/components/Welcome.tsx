import { IconPuzzle } from './icons';

interface Props {
  onOpen: () => void;
  onSampleCosmos: () => void;
  onSampleEnglish: () => void;
}

export default function Welcome({ onOpen, onSampleCosmos, onSampleEnglish }: Props) {
  return (
    <div className="welcome">
      <div className="welcome-icon" aria-hidden="true">
        <IconPuzzle size={56} />
      </div>
      <h2>Кроссворд</h2>
      <p>
        Откройте файл JSON с кроссвордом — вопросы, ответы и расположение слов задаются в нём.
        Подходит любой файл по контракту (см. README проекта).
      </p>
      <button type="button" className="btn primary big" onClick={onOpen}>
        📂 Открыть файл JSON
      </button>
      <div className="welcome-samples">
        <span>Или попробуйте готовый пример:</span>
        <div className="welcome-sample-btns">
          <button type="button" className="btn ghost" onClick={onSampleCosmos}>
            «Космос» (рус.)
          </button>
          <button type="button" className="btn ghost" onClick={onSampleEnglish}>
            English Vocabulary
          </button>
        </div>
      </div>
    </div>
  );
}
