import { useEffect, useState } from 'react';
import { fetchUsageQuota } from '../services/users';
import type { IaQuota, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';

export function useIaQuota() {
  const { user } = useAuth();
  const [quota, setQuota] = useState<IaQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setQuota(null);
        setLoading(false);
        setError(null);
        return;
      }
      try {
        const data = await fetchUsageQuota();
        if (!cancelled) {
          const role: UserRole = (data?.role as UserRole) || 'free';
          const parsed: IaQuota = {
            role,
            parseUsed: data?.parse?.used ?? 0,
            parseLimit: data?.parse?.limit ?? 0,
            analyzeUsed: data?.analyze?.used ?? 0,
            analyzeLimit: data?.analyze?.limit ?? 0,
            week: data?.week,
            resetAt: data?.resetAt,
          };
          setQuota(parsed);
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar tu cuota de IA.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const parseRatio = quota && quota.parseLimit ? quota.parseUsed / quota.parseLimit : 0;
  const analyzeRatio = quota && quota.analyzeLimit ? quota.analyzeUsed / quota.analyzeLimit : 0;

  return { quota, loading, error, parseRatio, analyzeRatio };
}
