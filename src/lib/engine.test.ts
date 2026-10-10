import { describe, expect, it } from 'vitest';
import type { BucketAllocation, FinanceData, RolloverPreference, RolloverRecord, SavingsVault, Transaction } from '../types';
import { roundMoney } from './budget';
import {
  getPeriodWeeks,
  getWeeklyBudget,
  monthlyAllocation,
  rebalanceAllocation,
  settleCompletedWeeks,
  splitIntoWeeklyCaps,
  summarizeBudget,
} from './engine';
import { createDefaultFinanceData } from './schema';

/** Local noon, so DST and timezones can't tip a date over. */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

let counter = 0;
const tx = (date: string, category: Transaction['category'], amount: number, type: Transaction['type'] = 'expense'): Transaction => ({
  id: `t${(counter += 1)}`,
  amount,
  category,
  type,
  date,
  note: '',
  isRecurring: false,
});

const vault = (id: string, currentAmount = 100): SavingsVault => ({
  id,
  name: id,
  targetAmount: 5000,
  currentAmount,
  targetDate: '2027-12-01',
  icon: 'piggy-bank',
});

/**
 * October 2026 has 31 days and, with a 3,100 salary split 50/30/20, every daily
 * rate is a whole number: needs 50/day, wants 30/day, savings 20/day. So a full
 * week is 350 / 210 / 140 and the 3-day last week is 150 / 90 / 60.
 */
function dataFor(overrides: Partial<FinanceData> & { preference?: RolloverPreference; vaultId?: string | null } = {}): FinanceData {
  const { preference = 'none', vaultId = null, ...rest } = overrides;
  const base = createDefaultFinanceData(d(2026, 10, 1));
  return {
    ...base,
    salary: { ...base.salary, monthlySalary: 3100, paydayDate: 1, rolloverPreference: preference, rolloverVaultId: vaultId },
    ...rest,
  };
}

// ---------------------------------------------------------------------------

describe('rebalanceAllocation', () => {
  const start: BucketAllocation = { needs: 50, wants: 30, savings: 20 };

  it('shares the remainder between the other two in proportion', () => {
    expect(rebalanceAllocation(start, 'needs', 60)).toEqual({ needs: 60, wants: 24, savings: 16 });
    // needs:wants stays 50:30, so the remaining 60 splits 37.5 / 22.5 -> 38 / 22
    expect(rebalanceAllocation(start, 'savings', 40)).toEqual({ needs: 38, wants: 22, savings: 40 });
  });

  it('can take one bucket to 0 or 100', () => {
    expect(rebalanceAllocation(start, 'savings', 100)).toEqual({ needs: 0, wants: 0, savings: 100 });
    // needs:savings stays 50:20, so 100 splits 71.4 / 28.6 -> 71 / 29
    expect(rebalanceAllocation(start, 'wants', 0)).toEqual({ needs: 71, wants: 0, savings: 29 });
  });

  it('splits evenly when the other two are both zero', () => {
    expect(rebalanceAllocation({ needs: 100, wants: 0, savings: 0 }, 'needs', 40)).toEqual({ needs: 40, wants: 30, savings: 30 });
    expect(rebalanceAllocation({ needs: 100, wants: 0, savings: 0 }, 'needs', 41)).toEqual({ needs: 41, wants: 30, savings: 29 });
  });

  it('clamps and rounds bad input', () => {
    expect(rebalanceAllocation(start, 'needs', 150).needs).toBe(100);
    expect(rebalanceAllocation(start, 'needs', -5).needs).toBe(0);
    expect(rebalanceAllocation(start, 'needs', Number.NaN).needs).toBe(0);
    expect(rebalanceAllocation(start, 'needs', 33.6).needs).toBe(34);
  });

  it('always totals exactly 100 with whole, non-negative numbers', () => {
    const starts: BucketAllocation[] = [
      start,
      { needs: 33, wants: 33, savings: 34 },
      { needs: 0, wants: 0, savings: 100 },
      { needs: 1, wants: 98, savings: 1 },
      { needs: 33.3, wants: 33.3, savings: 33.4 },
    ];
    for (const from of starts) {
      for (const bucket of ['needs', 'wants', 'savings'] as const) {
        for (let percent = 0; percent <= 100; percent += 1) {
          const next = rebalanceAllocation(from, bucket, percent);
          expect(next.needs + next.wants + next.savings).toBe(100);
          for (const value of Object.values(next)) {
            expect(Number.isInteger(value) && value >= 0).toBe(true);
          }
          expect(next[bucket]).toBe(percent);
        }
      }
    }
  });
});

