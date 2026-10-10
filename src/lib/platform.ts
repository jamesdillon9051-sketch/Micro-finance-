/** Small, side-effect-free checks about where the app is running. Safe to call during tests and SSR. */

interface IosNavigator extends Navigator {
  /** Only present in Safari; true when launched from the Home Screen. */
  standalone?: boolean;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, but a Mac has no touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True on macOS, where the shortcut is Cmd rather than Ctrl. */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) && navigator.maxTouchPoints === 0;
}

/** True when running as an installed app (Home Screen on iOS, installed PWA elsewhere). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const matches = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return matches || (navigator as IosNavigator).standalone === true;
}
