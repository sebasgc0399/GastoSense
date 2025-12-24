import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../src/context/ConfirmContext';
import { useConfirm } from '../src/hooks/useConfirm';

interface TriggerProps {
  onResult: (result: boolean) => void;
}

function ConfirmTrigger({ onResult }: TriggerProps) {
  const confirm = useConfirm();

  const handleClick = async () => {
    const result = await confirm({ title: 'Confirmar accion' });
    onResult(result);
  };

  return (
    <button type="button" onClick={handleClick}>
      Open
    </button>
  );
}

describe('useConfirm', () => {
  it('resuelve true al confirmar una sola vez', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    render(
      <ConfirmProvider>
        <ConfirmTrigger onResult={onResult} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));

    const confirmButton = await screen.findByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it('resuelve false al cancelar', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    render(
      <ConfirmProvider>
        <ConfirmTrigger onResult={onResult} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    const cancelButton = await screen.findByRole('button', { name: 'Cancelar' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });
    expect(onResult).toHaveBeenCalledWith(false);
  });
});
