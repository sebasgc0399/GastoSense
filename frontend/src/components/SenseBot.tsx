import clsx from 'clsx';

type BotMood = 'idle' | 'happy' | 'thinking' | 'waving' | 'excited' | 'curious' | 'success';

interface SenseBotProps {
  mood?: BotMood;
  size?: 'sm' | 'md' | 'lg';
}

const moodColors: Record<BotMood, string> = {
  idle: 'text-[var(--text-muted)]',
  happy: 'text-[var(--success-text)]',
  thinking: 'text-sky-300',
  waving: 'text-[var(--warn-text)]',
  excited: 'text-orange-300',
  curious: 'text-indigo-300',
  success: 'text-[var(--accent)]',
};

const sizeMap = {
  sm: 'text-4xl',
  md: 'text-6xl',
  lg: 'text-7xl',
};

export function SenseBot({ mood = 'idle', size = 'md' }: SenseBotProps) {
  return (
    <div
      className={clsx(
        'relative inline-flex items-center justify-center rounded-3xl bg-[var(--modal-overlay)] px-6 py-5 shadow-2xl ring-4 ring-[var(--border-10)] backdrop-blur',
        size === 'lg' ? 'min-w-[120px] min-h-[120px]' : size === 'md' ? 'min-w-[96px] min-h-[96px]' : 'min-w-[80px] min-h-[80px]',
      )}
    >
      <div className={clsx('transition-transform duration-500', mood === 'waving' ? 'animate-bounce' : '')}>
        <span className={clsx(sizeMap[size], moodColors[mood])}>🤖</span>
      </div>
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 to-white/0" />
      <div className="absolute -bottom-1 left-3 h-3 w-8 rounded-full bg-[var(--modal-overlay)] blur-lg" />
    </div>
  );
}
