import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationSupport, requestNotificationPermission, showNotification } from './notifier';

const content = { title: 'Rent is due today', body: '$900.00', tag: 'bill-rent', url: '/?tab=bills' };

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static created: Array<{ title: string; options?: NotificationOptions }> = [];
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  onclick: (() => void) | null = null;
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.created.push({ title, ...(options ? { options } : {}) });
  }
  close(): void {}
}

function stubServiceWorker(registration: unknown, ready?: Promise<unknown>) {
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { getRegistration: async () => registration, ready: ready ?? new Promise(() => {}) },
  });
}

beforeEach(() => {
  FakeNotification.permission = 'granted';
  FakeNotification.created = [];
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('showNotification', () => {
  it('shows through an active service worker, carrying the tap target', async () => {
    const showNotification = vi.fn(async () => {});
    stubServiceWorker({ active: {}, showNotification });
    expect(await showNotification_(content)).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('Rent is due today', expect.objectContaining({ body: '$900.00', tag: 'bill-rent', data: { url: '/?tab=bills' } }));
    expect(FakeNotification.created).toEqual([]); // never the page-level fallback
  });

  it('waits for a worker that is still installing, instead of failing on a first launch', async () => {
    const showNotification = vi.fn(async () => {});
    const registration = { active: null, showNotification };
    let activate: (value: unknown) => void = () => {};
    stubServiceWorker(registration, new Promise((resolve) => (activate = resolve)));
    const pending = showNotification_(content);
    await Promise.resolve();
    expect(showNotification).not.toHaveBeenCalled();
    activate({ active: {}, showNotification });
    expect(await pending).toBe(true);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('falls back to a page notification if the worker never activates', async () => {
    vi.useFakeTimers();
    stubServiceWorker({ active: null, showNotification: vi.fn() });
    const pending = showNotification_(content);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBe(true);
    expect(FakeNotification.created.map((n) => n.title)).toEqual(['Rent is due today']);
  });

  it('uses a page notification when there is no service worker at all (development)', async () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: undefined });
    expect(await showNotification_(content)).toBe(true);
    expect(FakeNotification.created).toHaveLength(1);
  });

  it('shows nothing, and says so, without permission', async () => {
    FakeNotification.permission = 'denied';
    expect(await showNotification_(content)).toBe(false);
    expect(FakeNotification.created).toEqual([]);
  });

  it('reports a failure instead of throwing', async () => {
    stubServiceWorker({ active: {}, showNotification: async () => { throw new Error('boom'); } });
    expect(await showNotification_(content)).toBe(false);
  });
});

describe('permission', () => {
  it('reports the browser state and asks on request', async () => {
    FakeNotification.permission = 'default';
    expect(notificationSupport().permission).toBe('default');
    expect(await requestNotificationPermission()).toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('knows when notifications are unsupported', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(notificationSupport().permission).toBe('unsupported');
    expect(await requestNotificationPermission()).toBe('unsupported');
  });

  it('flags iPhones that have not been added to the Home Screen', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1', standalone: false });
    expect(notificationSupport().needsInstall).toBe(true);
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1', standalone: true });
    expect(notificationSupport().needsInstall).toBe(false);
  });
});

// `showNotification` is shadowed by the spy name above in two tests, so call it through an alias.
const showNotification_ = showNotification;
