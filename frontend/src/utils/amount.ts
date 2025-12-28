export function formatAmountHero(raw: string, locale = 'es-CO') {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '0';

  const safe = trimmed.replace(/[^\d.]/g, '');
  const hasDot = safe.includes('.');
  const [intRaw, decRaw = ''] = safe.split('.');
  const intDigits = (intRaw || '0').replace(/^0+(?=\d)/, '');

  const intNumber = Number(intDigits || '0');
  const intFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Number.isFinite(intNumber) ? intNumber : 0,
  );

  const decDigits = decRaw.slice(0, 2);

  if (hasDot) {
    return `${intFmt},${decDigits}`;
  }
  return intFmt;
}
