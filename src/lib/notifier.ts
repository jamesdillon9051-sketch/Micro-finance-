import { isIos, isStandalone } from './platform';

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export interface NotificationSupport {
  permission: PermissionState;
  /** iPhone/iPad only allow web notifications once the app has been added to the Home Screen. */
  needsInstall: boolean;
}

/** What this browser can do right now. */
export function notificationSupport(): NotificationSupport {
  const needsInstall = isIos() && !isStandalone();
  if (typeof Notification === 'undefined') return { permission: 'unsupported', needsInstall };
  return { permission: Notification.permission, needsInstall };
}

/** Must be called from a tap or click: browsers (iOS especially) ignore permission requests otherwise. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export interface NotificationContent {
  title: string;
  body: string;
  tag: string;
  /** Where the app should go when the notification is tapped. */
  url: string;
}

const ICON = '/icons/icon-192.png';
/** On a first launch the worker is still installing; this is how long to wait for it to take over. */
const ACTIVATION_WAIT_MS = 5000;

/**
 * The service worker registration to show notifications through, once its worker is running.
 * `undefined` when there is no service worker (development, unsupported browsers) or it never activates.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const container = navigator.serviceWorker;
  if (!container) return undefined;
  const registration = await container.getRegistration();
  if (!registration) return undefined;
  if (registration.active) return registration;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ACTIVATION_WAIT_MS);
  });
  try {
    return await Promise.race([container.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shows a system notification. It goes through the service worker when there is one, because that is
 * the only route that works in an installed iOS or Android web app; `new Notification()` is the fallback
 * for desktop browsers and development. Resolves to whether anything was shown.
 */
export async function showNotification({ title, body, tag, url }: NotificationContent): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = { body, tag, icon: ICON, badge: ICON, data: { url } };
  try {
    const registration = await activeRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
