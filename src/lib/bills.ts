import type { BillReminder, DateKey, MonthKey, Transaction } from '../types';
import { autoDeductTransactionId } from './budget';
import { dayInMonth, diffInDays, toDateKey, toMonthKey } from './dates';

export type BillStatus = 'overdue' | 'due-today' | 'upcoming' | 'paid';

export interface BillCycle {
  bill: BillReminder;
  status: BillStatus;
  /** The due date this status refers to. */
  due: Date;
  /** Whole days from today to `due`; negative when overdue. */
  days: number;
}

/**
 * A bill counts as paid for a month when its payment transaction exists. Auto-deducted bills
 * and bills marked paid by hand use the same fixed id, so both are detected the same way.
 */
export function isBillPaid(bill: BillReminder, transactions: readonly Transaction[], month: MonthKey): boolean {
  const paymentId = autoDeductTransactionId(bill.id, month);
  return transactions.some((tx) => tx.id === paymentId);
}

/**
 * The bill's occurrence in one calendar month, or `null` if that due date was before the bill
 * was added and wasn't paid (so it was never really owed through this app).
 * Short months use their last day (a bill due on the 31st falls on Feb 28).
 */
export function billStatusInMonth(
  bill: BillReminder,
  transactions: readonly Transaction[],
  year: number,
  monthIndex: number,
  today: Date,
): BillCycle | null {
  const due = dayInMonth(bill.dueDate, year, monthIndex);
  const days = diffInDays(today, due);
  const cycle = (status: BillStatus): BillCycle => ({ bill, status, due, days });

  if (isBillPaid(bill, transactions, toMonthKey(due))) return cycle('paid');
  if (bill.createdOn !== null && toDateKey(due) < bill.createdOn) return null;
  if (days === 0) return cycle('due-today');
  return cycle(days > 0 ? 'upcoming' : 'overdue');
}

/**
 * What to show for a bill right now: this month's occurrence, or next month's if this month's
 * date had already passed before the bill was added.
 */
export function currentBillCycle(bill: BillReminder, transactions: readonly Transaction[], today: Date): BillCycle {
  const thisMonth = billStatusInMonth(bill, transactions, today.getFullYear(), today.getMonth(), today);
  if (thisMonth) return thisMonth;
  const due = dayInMonth(bill.dueDate, today.getFullYear(), today.getMonth() + 1);
  return (
    billStatusInMonth(bill, transactions, today.getFullYear(), today.getMonth() + 1, today) ?? {
      bill,
      status: 'upcoming',
      due,
      days: diffInDays(today, due),
    }
  );
}

const URGENCY: Record<BillStatus, number> = { overdue: 0, 'due-today': 1, upcoming: 2, paid: 3 };

/** Overdue first, then due today, then upcoming by date, with paid bills last. */
export function compareCycles(a: BillCycle, b: BillCycle): number {
  return URGENCY[a.status] - URGENCY[b.status] || a.days - b.days || a.bill.title.localeCompare(b.bill.title);
}

export interface MonthBillTotals {
  total: number;
  paid: number;
  count: number;
  paidCount: number;
}

/** How much of a month's bills has been paid. Bills not yet tracked that month are left out. */
export function monthBillTotals(cycles: ReadonlyArray<BillCycle | null>): MonthBillTotals {
  let total = 0;
  let paid = 0;
  let count = 0;
  let paidCount = 0;
  for (const cycle of cycles) {
    if (!cycle) continue;
    total += cycle.bill.amount;
    count += 1;
    if (cycle.status === 'paid') {
      paid += cycle.bill.amount;
      paidCount += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, paid: Math.round(paid * 100) / 100, count, paidCount };
}

export interface CalendarCell {
  date: DateKey;
  day: number;
}

/** The days of a month for a Sunday-first calendar: `null` entries are the blanks before the 1st. */
export function buildMonthGrid(year: number, monthIndex: number): Array<CalendarCell | null> {
  const first = new Date(year, monthIndex, 1);
  const daysInThisMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<CalendarCell | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInThisMonth; day += 1) {
    cells.push({ date: toDateKey(new Date(year, monthIndex, day)), day });
  }
  return cells;
}
