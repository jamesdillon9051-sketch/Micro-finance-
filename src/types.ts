/**
 * Domain model for the Personal Finance PWA.
 *
 * Conventions used throughout the app:
 *  - Money is a plain number in the user's currency, rounded to 2 decimals.
 *    Amounts are never negative; direction comes from `Transaction.type`.
 *  - Calendar dates are local `YYYY-MM-DD` strings (`DateKey`), never UTC
 *    timestamps, so a date can't shift when the user changes time zone.
 *  - "Day of month" fields are integers 1-31. In months that are shorter, the
 *    last day of that month is used (e.g. 31 -> Feb 28/29).
 */

// ---------------------------------------------------------------------------
// Primitive aliases
// ---------------------------------------------------------------------------

/** Local calendar date, `YYYY-MM-DD`. */
export type DateKey = string;
/** Local calendar month, `YYYY-MM`. */
export type MonthKey = string;
/** 24-hour local time of day, `HH:mm`. */
export type TimeOfDay = string;

// ---------------------------------------------------------------------------
// Budget buckets & categories
// ---------------------------------------------------------------------------

export const BUCKET_KEYS = ['needs', 'wants', 'savings'] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

/** Percentage (0-100) of each pay period's salary given to every bucket. Must total 100. */
export interface BucketAllocation {
  needs: number;
  wants: number;
  savings: number;
}

/**
 * Every expense category and the bucket it counts against.
 * This is the single source of truth: `ExpenseCategory` is derived from it.
 */
export const CATEGORY_BUCKET = {
  // Needs
  housing: 'needs',
  utilities: 'needs',
  groceries: 'needs',
  transport: 'needs',
  healthcare: 'needs',
  insurance: 'needs',
  debt: 'needs',
  education: 'needs',
  // Wants
  dining: 'wants',
  entertainment: 'wants',
  shopping: 'wants',
  subscriptions: 'wants',
  travel: 'wants',
  'personal-care': 'wants',
  gifts: 'wants',
  'other-wants': 'wants',
  // Savings
  'savings-contribution': 'savings',
  investments: 'savings',
  'emergency-fund': 'savings',
} as const satisfies Record<string, BucketKey>;

export type ExpenseCategory = keyof typeof CATEGORY_BUCKET;
export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_BUCKET) as ExpenseCategory[];

export const INCOME_CATEGORIES = [
  'salary',
  'bonus',
  'freelance',
  'investment-income',
  'gift-received',
  'other-income',
] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export type Category = ExpenseCategory | IncomeCategory;

export type TransactionType = 'income' | 'expense';

// ---------------------------------------------------------------------------
// 1. SalaryConfig
// ---------------------------------------------------------------------------

/**
 * What happens to money left in a bucket when a pay period ends.
 *  - `none`            each period starts fresh.
 *  - `carry-forward`   unspent Needs/Wants/Savings stays in the same bucket.
 *  - `move-to-savings` unspent Needs/Wants is moved into the Savings bucket.
 */
export const ROLLOVER_PREFERENCES = ['none', 'carry-forward', 'move-to-savings'] as const;
export type RolloverPreference = (typeof ROLLOVER_PREFERENCES)[number];

export interface SalaryConfig {
  /** Take-home pay per month. `0` means "not configured yet". */
  monthlySalary: number;
  /** Day of month (1-31) on which salary arrives; a pay period starts on this day. */
  paydayDate: number;
  /** How each pay period's salary is split across Needs / Wants / Savings (percent). */
  allocation: BucketAllocation;
  rolloverPreference: RolloverPreference;
}

// ---------------------------------------------------------------------------
// 2. Transaction
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  /** Always positive; `type` decides whether it adds or subtracts. */
  amount: number;
  /** Must be an `IncomeCategory` when `type` is 'income', otherwise an `ExpenseCategory`. */
  category: Category;
  type: TransactionType;
  date: DateKey;
  note: string;
  isRecurring: boolean;
}

