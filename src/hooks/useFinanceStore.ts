import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { autoDeductTransactionId, getDueAutoDeductions, roundMoney } from '../lib/budget';
import { addDays, fromDateKey, toDateKey, toMonthKey } from '../lib/dates';
import { settleCompletedWeeks, summarizeBudget } from '../lib/engine';
import {
  backupFileName,
  buildSettingsExport,
  createDefaultFinanceData,
  parseBill,
  parseNotificationSettings,
  parseSalaryConfig,
  parseSettingsJson,
  parseTransaction,
  parseVault,
} from '../lib/schema';
import type {
  BillReminder,
  BudgetOverview,
  DateKey,
  FinanceData,
  ImportSummary,
  NotificationSettings,
  Result,
  RolloverRecord,
  SalaryConfig,
  SavingsVault,
  Transaction,
} from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export const STORAGE_KEY = 'micro-finance:state';
const CORRUPT_BACKUP_SUFFIX = ':corrupt-backup';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAINTENANCE_INTERVAL_MS = 60_000;
/** How long delivered-notification keys are remembered. */
const NOTIFICATION_LOG_DAYS = 62;

/** The slice of the Web Storage API the store needs (so tests can inject a fake). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type NewTransaction = Omit<Transaction, 'id'>;
export type TransactionPatch = Partial<Omit<Transaction, 'id'>>;
export type NewBill = Omit<BillReminder, 'id' | 'createdOn'>;
export type BillPatch = Partial<Omit<BillReminder, 'id' | 'createdOn'>>;

/** An alert that was delivered; `billId` also marks that bill as notified for the month. */
export interface NotificationReceipt {
  key: string;
  billId?: string | undefined;
}
export type NewVault = Omit<SavingsVault, 'id'>;
export type VaultPatch = Partial<Omit<SavingsVault, 'id'>>;
export type SalaryPatch = Partial<SalaryConfig>;
export type NotificationPatch = Partial<NotificationSettings>;

/**
 * Every mutation validates its input first. On failure it returns
 * `{ ok: false, errors }` and leaves the state and storage untouched.
 */
export interface FinanceActions {
  /**
   * Edits salary, payday, bucket percentages (which must total 100), rollover preference
   * and the rollover vault. The weekly caps and safe-to-spend recalculate immediately.
   */
  updateSalary(patch: SalaryPatch): Result<SalaryConfig>;

  addTransaction(input: NewTransaction): Result<Transaction>;
  updateTransaction(id: string, patch: TransactionPatch): Result<Transaction>;
  /** Returns whether a transaction with that id existed. */
  deleteTransaction(id: string): boolean;

  addBill(input: NewBill): Result<BillReminder>;
  updateBill(id: string, patch: BillPatch): Result<BillReminder>;
  deleteBill(id: string): boolean;
  /**
   * Records this month's payment of a bill as an expense dated today. Safe to call twice: the
   * payment has a fixed id per bill and month, the same one auto-deducted bills use. To undo it,
   * delete the returned transaction.
   */
  markBillPaid(id: string): Result<Transaction>;

  addVault(input: NewVault): Result<SavingsVault>;
  updateVault(id: string, patch: VaultPatch): Result<SavingsVault>;
  /** Adds (positive) or withdraws (negative) money. A withdrawal larger than the balance is rejected. */
  adjustVaultBalance(id: string, delta: number): Result<SavingsVault>;
  /** Returns whether the vault existed. If it was the rollover destination, that setting is cleared. */
  deleteVault(id: string): boolean;

  updateNotifications(patch: NotificationPatch): Result<NotificationSettings>;
  /** Remembers delivered alerts so they are never sent twice, and flags their bills as notified this month. */
  recordNotificationsSent(receipts: readonly NotificationReceipt[]): void;

