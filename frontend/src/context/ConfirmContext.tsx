import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import type { ConfirmFn, ConfirmOptions } from './confirm-context';
import { ConfirmContext } from './confirm-context';

interface ConfirmProviderProps {
  children: ReactNode;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((nextOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }

    setOptions({
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      variant: 'default',
      ...nextOptions,
    });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const closeDialog = useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    if (resolver) {
      resolver(result);
      resolverRef.current = null;
    }
    setOpen(false);
    setOptions(null);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && resolverRef.current) {
      closeDialog(false);
      return;
    }
    setOpen(nextOpen);
  };

  const title = options?.title ?? 'Confirmar accion';
  const description = options?.description;
  const confirmText = options?.confirmText ?? 'Confirmar';
  const cancelText = options?.cancelText ?? 'Cancelar';
  const variant = options?.variant ?? 'default';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelText}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeDialog(true)}
              className={
                variant === 'destructive'
                  ? 'btn-danger'
                  : 'btn-primary'
              }
            >
              {confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