// ---------------------------------------------------------------------------
// 3. BillReminder
// ---------------------------------------------------------------------------

export interface BillReminder {
  id: string;
  title: string;
  amount: number;
  /** Day of month (1-31) on which the bill is due. */
  dueDate: number;
  category: ExpenseCategory;
  /** When true, the store records an expense transaction automatically on the due date. */
  isAutoDeduct: boolean;
  /** Whether the user has already been alerted about this bill in the current calendar month. Reset automatically each month. */
  notifiedThisMonth: boolean;
}

// ---------------------------------------------------------------------------
// 4. SavingsVault
// ---------------------------------------------------------------------------

/** Icon keys a vault can use. The UI maps each key to a Lucide icon component. */
export const VAULT_ICONS = [
  'piggy-bank',
  'home',
  'car',
  'plane',
  'graduation-cap',
  'heart-pulse',
  'gift',
  'briefcase',
  'smartphone',
  'umbrella',
] as const;
export type VaultIcon = (typeof VAULT_ICONS)[number];

export interface SavingsVault {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: DateKey;
  icon: VaultIcon;
}

// ---------------------------------------------------------------------------
// 5. NotificationSettings
// ---------------------------------------------------------------------------

export interface NotificationSettings {
  enableDailyReminder: boolean;
  /** Local time the daily reminder should fire. */
  reminderTime: TimeOfDay;
  enableBillAlerts: boolean;
  enableOverspendAlerts: boolean;
  /** Alert when the per-day safe-to-spend amount falls below this value. */
  safeToSpendThreshold: number;
}

// ---------------------------------------------------------------------------
// Aggregate state & settings schema (persistence / export / import)
// ---------------------------------------------------------------------------

/** Bookkeeping the store needs to run its once-a-month / once-a-day jobs exactly once. */
export interface FinanceMeta {
  /** Month for which `BillReminder.notifiedThisMonth` flags are valid. */
  billsMonth: MonthKey;
  /** Last day auto-deduct bills were processed up to; `null` if never. */
  lastAutoDeductDate: DateKey | null;
}

/** Everything the app persists. */
export interface FinanceData {
  salary: SalaryConfig;
  transactions: Transaction[];
  bills: BillReminder[];
  vaults: SavingsVault[];
  notifications: NotificationSettings;
  meta: FinanceMeta;
}

export const SETTINGS_SCHEMA_ID = 'micro-finance.settings';
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * The on-disk JSON envelope. The same shape is used for the localStorage
 * record and for exported backup files.
 */
export interface SettingsExport {
  schema: typeof SETTINGS_SCHEMA_ID;
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** ISO-8601 timestamp of when this document was written. */
  exportedAt: string;
  data: FinanceData;
}

// ---------------------------------------------------------------------------
// Results & derived values
// ---------------------------------------------------------------------------

/** Outcome of an operation that can be rejected. Nothing is changed when `ok` is false. */
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface ImportSummary {
  transactions: number;
  bills: number;
  vaults: number;
}

/** The pay period containing "today": from the most recent payday to the day before the next one. */
export interface BudgetPeriod {
  startDate: DateKey;
  /** Last day of the period (inclusive). */
  endDate: DateKey;
  totalDays: number;
  /** Full days since the period started (0 on payday). */
  daysElapsed: number;
  /** Days left including today. */
  daysRemaining: number;
}

export interface BucketSummary {
  bucket: BucketKey;
  allocated: number;
  spent: number;
  /** `allocated - spent`; negative when overspent. */
  remaining: number;
  /** `spent / allocated * 100`, not capped at 100. */
  percentUsed: number;
}

export interface BudgetOverview {
  period: BudgetPeriod;
  buckets: Record<BucketKey, BucketSummary>;
  periodIncome: number;
  periodExpenses: number;
  /** Discretionary headroom: what's left in Needs + Wants, in total and spread over the days remaining. */
  safeToSpend: {
    remaining: number;
    perDay: number;
  };
}
