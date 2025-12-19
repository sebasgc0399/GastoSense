import { useContext } from 'react';
import { ConfirmContext } from '../context/confirm-context';

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return confirm;
}
