interface Props {
  data: { category: string; amount: number }[];
}

const colors = ['#0F766E', '#0EA5E9', '#F97316', '#EF4444', '#8B5CF6'];

export function TopExpensesChart({ data }: Props) {
  const max = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Top categorías de gasto</h3>
        <span className="text-xs text-[var(--muted)]">Barras proporcionales</span>
      </div>
      <div className="space-y-3">
        {data.map((item, idx) => {
          const pct = Math.round((item.amount / max) * 100);
          const color = colors[idx % colors.length];
          return (
            <div key={item.category}>
              <div className="flex items-center justify-between text-sm text-white">
                <span className="font-semibold capitalize">{item.category}</span>
                <span className="text-[var(--muted)]">${item.amount.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-3 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
        {data.length === 0 && <p className="text-sm text-[var(--muted)]">Aún no hay gastos para graficar.</p>}
      </div>
    </div>
  );
}
