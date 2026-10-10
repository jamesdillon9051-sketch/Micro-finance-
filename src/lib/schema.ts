import {
  BUCKET_KEYS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ROLLOVER_PREFERENCES,
  SETTINGS_SCHEMA_ID,
  SETTINGS_SCHEMA_VERSION,
  VAULT_ICONS,
  type BillReminder,
  type BucketAllocation,
  type DateKey,
  type FinanceData,
  type FinanceMeta,
  type NotificationSettings,
  type Result,
  type SalaryConfig,
  type SavingsVault,
  type SettingsExport,
  type Transaction,
} from '../types';
import { isExpenseCategory, isIncomeCategory, roundMoney } from './budget';
import {
  isValidDateKey,
  isValidMonthKey,
  isValidTimeOfDay,
  toDateKey,
  toMonthKey,
} from './dates';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_MONEY = 1_000_000_000_000;
const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;
/** Reported errors are capped so a badly broken file doesn't produce thousands of lines. */
const MAX_REPORTED_ERRORS = 25;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function createDefaultFinanceData(now: Date): FinanceData {
  return {
    salary: {
      monthlySalary: 0,
      paydayDate: 1,
      allocation: { needs: 50, wants: 30, savings: 20 },
      rolloverPreference: 'none',
    },
    transactions: [],
    bills: [],
    vaults: [],
    notifications: {
      enableDailyReminder: false,
      reminderTime: '20:00',
      enableBillAlerts: true,
      enableOverspendAlerts: true,
      safeToSpendThreshold: 0,
    },
    meta: createDefaultMeta(now),
  };
}

function createDefaultMeta(now: Date): FinanceMeta {
  return { billsMonth: toMonthKey(now), lastAutoDeductDate: null };
}

// ---------------------------------------------------------------------------
// Field readers
//
// Each reader pulls one field out of an unknown record. On failure it pushes a
// message to `errors` and returns a harmless fallback, so entity readers can
// read every field, then check once whether anything went wrong.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string, errors: string[]): Rec | undefined {
  if (isRecord(value)) return value;
  errors.push(`${path} must be an object`);
  return undefined;
}

