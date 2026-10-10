import { describe, expect, it } from 'vitest';
import type { BillReminder, FinanceData, Transaction } from '../types';
import { summarizeBudget } from './engine';
import { planNotifications } from './notify';
import { createDefaultFinanceData } from './schema';

const at = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute);

let n = 0;
const tx = (date: string, category: Transaction['category'], amount: number, id = `t${(n += 1)}`): Transaction => ({
  id,
  amount,
  category,
  type: 'expense',
  date,
  note: '',
  isRecurring: false,
});

const bill = (partial: Partial<BillReminder> = {}): BillReminder => ({
  id: 'b1',
  title: 'Rent',
  amount: 900,
  dueDate: 12,
  category: 'housing',
  isAutoDeduct: false,
  notifiedThisMonth: false,
  createdOn: null,
  ...partial,
});

function plan(now: Date, overrides: Partial<FinanceData> = {}, notificationOverrides: Partial<FinanceData['notifications']> = {}) {
  const base = createDefaultFinanceData(now);
  const data: FinanceData = {
    ...base,
    salary: { ...base.salary, monthlySalary: 3100 },
    notifications: {
      enableDailyReminder: true,
      reminderTime: '20:00',
      enableBillAlerts: true,
      enableOverspendAlerts: true,
      safeToSpendThreshold: 20,
      ...notificationOverrides,
    },
    ...overrides,
  };
  return planNotifications({ data, overview: summarizeBudget(data, now), now });
}
const kinds = (list: ReturnType<typeof plan>) => list.map((item) => item.kind);

describe('bill alerts', () => {
  it('warns two days ahead, naming the due date', () => {
    const [alert, ...rest] = plan(at(10, 10), { bills: [bill()] }, { enableDailyReminder: false });
    expect(rest).toEqual([]);
    expect(alert).toMatchObject({
      key: '2026-10-10|bill-2d|b1',
      kind: 'bill-2d',
      title: 'Rent is due in 2 days',
      body: '$900.00 is due on Oct 12.',
      billId: 'b1',
      url: '/?tab=bills',
    });
  });

  it('words it differently for an auto-deducted bill', () => {
    const [alert] = plan(at(10, 10), { bills: [bill({ isAutoDeduct: true })] }, { enableDailyReminder: false });
    expect(alert?.title).toBe('Rent will be auto-deducted in 2 days');
  });

  it('reminds on the due date, or confirms the auto-deduction', () => {
    const manual = plan(at(10, 12), { bills: [bill()] }, { enableDailyReminder: false });
    expect(manual[0]).toMatchObject({ kind: 'bill-due', title: 'Rent is due today', key: '2026-10-12|bill-due|b1' });

    const paidAuto = plan(
      at(10, 12),
      { bills: [bill({ isAutoDeduct: true })], transactions: [tx('2026-10-12', 'housing', 900, 'bill-b1-2026-10')] },
      { enableDailyReminder: false },
    );
    expect(paidAuto[0]).toMatchObject({ kind: 'bill-due', title: 'Rent was auto-deducted today' });
  });

  it('stays quiet when the bill is already paid, or on any other day', () => {
    const paid = [tx('2026-10-03', 'housing', 900, 'bill-b1-2026-10')];
    expect(plan(at(10, 10), { bills: [bill()], transactions: paid }, { enableDailyReminder: false })).toEqual([]);
    expect(plan(at(10, 12), { bills: [bill()], transactions: paid }, { enableDailyReminder: false })).toEqual([]);
    for (const day of [8, 9, 11, 13]) {
      expect(plan(at(10, day), { bills: [bill()] }, { enableDailyReminder: false })).toEqual([]);
    }
  });

  it('looks across the month boundary', () => {
    const [alert] = plan(at(10, 30), { bills: [bill({ dueDate: 1 })] }, { enableDailyReminder: false });
    expect(alert).toMatchObject({ kind: 'bill-2d', body: '$900.00 is due on Nov 1.' });
  });

  it('can be switched off', () => {
    expect(plan(at(10, 10), { bills: [bill()] }, { enableBillAlerts: false, enableDailyReminder: false })).toEqual([]);
  });
});

