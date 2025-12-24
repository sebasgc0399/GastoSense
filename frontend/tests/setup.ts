import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Avoid ECharts (and its ResizeObserver/sensors) in unit tests.
vi.mock('echarts-for-react', () => ({
  default: () => null,
}));

if (!window.matchMedia) {
  // Minimal stub needed by ResponsiveSelect in jsdom.
  window.matchMedia = (query) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb([], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }

  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// ECharts measures text via canvas even with SVG renderer.
HTMLCanvasElement.prototype.getContext = () =>
  ({
    canvas: { width: 300, height: 150 },
    font: '',
    measureText: (text: string) => ({ width: text.length * 7 }),
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    rect: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    clearRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    setLineDash: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    drawImage: () => {},
  }) as unknown as CanvasRenderingContext2D;

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return 320;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {
    return 200;
  },
});

afterEach(() => {
  cleanup();
});
