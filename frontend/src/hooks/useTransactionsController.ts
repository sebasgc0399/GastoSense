import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listenTransactions } from '../services/transactions';
import type { CategoryKind, Transaction } from '../types';
import { monthStartIso, todayIso } from '../utils/dates';
import { useCategoriesController } from './useCategoriesController';

export interface TransactionsFilters {
  startDate: string;
  endDate: string;
  category: string;
  search: string;
  type: TransactionTypeFilter;
}

export type TransactionTypeFilter = 'all' | 'expense' | 'income';
export type TransactionsSortBy = 'date_desc' | 'amount_desc';

export interface UseTransactionsControllerParams {
  userId: string | null | undefined;
  txPageSize?: number;
  sortBy?: TransactionsSortBy;
}

const resolveKind = (value?: CategoryKind) => (value === 'income' ? 'income' : 'expense');

export function useTransactionsController({ userId, txPageSize = 8, sortBy = 'date_desc' }: UseTransactionsControllerParams) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<TransactionsFilters>({
    startDate: monthStartIso(),
    endDate: todayIso(),
    category: 'all',
    search: '',
    type: 'all',
  });
  const [error, setError] = useState<string | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const loadedUserRef = useRef<string | null>(null);
  const { categories } = useCategoriesController({ userId, includeArchived: true });
  const activeExpenseIds = useMemo(
    () =>
      new Set(
        categories.filter((cat) => !cat.isArchived && resolveKind(cat.kind) === 'expense').map((cat) => cat.id),
      ),
    [categories],
  );
  const activeIncomeIds = useMemo(
    () =>
      new Set(
        categories.filter((cat) => !cat.isArchived && resolveKind(cat.kind) === 'income').map((cat) => cat.id),
      ),
    [categories],
  );
  const effectiveType = useMemo(() => {
    if (filters.category === 'otros') return 'expense';
    if (filters.category === 'ingreso') return 'income';
    return filters.type;
  }, [filters.category, filters.type]);

  const handleFiltersChange = useCallback((next: TransactionsFilters) => {
    const { startDate, endDate, category, search, type } = next;
    setTxPage(1);
    // Aseguramos orden para evitar consultas vacías si el usuario invierte las fechas
    if (startDate && endDate && startDate > endDate) {
      setFilters({ startDate: endDate, endDate: startDate, category, search, type });
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
      type: effectiveType,
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
  }, [effectiveType, filters.category, filters.endDate, filters.startDate, userId]);

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
    let filtered =
      searchTerm.length > 0
        ? transactions.filter((t) => normalize(`${t.note ?? ''} ${t.categoryId ?? ''}`).includes(searchTerm))
        : transactions;

    if (effectiveType !== 'all') {
      filtered = filtered.filter((t) => t.type === effectiveType);
    }

    if (filters.category === 'otros') {
      filtered = filtered.filter(
        (t) => t.type === 'expense' && (t.categoryId === 'otros' || !activeExpenseIds.has(t.categoryId)),
      );
    }

    if (filters.category === 'ingreso') {
      filtered = filtered.filter(
        (t) => t.type === 'income' && (t.categoryId === 'ingreso' || !activeIncomeIds.has(t.categoryId)),
      );
    }

    if (sortBy !== 'amount_desc') return filtered;
    return [...filtered].sort((a, b) => {
      const diff = b.amount - a.amount;
      if (diff !== 0) return diff;
      return b.date.localeCompare(a.date);
    });
  }, [
    activeExpenseIds,
    activeIncomeIds,
    effectiveType,
    filters.category,
    filters.search,
    sortBy,
    transactions,
    transactionsReady,
  ]);

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
