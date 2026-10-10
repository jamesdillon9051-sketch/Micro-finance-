/** Event the app listens for to offer "a new version is ready". */
export const UPDATE_READY_EVENT = 'app:update-ready';

/**
 * Registers the service worker (production only, so it never interferes with the dev server) and
 * announces when a new version has taken over.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // The first install isn't an update, so only announce a swap after a worker was already in charge.
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.dispatchEvent(new Event(UPDATE_READY_EVENT));
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Service worker registration failed', error);
    });
  });
}
