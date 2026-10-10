import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { burnRate, categoryBreakdown, monthlyNetSavings, rangeBounds } from './analytics';
import { createDefaultFinanceData } from './schema';

const TODAY = new Date(2026, 9, 10, 12);

let n = 0;
const tx = (date: string, category: Transaction['category'], amount: number, type: Transaction['type'] = 'expense'): Transaction => ({
  id: `t${(n += 1)}`,
  amount,
  category,
  type,
  date,
  note: '',
  isRecurring: false,
});

describe('categoryBreakdown', () => {
  const data = [
    tx('2026-10-02', 'groceries', 300),
    tx('2026-10-03', 'dining', 200),
    tx('2026-10-04', 'transport', 100),
    tx('2026-10-05', 'shopping', 50),
    tx('2026-10-06', 'travel', 40),
    tx('2026-10-07', 'utilities', 30),
    tx('2026-10-08', 'entertainment', 20),
    tx('2026-10-09', 'investments', 500), // savings: not spending
    tx('2026-10-01', 'salary', 3100, 'income'), // income: not spending
    tx('2026-09-20', 'groceries', 999), // outside the range
  ];

  it('keeps the top four categories and folds the rest into "other"', () => {
    const { slices, total } = categoryBreakdown(data, '2026-10-01', '2026-10-31');
    expect(total).toBe(740);
    expect(slices.map((s) => [s.id, s.amount, s.percent, s.members])).toEqual([
      ['groceries', 300, 40.5, 1],
      ['dining', 200, 27, 1],
      ['transport', 100, 13.5, 1],
      ['shopping', 50, 6.8, 1],
      ['other', 90, 12.2, 3], // travel 40 + utilities 30 + entertainment 20
    ]);
  });

  it('shows a lone leftover category as itself rather than as "other"', () => {
    const five = data.filter((t) => t.category !== 'entertainment' && t.category !== 'utilities');
    const { slices } = categoryBreakdown(five, '2026-10-01', '2026-10-31');
    expect(slices.map((s) => s.id)).toEqual(['groceries', 'dining', 'transport', 'shopping', 'travel']);
  });

  it('is empty when nothing was spent', () => {
    expect(categoryBreakdown([], '2026-10-01', '2026-10-31')).toEqual({ slices: [], total: 0 });
    expect(categoryBreakdown([tx('2026-10-09', 'investments', 5)], '2026-10-01', '2026-10-31').total).toBe(0);
  });

  it('resolves the range choices', () => {
    const period = { startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(rangeBounds('period', TODAY, period)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeBounds('30d', TODAY, period)).toEqual({ from: '2026-09-11', to: '2026-10-10' });
    expect(rangeBounds('90d', TODAY, period)).toEqual({ from: '2026-07-13', to: '2026-10-10' });
  });
});

describe('burnRate', () => {
  const base = createDefaultFinanceData(TODAY);
  const salary = { ...base.salary, monthlySalary: 3100, paydayDate: 1 };
  const transactions = [
    tx('2026-10-02', 'housing', 900),
    tx('2026-10-05', 'dining', 100),
    tx('2026-10-10', 'groceries', 50),
    tx('2026-10-06', 'investments', 400), // ignored
  ];

  it('accumulates spending day by day against an even pace', () => {
    const result = burnRate({ salary, transactions }, TODAY);
    expect(result.limit).toBe(2480); // needs 1550 + wants 930
    expect(result.points).toHaveLength(31);
    const spentOn = (day: number) => result.points[day - 1]?.spent;
    expect([spentOn(1), spentOn(2), spentOn(4), spentOn(5), spentOn(9), spentOn(10)]).toEqual([0, 900, 900, 1000, 1000, 1050]);
    expect(spentOn(11)).toBeNull(); // the future has no spending yet
    expect(result.points[9]?.pace).toBe(800);
    expect(result.points[30]?.pace).toBe(2480);
  });

  it('projects the month from the daily rate so far', () => {
    const result = burnRate({ salary, transactions }, TODAY);
    expect(result).toMatchObject({ spent: 1050, dailyRate: 105, projected: 3255, todayIndex: 10 });
    expect(result.projected).toBeGreaterThan(result.limit); // heading for an overspend
  });

  it('copes with no salary and no spending', () => {
    const result = burnRate({ salary: base.salary, transactions: [] }, TODAY);
    expect(result).toMatchObject({ limit: 0, spent: 0, dailyRate: 0, projected: 0 });
  });
});

describe('monthlyNetSavings', () => {
  const data = [
    tx('2026-10-01', 'salary', 3100, 'income'),
    tx('2026-10-05', 'housing', 900),
    tx('2026-10-08', 'dining', 150),
    tx('2026-10-09', 'investments', 500), // set aside, not spent
    tx('2026-09-01', 'salary', 3000, 'income'),
    tx('2026-09-15', 'shopping', 3200),
    tx('2026-04-01', 'salary', 9999, 'income'), // before the window
  ];

  it('is income minus Needs + Wants spending for each of the last six months', () => {
    const months = monthlyNetSavings(data, TODAY);
    expect(months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months[5]).toEqual({ month: '2026-10', income: 3100, spending: 1050, net: 2050 });
    expect(months[4]).toEqual({ month: '2026-09', income: 3000, spending: 3200, net: -200 });
    expect(months[0]).toEqual({ month: '2026-05', income: 0, spending: 0, net: 0 });
  });

  it('walks back across a year boundary', () => {
    expect(monthlyNetSavings([], new Date(2027, 1, 14), 3).map((m) => m.month)).toEqual(['2026-12', '2027-01', '2027-02']);
  });
});
