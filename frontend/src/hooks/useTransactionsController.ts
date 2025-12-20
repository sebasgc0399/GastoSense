import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listenTransactions } from '../services/transactions';
import type { Transaction } from '../types';
import { monthStartIso, todayIso } from '../utils/dates';

export interface TransactionsFilters {
  startDate: string;
  endDate: string;
  category: string;
  search: string;
}

export type TransactionsSortBy = 'date_desc' | 'amount_desc';

export interface UseTransactionsControllerParams {
  userId: string | null | undefined;
  txPageSize?: number;
  sortBy?: TransactionsSortBy;
}

export function useTransactionsController({ userId, txPageSize = 8, sortBy = 'date_desc' }: UseTransactionsControllerParams) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<TransactionsFilters>({
    startDate: monthStartIso(),
    endDate: todayIso(),
    category: 'all',
    search: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);

  const handleFiltersChange = useCallback((next: TransactionsFilters) => {
    const { startDate, endDate, category, search } = next;
    setTxPage(1);
    // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
    if (startDate && endDate && startDate > endDate) {
      setFilters({ startDate: endDate, endDate: startDate, category, search });
    } else {
      setFilters(next);
    }
  }, []);

  useEffect(() => {
    if (userId) return;
    loadedUserRef.current = null;
    const timeoutId = window.setTimeout(() => setLoadedUserId(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = listenTransactions({
      userId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      category: filters.category,
      onChange: (list) => {
        const shouldResetPage = loadedUserRef.current !== userId;
        loadedUserRef.current = userId;
        if (shouldResetPage) setTxPage(1);
        setTransactions(list);
        setLoadedUserId(userId);
      },
      onError: (err) => {
        setError(err.message);
        const shouldResetPage = loadedUserRef.current !== userId;
        loadedUserRef.current = userId;
        if (shouldResetPage) setTxPage(1);
        setLoadedUserId(userId);
      },
    });
    return () => unsubscribe();
  }, [filters.category, filters.endDate, filters.startDate, userId]);

  const transactionsReady = !!userId && loadedUserId === userId;
  const visibleTransactions = useMemo(() => {
    if (!transactionsReady) return [];

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const searchTerm = normalize(filters.search || '');
    const filtered =
      searchTerm.length > 0
        ? transactions.filter((t) => normalize(`${t.note ?? ''} ${t.categoryId ?? ''}`).includes(searchTerm))
        : transactions;

    if (sortBy !== 'amount_desc') return filtered;
    return [...filtered].sort((a, b) => {
      const diff = b.amount - a.amount;
      if (diff !== 0) return diff;
      return b.date.localeCompare(a.date);
    });
  }, [filters.search, sortBy, transactions, transactionsReady]);

  const paginatedTransactions = useMemo(() => {
    const start = (txPage - 1) * txPageSize;
    return visibleTransactions.slice(start, start + txPageSize);
  }, [txPage, txPageSize, visibleTransactions]);
  const totalTxPages = useMemo(
    () => Math.max(1, Math.ceil(visibleTransactions.length / txPageSize)),
    [txPageSize, visibleTransactions.length],
  );

  return {
    filters,
    handleFiltersChange,
    transactions: visibleTransactions,
    transactionsReady,
    error,
    txPage,
    setTxPage,
    txPageSize,
    paginatedTransactions,
    totalTxPages,
  };
}
