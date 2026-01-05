export type CssVarReader = (name: string, fallback: string) => string;

export const createCssVarReader = (): CssVarReader => {
  if (typeof window === 'undefined') {
    return (_name, fallback) => fallback;
  }

  const styles = getComputedStyle(document.documentElement);
  return (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
};
