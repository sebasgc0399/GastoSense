import { useEffect, useRef } from 'react';
import type React from 'react';
import type { Transaction } from '../../types';
import { useConfirm } from '../../hooks/useConfirm';

export type BudgetState = 'none' | 'unlimited' | 'limited';

export interface TransactionItemCardProps {
  tx: Transaction;
  displayCategory: string;
  spentInCategory: number;
  budgetState: BudgetState;
  budgetValue?: number;
  percentUsed?: number;
  excessAmount?: number;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void | Promise<void>;
  showDate?: boolean;
}

export function TransactionItemCard({
  tx,
  displayCategory,
  spentInCategory,
  budgetState,
  budgetValue,
  percentUsed,
  excessAmount,
  onEdit,
  onDelete,
  showDate = true,
}: TransactionItemCardProps) {
  const confirm = useConfirm();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickRef = useRef(false);
  const hasBudget = budgetState !== 'none';
  const hasLimit = budgetState === 'limited';
  const isExpense = tx.type === 'expense';
  const title = tx.note?.trim() ? tx.note : displayCategory;
  const amountLabel = `${isExpense ? '-' : '+'}$${tx.amount.toLocaleString()}`;
  const ariaLabel = `Editar movimiento: ${title}, ${amountLabel}, ${tx.date}`;
  const rawPaymentMethod = tx.paymentMethod?.trim() ?? '';
  const normalizedPaymentMethod =
    rawPaymentMethod && rawPaymentMethod === rawPaymentMethod.toLocaleLowerCase('es-CO')
      ? `${rawPaymentMethod.charAt(0).toLocaleUpperCase('es-CO')}${rawPaymentMethod.slice(1)}`
      : rawPaymentMethod;
  const metaLine = [showDate ? tx.date : null, normalizedPaymentMethod || null].filter(Boolean).join(' \u00b7 ');
  const showCategoryChip = Boolean(displayCategory) && displayCategory !== title;
  const safeBudgetValue = typeof budgetValue === 'number' ? budgetValue : 0;
  const budgetAmount = budgetState === 'limited' ? `$${safeBudgetValue.toLocaleString()}` : 'Sin tope';
  const showPercent = hasLimit && safeBudgetValue > 0 && typeof percentUsed === 'number';
  const spentRatio = showPercent ? spentInCategory / safeBudgetValue : 0;
  const toneClass =
    spentRatio >= 1
      ? 'bg-red-500/10 text-red-200'
      : spentRatio >= 0.8
        ? 'bg-amber-500/10 text-amber-200'
        : 'bg-emerald-500/10 text-emerald-200';
  const barClass =
    spentRatio >= 1 ? 'bg-red-400/80' : spentRatio >= 0.8 ? 'bg-amber-400/80' : 'bg-emerald-400/80';
  const progressValue = showPercent && typeof percentUsed === 'number' ? Math.min(percentUsed, 100) : 0;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details || !details.open) return;
      if (!details.contains(event.target as Node)) {
        details.removeAttribute('open');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const details = detailsRef.current;
      if (!details || !details.open) return;
      details.removeAttribute('open');
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeDetails = () => {
    const details = detailsRef.current;
    if (details?.open) {
      details.removeAttribute('open');
    }
  };

  const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    ignoreClickRef.current = false;
    if (event.pointerType !== 'touch') return;
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleCardPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!start) return;
    const delta = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (delta > 10) {
      ignoreClickRef.current = true;
    }
  };

  const handleCardPointerCancel = () => {
    pointerDownRef.current = null;
    ignoreClickRef.current = false;
  };

  const handleCardClick = () => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    closeDetails();
    onEdit(tx);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closeDetails();
      onEdit(tx);
    }
  };

  const handleDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    closeDetails();
    const confirmed = await confirm({
      title: '¿Borrar este movimiento?',
      description: 'Esta acción no se puede deshacer.',
      confirmText: 'Borrar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!confirmed) return;
    await onDelete(tx.id);
  };

  return (
    <div
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onPointerDown={handleCardPointerDown}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerCancel}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-white line-clamp-2">{title}</p>
        <div className="flex items-start gap-2">
          <p
            className={`shrink-0 text-base font-bold tabular-nums ${isExpense ? 'text-red-300' : 'text-emerald-300'}`}
          >
            {isExpense ? '-' : '+'}${tx.amount.toLocaleString()}
          </p>
          <details
            className="relative"
            ref={detailsRef}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <summary
              className="flex h-7 w-7 list-none items-center justify-center rounded-full text-slate-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden"
              aria-label="Acciones"
              aria-haspopup="menu"
            >
              ⋯
            </summary>
            <div className="absolute right-0 top-7 z-10 w-28 rounded-lg border border-white/10 bg-slate-950/95 p-1 text-[11px] text-slate-200 shadow-lg backdrop-blur">
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                onClick={(event) => {
                  event.stopPropagation();
                  closeDetails();
                  onEdit(tx);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-red-200 hover:bg-white/10"
                onClick={handleDelete}
              >
                Borrar
              </button>
            </div>
          </details>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        {metaLine ? <span>{metaLine}</span> : null}
        {showCategoryChip && (
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
            {displayCategory}
          </span>
        )}
      </div>
      {isExpense && hasBudget && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-300">
              {hasLimit
                ? `Presupuesto ${budgetAmount} · Gastado mes $${spentInCategory.toLocaleString()}`
                : `Presupuesto: ${budgetAmount} · Gastado mes $${spentInCategory.toLocaleString()}`}
              {hasLimit && typeof excessAmount === 'number' && excessAmount > 0
                ? ` · Exceso $${excessAmount.toLocaleString()}`
                : ''}
            </p>
            {showPercent && <span className={`rounded-full px-2 py-0.5 text-[10px] ${toneClass}`}>{percentUsed}%</span>}
          </div>
          {showPercent && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-full ${barClass}`} style={{ width: `${progressValue}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
