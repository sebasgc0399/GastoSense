export const formatCurrency = (cents?: number | null, currency: string = 'COP') => {
  if (!cents && cents !== 0) return '--';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export const formatPesos = (value?: number | null) => {
  if (!value && value !== 0) return '--';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
};

export const formatUsdApprox = (cents?: number | null) => {
  if (!cents && cents !== 0) return '';
  // Aproximación rápida: 1 USD = 4000 COP; ajusta si quieres un tipo de cambio distinto.
  const usd = cents / 100 / 4000;
  return `(≈ ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)})`;
};

export const formatDate = (ts?: number | null): string | null => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};