  /** The full state as a pretty-printed settings document (see `SettingsExport`). */
  exportToJson(): string;
  /** Saves `exportToJson()` as a file through the browser's download mechanism. */
  downloadBackup(fileName?: string): void;
  /** Replaces ALL current data with a backup. All-or-nothing: an invalid file changes nothing. */
  importFromJson(text: string): Result<ImportSummary>;
  importFromFile(file: File): Promise<Result<ImportSummary>>;
  /** Replaces ALL current data with defaults. */
  resetAll(): void;
}

export interface FinanceSnapshot {
  data: FinanceData;
  /** User-facing message when data could not be loaded or saved; `null` when everything is fine. */
  storageError: string | null;
}

export interface FinanceStore {
  readonly storageKey: string;
  readonly actions: FinanceActions;
  getSnapshot(): FinanceSnapshot;
  subscribe(listener: () => void): () => void;
  /** Today's local date according to the store's clock. */
  getToday(): DateKey;
  /** Runs the monthly bill-flag reset and due auto-deductions. Safe to call any time; a no-op when up to date. */
  runMaintenance(): void;
  /** Pulls in a change another tab wrote to storage. */
  syncFromStorage(): void;
}

export interface FinanceStoreOptions {
  /** Defaults to `window.localStorage`. Pass `null` to run purely in memory. */
  storage?: StorageLike | null;
  storageKey?: string;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function describeSaveError(error: unknown): string {
  const isQuota =
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return isQuota
    ? 'Device storage is full, so your latest changes could not be saved. Export a backup and free up some space.'
    : 'Your latest changes could not be saved to this device.';
}

const NO_STORAGE_MESSAGE =
  'Saving is unavailable in this browser, so changes will be lost when you close the app. Export a backup to keep them.';

function notFound(id: string): { ok: false; errors: string[] } {
  return { ok: false, errors: [`No item found with id "${id}"`] };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function createFinanceStore(options: FinanceStoreOptions = {}): FinanceStore {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  const storageKey = options.storageKey ?? STORAGE_KEY;
  const now = options.now ?? (() => new Date());

  const listeners = new Set<() => void>();
  /** The exact string last read from / written to storage; used to ignore our own echoes. */
  let lastSerialized: string | null = null;
  /** Set when unreadable saved data couldn't be backed up, so we must not overwrite it. */
  let persistenceLockedMessage: string | null = null;
  /** What went wrong while loading. Stays for the whole session so the user actually sees it. */
  let loadNotice: string | null = null;
  let snapshot: FinanceSnapshot;

  function publish(data: FinanceData, storageError: string | null): void {
    if (data === snapshot.data && storageError === snapshot.storageError) return;
    snapshot = { data, storageError };
    listeners.forEach((listener) => listener());
  }

  /** Writes `data` to storage. Returns a user-facing message on failure, `null` on success. */
  function save(data: FinanceData): string | null {
    if (persistenceLockedMessage) return persistenceLockedMessage;
    if (!storage) return NO_STORAGE_MESSAGE;
    try {
      const serialized = JSON.stringify(buildSettingsExport(data, now()));
      storage.setItem(storageKey, serialized);
      lastSerialized = serialized;
      return null;
    } catch (error) {
      return describeSaveError(error);
    }
  }

  /**
   * The one place state changes: persist first, then notify subscribers.
   * A failed save is reported until a later save succeeds; the load notice is kept regardless.
   */
  function setData(data: FinanceData): void {
    publish(data, save(data) ?? loadNotice);
  }

  function load(): { data: FinanceData; notice: string | null; needsSave: boolean } {
    const defaults = createDefaultFinanceData(now());
    if (!storage) return { data: defaults, notice: NO_STORAGE_MESSAGE, needsSave: false };

    let raw: string | null;
    try {
      raw = storage.getItem(storageKey);
    } catch {
      return { data: defaults, notice: NO_STORAGE_MESSAGE, needsSave: false };
    }
    if (raw === null) return { data: defaults, notice: null, needsSave: true };

    const parsed = parseSettingsJson(raw, now());
    if (parsed.ok) {
      lastSerialized = raw;
      return { data: parsed.value, notice: null, needsSave: false };
    }

    // The stored record is unreadable (corrupted, or written by a newer app
    // version). Keep a copy before starting fresh so nothing is destroyed.
    const reason = parsed.errors[0] ?? 'unknown problem';
    try {
      storage.setItem(storageKey + CORRUPT_BACKUP_SUFFIX, raw);
      return {
        data: defaults,
        notice: `Your saved data could not be read (${reason}). A copy was kept and the app was reset.`,
        needsSave: true,
      };
    } catch {
      persistenceLockedMessage = `Your saved data could not be read (${reason}) and could not be backed up, so saving is turned off to protect it.`;
      return { data: defaults, notice: persistenceLockedMessage, needsSave: false };
    }
  }

  /** Pure housekeeping: returns the same object when there is nothing to do. */
  function withMaintenance(data: FinanceData): FinanceData {
    const today = now();
    const todayKey = toDateKey(today);
    const month = toMonthKey(today);
    let next = data;

    // "Notified this month" flags are only valid for the month they were set in.
    if (next.meta.billsMonth !== month) {
      next = {
        ...next,
        bills: next.bills.map((bill) =>
          bill.notifiedThisMonth ? { ...bill, notifiedThisMonth: false } : bill,
        ),
        meta: { ...next.meta, billsMonth: month },
      };
    }

    // Record auto-deduct bills that fell due since the last run (including days the app was closed).
    const last = next.meta.lastAutoDeductDate;
    if (last === null || last < todayKey) {
      const existingIds = new Set(next.transactions.map((tx) => tx.id));
      const due = getDueAutoDeductions(next.bills, existingIds, last, todayKey);
      next = {
        ...next,
        transactions: due.length > 0 ? [...next.transactions, ...due] : next.transactions,
        meta: { ...next.meta, lastAutoDeductDate: todayKey },
      };
    }

    // Settle the surplus of finished weeks. This runs last so auto-deducted bills already count as spending.
    return settleCompletedWeeks(next, today);
  }

  // -- Initial state --------------------------------------------------------

  const loaded = load();
  loadNotice = loaded.notice;
  snapshot = { data: loaded.data, storageError: loadNotice };
  if (loaded.needsSave) setData(loaded.data);

  function runMaintenance(): void {
    const next = withMaintenance(snapshot.data);
    if (next !== snapshot.data) setData(next);
  }
  runMaintenance();

  // -- Generic add / update / delete for the three entity collections -------

  function collection<T extends { id: string }, N extends object = Omit<T, 'id'>>(
    select: (data: FinanceData) => T[],
    assign: (data: FinanceData, items: T[]) => FinanceData,
    parse: (value: unknown) => Result<T>,
    /** Fills in fields the store owns (like `createdOn`) before the new item is validated. */
    prepare: (input: N) => object = (input) => input,
  ) {
    return {
      add(input: N): Result<T> {
        const parsed = parse({ ...prepare(input), id: createId() });
        if (!parsed.ok) return parsed;
        const data = snapshot.data;
        setData(assign(data, [...select(data), parsed.value]));
        return parsed;
      },
      update(id: string, patch: Partial<Omit<T, 'id'>>): Result<T> {
        const data = snapshot.data;
        const items = select(data);
        const existing = items.find((item) => item.id === id);
        if (!existing) return notFound(id);
        const parsed = parse({ ...existing, ...patch, id });
        if (!parsed.ok) return parsed;
        setData(assign(data, items.map((item) => (item.id === id ? parsed.value : item))));
        return parsed;
      },
      remove(id: string): boolean {
        const data = snapshot.data;
        const items = select(data);
        if (!items.some((item) => item.id === id)) return false;
        setData(assign(data, items.filter((item) => item.id !== id)));
        return true;
      },
    };
  }

  const transactions = collection(
    (data) => data.transactions,
    (data, items) => ({ ...data, transactions: items }),
    parseTransaction,
  );
  const bills = collection<BillReminder, NewBill>(
    (data) => data.bills,
    (data, items) => ({ ...data, bills: items }),
    parseBill,
    (input) => ({ ...input, createdOn: toDateKey(now()) }),
  );
  const vaults = collection(
    (data) => data.vaults,
    (data, items) => ({ ...data, vaults: items }),
    parseVault,
  );

  // -- Export / import -------------------------------------------------------

  function exportToJson(): string {
    return JSON.stringify(buildSettingsExport(snapshot.data, now()), null, 2);
  }

  function importFromJson(text: string): Result<ImportSummary> {
    if (text.length > MAX_IMPORT_BYTES) {
      return { ok: false, errors: ['The file is too large to be a Micro Finance backup'] };
    }
    const parsed = parseSettingsJson(text, now());
    if (!parsed.ok) return parsed;
    const data = withMaintenance(parsed.value);
    setData(data);
    return {
      ok: true,
      value: {
        transactions: data.transactions.length,
        bills: data.bills.length,
        vaults: data.vaults.length,
      },
    };
  }

  const actions: FinanceActions = {
    updateSalary(patch) {
      const parsed = parseSalaryConfig({ ...snapshot.data.salary, ...patch });
      if (!parsed.ok) return parsed;
      const { rolloverVaultId } = parsed.value;
      if (rolloverVaultId !== null && !snapshot.data.vaults.some((vault) => vault.id === rolloverVaultId)) {
        return { ok: false, errors: ['The chosen savings vault no longer exists'] };
      }
      setData({ ...snapshot.data, salary: parsed.value });
      return parsed;
    },

    addTransaction: transactions.add,
    updateTransaction: transactions.update,
    deleteTransaction: transactions.remove,

    addBill: bills.add,
    updateBill: bills.update,
    deleteBill: bills.remove,
    markBillPaid(id) {
      const data = snapshot.data;
      const bill = data.bills.find((item) => item.id === id);
      if (!bill) return notFound(id);
      const today = now();
      const paymentId = autoDeductTransactionId(bill.id, toMonthKey(today));
      const existing = data.transactions.find((tx) => tx.id === paymentId);
      if (existing) return { ok: true, value: existing };
      const parsed = parseTransaction({
        id: paymentId,
        amount: bill.amount,
        category: bill.category,
        type: 'expense',
        date: toDateKey(today),
        note: `Paid: ${bill.title}`,
        isRecurring: true,
      });
      if (!parsed.ok) return parsed;
      setData({ ...data, transactions: [...data.transactions, parsed.value] });
      return parsed;
    },

    addVault: vaults.add,
    updateVault: vaults.update,
    deleteVault(id) {
      const data = snapshot.data;
      if (!data.vaults.some((vault) => vault.id === id)) return false;
      setData({
        ...data,
        vaults: data.vaults.filter((vault) => vault.id !== id),
        // Never leave the rollover pointing at a vault that no longer exists.
        salary: data.salary.rolloverVaultId === id ? { ...data.salary, rolloverVaultId: null } : data.salary,
      });
      return true;
    },
    adjustVaultBalance(id, delta) {
      const vault = snapshot.data.vaults.find((item) => item.id === id);
      if (!vault) return notFound(id);
      if (!Number.isFinite(delta)) return { ok: false, errors: ['The amount must be a number'] };
      const next = roundMoney(vault.currentAmount + delta);
      if (next < 0) return { ok: false, errors: ['Cannot withdraw more than the vault holds'] };
      return vaults.update(id, { currentAmount: next });
    },

    updateNotifications(patch) {
      const parsed = parseNotificationSettings({ ...snapshot.data.notifications, ...patch });
      if (!parsed.ok) return parsed;
      setData({ ...snapshot.data, notifications: parsed.value });
      return parsed;
    },

    recordNotificationsSent(receipts) {
      if (receipts.length === 0) return;
      const data = snapshot.data;
      const cutoff = toDateKey(addDays(now(), -NOTIFICATION_LOG_DAYS));
      // Log keys begin with their date (YYYY-MM-DD), so old ones can be dropped by prefix.
      const log = [...new Set([...data.meta.notificationLog, ...receipts.map((receipt) => receipt.key)])].filter(
        (key) => key.slice(0, 10) >= cutoff,
      );
      const notifiedBills = new Set(receipts.flatMap((receipt) => (receipt.billId ? [receipt.billId] : [])));
      setData({
        ...data,
        bills: notifiedBills.size
          ? data.bills.map((bill) => (notifiedBills.has(bill.id) ? { ...bill, notifiedThisMonth: true } : bill))
          : data.bills,
        meta: { ...data.meta, notificationLog: log },
      });
    },

    exportToJson,
    downloadBackup(fileName = backupFileName(now())) {
      if (typeof document === 'undefined') return;
      const blob = new Blob([exportToJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke later: revoking synchronously can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    importFromJson,
    async importFromFile(file) {
      if (file.size > MAX_IMPORT_BYTES) {
        return { ok: false, errors: ['The file is too large to be a Micro Finance backup'] };
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        return { ok: false, errors: ['The file could not be read'] };
      }
      return importFromJson(text);
    },
    resetAll() {
      setData(createDefaultFinanceData(now()));
    },
  };

  return {
    storageKey,
    actions,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getToday: () => toDateKey(now()),
    runMaintenance,
    syncFromStorage() {
      if (!storage) return;
      let raw: string | null;
      try {
        raw = storage.getItem(storageKey);
      } catch {
        return;
      }
      if (raw === null || raw === lastSerialized) return;
      const parsed = parseSettingsJson(raw, now());
      // Ignore unreadable writes; the next save from this tab will overwrite them.
      if (!parsed.ok) return;
      lastSerialized = raw;
      publish(parsed.value, snapshot.storageError);
    },
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

let defaultStore: FinanceStore | undefined;

/** The app-wide store, created on first use so importing this module has no side effects. */
export function getDefaultFinanceStore(): FinanceStore {
  defaultStore ??= createFinanceStore();
  return defaultStore;
}

export interface FinanceState {
  /** The complete saved state, for features that need all of it (notifications, export). */
  data: FinanceData;
  salary: SalaryConfig;
  transactions: Transaction[];
  bills: BillReminder[];
  vaults: SavingsVault[];
  notifications: NotificationSettings;
  /** History of weekly surplus that was carried forward or moved to a vault, oldest first. */
  rollovers: RolloverRecord[];
  /** Pay-period totals, this week's caps and today's safe-to-spend; recalculated when the data or the day changes. */
  overview: BudgetOverview;
  /** Today's local date; updates when the day rolls over so screens never show a stale "today". */
  today: DateKey;
  storageError: string | null;
}

export type UseFinanceStoreResult = FinanceState & FinanceActions;

/**
 * App-wide finance state, persisted to localStorage on every change.
 *
 * Every component that calls this shares the same state, so no provider is
 * needed. Changes made in another tab/window are picked up automatically.
 * The `store` argument exists for tests and previews; leave it out in the app.
 */
export function useFinanceStore(store: FinanceStore = getDefaultFinanceStore()): UseFinanceStoreResult {
  const { data, storageError } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [todayKey, setTodayKey] = useState<DateKey>(() => store.getToday());

  useEffect(() => {
    const refresh = (): void => {
      store.runMaintenance();
      setTodayKey(store.getToday());
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onStorage = (event: StorageEvent): void => {
      // `key === null` means the whole storage area was cleared.
      if (event.key === null || event.key === store.storageKey) store.syncFromStorage();
    };

    refresh();
    const interval = window.setInterval(refresh, MAINTENANCE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [store]);

  const { salary, transactions, bills, vaults, notifications, rollovers } = data;
  const overview = useMemo(
    () => summarizeBudget({ salary, transactions, rollovers }, fromDateKey(todayKey)),
    [salary, transactions, rollovers, todayKey],
  );

  return {
    data,
    salary,
    transactions,
    bills,
    vaults,
    notifications,
    rollovers,
    overview,
    today: todayKey,
    storageError,
    ...store.actions,
  };
}
