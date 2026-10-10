import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NewBill, NewTransaction, NewVault } from './useFinanceStore';
import {
  STORAGE_KEY,
  createFinanceStore,
  getDefaultFinanceStore,
  useFinanceStore,
  type StorageLike,
} from './useFinanceStore';

// -- Test helpers ------------------------------------------------------------

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  writes = 0;
  failWith: Error | null = null;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWith) throw this.failWith;
    this.writes += 1;
    this.map.set(key, value);
  }
}

function quotaError(): DOMException {
  return new DOMException('full', 'QuotaExceededError');
}

/** A clock the test can move. */
function createClock(start: Date) {
  let current = start;
  return {
    now: () => new Date(current),
    set(next: Date) {
      current = next;
    },
  };
}

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

const expense: NewTransaction = {
  amount: 25,
  category: 'groceries',
  type: 'expense',
  date: '2026-10-09',
  note: 'milk',
  isRecurring: false,
};
const rent: NewBill = {
  title: 'Rent',
  amount: 1200,
  dueDate: 15,
  category: 'housing',
  isAutoDeduct: true,
  notifiedThisMonth: false,
};
const holiday: NewVault = {
  name: 'Holiday',
  targetAmount: 2000,
  currentAmount: 100,
  targetDate: '2027-06-01',
  icon: 'plane',
};

function setup(start = at(2026, 10, 10)) {
  const storage = new MemoryStorage();
  const clock = createClock(start);
  const make = () => createFinanceStore({ storage, now: clock.now });
  return { storage, clock, make, store: make() };
}

const stored = (storage: MemoryStorage) => JSON.parse(storage.map.get(STORAGE_KEY) ?? 'null');

// -- Persistence -------------------------------------------------------------

describe('persistence', () => {
  it('writes the settings envelope on first load', () => {
    const { storage } = setup();
    expect(stored(storage)).toMatchObject({ schema: 'micro-finance.settings', schemaVersion: 1 });
  });

  it('saves every change and restores it in a new session', () => {
    const { storage, store, make } = setup();
    store.actions.updateSalary({ monthlySalary: 3200, paydayDate: 25 });
    const added = store.actions.addTransaction(expense);
    store.actions.addBill(rent);
    store.actions.addVault(holiday);
    store.actions.updateNotifications({ enableDailyReminder: true, reminderTime: '08:30' });
    expect(added.ok).toBe(true);

    const reopened = make().getSnapshot().data;
    expect(reopened).toEqual(store.getSnapshot().data);
    expect(reopened.salary).toMatchObject({ monthlySalary: 3200, paydayDate: 25 });
    expect(reopened.transactions).toHaveLength(1);
    expect(stored(storage).data.notifications.reminderTime).toBe('08:30');
  });

  it('rejects invalid input without touching state or storage', () => {
    const { storage, store } = setup();
    const before = storage.map.get(STORAGE_KEY);
    const writes = storage.writes;

    const results = [
      store.actions.addTransaction({ ...expense, amount: -1 }),
      store.actions.addTransaction({ ...expense, category: 'salary' }),
      store.actions.addBill({ ...rent, dueDate: 40 }),
      store.actions.addVault({ ...holiday, targetDate: 'tomorrow' }),
      store.actions.updateSalary({ allocation: { needs: 60, wants: 30, savings: 20 } }),
      store.actions.updateNotifications({ reminderTime: '9am' }),
      store.actions.updateTransaction('missing', { note: 'x' }),
    ];
    for (const result of results) expect(result.ok).toBe(false);
    expect(storage.map.get(STORAGE_KEY)).toBe(before);
    expect(storage.writes).toBe(writes);
  });

  it('updates and deletes by id', () => {
    const { store } = setup();
    const added = store.actions.addTransaction(expense);
    if (!added.ok) throw new Error('add failed');
    const id = added.value.id;

    expect(store.actions.updateTransaction(id, { amount: 30.456, note: 'bigger' })).toMatchObject({
      ok: true,
      value: { id, amount: 30.46, note: 'bigger', category: 'groceries' },
    });
    expect(store.actions.deleteTransaction(id)).toBe(true);
    expect(store.actions.deleteTransaction(id)).toBe(false);
    expect(store.getSnapshot().data.transactions).toEqual([]);
  });

  it('adjusts vault balances and refuses overdrafts', () => {
    const { store } = setup();
    const added = store.actions.addVault(holiday);
    if (!added.ok) throw new Error('add failed');
    const id = added.value.id;

    expect(store.actions.adjustVaultBalance(id, 50.5)).toMatchObject({ ok: true, value: { currentAmount: 150.5 } });
    expect(store.actions.adjustVaultBalance(id, -1000).ok).toBe(false);
    expect(store.actions.adjustVaultBalance(id, Number.NaN).ok).toBe(false);
    expect(store.getSnapshot().data.vaults[0]?.currentAmount).toBe(150.5);
    expect(store.actions.adjustVaultBalance('missing', 5).ok).toBe(false);
  });

  it('resetAll returns to defaults and persists them', () => {
    const { storage, store } = setup();
    store.actions.addTransaction(expense);
    store.actions.resetAll();
    expect(store.getSnapshot().data.transactions).toEqual([]);
    expect(stored(storage).data.transactions).toEqual([]);
  });
});

