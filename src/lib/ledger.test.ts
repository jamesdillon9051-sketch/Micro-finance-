import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import { NO_FILTERS, filterTransactions, isUnfiltered, ledgerTotals, orderedRange, presetRange, type LedgerFilters } from './ledger';

const label = (category: Category): string => category.replace('-', ' ');
const TODAY = new Date(2026, 9, 10, 12);
const PERIOD = { startDate: '2026-10-01', endDate: '2026-10-31' };

let n = 0;
const tx = (date: string, category: Category, amount: number, note = '', type: Transaction['type'] = 'expense'): Transaction => ({
  id: `t${(n += 1)}`,
  amount,
  category,
  type,
  date,
  note,
  isRecurring: false,
});

const all = [
  tx('2026-10-09', 'groceries', 42.5, 'Weekly shop at Aldi'),
  tx('2026-10-10', 'dining', 18, 'Pizza night'),
  tx('2026-10-01', 'salary', 3100, 'October pay', 'income'),
  tx('2026-09-28', 'housing', 900, 'Rent'),
  tx('2026-10-05', 'investments', 200, 'ETF'),
];
const find = (filters: Partial<LedgerFilters>) => filterTransactions(all, { ...NO_FILTERS, ...filters }, label).map((t) => t.note);

describe('filterTransactions', () => {
  it('returns everything with no filters', () => {
    expect(find({})).toHaveLength(5);
    expect(isUnfiltered(NO_FILTERS)).toBe(true);
  });

  it('searches notes, case-insensitively, requiring every word', () => {
    expect(find({ query: 'PIZZA' })).toEqual(['Pizza night']);
    expect(find({ query: 'weekly aldi' })).toEqual(['Weekly shop at Aldi']);
    expect(find({ query: 'weekly pizza' })).toEqual([]);
  });

  it('searches category names, buckets, amounts and dates', () => {
    expect(find({ query: 'groceries' })).toEqual(['Weekly shop at Aldi']);
    expect(find({ query: 'wants' })).toEqual(['Pizza night']);
    expect(find({ query: 'income' })).toEqual(['October pay']);
    expect(find({ query: '42.5' })).toEqual(['Weekly shop at Aldi']);
    expect(find({ query: '42.50' })).toEqual(['Weekly shop at Aldi']);
    expect(find({ query: '2026-09' })).toEqual(['Rent']);
  });

  it('filters by type and by category', () => {
    expect(find({ type: 'income' })).toEqual(['October pay']);
    expect(find({ type: 'expense' })).toHaveLength(4);
    expect(find({ category: 'dining' })).toEqual(['Pizza night']);
  });

  it('treats the date range as inclusive on both ends, and open ends as unbounded', () => {
    expect(find({ from: '2026-10-05', to: '2026-10-09' })).toEqual(['Weekly shop at Aldi', 'ETF']);
    expect(find({ from: '2026-10-10' })).toEqual(['Pizza night']);
    expect(find({ to: '2026-09-30' })).toEqual(['Rent']);
  });

  it('combines every filter', () => {
    expect(find({ type: 'expense', from: '2026-10-01', query: 'shop', category: 'groceries' })).toEqual(['Weekly shop at Aldi']);
    expect(find({ type: 'income', query: 'shop' })).toEqual([]);
  });
});

describe('ranges and totals', () => {
  it('turns presets into date bounds', () => {
    expect(presetRange('all', TODAY, PERIOD)).toEqual({ from: null, to: null });
    expect(presetRange('period', TODAY, PERIOD)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('7d', TODAY, PERIOD)).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(presetRange('30d', TODAY, PERIOD)).toEqual({ from: '2026-09-11', to: '2026-10-10' });
  });

  it('swaps a backwards custom range', () => {
    expect(orderedRange('2026-10-09', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-09' });
    expect(orderedRange('2026-10-01', null)).toEqual({ from: '2026-10-01', to: null });
  });

  it('totals income, expenses and net to the cent', () => {
    expect(ledgerTotals(all)).toEqual({ income: 3100, expenses: 1160.5, net: 1939.5, count: 5 });
    expect(ledgerTotals([])).toEqual({ income: 0, expenses: 0, net: 0, count: 0 });
  });
});
