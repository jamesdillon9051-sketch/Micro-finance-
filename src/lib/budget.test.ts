import { describe, expect, it } from 'vitest';
import type { BillReminder, Transaction } from '../types';
import { getBudgetPeriod, getDueAutoDeductions, summarizeBudget } from './budget';
import { createDefaultFinanceData } from './schema';

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

describe('summarizeBudget', () => {
  const base = createDefaultFinanceData(d(2026, 10, 10));
  const salary = { ...base.salary, monthlySalary: 3000, paydayDate: 1 };
  const tx = (partial: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(),
    amount: 100,
    category: 'groceries',
    type: 'expense',
    date: '2026-10-05',
    note: '',
    isRecurring: false,
    ...partial,
  });

  it('allocates by percentage and counts only expenses inside the period', () => {
    const overview = summarizeBudget(
      {
        salary,
        transactions: [
          tx({ amount: 400, category: 'housing' }),
          tx({ amount: 150.5, category: 'dining' }),
          tx({ amount: 200, category: 'investments' }),
          tx({ amount: 999, category: 'dining', date: '2026-09-30' }), // before period
          tx({ amount: 999, category: 'dining', date: '2026-11-01' }), // after period
          tx({ amount: 3000, type: 'income', category: 'salary' }), // income is not spending
        ],
      },
      d(2026, 10, 10),
    );

    expect(overview.buckets.needs).toMatchObject({ allocated: 1500, spent: 400, remaining: 1100 });
    expect(overview.buckets.wants).toMatchObject({ allocated: 900, spent: 150.5, remaining: 749.5 });
    expect(overview.buckets.savings).toMatchObject({ allocated: 600, spent: 200, remaining: 400 });
    expect(overview.periodIncome).toBe(3000);
    expect(overview.periodExpenses).toBe(750.5);
    // (1100 + 749.5) over the 22 days left (Oct 10..31)
    expect(overview.safeToSpend).toEqual({ remaining: 1849.5, perDay: 84.07 });
  });

  it('goes negative when overspent and never divides by zero', () => {
    const overview = summarizeBudget(
      { salary: { ...salary, monthlySalary: 100 }, transactions: [tx({ amount: 90, category: 'dining' })] },
      d(2026, 10, 31), // last day of the period: 1 day left
    );
    expect(overview.buckets.wants).toMatchObject({ allocated: 30, spent: 90, remaining: -60 });
    expect(overview.buckets.wants.percentUsed).toBe(300);
    // needs +50, wants -60
    expect(overview.safeToSpend).toEqual({ remaining: -10, perDay: -10 });
  });

  it('reports 0% used when nothing is allocated or spent', () => {
    const overview = summarizeBudget({ salary: base.salary, transactions: [] }, d(2026, 10, 10));
    expect(overview.buckets.needs.percentUsed).toBe(0);
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
