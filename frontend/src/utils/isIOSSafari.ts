export function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent ?? '';
  const isAppleMobileDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as Macintosh but with touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isAppleMobileDevice) return false;

  // iOS browsers include "Safari" in UA even when not Safari.
  const isSafari = /Safari/i.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA)/i.test(ua);
  return isSafari;
}
