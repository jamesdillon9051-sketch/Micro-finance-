import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationSupport, requestNotificationPermission, showNotification, type NotificationSupport } from '../lib/notifier';
import { planNotifications } from '../lib/notify';
import type { UseFinanceStoreResult } from './useFinanceStore';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Delivers the alerts the user switched on: bills due in 2 days and on the day, a low safe-to-spend
 * amount, and the evening check-in.
 *
 * It checks when the app opens, when it comes back to the foreground, every minute while it is running,
 * and whenever the data changes (so spending that crosses the threshold alerts straight away). Each alert
 * is remembered in the store, so it fires once however many times it is checked.
 *
 * A web app can only run this while it is open or recently active. Alerts for a time the app wasn't
 * running arrive the next time it is opened; guaranteed delivery on a closed phone needs a push server.
 */
export function useNotifications(finance: UseFinanceStoreResult, now: () => Date = () => new Date()) {
  const [support, setSupport] = useState<NotificationSupport>(() => notificationSupport());
  const latest = useRef({ finance, now });
  latest.current = { finance, now };
  const busy = useRef(false);

  const evaluate = useCallback(async (): Promise<void> => {
    if (busy.current || notificationSupport().permission !== 'granted') return;
    busy.current = true;
    try {
      const { finance: current, now: clock } = latest.current;
      const planned = planNotifications({ data: current.data, overview: current.overview, now: clock() });
      const delivered = [];
      for (const item of planned) {
        if (await showNotification(item)) delivered.push({ key: item.key, billId: item.billId });
      }
      current.recordNotificationsSent(delivered);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void evaluate();
    const interval = window.setInterval(() => void evaluate(), CHECK_INTERVAL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void evaluate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [evaluate]);

  // Re-check as soon as the numbers or the settings change.
  useEffect(() => {
    void evaluate();
  }, [evaluate, finance.data]);

  /** Asks for permission (call from a tap), then sends anything that is already due. */
  const enable = useCallback(async (): Promise<void> => {
    await requestNotificationPermission();
    setSupport(notificationSupport());
    await evaluate();
  }, [evaluate]);

  const sendTest = useCallback(
    () =>
      showNotification({
        title: 'Notifications are on',
        body: "You'll get bill reminders, safe-to-spend warnings and an evening check-in.",
        tag: 'test',
        url: '/',
      }),
    [],
  );

  return { support, enable, sendTest };
}
