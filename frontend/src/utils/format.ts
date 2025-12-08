export const formatCurrency = (cents?: number | null, currency: string = 'COP') => {
  if (!cents && cents !== 0) return '--';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};
