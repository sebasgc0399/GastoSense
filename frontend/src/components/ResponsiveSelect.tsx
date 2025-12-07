import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type Option<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  title?: string;
  className?: string;
  buttonClassName?: string;
}

export function ResponsiveSelect<T extends string>({
  value,
  options,
  onChange,
  title = 'Selecciona una opción',
  className,
  buttonClassName,
}: Props<T>) {
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  if (!isMobile) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={clsx(
          'w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none shadow-sm',
          className,
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:border-primary',
          buttonClassName,
        )}
      >
        {selected?.label ?? title}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-slate-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{title}</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  disabled={opt.disabled}
                  className={clsx(
                    'rounded-xl border px-3 py-3 text-left text-sm font-semibold',
                    opt.disabled
                      ? 'border-white/5 bg-white/5 text-slate-500'
                      : opt.value === value
                        ? 'border-primary bg-primary/20 text-white'
                        : 'border-white/10 bg-white/5 text-white hover:border-primary',
                  )}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
