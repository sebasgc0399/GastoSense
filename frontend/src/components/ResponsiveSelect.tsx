import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import clsx from 'clsx';

type Option<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

interface ResponsiveSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  title?: string;
  className?: string;
  buttonClassName?: string;
}

export function ResponsiveSelect<T extends string>({
  value,
  onChange,
  options,
  title = 'Seleccionar',
  className = '',
  buttonClassName = '',
}: ResponsiveSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopStyle, setDesktopStyle] = useState<CSSProperties | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isOpen || isMobile || typeof window === 'undefined') return;
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDesktopStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isOpen || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobile, isOpen]);

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          'flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-left text-[var(--text)] transition-colors',
          buttonClassName,
        )}
      >
        <span className="truncate text-sm font-medium">{selectedOption?.label ?? title}</span>
        <ChevronDown
          className={clsx(
            'h-4 w-4 text-[var(--text-muted)] transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={clsx(
                'fixed inset-0 z-[9999]',
                isMobile ? 'flex flex-col justify-end' : 'pointer-events-none',
              )}
            >
              {isMobile && (
                <div
                  className="absolute inset-0 bg-[var(--modal-overlay)] backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                  onClick={() => setIsOpen(false)}
                />
              )}

              <div
                ref={portalRef}
                className={clsx(
                  'relative flex w-full flex-col overflow-hidden bg-[var(--modal-surface)] shadow-2xl backdrop-blur-xl',
                  isMobile
                    ? 'rounded-t-2xl border-t border-[var(--modal-border)] animate-in slide-in-from-bottom-10 duration-300'
                    : 'pointer-events-auto rounded-xl border border-[var(--modal-border)] shadow-lg animate-in fade-in zoom-in-95',
                )}
                style={isMobile ? undefined : desktopStyle}
              >
                {isMobile && (
                  <div className="flex shrink-0 items-center justify-between border-b surface-divider bg-[var(--modal-header)] px-4 py-3">
                    <span className="text-sm font-bold text-[var(--text)]">{title}</span>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-full bg-[var(--overlay-5)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--overlay-10)] hover:text-[var(--text)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}

                <div className={clsx('flex-1 overflow-y-auto p-2', isMobile ? 'max-h-[60vh]' : 'max-h-60')}>
                  {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={option.disabled}
                        onClick={() => {
                          if (option.disabled) return;
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                        className={clsx(
                          'flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-all sm:py-2',
                          option.disabled
                            ? 'cursor-not-allowed text-[var(--text-muted)] opacity-50'
                            : isSelected
                              ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold'
                              : 'text-[var(--text-muted)] hover:bg-[var(--overlay-5)] hover:text-[var(--text)] active:bg-[var(--overlay-10)]',
                        )}
                      >
                        <span className="truncate">{option.label}</span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
