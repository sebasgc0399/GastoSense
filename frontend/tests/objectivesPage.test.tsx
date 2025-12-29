import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ObjectivesPage } from '../src/pages/ObjectivesPage';
import type { Objective } from '../src/types';

const goals: Objective[] = [
  {
    id: 'goal-1',
    userId: 'user-1',
    type: 'goal',
    name: 'Viaje',
    targetAmount: 1000,
    currentAmount: 200,
    status: 'active',
  },
  {
    id: 'debt-1',
    userId: 'user-1',
    type: 'debt',
    name: 'Tarjeta',
    targetAmount: 2000,
    currentAmount: 300,
    status: 'active',
  },
];

describe('ObjectivesPage', () => {
  it('renders goals by default', () => {
    render(
      <ObjectivesPage
        objectives={goals}
        objectivesReady={true}
        error={null}
        onCreateObjective={vi.fn()}
        onUpdateObjective={vi.fn()}
        onArchiveObjective={vi.fn()}
        onDeleteObjective={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ahorros' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Total ahorrado')).toBeInTheDocument();
    expect(screen.getByText('Viaje')).toBeInTheDocument();
    expect(screen.queryByText('Tarjeta')).not.toBeInTheDocument();
  });

  it('switches to debt view', async () => {
    const user = userEvent.setup();

    render(
      <ObjectivesPage
        objectives={goals}
        objectivesReady={true}
        error={null}
        onCreateObjective={vi.fn()}
        onUpdateObjective={vi.fn()}
        onArchiveObjective={vi.fn()}
        onDeleteObjective={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Deudas' }));
    expect(screen.getByRole('button', { name: 'Deudas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Deuda restante')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
    expect(screen.queryByText('Viaje')).not.toBeInTheDocument();
  });
});
