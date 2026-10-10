import { describe, expect, it } from 'vitest';
import type { BillReminder } from '../types';
import { getBudgetPeriod, getDueAutoDeductions, sortNewestFirst } from './budget';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 15, 30);

describe('getBudgetPeriod', () => {
  it('starts on the previous payday when payday has not happened yet this month', () => {
    expect(getBudgetPeriod(25, d(2026, 10, 10))).toEqual({
      startDate: '2026-09-25',
      endDate: '2026-10-24',
      totalDays: 30,
      daysElapsed: 15,
      daysRemaining: 15,
    });
  });

  it('starts today when today is payday', () => {
    const period = getBudgetPeriod(25, d(2026, 10, 25));
    expect(period.startDate).toBe('2026-10-25');
    expect(period.endDate).toBe('2026-11-24');
    expect(period.daysElapsed).toBe(0);
    expect(period.daysRemaining).toBe(31);
  });

  it('handles payday on the 1st (calendar month)', () => {
    const period = getBudgetPeriod(1, d(2026, 10, 10));
    expect([period.startDate, period.endDate]).toEqual(['2026-10-01', '2026-10-31']);
  });

  it('crosses the year boundary', () => {
    const period = getBudgetPeriod(15, d(2027, 1, 5));
    expect([period.startDate, period.endDate]).toEqual(['2026-12-15', '2027-01-14']);
  });

  it('clamps a payday of 31 to short months', () => {
    expect(getBudgetPeriod(31, d(2027, 2, 15))).toMatchObject({ startDate: '2027-01-31', endDate: '2027-02-27' });
    expect(getBudgetPeriod(31, d(2027, 2, 28))).toMatchObject({ startDate: '2027-02-28', endDate: '2027-03-30' });
  });
});

describe('getDueAutoDeductions', () => {
  const bill = (partial: Partial<BillReminder>): BillReminder => ({
    id: 'rent',
    title: 'Rent',
    amount: 1200,
    dueDate: 15,
    category: 'housing',
    isAutoDeduct: true,
    notifiedThisMonth: false,
    createdOn: null,
    ...partial,
  });
  const none = new Set<string>();

  it('only considers the target day when there was no previous run', () => {
    expect(getDueAutoDeductions([bill({})], none, null, '2026-10-14')).toEqual([]);
    const due = getDueAutoDeductions([bill({})], none, null, '2026-10-15');
    expect(due).toEqual([
      {
        id: 'bill-rent-2026-10',
        amount: 1200,
        category: 'housing',
        type: 'expense',
        date: '2026-10-15',
        note: 'Auto-deducted: Rent',
        isRecurring: true,
      },
    ]);
  });

  it('catches up on days the app was closed, once per month', () => {
    const due = getDueAutoDeductions([bill({})], none, '2026-09-10', '2026-11-20');
    expect(due.map((t) => t.date)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
  });

  it('excludes the previous-run day itself and skips already-recorded ids', () => {
    expect(getDueAutoDeductions([bill({})], none, '2026-10-15', '2026-10-20')).toEqual([]);
    expect(getDueAutoDeductions([bill({})], new Set(['bill-rent-2026-10']), '2026-10-01', '2026-10-20')).toEqual([]);
  });

  it('ignores bills without auto-deduct', () => {
    expect(getDueAutoDeductions([bill({ isAutoDeduct: false })], none, null, '2026-10-15')).toEqual([]);
  });

  it('moves a day-31 bill to the last day of short months', () => {
    const due = getDueAutoDeductions([bill({ dueDate: 31 })], none, '2027-01-31', '2027-03-05');
    expect(due.map((t) => t.date)).toEqual(['2027-02-28']);
  });
});

describe('sortNewestFirst', () => {
  const tx = (id: string, date: string) => ({
    id,
    amount: 1,
    category: 'groceries' as const,
    type: 'expense' as const,
    date,
    note: '',
    isRecurring: false,
  });

  it('orders by date, keeping the most recently added first within a day', () => {
    const sorted = sortNewestFirst([tx('a', '2026-10-01'), tx('b', '2026-10-03'), tx('c', '2026-10-03'), tx('d', '2026-09-30')]);
    expect(sorted.map((t) => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('does not mutate its input', () => {
    const input = [tx('a', '2026-10-01'), tx('b', '2026-10-02')];
    sortNewestFirst(input);
    expect(input.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
