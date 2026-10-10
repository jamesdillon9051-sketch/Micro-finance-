import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFinanceStore, useFinanceStore } from './useFinanceStore';
import { useNotifications } from './useNotifications';

/** A stand-in for the browser's Notification API that records what gets shown. */
class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static shown: Array<{ title: string; options: NotificationOptions | undefined }> = [];
  static requestPermission = vi.fn(async () => {
    FakeNotification.permission = 'granted';
    return 'granted' as NotificationPermission;
  });
  onclick: (() => void) | null = null;
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.shown.push({ title, options });
  }
  close(): void {}
}

beforeEach(() => {
  FakeNotification.permission = 'granted';
  FakeNotification.shown = [];
  FakeNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', FakeNotification);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Oct 12 2026, 8:30pm: a bill due today, past the 8pm reminder time. */
const NOW = new Date(2026, 9, 12, 20, 30);

function setup() {
  const store = createFinanceStore({ storage: null, now: () => new Date(NOW) });
  store.actions.updateSalary({ monthlySalary: 3100 });
  store.actions.addBill({ title: 'Rent', amount: 900, dueDate: 12, category: 'housing', isAutoDeduct: false, notifiedThisMonth: false });
  store.actions.updateNotifications({ enableDailyReminder: true, reminderTime: '20:00', enableBillAlerts: true, enableOverspendAlerts: true, safeToSpendThreshold: 20 });
  const hook = renderHook(() => useNotifications(useFinanceStore(store), () => new Date(NOW)));
  return { store, hook };
}

const titles = () => FakeNotification.shown.map((n) => n.title);
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useNotifications', () => {
  it('sends the due-date and evening alerts once permission is granted', async () => {
    setup();
    await flush();
    expect(titles()).toEqual(expect.arrayContaining(['Rent is due today', 'Evening check-in']));
    expect(FakeNotification.shown.find((n) => n.title === 'Rent is due today')?.options).toMatchObject({
      tag: expect.stringContaining('bill-'),
      data: { url: '/?tab=bills' },
    });
  });

  it('never repeats an alert, however many times it checks', async () => {
    const { store, hook } = setup();
    await flush();
    const first = titles().length;
    expect(first).toBeGreaterThan(0);
    hook.rerender();
    await flush();
    act(() => {
      store.actions.addTransaction({ amount: 1, type: 'expense', category: 'dining', date: '2026-10-12', note: '', isRecurring: false });
    });
    await flush();
    expect(titles().filter((t) => t === 'Rent is due today')).toHaveLength(1);
    expect(titles().filter((t) => t === 'Evening check-in')).toHaveLength(1);
    expect(store.getSnapshot().data.meta.notificationLog).toEqual(expect.arrayContaining(['2026-10-12|summary']));
    expect(store.getSnapshot().data.bills[0]?.notifiedThisMonth).toBe(true);
  });

  it('warns as soon as spending pushes safe-to-spend under the threshold', async () => {
    const { store } = setup();
    await flush();
    expect(titles()).not.toContain('Your safe-to-spend is running low');
    act(() => {
      // week 2 (Oct 8-14) allows 560; leave a little under 20/day for the 3 days left
      store.actions.addTransaction({ amount: 520, type: 'expense', category: 'shopping', date: '2026-10-12', note: '', isRecurring: false });
    });
    await flush();
    expect(titles()).toContain('Your safe-to-spend is running low');
  });

  it('sends nothing without permission, and does not mark anything as sent', async () => {
    FakeNotification.permission = 'default';
    const { store } = setup();
    await flush();
    expect(FakeNotification.shown).toEqual([]);
    expect(store.getSnapshot().data.meta.notificationLog).toEqual([]);
  });

  it('enable() asks for permission, then delivers what was waiting', async () => {
    FakeNotification.permission = 'default';
    const { hook } = setup();
    await flush();
    expect(hook.result.current.support.permission).toBe('default');
    await act(async () => {
      await hook.result.current.enable();
    });
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(hook.result.current.support.permission).toBe('granted');
    expect(titles()).toContain('Rent is due today');
  });

  it('honours the switches', async () => {
    const store = createFinanceStore({ storage: null, now: () => new Date(NOW) });
    store.actions.addBill({ title: 'Rent', amount: 900, dueDate: 12, category: 'housing', isAutoDeduct: false, notifiedThisMonth: false });
    store.actions.updateNotifications({ enableDailyReminder: false, enableBillAlerts: false, enableOverspendAlerts: false });
    renderHook(() => useNotifications(useFinanceStore(store), () => new Date(NOW)));
    await flush();
    expect(FakeNotification.shown).toEqual([]);
  });

  it('can send a test notification', async () => {
    const { hook } = setup();
    await flush();
    FakeNotification.shown = [];
    await act(async () => {
      expect(await hook.result.current.sendTest()).toBe(true);
    });
    expect(titles()).toEqual(['Notifications are on']);
  });
});
