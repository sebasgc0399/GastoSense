type TabKey = 'home' | 'transactions' | 'metrics' | 'advisor' | 'settings';

interface BottomNavProps {
  value: TabKey;
  onChange: (value: TabKey) => void;
}

const tabs: { key: TabKey; label: string; iconSrc: string }[] = [
  { key: 'home', label: 'Inicio', iconSrc: '/icons/Home_64v2.svg' },
  { key: 'transactions', label: 'Movimientos', iconSrc: '/icons/Movements_64.svg' },
  { key: 'metrics', label: 'M\u00E9tricas', iconSrc: '/icons/Chart_64.svg' },
  { key: 'advisor', label: 'Asesor IA', iconSrc: '/icons/RobotIA_64.svg' },
];

export function BottomNav({ value, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-md shadow-lg">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-2">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              <img
                src={tab.iconSrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                className={`h-6 w-6 transition ${active ? 'opacity-100' : 'opacity-70 grayscale'}`}
              />
              <span className="leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type { TabKey };
