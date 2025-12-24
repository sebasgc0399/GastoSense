// Safe replacement for `size-sensor` used by `echarts-for-react`.
// Fixes a dev-only warning (React StrictMode double-mount) where `clear()` could
// throw before a ResizeObserver was actually created.

type SizeSensorListener = (element: HTMLElement) => void;

type Entry = {
  element: HTMLElement;
  observer: ResizeObserver | null;
  listeners: Set<SizeSensorListener>;
  fallbackResizeHandler?: () => void;
};

const pool = new WeakMap<HTMLElement, Entry>();

const getEntry = (element: HTMLElement): Entry => {
  const existing = pool.get(element);
  if (existing) return existing;

  const entry: Entry = {
    element,
    observer: null,
    listeners: new Set(),
  };

  if (typeof ResizeObserver !== 'undefined') {
    entry.observer = new ResizeObserver(() => {
      entry.listeners.forEach((cb) => cb(element));
    });
    entry.observer.observe(element);
  } else if (typeof window !== 'undefined') {
    entry.fallbackResizeHandler = () => entry.listeners.forEach((cb) => cb(element));
    window.addEventListener('resize', entry.fallbackResizeHandler);
  }

  pool.set(element, entry);
  return entry;
};

export function bind(element: HTMLElement, cb: SizeSensorListener) {
  const entry = getEntry(element);
  entry.listeners.add(cb);

  // Trigger once for initial layout.
  queueMicrotask(() => cb(element));

  return () => {
    const current = pool.get(element);
    if (!current) return;
    current.listeners.delete(cb);
    if (current.listeners.size === 0) clear(element);
  };
}

export function clear(element: HTMLElement) {
  const entry = pool.get(element);
  if (!entry) return;

  try {
    entry.observer?.disconnect();
  } catch {
    // noop
  }

  if (entry.fallbackResizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', entry.fallbackResizeHandler);
  }

  entry.listeners.clear();
  pool.delete(element);
}

export const ver = 'safe';

