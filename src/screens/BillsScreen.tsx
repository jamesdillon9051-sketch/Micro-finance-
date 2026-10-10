import { CalendarClock, CalendarDays, CircleAlert, CircleCheck, Clock, Plus, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BillSheet } from '../components/BillSheet';
import { BillCalendar, STATUS_LABEL } from '../components/bills/BillCalendar';
import { Switch } from '../components/forms';
import { categoryColor, categoryMeta } from '../components/meta';
import { useToast } from '../components/toast';
import { Button, Chip, EmptyState, GlassCard, IconButton, IconTile, Label, Money, ProgressBar, ScreenHeader, type Accent } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { billStatusInMonth, compareCycles, currentBillCycle, monthBillTotals, type BillStatus } from '../lib/bills';
import { fromDateKey, toMonthKey } from '../lib/dates';
import { formatCurrency, formatDueInDays, formatMonthName, formatShortDate } from '../lib/format';
import type { BillReminder } from '../types';
import type { LucideIcon } from 'lucide-react';

const STATUS_CHIP: Record<BillStatus, { accent: Accent; icon: LucideIcon }> = {
  overdue: { accent: 'rose', icon: CircleAlert },
  'due-today': { accent: 'amber', icon: Clock },
  upcoming: { accent: 'indigo', icon: CalendarClock },
  paid: { accent: 'emerald', icon: CircleCheck },
};

export function BillsScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const toast = useToast();
  const [sheet, setSheet] = useState<{ editing?: BillReminder } | null>(null);
  const today = fromDateKey(finance.today);

  const cycles = useMemo(
    () => finance.bills.map((bill) => currentBillCycle(bill, finance.transactions, today)).sort(compareCycles),
    // `today` is derived from finance.today.
    [finance.bills, finance.transactions, finance.today],
  );
  const month = monthBillTotals(
    finance.bills.map((bill) => billStatusInMonth(bill, finance.transactions, today.getFullYear(), today.getMonth(), today)),
  );
  const next = cycles.find((cycle) => cycle.status !== 'paid');

  const markPaid = (bill: BillReminder): void => {
    const result = finance.markBillPaid(bill.id);
    if (!result.ok) return;
    const payment = result.value;
    toast({
      message: `${bill.title} marked paid · ${formatCurrency(bill.amount)}`,
      action: { label: 'Undo', onClick: () => finance.deleteTransaction(payment.id) },
    });
  };

  return (
    <>
      <ScreenHeader
        title="Bills"
        subtitle={`${cycles.length} ${cycles.length === 1 ? 'bill' : 'bills'} a month`}
        trailing={<IconButton icon={Plus} label="Add bill" variant="primary" onClick={() => setSheet({})} />}
      />
      <div className="space-y-4 px-4 pt-4">
        {cycles.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No bills yet"
            body="Add the bills and subscriptions you pay every month. We'll show when each is due, remind you, and can record it automatically."
            action={
              <Button variant="primary" large icon={Plus} onClick={() => setSheet({})}>
                Add a bill
              </Button>
            }
          />
        ) : (
          <>
            <GlassCard>
              <Label>Paid in {formatMonthName(today.getFullYear(), today.getMonth())}</Label>
              <div className="mt-3 flex items-baseline gap-2">
                <Money value={month.paid} size="xl" tone={month.paid > 0 ? 'emerald' : 'default'} />
                <span className="text-sm text-slate-400">of {formatCurrency(month.total)}</span>
              </div>
              <div className="mt-4">
                <ProgressBar value={month.total > 0 ? (month.paid / month.total) * 100 : 0} color="#34d399" label="Share of this month's bills that are paid" />
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {month.paidCount} of {month.count} paid
                {next && (
                  <>
                    {' · Next: '}
                    <span className="font-medium text-slate-200">{next.bill.title}</span> {formatDueInDays(next.days).toLowerCase()}
                  </>
                )}
              </p>
            </GlassCard>

            <BillCalendar bills={finance.bills} transactions={finance.transactions} today={finance.today} onSelectBill={(bill) => setSheet({ editing: bill })} />

            <section aria-label="All bills" className="space-y-3">
              {cycles.map((cycle, index) => {
                const { bill, status, due, days } = cycle;
                const meta = categoryMeta(bill.category);
                const chip = STATUS_CHIP[status];
                const thisMonth = toMonthKey(due) === toMonthKey(today);
                const canMarkPaid = status !== 'paid' && thisMonth;
                return (
                  <GlassCard key={bill.id} className="p-4" delay={90 + index * 30}>
                    <div className="flex items-start gap-3">
                      <IconTile icon={meta.icon} color={categoryColor(bill.category)} />
                      <button
                        type="button"
                        onClick={() => setSheet({ editing: bill })}
                        aria-label={`Edit ${bill.title}`}
                        className="min-w-0 flex-1 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-indigo-400"
                      >
                        <span className="block truncate text-base font-semibold text-white">{bill.title}</span>
                        <span className="block text-sm text-slate-400">
                          {status === 'paid' ? `Paid for ${formatMonthName(due.getFullYear(), due.getMonth()).split(' ')[0]}` : `Due ${formatShortDate(due)} · ${formatDueInDays(days)}`}
                        </span>
                      </button>
                      <div className="flex flex-col items-end gap-1.5">
                        <Money value={bill.amount} size="md" />
                        <Chip accent={chip.accent} icon={chip.icon}>
                          {STATUS_LABEL[status]}
                        </Chip>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
                      <div className="min-w-0 flex-1">
                        <Switch
                          label="Auto-deduct"
                          description={bill.isAutoDeduct ? 'Recorded on the due date' : 'Off: mark it paid yourself'}
                          checked={bill.isAutoDeduct}
                          onChange={(checked) => finance.updateBill(bill.id, { isAutoDeduct: checked })}
                        />
                      </div>
                      {canMarkPaid && (
                        <Button variant="success" icon={Zap} onClick={() => markPaid(bill)} className="shrink-0">
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </GlassCard>
                );
              })}
            </section>
          </>
        )}
      </div>

      {sheet && <BillSheet finance={finance} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </>
  );
}