// -- Failure handling --------------------------------------------------------

describe('storage failures', () => {
  it('keeps a copy of unreadable saved data before starting fresh', () => {
    const storage = new MemoryStorage();
    storage.map.set(STORAGE_KEY, '{"this is": broken');
    const store = createFinanceStore({ storage });

    expect(storage.map.get(`${STORAGE_KEY}:corrupt-backup`)).toBe('{"this is": broken');
    expect(store.getSnapshot().storageError).toMatch(/could not be read/);
    expect(store.getSnapshot().data.transactions).toEqual([]);
    expect(stored(storage).schema).toBe('micro-finance.settings'); // main key now holds valid defaults
  });

  it('does not overwrite data from a newer app version', () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ schema: 'micro-finance.settings', schemaVersion: 9, data: {} });
    storage.map.set(STORAGE_KEY, future);
    const store = createFinanceStore({ storage });
    expect(storage.map.get(`${STORAGE_KEY}:corrupt-backup`)).toBe(future);
    expect(store.getSnapshot().storageError).toMatch(/newer version/);
  });

  it('locks saving if the unreadable data cannot be backed up', () => {
    const storage = new MemoryStorage();
    storage.map.set(STORAGE_KEY, 'garbage');
    storage.failWith = quotaError();
    const store = createFinanceStore({ storage });
    storage.failWith = null;

    expect(store.getSnapshot().storageError).toMatch(/saving is turned off/);
    store.actions.addTransaction(expense);
    expect(storage.map.get(STORAGE_KEY)).toBe('garbage');
    expect(store.getSnapshot().data.transactions).toHaveLength(1); // still usable in memory
  });

  it('keeps working in memory when storage is full, then recovers', () => {
    const { storage, store } = setup();
    storage.failWith = quotaError();
    store.actions.addTransaction(expense);
    expect(store.getSnapshot().data.transactions).toHaveLength(1);
    expect(store.getSnapshot().storageError).toMatch(/storage is full/);

    storage.failWith = null;
    store.actions.addTransaction({ ...expense, note: 'second' });
    expect(store.getSnapshot().storageError).toBeNull();
    expect(stored(storage).data.transactions).toHaveLength(2);
  });

  it('works with no storage at all and says so', () => {
    const store = createFinanceStore({ storage: null });
    expect(store.getSnapshot().storageError).toMatch(/unavailable/);
    expect(store.actions.addTransaction(expense).ok).toBe(true);
  });
});

// -- Export / import ---------------------------------------------------------

