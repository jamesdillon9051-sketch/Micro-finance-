import type { BudgetPeriod, Category, DateKey, Transaction, TransactionType } from '../types';
import { CATEGORY_BUCKET } from '../types';
import { addDays, fromDateKey, toDateKey } from './dates';
import { isExpenseCategory, roundMoney } from './budget';

export type RangePreset = 'all' | 'period' | '7d' | '30d' | 'custom';

export interface LedgerFilters {
  query: string;
  type: 'all' | TransactionType;
  category: Category | 'all';
  /** Inclusive bounds; `null` is open-ended. */
  from: DateKey | null;
  to: DateKey | null;
}

export const NO_FILTERS: LedgerFilters = { query: '', type: 'all', category: 'all', from: null, to: null };

/** The date bounds a preset stands for. `custom` has none of its own: the caller supplies them. */
export function presetRange(
  preset: RangePreset,
  today: Date,
  period: Pick<BudgetPeriod, 'startDate' | 'endDate'>,
): { from: DateKey | null; to: DateKey | null } {
  switch (preset) {
    case 'period':
      return { from: period.startDate, to: period.endDate };
    case '7d':
      return { from: toDateKey(addDays(today, -6)), to: toDateKey(today) };
    case '30d':
      return { from: toDateKey(addDays(today, -29)), to: toDateKey(today) };
    default:
      return { from: null, to: null };
  }
}

/** Every word in `query` must appear in the note, category, bucket, amount or date. */
export function matchesQuery(tx: Transaction, query: string, labelOf: (category: Category) => string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const bucket = isExpenseCategory(tx.category) ? CATEGORY_BUCKET[tx.category] : 'income';
  const haystack = [
    tx.note,
    tx.category,
    labelOf(tx.category),
    bucket,
    tx.type,
    String(tx.amount),
    tx.amount.toFixed(2),
    tx.date,
  ]
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: LedgerFilters,
  labelOf: (category: Category) => string,
): Transaction[] {
  const { query, type, category, from, to } = filters;
  return transactions.filter(
    (tx) =>
      (type === 'all' || tx.type === type) &&
      (category === 'all' || tx.category === category) &&
      (from === null || tx.date >= from) &&
      (to === null || tx.date <= to) &&
      matchesQuery(tx, query, labelOf),
  );
}

export interface LedgerTotals {
  income: number;
  expenses: number;
  net: number;
  count: number;
}

export function ledgerTotals(transactions: readonly Transaction[]): LedgerTotals {
  let income = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (tx.type === 'income') income += tx.amount;
    else expenses += tx.amount;
  }
  return {
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    net: roundMoney(income - expenses),
    count: transactions.length,
  };
}

/** True when every filter is at its default. */
export function isUnfiltered(filters: LedgerFilters): boolean {
  return (
    filters.query.trim() === '' &&
    filters.type === 'all' &&
    filters.category === 'all' &&
    filters.from === null &&
    filters.to === null
  );
}

/** Swaps the bounds if someone picked them the wrong way round. */
export function orderedRange(from: DateKey | null, to: DateKey | null): { from: DateKey | null; to: DateKey | null } {
  return from !== null && to !== null && fromDateKey(from) > fromDateKey(to) ? { from: to, to: from } : { from, to };
}