function readNumber(
  rec: Rec,
  key: string,
  path: string,
  errors: string[],
  min: number,
  max: number,
  integer = false,
): number {
  const value = rec[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path}.${key} must be a number`);
    return min;
  }
  if (integer && !Number.isInteger(value)) {
    errors.push(`${path}.${key} must be a whole number`);
    return min;
  }
  if (value < min || value > max) {
    errors.push(`${path}.${key} must be between ${min} and ${max}`);
    return min;
  }
  return value;
}

/** Money, rounded to 2 decimals. `positive` requires at least 0.01. */
function readMoney(rec: Rec, key: string, path: string, errors: string[], positive: boolean): number {
  return roundMoney(readNumber(rec, key, path, errors, positive ? 0.01 : 0, MAX_MONEY));
}

function readString(
  rec: Rec,
  key: string,
  path: string,
  errors: string[],
  maxLength: number,
  required: boolean,
): string {
  const value = rec[key];
  if (typeof value !== 'string') {
    errors.push(`${path}.${key} must be a string`);
    return '';
  }
  if (required && value.trim().length === 0) {
    errors.push(`${path}.${key} must not be empty`);
  } else if (value.length > maxLength) {
    errors.push(`${path}.${key} must be at most ${maxLength} characters`);
  }
  return value;
}

function readBoolean(rec: Rec, key: string, path: string, errors: string[]): boolean {
  const value = rec[key];
  if (typeof value !== 'boolean') {
    errors.push(`${path}.${key} must be true or false`);
    return false;
  }
  return value;
}

function readEnum<T extends string>(
  rec: Rec,
  key: string,
  path: string,
  errors: string[],
  allowed: readonly T[],
  fallback: T,
): T {
  const value = rec[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    errors.push(`${path}.${key} must be one of: ${allowed.join(', ')}`);
    return fallback;
  }
  return match;
}

function readDateKey(rec: Rec, key: string, path: string, errors: string[]): DateKey {
  const value = rec[key];
  if (typeof value !== 'string' || !isValidDateKey(value)) {
    errors.push(`${path}.${key} must be a valid date formatted YYYY-MM-DD`);
    return '1970-01-01';
  }
  return value;
}

// ---------------------------------------------------------------------------
// Entity readers
// ---------------------------------------------------------------------------

type Reader<T> = (value: unknown, path: string, errors: string[]) => T | undefined;

const readAllocation: Reader<BucketAllocation> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const allocation: BucketAllocation = {
    needs: readNumber(rec, 'needs', path, errors, 0, 100),
    wants: readNumber(rec, 'wants', path, errors, 0, 100),
    savings: readNumber(rec, 'savings', path, errors, 0, 100),
  };
  if (errors.length > start) return undefined;
  const total = BUCKET_KEYS.reduce((sum, bucket) => sum + allocation[bucket], 0);
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`${path} percentages must add up to 100 (got ${roundMoney(total)})`);
    return undefined;
  }
  return allocation;
};

export const readSalaryConfig: Reader<SalaryConfig> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const monthlySalary = readMoney(rec, 'monthlySalary', path, errors, false);
  const paydayDate = readNumber(rec, 'paydayDate', path, errors, 1, 31, true);
  const allocation = readAllocation(rec['allocation'], `${path}.allocation`, errors);
  const rolloverPreference = readEnum(
    rec,
    'rolloverPreference',
    path,
    errors,
    ROLLOVER_PREFERENCES,
    'none',
  );
  if (errors.length > start || !allocation) return undefined;
  return { monthlySalary, paydayDate, allocation, rolloverPreference };
};

export const readTransaction: Reader<Transaction> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const id = readString(rec, 'id', path, errors, MAX_ID_LENGTH, true);
  const amount = readMoney(rec, 'amount', path, errors, true);
  const type = readEnum(rec, 'type', path, errors, ['income', 'expense'] as const, 'expense');
  const date = readDateKey(rec, 'date', path, errors);
  const note = readString(rec, 'note', path, errors, MAX_NOTE_LENGTH, false);
  const isRecurring = readBoolean(rec, 'isRecurring', path, errors);
  const category = readEnum(
    rec,
    'category',
    path,
    errors,
    [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
    'other-wants',
  );
  if (errors.length > start) return undefined;
  if (type === 'income' ? !isIncomeCategory(category) : !isExpenseCategory(category)) {
    errors.push(`${path}.category "${category}" is not a valid ${type} category`);
    return undefined;
  }
  return { id, amount, category, type, date, note, isRecurring };
};

export const readBill: Reader<BillReminder> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const bill: BillReminder = {
    id: readString(rec, 'id', path, errors, MAX_ID_LENGTH, true),
    title: readString(rec, 'title', path, errors, MAX_TITLE_LENGTH, true),
    amount: readMoney(rec, 'amount', path, errors, true),
    dueDate: readNumber(rec, 'dueDate', path, errors, 1, 31, true),
    category: readEnum(rec, 'category', path, errors, EXPENSE_CATEGORIES, 'utilities'),
    isAutoDeduct: readBoolean(rec, 'isAutoDeduct', path, errors),
    notifiedThisMonth: readBoolean(rec, 'notifiedThisMonth', path, errors),
  };
  return errors.length > start ? undefined : bill;
};

export const readVault: Reader<SavingsVault> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const vault: SavingsVault = {
    id: readString(rec, 'id', path, errors, MAX_ID_LENGTH, true),
    name: readString(rec, 'name', path, errors, MAX_TITLE_LENGTH, true),
    targetAmount: readMoney(rec, 'targetAmount', path, errors, true),
    currentAmount: readMoney(rec, 'currentAmount', path, errors, false),
    targetDate: readDateKey(rec, 'targetDate', path, errors),
    icon: readEnum(rec, 'icon', path, errors, VAULT_ICONS, 'piggy-bank'),
  };
  return errors.length > start ? undefined : vault;
};

export const readNotificationSettings: Reader<NotificationSettings> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const reminderTime = rec['reminderTime'];
  if (typeof reminderTime !== 'string' || !isValidTimeOfDay(reminderTime)) {
    errors.push(`${path}.reminderTime must be a 24-hour time formatted HH:mm`);
  }
  const settings: NotificationSettings = {
    enableDailyReminder: readBoolean(rec, 'enableDailyReminder', path, errors),
    reminderTime: typeof reminderTime === 'string' ? reminderTime : '20:00',
    enableBillAlerts: readBoolean(rec, 'enableBillAlerts', path, errors),
    enableOverspendAlerts: readBoolean(rec, 'enableOverspendAlerts', path, errors),
    safeToSpendThreshold: readMoney(rec, 'safeToSpendThreshold', path, errors, false),
  };
  return errors.length > start ? undefined : settings;
};

const readMeta: Reader<FinanceMeta> = (value, path, errors) => {
  const rec = readRecord(value, path, errors);
  if (!rec) return undefined;
  const start = errors.length;
  const billsMonth = rec['billsMonth'];
  if (typeof billsMonth !== 'string' || !isValidMonthKey(billsMonth)) {
    errors.push(`${path}.billsMonth must be a month formatted YYYY-MM`);
  }
  const last = rec['lastAutoDeductDate'];
  if (last !== null && (typeof last !== 'string' || !isValidDateKey(last))) {
    errors.push(`${path}.lastAutoDeductDate must be null or a date formatted YYYY-MM-DD`);
  }
  if (errors.length > start) return undefined;
  return {
    billsMonth: typeof billsMonth === 'string' ? billsMonth : '1970-01',
    lastAutoDeductDate: typeof last === 'string' ? last : null,
  };
};

/** Reads an array of entities, collecting every problem and rejecting duplicate ids. */
function readEntityList<T extends { id: string }>(
  value: unknown,
  path: string,
  errors: string[],
  readItem: Reader<T>,
): T[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const items: T[] = [];
  const seen = new Set<string>();
  value.forEach((raw: unknown, index) => {
    if (errors.length >= MAX_REPORTED_ERRORS) return;
    const item = readItem(raw, `${path}[${index}]`, errors);
    if (!item) return;
    if (seen.has(item.id)) {
      errors.push(`${path}[${index}].id "${item.id}" is used more than once`);
      return;
    }
    seen.add(item.id);
    items.push(item);
  });
  return items;
}

// ---------------------------------------------------------------------------
// Public parsing API
// ---------------------------------------------------------------------------

function finish<T>(value: T | undefined, errors: string[]): Result<T> {
  if (errors.length > 0 || value === undefined) {
    const shown = errors.slice(0, MAX_REPORTED_ERRORS);
    if (errors.length > MAX_REPORTED_ERRORS) shown.push('...and more');
    return { ok: false, errors: shown.length > 0 ? shown : ['Invalid data'] };
  }
  return { ok: true, value };
}

function parseWith<T>(reader: Reader<T>, value: unknown, path: string): Result<T> {
  const errors: string[] = [];
  return finish(reader(value, path, errors), errors);
}

export const parseSalaryConfig = (value: unknown): Result<SalaryConfig> =>
  parseWith(readSalaryConfig, value, 'salary');
export const parseTransaction = (value: unknown): Result<Transaction> =>
  parseWith(readTransaction, value, 'transaction');
export const parseBill = (value: unknown): Result<BillReminder> =>
  parseWith(readBill, value, 'bill');
export const parseVault = (value: unknown): Result<SavingsVault> =>
  parseWith(readVault, value, 'vault');
export const parseNotificationSettings = (value: unknown): Result<NotificationSettings> =>
  parseWith(readNotificationSettings, value, 'notifications');

/**
 * Validates a parsed settings document and returns clean, fully-typed data
 * (unknown properties are dropped). Nothing is returned unless the whole
 * document is valid. `now` supplies defaults for the optional `meta` block.
 */
export function parseSettingsExport(input: unknown, now: Date): Result<FinanceData> {
  const errors: string[] = [];
  const root = readRecord(input, 'document', errors);
  if (!root) return finish<FinanceData>(undefined, errors);

  if (root['schema'] !== SETTINGS_SCHEMA_ID) {
    return finish<FinanceData>(
      undefined,
      [`This is not a Micro Finance backup (expected schema "${SETTINGS_SCHEMA_ID}")`],
    );
  }
  const version = root['schemaVersion'];
  if (version !== SETTINGS_SCHEMA_VERSION) {
    const message =
      typeof version === 'number' && version > SETTINGS_SCHEMA_VERSION
        ? `This backup was made by a newer version of the app (schema v${version}); this app supports v${SETTINGS_SCHEMA_VERSION}`
        : `Unsupported schemaVersion ${JSON.stringify(version)}; this app supports v${SETTINGS_SCHEMA_VERSION}`;
    return finish<FinanceData>(undefined, [message]);
  }

  const data = readRecord(root['data'], 'data', errors);
  if (!data) return finish<FinanceData>(undefined, errors);

  const salary = readSalaryConfig(data['salary'], 'data.salary', errors);
  const transactions = readEntityList(data['transactions'], 'data.transactions', errors, readTransaction);
  const bills = readEntityList(data['bills'], 'data.bills', errors, readBill);
  const vaults = readEntityList(data['vaults'], 'data.vaults', errors, readVault);
  const notifications = readNotificationSettings(data['notifications'], 'data.notifications', errors);
  const meta =
    data['meta'] === undefined ? createDefaultMeta(now) : readMeta(data['meta'], 'data.meta', errors);

  if (errors.length > 0 || !salary || !notifications || !meta) return finish<FinanceData>(undefined, errors);
  return { ok: true, value: { salary, transactions, bills, vaults, notifications, meta } };
}

/** Parses the text of a settings file / stored record. Never throws. */
export function parseSettingsJson(text: string, now: Date): Result<FinanceData> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON'] };
  }
  return parseSettingsExport(parsed, now);
}

export function buildSettingsExport(data: FinanceData, now: Date): SettingsExport {
  return {
    schema: SETTINGS_SCHEMA_ID,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

/** Default file name for a downloaded backup, e.g. `micro-finance-backup-2026-10-10.json`. */
export function backupFileName(now: Date): string {
  return `micro-finance-backup-${toDateKey(now)}.json`;
}