describe('export and import', () => {
  it('restores a backup exactly, into a brand-new store', () => {
    const source = setup();
    source.store.actions.updateSalary({ monthlySalary: 4100, rolloverPreference: 'move-to-savings' });
    source.store.actions.addTransaction(expense);
    source.store.actions.addTransaction({ ...expense, type: 'income', category: 'salary', amount: 4100 });
    source.store.actions.addBill(rent);
    source.store.actions.addVault(holiday);
    const json = source.store.actions.exportToJson();

    expect(JSON.parse(json)).toMatchObject({ schema: 'micro-finance.settings', schemaVersion: 1 });

    const target = setup();
    const result = target.store.actions.importFromJson(json);
    expect(result).toEqual({ ok: true, value: { transactions: 2, bills: 1, vaults: 1 } });
    expect(target.store.getSnapshot().data).toEqual(source.store.getSnapshot().data);
    expect(stored(target.storage).data.salary.rolloverPreference).toBe('move-to-savings'); // persisted too
  });

  it('is all-or-nothing: a bad file changes nothing', () => {
    const { storage, store } = setup();
    store.actions.addTransaction(expense);
    const dataBefore = store.getSnapshot().data;
    const rawBefore = storage.map.get(STORAGE_KEY);

    const tampered = JSON.parse(store.actions.exportToJson());
    tampered.data.bills = [{ ...rent, id: 'b1', dueDate: 99 }];
    tampered.data.transactions[0].amount = 'lots';

    for (const text of [JSON.stringify(tampered), 'not json', '{}']) {
      expect(store.actions.importFromJson(text).ok).toBe(false);
    }
    expect(store.getSnapshot().data).toBe(dataBefore);
    expect(storage.map.get(STORAGE_KEY)).toBe(rawBefore);
  });

  it('imports from a File', async () => {
    const source = setup();
    source.store.actions.addVault(holiday);
    const file = new File([source.store.actions.exportToJson()], 'backup.json', { type: 'application/json' });

    const target = setup();
    expect(await target.store.actions.importFromFile(file)).toEqual({
      ok: true,
      value: { transactions: 0, bills: 0, vaults: 1 },
    });
    expect(await target.store.actions.importFromFile(new File(['nope'], 'x.json'))).toMatchObject({ ok: false });
  });
});

// -- Monthly / daily maintenance ---------------------------------------------

describe('maintenance', () => {
  it('resets "notified this month" flags when the month changes', () => {
    const { clock, store, storage } = setup(at(2026, 10, 10));
    const bill = store.actions.addBill({ ...rent, isAutoDeduct: false });
    if (!bill.ok) throw new Error('add failed');
    store.actions.updateBill(bill.value.id, { notifiedThisMonth: true });

    store.runMaintenance();
    expect(store.getSnapshot().data.bills[0]?.notifiedThisMonth).toBe(true); // same month: untouched

    clock.set(at(2026, 11, 1));
    store.runMaintenance();
    expect(store.getSnapshot().data.bills[0]?.notifiedThisMonth).toBe(false);
    expect(store.getSnapshot().data.meta.billsMonth).toBe('2026-11');
    expect(stored(storage).data.bills[0].notifiedThisMonth).toBe(false);
  });

  it('records an auto-deduct bill once on its due date', () => {
    const { clock, store } = setup(at(2026, 10, 14));
    store.actions.addBill(rent);
    expect(store.getSnapshot().data.transactions).toEqual([]);

    clock.set(at(2026, 10, 15));
    store.runMaintenance();
    store.runMaintenance(); // idempotent
    const [tx, ...rest] = store.getSnapshot().data.transactions;
    expect(rest).toEqual([]);
    expect(tx).toMatchObject({ amount: 1200, category: 'housing', type: 'expense', date: '2026-10-15' });
  });

  it('catches up on due dates missed while the app was closed', () => {
    const { clock, store, make } = setup(at(2026, 10, 14));
    store.actions.addBill(rent);

    clock.set(at(2026, 12, 20)); // app reopened two months later
    const reopened = make();
    expect(reopened.getSnapshot().data.transactions.map((t) => t.date)).toEqual([
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ]);
  });

  it('does not back-date a bill that was just added', () => {
    const { store } = setup(at(2026, 10, 20));
    store.actions.addBill(rent); // due on the 15th, already past this month
    store.runMaintenance();
    expect(store.getSnapshot().data.transactions).toEqual([]);
  });

  it('does not double-post bills restored from a backup', () => {
    const source = setup(at(2026, 10, 14));
    source.store.actions.addBill(rent);
    source.clock.set(at(2026, 10, 16));
    source.store.runMaintenance();
    const json = source.store.actions.exportToJson();

    const target = setup(at(2026, 10, 20));
    target.store.actions.importFromJson(json);
    expect(target.store.getSnapshot().data.transactions).toHaveLength(1);
  });
});

