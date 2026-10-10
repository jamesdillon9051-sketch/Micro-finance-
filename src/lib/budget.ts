import {
  CATEGORY_BUCKET,
  INCOME_CATEGORIES,
  type BillReminder,
  type BudgetPeriod,
  type DateKey,
  type ExpenseCategory,
  type IncomeCategory,
  type Transaction,
} from '../types';
import {
  addDays,
  dayInMonth,
  diffInDays,
  fromDateKey,
  startOfDay,
  toDateKey,
  toMonthKey,
} from './dates';

/** Longest gap (in days) of missed auto-deductions the store will back-fill after the app was closed. */
const MAX_CATCH_UP_DAYS = 366;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return Object.hasOwn(CATEGORY_BUCKET, value);
}

/** Needs and Wants expenses. Savings contributions are money set aside, not money spent. */
export function isSpendingTransaction(tx: Transaction): tx is Transaction & { category: ExpenseCategory } {
  return tx.type === 'expense' && isExpenseCategory(tx.category) && CATEGORY_BUCKET[tx.category] !== 'savings';
}

export function isIncomeCategory(value: string): value is IncomeCategory {
  return (INCOME_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The pay period that contains `today`. A period runs from one payday to the
 * day before the next. Paydays after the month's last day (e.g. 31 in April)
 * fall on that month's last day.
 */
export function getBudgetPeriod(paydayDate: number, today: Date): BudgetPeriod {
  const todayStart = startOfDay(today);
  const year = todayStart.getFullYear();
  const month = todayStart.getMonth();
  const paydayThisMonth = dayInMonth(paydayDate, year, month);

  const started = todayStart >= paydayThisMonth;
  const start = started ? paydayThisMonth : dayInMonth(paydayDate, year, month - 1);
  const nextStart = started ? dayInMonth(paydayDate, year, month + 1) : paydayThisMonth;
  const end = addDays(nextStart, -1);

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    totalDays: diffInDays(start, nextStart),
    daysElapsed: diffInDays(start, todayStart),
    daysRemaining: diffInDays(todayStart, end) + 1,
  };
}

/** Deterministic id, so a bill can never be auto-deducted twice for the same month. */
export function autoDeductTransactionId(billId: string, monthKey: string): string {
  return `bill-${billId}-${monthKey}`;
}

/**
 * Expense transactions for every auto-deduct bill whose due day falls in
 * (`after`, `upTo`] - the window since the last run, so days the app was closed
 * are caught up. With `after === null` only `upTo` itself is considered.
 * Bills already recorded (matched by `existingIds`) are skipped.
 */
export function getDueAutoDeductions(
  bills: readonly BillReminder[],
  existingIds: ReadonlySet<string>,
  after: DateKey | null,
  upTo: DateKey,
): Transaction[] {
  const autoBills = bills.filter((bill) => bill.isAutoDeduct);
  if (autoBills.length === 0) return [];

  const last = fromDateKey(upTo);
  const earliest = addDays(last, -MAX_CATCH_UP_DAYS);
  let cursor = after === null ? last : addDays(fromDateKey(after), 1);
  if (cursor < earliest) cursor = earliest;

  const due: Transaction[] = [];
  for (; cursor <= last; cursor = addDays(cursor, 1)) {
    for (const bill of autoBills) {
      const dueDay = dayInMonth(bill.dueDate, cursor.getFullYear(), cursor.getMonth());
      if (dueDay.getDate() !== cursor.getDate()) continue;
      const id = autoDeductTransactionId(bill.id, toMonthKey(cursor));
      if (existingIds.has(id)) continue;
      due.push({
        id,
        amount: bill.amount,
        category: bill.category,
        type: 'expense',
        date: toDateKey(cursor),
        note: `Auto-deducted: ${bill.title}`,
        isRecurring: true,
      });
    }
  }
  return due;
}

/** Newest first; transactions on the same day keep "most recently added first". */
export function sortNewestFirst(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => (a.tx.date === b.tx.date ? b.index - a.index : a.tx.date < b.tx.date ? 1 : -1))
    .map(({ tx }) => tx);
}
