import { CalendarClock, Clock, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { BillSheet } from '../components/BillSheet';
import { categoryColor, categoryMeta } from '../components/meta';
import { Chip, EmptyState, Fab, GlassCard, IconTile, Label, Money, ScreenHeader, Button } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { roundMoney } from '../lib/budget';
import { diffInDays, fromDateKey, nextOccurrence } from '../lib/dates';
import { formatDueInDays, formatShortDate } from '../lib/format';
import type { BillReminder } from '../types';

const DUE_SOON_DAYS = 3;

export function BillsScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const [sheet, setSheet] = useState<{ editing?: BillReminder } | null>(null);
  const today = fromDateKey(finance.today);

  const items = finance.bills
    .map((bill) => {
      const due = nextOccurrence(bill.dueDate, today);
      return { bill, due, days: diffInDays(today, due) };
    })
    .sort((a, b) => a.days - b.days);

  const total = roundMoney(finance.bills.reduce((sum, bill) => sum + bill.amount, 0));
  const next = items[0];

  return (
    <>
      <ScreenHeader title="Bills" subtitle={`${items.length} ${items.length === 1 ? 'bill' : 'bills'} a month`} />
      <div className="space-y-4 px-4 pt-4">
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No bills yet"
            body="Add the bills you pay every month and we'll remind you before they're due. Mark one as auto-deduct to record it for you."
            action={
              <Button variant="primary" large icon={Plus} onClick={() => setSheet({})}>
                Add a bill
              </Button>
            }
          />
        ) : (
          <>
            <GlassCard>
              <Label>Bills each month</Label>
              <div className="mt-3">
                <Money value={total} size="xl" />
              </div>
              {next && (
                <p className="mt-3 text-sm text-slate-400">
                  Next up: <span className="font-medium text-slate-200">{next.bill.title}</span> ·{' '}
                  {formatDueInDays(next.days).toLowerCase()}
                </p>
              )}
            </GlassCard>

            <GlassCard className="px-3 py-1" delay={60}>
              <ul className="divide-y divide-white/5">
                {items.map(({ bill, due, days }) => {
                  const meta = categoryMeta(bill.category);
                  return (
                    <li key={bill.id}>
                      <button
                        type="button"
                        onClick={() => setSheet({ editing: bill })}
                        className="flex w-full items-center gap-3 rounded-2xl px-1 py-3.5 text-left transition-all duration-300 ease-in-out hover:bg-white/5 active:scale-[0.98] active:bg-white/10 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-indigo-400"
                      >
                        <IconTile icon={meta.icon} color={categoryColor(bill.category)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-medium text-white">{bill.title}</span>
                          <span className="block truncate text-sm text-slate-400">
                            {formatShortDate(due)} · {formatDueInDays(days)}
                          </span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {days <= DUE_SOON_DAYS && (
                              <Chip accent="amber" icon={Clock}>
                                Due soon
                              </Chip>
                            )}
                            {bill.isAutoDeduct && (
                              <Chip accent="emerald" icon={Zap}>
                                Auto-deduct
                              </Chip>
                            )}
                          </span>
                        </span>
                        <Money value={bill.amount} size="md" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </GlassCard>
          </>
        )}
      </div>

      <Fab label="Add bill" icon={Plus} onClick={() => setSheet({})} />
      {sheet && <BillSheet finance={finance} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </>
  );
}
