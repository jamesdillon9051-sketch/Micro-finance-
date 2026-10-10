import { describe, expect, it } from 'vitest';
import type { BillReminder, Transaction } from '../types';
import { billStatusInMonth, buildMonthGrid, compareCycles, currentBillCycle, isBillPaid, monthBillTotals } from './bills';

const TODAY = new Date(2026, 9, 10, 12); // Oct 10 2026

const bill = (partial: Partial<BillReminder> = {}): BillReminder => ({
  id: 'rent',
  title: 'Rent',
  amount: 900,
  dueDate: 15,
  category: 'housing',
  isAutoDeduct: false,
  notifiedThisMonth: false,
  createdOn: null,
  ...partial,
});

const payment = (billId: string, month: string): Transaction => ({
  id: `bill-${billId}-${month}`,
  amount: 900,
  category: 'housing',
  type: 'expense',
  date: `${month}-12`,
  note: '',
  isRecurring: true,
});

describe('bill status', () => {
  it('is upcoming before the due date, with the days to go', () => {
    expect(currentBillCycle(bill(), [], TODAY)).toMatchObject({ status: 'upcoming', days: 5 });
  });

  it('is due today on the due date', () => {
    expect(currentBillCycle(bill({ dueDate: 10 }), [], TODAY)).toMatchObject({ status: 'due-today', days: 0 });
  });

  it('is overdue once the date has passed unpaid', () => {
    expect(currentBillCycle(bill({ dueDate: 5 }), [], TODAY)).toMatchObject({ status: 'overdue', days: -5 });
  });

  it('is paid when the payment for this month exists, whenever the due date is', () => {
    const paid = [payment('rent', '2026-10')];
    for (const dueDate of [5, 10, 25]) {
      expect(currentBillCycle(bill({ dueDate }), paid, TODAY).status).toBe('paid');
    }
    expect(isBillPaid(bill(), paid, '2026-10')).toBe(true);
    expect(isBillPaid(bill(), paid, '2026-11')).toBe(false); // last month's payment doesn't cover next month
  });

  it("doesn't call a bill overdue for a date before it was added", () => {
    const added = bill({ dueDate: 5, createdOn: '2026-10-08' });
    expect(billStatusInMonth(added, [], 2026, 9, TODAY)).toBeNull();
    const cycle = currentBillCycle(added, [], TODAY);
    expect(cycle.status).toBe('upcoming');
    expect(cycle.due).toEqual(new Date(2026, 10, 5)); // moves on to next month
    expect(cycle.days).toBe(26);
  });

  it('is overdue when the bill existed before the missed date', () => {
    expect(currentBillCycle(bill({ dueDate: 5, createdOn: '2026-10-01' }), [], TODAY).status).toBe('overdue');
  });

  it('puts a day-31 bill on the last day of a short month', () => {
    const cycle = billStatusInMonth(bill({ dueDate: 31 }), [], 2027, 1, new Date(2027, 1, 10, 12));
    expect(cycle).toMatchObject({ status: 'upcoming', days: 18 });
    expect(cycle?.due).toEqual(new Date(2027, 1, 28));
  });

  it('orders overdue, due today, upcoming by date, then paid', () => {
    const paid = [payment('p', '2026-10')];
    const cycles = [
      currentBillCycle(bill({ id: 'far', title: 'Far', dueDate: 28 }), paid, TODAY),
      currentBillCycle(bill({ id: 'p', title: 'Paid', dueDate: 3 }), paid, TODAY),
      currentBillCycle(bill({ id: 'soon', title: 'Soon', dueDate: 12 }), paid, TODAY),
      currentBillCycle(bill({ id: 'late', title: 'Late', dueDate: 2 }), paid, TODAY),
      currentBillCycle(bill({ id: 'now', title: 'Now', dueDate: 10 }), paid, TODAY),
    ].sort(compareCycles);
    expect(cycles.map((c) => c.bill.title)).toEqual(['Late', 'Now', 'Soon', 'Far', 'Paid']);
  });

  it('totals what has been paid this month', () => {
    const paid = [payment('a', '2026-10')];
    const month = [
      billStatusInMonth(bill({ id: 'a', amount: 100 }), paid, 2026, 9, TODAY),
      billStatusInMonth(bill({ id: 'b', amount: 50.5 }), paid, 2026, 9, TODAY),
      billStatusInMonth(bill({ id: 'c', amount: 999, dueDate: 3, createdOn: '2026-10-09' }), paid, 2026, 9, TODAY), // untracked
    ];
    expect(monthBillTotals(month)).toEqual({ total: 150.5, paid: 100, count: 2, paidCount: 1 });
  });
});

describe('buildMonthGrid', () => {
  it('pads to the weekday of the 1st and lists every day', () => {
    const grid = buildMonthGrid(2026, 9);
    const blanks = new Date(2026, 9, 1).getDay();
    expect(grid).toHaveLength(blanks + 31);
    expect(grid.slice(0, blanks).every((cell) => cell === null)).toBe(true);
    expect(grid[blanks]).toEqual({ date: '2026-10-01', day: 1 });
    expect(grid.at(-1)).toEqual({ date: '2026-10-31', day: 31 });
  });

  it('knows February has 28 days in 2027 and 29 in 2028', () => {
    expect(buildMonthGrid(2027, 1).filter(Boolean)).toHaveLength(28);
    expect(buildMonthGrid(2028, 1).filter(Boolean)).toHaveLength(29);
  });
});