// -- Cross-tab sync -----------------------------------------------------------

describe('syncFromStorage', () => {
  it('adopts a newer write from another tab without writing it back', () => {
    const { storage, make, store: tabA } = setup();
    const tabB = make();
    tabA.actions.addTransaction(expense);

    let notified = 0;
    tabB.subscribe(() => (notified += 1));
    const writes = storage.writes;
    tabB.syncFromStorage();
    tabB.syncFromStorage(); // second call: nothing new

    expect(tabB.getSnapshot().data.transactions).toHaveLength(1);
    expect(notified).toBe(1);
    expect(storage.writes).toBe(writes);
  });

  it('ignores unreadable writes from elsewhere', () => {
    const { storage, store } = setup();
    store.actions.addTransaction(expense);
    storage.map.set(STORAGE_KEY, 'oops');
    store.syncFromStorage();
    expect(store.getSnapshot().data.transactions).toHaveLength(1);
  });
});

// -- React hook ---------------------------------------------------------------

describe('useFinanceStore', () => {
  it('re-renders on changes and recalculates the overview', () => {
    const { store } = setup();
    const { result } = renderHook(() => useFinanceStore(store));

    expect(result.current.overview.buckets.needs.allocated).toBe(0);
    act(() => {
      result.current.updateSalary({ monthlySalary: 2000, paydayDate: 1 });
    });
    expect(result.current.overview.buckets.needs.allocated).toBe(1000);

    act(() => {
      result.current.addTransaction({ ...expense, amount: 250, date: '2026-10-05' });
    });
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.overview.buckets.needs).toMatchObject({ spent: 250, remaining: 750 });
  });

  it('shares one state between every component that uses it', () => {
    const { store } = setup();
    const first = renderHook(() => useFinanceStore(store));
    const second = renderHook(() => useFinanceStore(store));

    act(() => {
      first.result.current.addVault(holiday);
    });
    expect(second.result.current.vaults).toHaveLength(1);
  });

  it('keeps action identities stable across renders', () => {
    const { store } = setup();
    const { result, rerender } = renderHook(() => useFinanceStore(store));
    const before = result.current.addTransaction;
    act(() => {
      result.current.addTransaction(expense);
    });
    rerender();
    expect(result.current.addTransaction).toBe(before);
  });

  it('picks up changes from other tabs via the storage event', () => {
    const { storage, make, store } = setup();
    const { result } = renderHook(() => useFinanceStore(store));

    const otherTab = make();
    otherTab.actions.addTransaction(expense);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: storage.map.get(STORAGE_KEY) ?? null }));
    });
    expect(result.current.transactions).toHaveLength(1);
  });
});

describe('default store (window.localStorage)', () => {
  afterEach(() => window.localStorage.clear());

  it('persists to real localStorage', () => {
    const store = getDefaultFinanceStore();
    expect(getDefaultFinanceStore()).toBe(store); // singleton
    store.actions.addTransaction(expense);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}').data.transactions).toHaveLength(1);
  });
});
