import type { BudgetPeriod, DateKey, ExpenseCategory, FinanceData, MonthKey, Transaction } from '../types';
import { getBudgetPeriod, isSpendingTransaction, roundMoney } from './budget';
import { addDays, dayInMonth, fromDateKey, toDateKey, toMonthKey } from './dates';
import { monthlyAllocation } from './engine';

export type AnalyticsRange = 'period' | '30d' | '90d';

/** Largest number of categories a donut names before folding the rest into "other" (plus that slice: 5 in all). */
export const MAX_NAMED_SLICES = 4;

const isSpending = isSpendingTransaction;

export function rangeBounds(
  range: AnalyticsRange,
  today: Date,
  period: Pick<BudgetPeriod, 'startDate' | 'endDate'>,
): { from: DateKey; to: DateKey } {
  if (range === 'period') return { from: period.startDate, to: period.endDate };
  return { from: toDateKey(addDays(today, range === '30d' ? -29 : -89)), to: toDateKey(today) };
}

// ---------------------------------------------------------------------------
// Category breakdown (donut)
// ---------------------------------------------------------------------------

export interface CategorySlice {
  id: ExpenseCategory | 'other';
  amount: number;
  /** Share of all spending in the range, 0-100. */
  percent: number;
  /** How many categories this slice stands for (more than 1 only for "other"). */
  members: number;
}

export interface CategoryBreakdown {
  slices: CategorySlice[];
  total: number;
}

/**
 * Spending by category in a date range: the `topN` biggest categories and the rest folded into
 * "other". A lone leftover category is shown as itself instead of as an "other" of one.
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  from: DateKey,
  to: DateKey,
  topN = MAX_NAMED_SLICES,
): CategoryBreakdown {
  const totals = new Map<ExpenseCategory, number>();
  for (const tx of transactions) {
    if (!isSpending(tx) || tx.date < from || tx.date > to) continue;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = ranked.reduce((sum, [, amount]) => sum + amount, 0);
  if (total <= 0) return { slices: [], total: 0 };

  const keep = ranked.length === topN + 1 ? ranked.length : topN;
  const head = ranked.slice(0, keep);
  const tail = ranked.slice(keep);
  const share = (amount: number): number => Math.round((amount / total) * 1000) / 10;

  const slices: CategorySlice[] = head.map(([id, amount]) => ({ id, amount: roundMoney(amount), percent: share(amount), members: 1 }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, [, amount]) => sum + amount, 0);
    slices.push({ id: 'other', amount: roundMoney(rest), percent: share(rest), members: tail.length });
  }
  return { slices, total: roundMoney(total) };
}

// ---------------------------------------------------------------------------
// Burn rate (line)
// ---------------------------------------------------------------------------

export interface BurnPoint {
  /** 1-based day of the pay period. */
  day: number;
  date: DateKey;
  /** Spent so far; `null` for days that haven't happened yet. */
  spent: number | null;
  /** Where spending would be if it were spread evenly over the period. */
  pace: number;
}

export interface BurnRate {
  points: BurnPoint[];
  /** Needs + Wants budget for the pay period. */
  limit: number;
  spent: number;
  /** Average spent per day so far, today included. */
  dailyRate: number;
  /** Spent by payday if the current daily rate continues. */
  projected: number;
  /** Today's position within the period (1-based). */
  todayIndex: number;
}

/** Cumulative Needs + Wants spending through the pay period against an even pace and the budget limit. */
export function burnRate(data: Pick<FinanceData, 'salary' | 'transactions'>, today: Date): BurnRate {
  const { salary, transactions } = data;
  const period = getBudgetPeriod(salary.paydayDate, today);
  const monthly = monthlyAllocation(salary);
  const limit = roundMoney(monthly.needs + monthly.wants);

  const perDay = new Map<DateKey, number>();
  for (const tx of transactions) {
    if (isSpending(tx) && tx.date >= period.startDate && tx.date <= period.endDate) {
      perDay.set(tx.date, (perDay.get(tx.date) ?? 0) + tx.amount);
    }
  }

  const start = fromDateKey(period.startDate);
  const todayIndex = period.daysElapsed + 1;
  const points: BurnPoint[] = [];
  let running = 0;
  for (let day = 1; day <= period.totalDays; day += 1) {
    const date = toDateKey(addDays(start, day - 1));
    running += perDay.get(date) ?? 0;
    points.push({
      day,
      date,
      spent: day <= todayIndex ? roundMoney(running) : null,
      pace: roundMoney((limit * day) / period.totalDays),
    });
  }

  const spent = roundMoney(running);
  const dailyRate = roundMoney(spent / todayIndex);
  return { points, limit, spent, dailyRate, projected: roundMoney(dailyRate * period.totalDays), todayIndex };
}

// ---------------------------------------------------------------------------
// Net savings (bars)
// ---------------------------------------------------------------------------

export interface MonthNet {
  month: MonthKey;
  income: number;
  spending: number;
  /** `income - spending`: what was left over from the month. */
  net: number;
}

/** Income minus Needs + Wants spending for each of the last `months` calendar months, oldest first. */
export function monthlyNetSavings(transactions: readonly Transaction[], today: Date, months = 6): MonthNet[] {
  const keys: MonthKey[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    keys.push(toMonthKey(dayInMonth(1, today.getFullYear(), today.getMonth() - back)));
  }
  const income = new Map<MonthKey, number>(keys.map((key) => [key, 0]));
  const spending = new Map<MonthKey, number>(keys.map((key) => [key, 0]));

  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    if (tx.type === 'income' && income.has(month)) income.set(month, (income.get(month) ?? 0) + tx.amount);
    else if (isSpending(tx) && spending.has(month)) spending.set(month, (spending.get(month) ?? 0) + tx.amount);
  }
  return keys.map((month) => {
    const earned = roundMoney(income.get(month) ?? 0);
    const spent = roundMoney(spending.get(month) ?? 0);
    return { month, income: earned, spending: spent, net: roundMoney(earned - spent) };
  });
}
