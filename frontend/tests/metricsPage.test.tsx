import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MetricsPage, shouldShowIncomeAndBalance } from '../src/pages/MetricsPage';
import type { Budget, Transaction } from '../src/types';

describe('MetricsPage', () => {
  it('shouldShowIncomeAndBalance is false with only expenses and true with income', () => {
    const baseExpense: Transaction = {
      id: 't1',
      amount: 12000,
      category: 'comida',
      type: 'expense',
      date: '2025-12-10',
      paymentMethod: 'efectivo',
    };

    expect(shouldShowIncomeAndBalance([baseExpense], 0)).toBe(false);

    const incomeTx: Transaction = { ...baseExpense, id: 't2', type: 'income', category: 'salario', amount: 100000 };
    expect(shouldShowIncomeAndBalance([baseExpense, incomeTx], 100000)).toBe(true);
  });

  it('shows empty state when txCount = 0', () => {
    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[]}
        monthlyExpense={0}
        monthlyIncome={0}
        availableBalance={0}
        budget={null}
        expenseCategories={[]}
        previousMonth={null}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('A\u00FAn no hay datos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar mi primer gasto' })).toBeInTheDocument();
  });

  it('renders base metrics cards when there is data', () => {
    const tx: Transaction = {
      id: 't1',
      amount: 5000,
      category: 'transporte',
      type: 'expense',
      date: '2025-11-03',
      paymentMethod: 'debito',
    };
    const budget: Budget = { month: '2025-11', total: 100000 };

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[tx]}
        monthlyExpense={5000}
        monthlyIncome={0}
        availableBalance={-5000}
        budget={budget}
        expenseCategories={[{ category: 'transporte', amount: 5000 }]}
        previousMonth={null}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('Gasto del mes')).toBeInTheDocument();
    expect(screen.getByText('Presupuesto total')).toBeInTheDocument();
    expect(screen.getByText('Evoluci\u00F3n del mes')).toBeInTheDocument();
    expect(screen.getByTestId('evolution-chart')).toBeInTheDocument();
    expect(screen.getByText('Top categor\u00EDas de gasto')).toBeInTheDocument();
    expect(screen.getByTestId('category-spend-chart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Presupuesto' })).toBeInTheDocument();
    expect(screen.queryByText('Ingresos del mes')).not.toBeInTheDocument();
    expect(screen.queryByText('Balance')).not.toBeInTheDocument();
  });

  it('renders Evoluci\u00F3n del mes and toggles to Acumulado when budget exists', async () => {
    const user = userEvent.setup();

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[
          {
            id: 't1',
            amount: 12000,
            category: 'comida',
            type: 'expense',
            date: '2025-11-01',
            paymentMethod: 'efectivo',
          },
        ]}
        monthlyExpense={12000}
        monthlyIncome={0}
        availableBalance={-12000}
        budget={{ month: '2025-11', total: 100000 }}
        expenseCategories={[{ category: 'comida', amount: 12000 }]}
        previousMonth={{ expense: 10000, income: 0 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('Evoluci\u00F3n del mes')).toBeInTheDocument();
    expect(screen.getByText('GASTO DIARIO DEL MES')).toBeInTheDocument();
    expect(screen.getByTestId('evolution-chart')).toBeInTheDocument();

    const dailyBtn = screen.getByRole('button', { name: 'Diario' });
    const cumulativeBtn = screen.getByRole('button', { name: 'Acumulado' });
    expect(dailyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(cumulativeBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(cumulativeBtn);
    expect(screen.getByText('ACUMULADO VS PRESUPUESTO')).toBeInTheDocument();
    expect(screen.getByText('Presupuesto: $100.000')).toBeInTheDocument();
  });

  it('renders income and balance cards when there is income', () => {
    const expenseTx: Transaction = {
      id: 't1',
      amount: 5000,
      category: 'transporte',
      type: 'expense',
      date: '2025-11-03',
      paymentMethod: 'debito',
    };

    const incomeTx: Transaction = {
      ...expenseTx,
      id: 't2',
      type: 'income',
      category: 'salario',
      amount: 100000,
    };

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[expenseTx, incomeTx]}
        monthlyExpense={5000}
        monthlyIncome={100000}
        availableBalance={95000}
        budget={{ month: '2025-11', total: 200000 }}
        expenseCategories={[{ category: 'transporte', amount: 5000 }]}
        previousMonth={{ expense: 10000, income: 100000 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('Ingresos del mes')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });

  it('does not render Top categorías when there are only incomes', () => {
    const incomeTx: Transaction = {
      id: 't1',
      amount: 100000,
      category: 'salario',
      type: 'income',
      date: '2025-11-03',
      paymentMethod: 'debito',
    };

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[incomeTx]}
        monthlyExpense={0}
        monthlyIncome={100000}
        availableBalance={100000}
        budget={{ month: '2025-11', total: 200000 }}
        expenseCategories={[]}
        previousMonth={{ expense: 10000, income: 100000 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.queryByText('Top categor\u00EDas de gasto')).not.toBeInTheDocument();
    expect(screen.queryByText('Evoluci\u00F3n del mes')).not.toBeInTheDocument();
  });

  it('shows "Sin referencia" when previousMonth expense is 0', () => {
    const tx: Transaction = {
      id: 't1',
      amount: 5000,
      category: 'transporte',
      type: 'expense',
      date: '2025-11-03',
      paymentMethod: 'debito',
    };

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[tx]}
        monthlyExpense={5000}
        monthlyIncome={0}
        availableBalance={-5000}
        budget={{ month: '2025-11', total: 100000 }}
        expenseCategories={[{ category: 'transporte', amount: 5000 }]}
        previousMonth={{ expense: 0, income: 0 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('Sin referencia del mes anterior.')).toBeInTheDocument();
  });

  it('shows "Define tu presupuesto" state when budget is empty', () => {
    const tx: Transaction = {
      id: 't1',
      amount: 5000,
      category: 'transporte',
      type: 'expense',
      date: '2025-11-03',
      paymentMethod: 'debito',
    };

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[tx]}
        monthlyExpense={5000}
        monthlyIncome={0}
        availableBalance={-5000}
        budget={{ month: '2025-11', total: 0 }}
        expenseCategories={[{ category: 'transporte', amount: 5000 }]}
        previousMonth={{ expense: 10000, income: 100000 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    expect(screen.getByText('Define tu presupuesto')).toBeInTheDocument();
    expect(screen.getByText('Evoluci\u00F3n del mes')).toBeInTheDocument();
    expect(screen.queryByText('Gastado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver movimientos' })).not.toBeInTheDocument();
    const cumulativeBtn = screen.getByRole('button', { name: 'Acumulado' });
    expect(cumulativeBtn).toBeDisabled();
    expect(cumulativeBtn).toHaveAttribute('title', expect.stringContaining('Define presupuesto'));

    const categoryBudgetBtn = screen.getByRole('button', { name: 'Presupuesto' });
    expect(categoryBudgetBtn).toBeDisabled();
    expect(screen.getByText('Define presupuestos por categor\u00EDa para comparar.')).toBeInTheDocument();
  });

  it('toggles to Presupuesto mode and unions budget categories (including budget-only)', async () => {
    const user = userEvent.setup();

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[
          {
            id: 't1',
            amount: 12000,
            category: 'comida',
            type: 'expense',
            date: '2025-11-01',
            paymentMethod: 'efectivo',
          },
        ]}
        monthlyExpense={18000}
        monthlyIncome={0}
        availableBalance={-18000}
        budget={{
          month: '2025-11',
          total: 200000,
          perCategory: { comida: 20000, transporte: 10000, renta: 50000, suscripciones: 5000 },
        }}
        expenseCategories={[
          { category: 'comida', amount: 12000 }, // has budget
          { category: 'ocio', amount: 6000 }, // no budget -> "Sin presupuesto"
        ]}
        previousMonth={{ expense: 10000, income: 0 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    const spentBtn = screen.getByRole('button', { name: 'Barras' });
    const budgetBtn = screen.getByRole('button', { name: 'Presupuesto' });
    expect(spentBtn).toHaveAttribute('aria-pressed', 'true');
    expect(budgetBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(budgetBtn);
    expect(budgetBtn).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ver todas' }));

    const dialogHeading = screen.getByRole('heading', { name: 'Categor\u00EDas del mes' });
    const dialog = dialogHeading.closest('[role=\"dialog\"]');
    expect(dialog).not.toBeNull();
    const dialogScope = within(dialog as HTMLElement);

    expect(screen.getAllByTestId('category-spend-chart')).toHaveLength(2);
    expect(dialogScope.getByRole('button', { name: 'Presupuesto' })).toHaveAttribute('aria-pressed', 'true');

    const renta = dialogScope.getByText('Renta');
    const rentaRow = renta.closest('li');
    expect(rentaRow).not.toBeNull();
    expect(rentaRow as HTMLElement).toHaveTextContent('Gastado: $0');
    expect(rentaRow as HTMLElement).toHaveTextContent('Presupuesto: $50.000');

    const ocio = dialogScope.getByText('Ocio');
    const ocioRow = ocio.closest('li');
    expect(ocioRow).not.toBeNull();
    expect(ocioRow as HTMLElement).toHaveTextContent('Presupuesto: —');
  });

  it('opens and closes the categories modal when there are more than 3 categories', async () => {
    const user = userEvent.setup();
    const onViewMovements = vi.fn();

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[
          {
            id: 't1',
            amount: 1000,
            category: 'comida',
            type: 'expense',
            date: '2025-11-01',
            paymentMethod: 'efectivo',
          },
        ]}
        monthlyExpense={56000}
        monthlyIncome={0}
        availableBalance={-56000}
        budget={{ month: '2025-11', total: 100000 }}
        expenseCategories={[
          { category: 'hogar', amount: 20000 },
          { category: 'comida', amount: 18000 },
          { category: 'transporte', amount: 12000 },
          { category: 'ocio', amount: 6000 },
        ]}
        previousMonth={{ expense: 10000, income: 0 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={onViewMovements}
        onAdjustBudget={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(onViewMovements).not.toHaveBeenCalled();

    const dialogHeading = screen.getByRole('heading', { name: 'Categor\u00EDas del mes' });
    const dialog = dialogHeading.closest('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const dialogScope = within(dialog as HTMLElement);
    expect(dialogScope.getByText('Hogar')).toBeInTheDocument();
    expect(dialogScope.getByText('Comida')).toBeInTheDocument();
    expect(dialogScope.getByText('Transporte')).toBeInTheDocument();
    expect(dialogScope.getByText('Ocio')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Cerrar'));
    expect(screen.queryByText('Categor\u00EDas del mes')).not.toBeInTheDocument();
  });

  it('closes the categories modal with Escape', async () => {
    const user = userEvent.setup();

    render(
      <MetricsPage
        currentMonth="2025-11"
        defaultMonth="2025-11"
        setCurrentMonth={vi.fn()}
        monthTransactions={[
          {
            id: 't1',
            amount: 1000,
            category: 'comida',
            type: 'expense',
            date: '2025-11-01',
            paymentMethod: 'efectivo',
          },
        ]}
        monthlyExpense={56000}
        monthlyIncome={0}
        availableBalance={-56000}
        budget={{ month: '2025-11', total: 100000 }}
        expenseCategories={[
          { category: 'hogar', amount: 20000 },
          { category: 'comida', amount: 18000 },
          { category: 'transporte', amount: 12000 },
          { category: 'ocio', amount: 6000 },
        ]}
        previousMonth={{ expense: 10000, income: 0 }}
        onOpenQuickAdd={vi.fn()}
        onViewMovements={vi.fn()}
        onAdjustBudget={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(screen.getByRole('heading', { name: 'Categor\u00EDas del mes' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Categor\u00EDas del mes')).not.toBeInTheDocument();
  });
});
