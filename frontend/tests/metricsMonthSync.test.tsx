import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MetricsPage } from '../src/pages/MetricsPage';
import { TransactionsPage } from '../src/pages/TransactionsPage';
import { monthRangeIso } from '../src/utils/dates';
import { buildCategoryResolver } from '../src/utils/categoryResolver';
import type { TransactionsFilters } from '../src/hooks/useTransactionsController';
import { ConfirmProvider } from '../src/context/ConfirmContext';

function MonthSyncHarness() {
  const categoryResolver = buildCategoryResolver([]);
  const defaultMonth = '2025-12';
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [activeTab, setActiveTab] = useState<'metrics' | 'transactions'>('metrics');
  const [filters, setFilters] = useState<TransactionsFilters>({
    startDate: '2025-12-01',
    endDate: '2025-12-18',
    category: 'all',
  });

  const openMovements = useCallback(() => {
    const { startDate, endDate } = monthRangeIso(selectedMonth, '2025-12-18');
    setFilters({ startDate, endDate, category: 'all' });
    setActiveTab('transactions');
  }, [selectedMonth]);

  if (activeTab === 'transactions') {
    return (
      <TransactionsPage
        transactions={[]}
        filters={filters}
        handleFiltersChange={setFilters}
        error={null}
        paginatedTransactions={[]}
        txPageSize={8}
        txPage={1}
        totalTxPages={1}
        setTxPage={vi.fn()}
        budget={null}
        categorySpendMap={{}}
        categoryResolver={categoryResolver}
        setSelectedTx={vi.fn()}
        handleDeleteTransaction={async () => {}}
      />
    );
  }

  return (
    <MetricsPage
      currentMonth={selectedMonth}
      defaultMonth={defaultMonth}
      setCurrentMonth={setSelectedMonth}
      monthTransactions={[]}
      monthlyExpense={0}
      monthlyIncome={0}
      availableBalance={0}
      budget={null}
      expenseCategories={[]}
      categoryResolver={categoryResolver}
      previousMonth={null}
      onOpenQuickAdd={vi.fn()}
      onViewMovements={openMovements}
      onAdjustBudget={vi.fn()}
    />
  );
}

describe('selectedMonth sync (Metrics -> Movimientos)', () => {
  it('changes month in Metrics and opens Movimientos for that month', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <MonthSyncHarness />
      </ConfirmProvider>,
    );

    const monthInput = screen.getByDisplayValue('2025-12') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '2025-11' } });

    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }));

    expect(screen.getByText('Movimientos')).toBeInTheDocument();
    screen.getAllByLabelText('Desde').forEach((input) => {
      expect(input).toHaveValue('2025-11-01');
    });
    screen.getAllByLabelText('Hasta').forEach((input) => {
      expect(input).toHaveValue('2025-11-30');
    });
  });
});
