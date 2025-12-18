export const todayIso = () => new Date().toISOString().slice(0, 10);

export const monthStartIso = (month?: string) => {
  const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0, 10);
};

export const monthEndIso = (month?: string) => {
  const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10);
};

export const monthRangeIso = (month: string, nowIso: string = todayIso()) => {
  const startDate = monthStartIso(month);
  const endDate = month === nowIso.slice(0, 7) ? nowIso : monthEndIso(month);
  return { startDate, endDate };
};

export const previousMonthRange = (month?: string) => {
  const base = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const end = new Date(base.getFullYear(), base.getMonth(), 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};
