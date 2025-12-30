type KeypadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | '.' | 'backspace';

const KEYPAD_KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

interface CustomKeypadProps {
  disabled?: boolean;
  actionDisabled?: boolean;
  onInput: (key: KeypadKey) => void;
  onAction: () => void;
}

export function CustomKeypad({ disabled, actionDisabled, onInput, onAction }: CustomKeypadProps) {
  return (
    <div className="flex gap-4">
      <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-3">
        {KEYPAD_KEYS.map((key) => {
          const isBackspace = key === 'backspace';
          const isDecimal = key === '.';
          const ariaLabel = isBackspace ? 'Borrar' : isDecimal ? 'coma decimal' : `Tecla ${key}`;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onInput(key)}
              disabled={disabled}
              className="btn-glass h-[7vh] min-h-[48px] max-h-[60px] text-2xl font-semibold sm:h-20 sm:text-3xl"
              aria-label={ariaLabel}
            >
              {isBackspace ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 9l-3 3 3 3" />
                  <path d="M7 12h10" />
                  <path d="M11 6h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5-6 5-6z" />
                </svg>
              ) : isDecimal ? (
                ','
              ) : (
                key
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className="flex h-auto w-20 flex-col items-center justify-center self-stretch rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-2 text-white shadow-lg shadow-emerald-500/20 transition hover:opacity-90 active:scale-95 disabled:opacity-60 sm:w-24"
        aria-label="Guardar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12l4 4L19 6" />
        </svg>
        <span className="mt-1 text-xs font-semibold">Guardar</span>
      </button>
    </div>
  );
}

export type { KeypadKey, CustomKeypadProps };