describe('weekly caps', () => {
  it('cuts a 31-day period into four full weeks and a 3-day stub', () => {
    const weeks = getPeriodWeeks({ startDate: '2026-10-01', totalDays: 31 });
    expect(weeks.map((w) => [w.start, w.end, w.days])).toEqual([
      ['2026-10-01', '2026-10-07', 7],
      ['2026-10-08', '2026-10-14', 7],
      ['2026-10-15', '2026-10-21', 7],
      ['2026-10-22', '2026-10-28', 7],
      ['2026-10-29', '2026-10-31', 3],
    ]);
  });

  it('has exactly four weeks in a 28-day February and handles periods that start mid-month', () => {
    expect(getPeriodWeeks({ startDate: '2027-02-01', totalDays: 28 })).toHaveLength(4);
    const weeks = getPeriodWeeks({ startDate: '2026-09-25', totalDays: 30 });
    expect(weeks.at(-1)).toMatchObject({ start: '2026-10-23', end: '2026-10-24', days: 2 });
  });

  it('is monthly x 7 / days for a full week', () => {
    const weeks = getPeriodWeeks({ startDate: '2026-10-01', totalDays: 31 });
    expect(splitIntoWeeklyCaps(1550, weeks, 31)).toEqual([350, 350, 350, 350, 150]);
    expect(splitIntoWeeklyCaps(930, weeks, 31)).toEqual([210, 210, 210, 210, 90]);
  });

  it('always adds up to exactly the monthly amount, whatever the rounding', () => {
    for (const totalDays of [28, 29, 30, 31]) {
      const weeks = getPeriodWeeks({ startDate: '2026-10-01', totalDays });
      for (const monthly of [0, 0.01, 99.99, 1000.01, 1234.56, 3333.33, 98765.43]) {
        const caps = splitIntoWeeklyCaps(monthly, weeks, totalDays);
        expect(roundMoney(caps.reduce((sum, cap) => sum + cap, 0))).toBe(monthly);
        for (const cap of caps) expect(cap).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('turns the salary split into monthly bucket amounts', () => {
    expect(monthlyAllocation(dataFor().salary)).toEqual({ needs: 1550, wants: 930, savings: 620 });
  });
});

describe('getWeeklyBudget and daily safe-to-spend', () => {
  const transactions = [
    tx('2026-10-03', 'dining', 50), // week 1: ignored
    tx('2026-10-09', 'groceries', 100), // week 2, needs
    tx('2026-10-10', 'dining', 20), // week 2, wants
    tx('2026-10-10', 'savings-contribution', 25), // week 2, savings
    tx('2026-10-10', 'salary', 3100, 'income'), // never counts as spending
  ];

  it('limits each bucket to its weekly cap and reports what is left', () => {
    const weekly = getWeeklyBudget({ ...dataFor(), transactions }, d(2026, 10, 10));
    expect(weekly).toMatchObject({ weekNumber: 2, weeksInPeriod: 5, daysRemaining: 5 });
    expect(weekly.week).toMatchObject({ start: '2026-10-08', end: '2026-10-14' });
    expect(weekly.buckets.needs).toMatchObject({ baseCap: 350, carriedIn: 0, cap: 350, spent: 100, remaining: 250, perDay: 50 });
    expect(weekly.buckets.wants).toMatchObject({ cap: 210, spent: 20, remaining: 190, perDay: 38 });
    expect(weekly.buckets.savings).toMatchObject({ cap: 140, spent: 25, remaining: 115 });
    expect(weekly.spendable).toEqual({ cap: 560, spent: 120, remaining: 440 });
  });

  it('divides the remaining weekly budget by the days left in the week, today included', () => {
    const overview = summarizeBudget({ ...dataFor(), transactions }, d(2026, 10, 10));
    // Oct 10 -> Oct 14 is 5 days; (350 - 100) + (210 - 20) = 440; 440 / 5 = 88
    expect(overview.safeToSpend).toEqual({ remaining: 440, daysRemaining: 5, perDay: 88 });
  });

  it('moves with the day and with spending, and never counts last week', () => {
    const data = { ...dataFor(), transactions: [] };
    // Fresh week, full 7 days left: 560 / 7 = 80
    expect(summarizeBudget(data, d(2026, 10, 8)).safeToSpend).toEqual({ remaining: 560, daysRemaining: 7, perDay: 80 });
    // Nothing spent, 3 days later: still 560, now over 4 days = 140
    expect(summarizeBudget(data, d(2026, 10, 11)).safeToSpend).toMatchObject({ daysRemaining: 4, perDay: 140 });
    // Last day of the week: everything left is available today
    expect(summarizeBudget(data, d(2026, 10, 14)).safeToSpend).toMatchObject({ daysRemaining: 1, perDay: 560 });
    // Spend 80 today: allowance for the rest of today drops by 80
    const spentToday = { ...data, transactions: [tx('2026-10-08', 'dining', 80)] };
    expect(summarizeBudget(spentToday, d(2026, 10, 8)).safeToSpend).toMatchObject({ remaining: 480, perDay: 68.57 });
  });

  it('goes negative when the week is overspent', () => {
    const data = { ...dataFor(), transactions: [tx('2026-10-09', 'shopping', 400)] };
    const { safeToSpend, weekly } = summarizeBudget(data, d(2026, 10, 12));
    expect(weekly.buckets.wants).toMatchObject({ remaining: -190, percentUsed: expect.closeTo(190.48, 1) });
    // needs +350, wants -190 -> 160 left over 3 days
    expect(safeToSpend).toMatchObject({ remaining: 160, daysRemaining: 3, perDay: 53.33 });
    const worse = summarizeBudget({ ...dataFor(), transactions: [tx('2026-10-09', 'shopping', 900)] }, d(2026, 10, 12));
    expect(worse.safeToSpend.perDay).toBeLessThan(0);
  });

  it('uses the shorter last week of the period', () => {
    const weekly = getWeeklyBudget({ ...dataFor(), transactions: [] }, d(2026, 10, 30));
    expect(weekly).toMatchObject({ weekNumber: 5, daysRemaining: 2 });
    expect(weekly.spendable.cap).toBe(240); // 150 + 90
    expect(summarizeBudget({ ...dataFor(), transactions: [] }, d(2026, 10, 30)).safeToSpend.perDay).toBe(120);
  });

  it('adds surplus carried in from the previous week to the cap', () => {
    const carried: RolloverRecord[] = [
      { id: '2026-10-01:needs', weekStart: '2026-10-01', weekEnd: '2026-10-07', bucket: 'needs', amount: 40, action: 'carried', vaultId: null, settledOn: '2026-10-08' },
      { id: '2026-10-01:wants', weekStart: '2026-10-01', weekEnd: '2026-10-07', bucket: 'wants', amount: 25.5, action: 'moved', vaultId: 'v', settledOn: '2026-10-08' }, // moved: not carried
      { id: '2026-09-24:needs', weekStart: '2026-09-24', weekEnd: '2026-09-30', bucket: 'needs', amount: 999, action: 'carried', vaultId: null, settledOn: '2026-10-01' }, // wrong week
    ];
    const weekly = getWeeklyBudget({ ...dataFor(), transactions: [], rollovers: carried }, d(2026, 10, 10));
    expect(weekly.buckets.needs).toMatchObject({ baseCap: 350, carriedIn: 40, cap: 390 });
    expect(weekly.buckets.wants).toMatchObject({ carriedIn: 0, cap: 210 });
    expect(weekly.buckets.savings.carriedIn).toBe(0);
  });

  it('reports zeros, not NaN, before a salary is set', () => {
    const empty = { ...createDefaultFinanceData(d(2026, 10, 1)), transactions: [] };
    const { safeToSpend, weekly } = summarizeBudget(empty, d(2026, 10, 10));
    expect(safeToSpend.perDay).toBe(0);
    expect(weekly.buckets.needs.percentUsed).toBe(0);
  });

  it('follows a mid-month payday', () => {
    const data = { ...dataFor(), transactions: [] };
    data.salary = { ...data.salary, paydayDate: 25 };
    const weekly = getWeeklyBudget(data, d(2026, 10, 10)); // period Sep 25 - Oct 24 (30 days): day 15 -> week 3
    expect(weekly.week).toMatchObject({ start: '2026-10-09', end: '2026-10-15' });
    expect(weekly.weekNumber).toBe(3);
    expect(weekly.weeksInPeriod).toBe(5);
  });
});

describe('settleCompletedWeeks (surplus rollover)', () => {
  /** Week 1 (Oct 1-7) is settled; week 2 (Oct 8-14) finished with 250 left in Needs and 190 in Wants. */
  const afterWeekTwo = (extra: Parameters<typeof dataFor>[0] = {}): FinanceData =>
    dataFor({
      transactions: [tx('2026-10-09', 'groceries', 100), tx('2026-10-10', 'dining', 20), tx('2026-10-12', 'investments', 500)],
      meta: { billsMonth: '2026-10', lastAutoDeductDate: '2026-10-14', lastSettledThrough: '2026-10-07', notificationLog: [] },
      ...extra,
    });
  const TODAY = d(2026, 10, 15);

  it('settles nothing while the week is still running, but still advances the marker', () => {
    const result = settleCompletedWeeks(afterWeekTwo({ preference: 'carry-forward' }), d(2026, 10, 14));
    expect(result.rollovers).toEqual([]); // week 2 ends today, so it has not finished
    expect(result.meta.lastSettledThrough).toBe('2026-10-13');
  });

  it('carry-forward: adds each bucket\'s surplus to next week\'s cap', () => {
    const result = settleCompletedWeeks(afterWeekTwo({ preference: 'carry-forward' }), TODAY);
    expect(result.rollovers).toEqual([
      { id: '2026-10-08:needs', weekStart: '2026-10-08', weekEnd: '2026-10-14', bucket: 'needs', amount: 250, action: 'carried', vaultId: null, settledOn: '2026-10-15' },
      { id: '2026-10-08:wants', weekStart: '2026-10-08', weekEnd: '2026-10-14', bucket: 'wants', amount: 190, action: 'carried', vaultId: null, settledOn: '2026-10-15' },
    ]);
    expect(result.meta.lastSettledThrough).toBe('2026-10-14');
    const next = getWeeklyBudget(result, TODAY);
    expect(next.buckets.needs).toMatchObject({ baseCap: 350, carriedIn: 250, cap: 600 });
    expect(next.buckets.wants).toMatchObject({ baseCap: 210, carriedIn: 190, cap: 400 });
    expect(next.spendable.remaining).toBe(1000);
  });

  it('move-to-savings: credits the chosen vault and does not touch next week\'s cap', () => {
    const data = afterWeekTwo({ preference: 'move-to-savings', vaultId: 'holiday', vaults: [vault('holiday', 100), vault('other', 7)] });
    const result = settleCompletedWeeks(data, TODAY);
    expect(result.vaults.map((v) => [v.id, v.currentAmount])).toEqual([['holiday', 540], ['other', 7]]); // 100 + 250 + 190
    expect(result.rollovers.map((r) => [r.bucket, r.amount, r.action, r.vaultId])).toEqual([
      ['needs', 250, 'moved', 'holiday'],
      ['wants', 190, 'moved', 'holiday'],
    ]);
    expect(getWeeklyBudget(result, TODAY).buckets.needs).toMatchObject({ carriedIn: 0, cap: 350 });
  });

  it('none: the surplus lapses, but the week is still marked as settled', () => {
    const result = settleCompletedWeeks(afterWeekTwo({ preference: 'none', vaultId: 'holiday', vaults: [vault('holiday')] }), TODAY);
    expect(result.rollovers).toEqual([]);
    expect(result.vaults[0]?.currentAmount).toBe(100);
    expect(result.meta.lastSettledThrough).toBe('2026-10-14');
  });

  it('move-to-savings with no valid vault lets the surplus lapse instead of guessing', () => {
    const noVault = settleCompletedWeeks(afterWeekTwo({ preference: 'move-to-savings', vaultId: null, vaults: [vault('a')] }), TODAY);
    expect(noVault.rollovers).toEqual([]);
    expect(noVault.vaults[0]?.currentAmount).toBe(100);
    const missing = settleCompletedWeeks(afterWeekTwo({ preference: 'move-to-savings', vaultId: 'gone', vaults: [vault('a')] }), TODAY);
    expect(missing.rollovers).toEqual([]);
  });

  it('is idempotent: re-running, even with a rewound marker, never double-pays', () => {
    const data = afterWeekTwo({ preference: 'move-to-savings', vaultId: 'holiday', vaults: [vault('holiday', 100)] });
    const once = settleCompletedWeeks(data, TODAY);
    expect(settleCompletedWeeks(once, TODAY)).toBe(once);
    const rewound = { ...once, meta: { ...once.meta, lastSettledThrough: '2026-10-07', notificationLog: [] } };
    const again = settleCompletedWeeks(rewound, TODAY);
    expect(again.vaults[0]?.currentAmount).toBe(540);
    expect(again.rollovers).toHaveLength(2);
  });

  it('produces nothing for an overspent week, and never settles Savings', () => {
    const data = afterWeekTwo({
      preference: 'carry-forward',
      transactions: [tx('2026-10-09', 'groceries', 400), tx('2026-10-10', 'dining', 20), tx('2026-10-11', 'investments', 1)],
    });
    const result = settleCompletedWeeks(data, TODAY);
    expect(result.rollovers.map((r) => r.bucket)).toEqual(['wants']); // needs overspent by 50; savings has no surplus concept
    expect(getWeeklyBudget(result, TODAY).buckets.needs.cap).toBe(350); // the overspend is not carried as debt
  });

  it('catches up on several missed weeks and lets the surplus compound', () => {
    const data = dataFor({
      preference: 'carry-forward',
      transactions: [],
      meta: { billsMonth: '2026-10', lastAutoDeductDate: '2026-10-07', lastSettledThrough: '2026-10-07', notificationLog: [] },
    });
    const result = settleCompletedWeeks(data, d(2026, 10, 29)); // weeks 2, 3 and 4 have finished
    const needs = result.rollovers.filter((r) => r.bucket === 'needs').map((r) => r.amount);
    const wants = result.rollovers.filter((r) => r.bucket === 'wants').map((r) => r.amount);
    expect(needs).toEqual([350, 700, 1050]); // each week's cap plus everything carried in
    expect(wants).toEqual([210, 420, 630]);
    expect(getWeeklyBudget(result, d(2026, 10, 29)).buckets.needs).toMatchObject({ baseCap: 150, carriedIn: 1050, cap: 1200 });
  });

  it('settles the last week of one pay period into the first week of the next', () => {
    const data = dataFor({
      preference: 'carry-forward',
      transactions: [],
      meta: { billsMonth: '2026-10', lastAutoDeductDate: '2026-10-24', lastSettledThrough: '2026-10-21', notificationLog: [] },
    });
    const result = settleCompletedWeeks(data, d(2026, 11, 3));
    // Week 4 (Oct 22-28): 350. Stub week (Oct 29-31): 150 + 350 carried in = 500.
    expect(result.rollovers.filter((r) => r.bucket === 'needs').map((r) => [r.weekStart, r.amount])).toEqual([
      ['2026-10-22', 350],
      ['2026-10-29', 500],
    ]);
    // November has 30 days, so a full week of Needs is 1550 x 7 / 30 = 361.67, plus the 500 carried across the boundary.
    expect(getWeeklyBudget(result, d(2026, 11, 3)).buckets.needs).toMatchObject({ baseCap: 361.67, carriedIn: 500, cap: 861.67 });
  });

  it('only records the starting point on the very first run', () => {
    const data = dataFor({ preference: 'carry-forward', transactions: [] }); // lastSettledThrough: null
    const result = settleCompletedWeeks(data, d(2026, 10, 20));
    expect(result.rollovers).toEqual([]);
    expect(result.meta.lastSettledThrough).toBe('2026-10-19');
  });

  it('waits until a week has actually finished', () => {
    const data = afterWeekTwo({ preference: 'carry-forward' });
    expect(settleCompletedWeeks(data, d(2026, 10, 14)).rollovers).toEqual([]); // week 2 ends today
    expect(settleCompletedWeeks(data, d(2026, 10, 15)).rollovers).toHaveLength(2); // finished yesterday
  });

  it('counts spending dated on the last day of the week', () => {
    const data = afterWeekTwo({ preference: 'carry-forward', transactions: [tx('2026-10-14', 'groceries', 350)] });
    const result = settleCompletedWeeks(data, TODAY);
    expect(result.rollovers.map((r) => r.bucket)).toEqual(['wants']); // needs spent to the cent: no surplus
  });
});
