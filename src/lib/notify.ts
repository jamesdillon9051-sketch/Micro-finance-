import type { BudgetOverview, FinanceData } from '../types';
import { isSpendingTransaction, roundMoney } from './budget';
import { isBillPaid } from './bills';
import { diffInDays, nextOccurrence, toDateKey, toMonthKey } from './dates';
import { formatCurrency, formatShortDate } from './format';

export type NotificationKind = 'bill-2d' | 'bill-due' | 'overspend' | 'summary';

export interface PlannedNotification {
  /** `YYYY-MM-DD|kind[|id]`: what the sent-log remembers, so each alert goes out once. */
  key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
  /** Where tapping the notification should take the app. */
  url: string;
  billId?: string | undefined;
}

interface PlanInput {
  data: FinanceData;
  overview: BudgetOverview;
  now: Date;
}

const minutesOf = (time: string): number => {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

/**
 * Everything that should be announced right now and hasn't been yet:
 *  - a bill that is due in 2 days, and on its due date,
 *  - a day on which safe-to-spend has fallen below the user's threshold,
 *  - the evening check-in once the reminder time has passed.
 * It only looks at today, so opening the app after a long gap never replays old alerts.
 */
export function planNotifications({ data, overview, now }: PlanInput): PlannedNotification[] {
  const { notifications, bills, transactions, meta, salary } = data;
  const today = toDateKey(now);
  const alreadySent = new Set(meta.notificationLog);
  const planned: PlannedNotification[] = [];
  const add = (item: PlannedNotification): void => {
    if (!alreadySent.has(item.key)) planned.push(item);
  };

  if (notifications.enableBillAlerts) {
    for (const bill of bills) {
      const due = nextOccurrence(bill.dueDate, now);
      const days = diffInDays(now, due);
      if (days !== 0 && days !== 2) continue;
      const paid = isBillPaid(bill, transactions, toMonthKey(due));
      const amount = formatCurrency(bill.amount);
      const base = { billId: bill.id, tag: `bill-${bill.id}`, url: '/?tab=bills' };

      if (days === 2 && !paid) {
        add({
          ...base,
          key: `${today}|bill-2d|${bill.id}`,
          kind: 'bill-2d',
          title: bill.isAutoDeduct ? `${bill.title} will be auto-deducted in 2 days` : `${bill.title} is due in 2 days`,
          body: bill.isAutoDeduct
            ? `${amount} will be recorded automatically on ${formatShortDate(due)}.`
            : `${amount} is due on ${formatShortDate(due)}.`,
        });
      } else if (days === 0 && bill.isAutoDeduct && paid) {
        add({
          ...base,
          key: `${today}|bill-due|${bill.id}`,
          kind: 'bill-due',
          title: `${bill.title} was auto-deducted today`,
          body: `${amount} was recorded as an expense.`,
        });
      } else if (days === 0 && !paid) {
        add({
          ...base,
          key: `${today}|bill-due|${bill.id}`,
          kind: 'bill-due',
          title: `${bill.title} is due today`,
          body: `${amount} is due today. Tap to mark it paid.`,
        });
      }
    }
  }

  const { perDay, remaining } = overview.safeToSpend;
  if (notifications.enableOverspendAlerts && salary.monthlySalary > 0 && perDay < notifications.safeToSpendThreshold) {
    add({
      key: `${today}|overspend`,
      kind: 'overspend',
      tag: 'overspend',
      url: '/?tab=budget',
      title: perDay < 0 ? "You're over this week's limit" : 'Your safe-to-spend is running low',
      body:
        perDay < 0
          ? `This week is ${formatCurrency(-remaining)} over its limit. Hold off on spending where you can.`
          : `Safe to spend today is ${formatCurrency(perDay)}, below your ${formatCurrency(notifications.safeToSpendThreshold)} alert level.`,
    });
  }

  if (notifications.enableDailyReminder && now.getHours() * 60 + now.getMinutes() >= minutesOf(notifications.reminderTime)) {
    const todays = transactions.filter((tx) => tx.date === today);
    const spent = roundMoney(todays.filter(isSpendingTransaction).reduce((sum, tx) => sum + tx.amount, 0));
    add({
      key: `${today}|summary`,
      kind: 'summary',
      tag: 'daily-summary',
      url: '/?action=log',
      title: 'Evening check-in',
      body:
        todays.length === 0
          ? "You haven't logged anything today. Take a few seconds to add what you spent."
          : `You logged ${todays.length} ${todays.length === 1 ? 'transaction' : 'transactions'} and spent ${formatCurrency(spent)} today. ${formatCurrency(remaining)} left this week. Anything missing?`,
    });
  }

  return planned;
}