describe('safe-to-spend alert', () => {
  // October, week 2 (Oct 8-14): needs 350 + wants 210 = 560 to spend, 5 days left.
  const spend = (amount: number) => [tx('2026-10-09', 'shopping', amount)];

  it('fires when the daily allowance falls below the threshold', () => {
    expect(plan(at(10, 10), { transactions: spend(100) }, { enableDailyReminder: false })).toEqual([]); // (560-100)/5 = 92
    const [alert] = plan(at(10, 10), { transactions: spend(540) }, { enableDailyReminder: false }); // 20/5 = 4
    expect(alert).toMatchObject({ key: '2026-10-10|overspend', kind: 'overspend', title: 'Your safe-to-spend is running low', url: '/?tab=budget' });
    expect(alert?.body).toBe('Safe to spend today is $4.00, below your $20.00 alert level.');
  });

  it('says so plainly when the week is overspent', () => {
    const [alert] = plan(at(10, 10), { transactions: spend(700) }, { enableDailyReminder: false });
    expect(alert).toMatchObject({ title: "You're over this week's limit" });
    expect(alert?.body).toContain('$140.00 over');
  });

  it('uses the threshold the user set', () => {
    expect(plan(at(10, 10), { transactions: spend(300) }, { enableDailyReminder: false, safeToSpendThreshold: 40 })).toEqual([]); // 52 a day
    expect(kinds(plan(at(10, 10), { transactions: spend(300) }, { enableDailyReminder: false, safeToSpendThreshold: 60 }))).toEqual(['overspend']);
  });

  it('with a threshold of 0 it only fires once the week is overspent', () => {
    expect(plan(at(10, 10), { transactions: spend(560) }, { enableDailyReminder: false, safeToSpendThreshold: 0 })).toEqual([]);
    expect(kinds(plan(at(10, 10), { transactions: spend(561) }, { enableDailyReminder: false, safeToSpendThreshold: 0 }))).toEqual(['overspend']);
  });

  it('needs a salary and the setting switched on', () => {
    const noSalary = createDefaultFinanceData(at(10, 10));
    expect(plan(at(10, 10), { salary: noSalary.salary }, { enableDailyReminder: false })).toEqual([]);
    expect(plan(at(10, 10), { transactions: spend(700) }, { enableDailyReminder: false, enableOverspendAlerts: false })).toEqual([]);
  });
});

describe('evening summary', () => {
  it('waits for the reminder time', () => {
    expect(plan(at(10, 10, 19, 59))).toEqual([]);
    expect(kinds(plan(at(10, 10, 20, 0)))).toEqual(['summary']);
    expect(kinds(plan(at(10, 10, 23, 40)))).toEqual(['summary']); // opening the app late still sends today's
  });

  it('asks to log expenses when nothing was logged', () => {
    const [summary] = plan(at(10, 10, 20, 30));
    expect(summary).toMatchObject({ key: '2026-10-10|summary', title: 'Evening check-in', url: '/?action=log' });
    expect(summary?.body).toBe("You haven't logged anything today. Take a few seconds to add what you spent.");
  });

  it("summarises today's spending when there is some", () => {
    const list = plan(at(10, 10, 20, 30), {
      // the 999 is last week's, so it affects neither today's total nor this week's remaining budget
      transactions: [tx('2026-10-10', 'dining', 30), tx('2026-10-10', 'groceries', 12.5), tx('2026-10-10', 'investments', 100), tx('2026-10-07', 'dining', 999)],
    });
    const summary = list.find((item) => item.kind === 'summary');
    // 3 transactions today; savings isn't spending
    expect(summary?.body).toBe('You logged 3 transactions and spent $42.50 today. $517.50 left this week. Anything missing?');
  });

  it('follows the configured time and the on/off setting', () => {
    expect(kinds(plan(at(10, 10, 7, 45), {}, { reminderTime: '07:30' }))).toEqual(['summary']);
    expect(plan(at(10, 10, 21, 0), {}, { enableDailyReminder: false })).toEqual([]);
  });
});

describe('never repeats itself', () => {
  it('skips anything already in the sent log', () => {
    const base = createDefaultFinanceData(at(10, 10));
    const meta = { ...base.meta, notificationLog: ['2026-10-10|bill-2d|b1', '2026-10-10|summary'] };
    expect(plan(at(10, 10, 21), { bills: [bill()], meta })).toEqual([]);
    // a different day's log doesn't suppress today's
    const yesterday = { ...base.meta, notificationLog: ['2026-10-09|summary'] };
    expect(kinds(plan(at(10, 10, 21), { meta: yesterday }))).toEqual(['summary']);
  });
});
