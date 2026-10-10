import { ArrowDownLeft, ArrowUpRight, CalendarClock, CircleAlert, Settings, TriangleAlert, Wallet } from 'lucide-react';
import { useState } from 'react';
import { BucketRings, toRingData } from '../components/BucketRings';
import { SafeToSpendCard } from '../components/budget/SafeToSpendCard';
import type { Tab } from '../components/BottomNav';
import { BUCKET_META, categoryColor, categoryMeta } from '../components/meta';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionSheet } from '../components/TransactionSheet';
import { Banner, GlassCard, IconButton, IconTile, Label, Money, ScreenHeader, SectionTitle } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { sortNewestFirst } from '../lib/budget';
import { diffInDays, fromDateKey, nextOccurrence } from '../lib/dates';
import { formatCurrency, formatDueInDays, formatShortDate } from '../lib/format';
import { BUCKET_KEYS, type Transaction } from '../types';

interface Props {
  finance: UseFinanceStoreResult;
  goTo: (tab: Tab) => void;
  openSettings: () => void;
}

const UPCOMING_COUNT = 3;
const RECENT_COUNT = 4;
const DUE_SOON_DAYS = 3;

export function HomeScreen({ finance, goTo, openSettings }: Props) {
  const { overview, salary, notifications, bills, transactions, today, storageError } = finance;
  const [editing, setEditing] = useState<Transaction | null>(null);
  const todayDate = fromDateKey(today);
  const configured = salary.monthlySalary > 0;

  const upcoming = bills
    .map((bill) => {
      const due = nextOccurrence(bill.dueDate, todayDate);
      return { bill, due, days: diffInDays(todayDate, due) };
    })
    .sort((a, b) => a.days - b.days);
  const dueSoon = upcoming.filter((item) => item.days <= DUE_SOON_DAYS);
  const overspent = BUCKET_KEYS.filter((bucket) => bucket !== 'savings' && overview.weekly.buckets[bucket].remaining < 0);
  const recent = sortNewestFirst(transactions).slice(0, RECENT_COUNT);
  const rings = toRingData(overview.buckets);

  return (
    <>
      <ScreenHeader
        title="Overview"
        subtitle={`${formatShortDate(fromDateKey(overview.period.startDate))} – ${formatShortDate(fromDateKey(overview.period.endDate))} · ${overview.period.daysRemaining} days left`}
        trailing={<IconButton icon={Settings} label="Settings" onClick={openSettings} />}
      />

      <div className="space-y-4 px-4 pt-4">
        {storageError && (
          <Banner accent="amber" icon={TriangleAlert}>
            {storageError}
          </Banner>
        )}
        {configured && notifications.enableOverspendAlerts && overspent.length > 0 && (
          <Banner accent="rose" icon={CircleAlert}>
            {overspent.map((bucket) => BUCKET_META[bucket].label).join(' and ')} {overspent.length > 1 ? 'are' : 'is'} over this
            week's limit by {formatCurrency(overspent.reduce((sum, bucket) => sum - overview.weekly.buckets[bucket].remaining, 0))}.
          </Banner>
        )}
        {notifications.enableBillAlerts && dueSoon.length > 0 && (
          <Banner accent="amber" icon={CalendarClock}>
            {dueSoon.length === 1 && dueSoon[0] ? (
              <>
                <strong className="font-semibold">{dueSoon[0].bill.title}</strong> is due {formatDueInDays(dueSoon[0].days).toLowerCase()} ·{' '}
                {formatCurrency(dueSoon[0].bill.amount)}
              </>
            ) : (
              <>
                {dueSoon.length} bills are due in the next {DUE_SOON_DAYS} days.
              </>
            )}
          </Banner>
        )}

        <SafeToSpendCard finance={finance} />

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Income"
            value={overview.periodIncome}
            icon={ArrowDownLeft}
            tint="#34d399"
            tone="emerald"
            delay={60}
          />
          <StatTile label="Spent" value={overview.periodExpenses} icon={ArrowUpRight} tint="#fb7185" tone="default" delay={100} />
        </div>

        {configured && (
          <GlassCard delay={140}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-white">This month</h2>
              <button
                type="button"
                onClick={() => goTo('budget')}
                className="text-sm font-medium text-indigo-300 transition-colors duration-300 hover:text-indigo-200"
              >
                Weekly limits
              </button>
            </div>
            <div className="relative mx-auto mt-4 aspect-square w-full max-w-[15rem]">
              <BucketRings data={rings} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <Label>Out so far</Label>
                <Money value={overview.periodExpenses} size="lg" className="mt-1" />
              </div>
            </div>
            <table className="mt-5 w-full text-left text-sm">
              <caption className="sr-only">Spending by bucket this month</caption>
              <thead>
                <tr className="text-slate-400">
                  <th scope="col" className="pb-2 font-medium">
                    Bucket
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Used
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Of
                  </th>
                </tr>
              </thead>
              <tbody>
                {BUCKET_KEYS.map((bucket) => {
                  const summary = overview.buckets[bucket];
                  return (
                    <tr key={bucket} className="border-t border-white/5">
                      <th scope="row" className="py-2.5 font-medium text-white">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BUCKET_META[bucket].color }} aria-hidden />
                          {BUCKET_META[bucket].label}
                        </span>
                      </th>
                      <td className="py-2.5 text-right tabular-nums text-slate-200">{formatCurrency(summary.spent)}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-400">{formatCurrency(summary.allocated)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        )}

        {upcoming.length > 0 && (
          <GlassCard delay={180}>
            <SectionTitle
              action={
                <button type="button" onClick={() => goTo('bills')} className="text-sm font-medium text-indigo-300 hover:text-indigo-200">
                  See all
                </button>
              }
            >
              Coming up
            </SectionTitle>
            <ul className="mt-2 divide-y divide-white/5">
              {upcoming.slice(0, UPCOMING_COUNT).map(({ bill, days }) => (
                <li key={bill.id} className="flex items-center gap-3 py-3">
                  <IconTile icon={categoryMeta(bill.category).icon} color={categoryColor(bill.category)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-white">{bill.title}</p>
                    <p className="text-sm text-slate-400">{formatDueInDays(days)}</p>
                  </div>
                  <Money value={bill.amount} size="md" />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        <GlassCard delay={220}>
          <SectionTitle
            action={
              recent.length > 0 ? (
                <button type="button" onClick={() => goTo('ledger')} className="text-sm font-medium text-indigo-300 hover:text-indigo-200">
                  See all
                </button>
              ) : undefined
            }
          >
            Recent activity
          </SectionTitle>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Wallet className="mb-3 h-8 w-8 text-slate-500" aria-hidden />
              <p className="text-sm text-slate-400">Nothing yet. Tap Log to record your first expense.</p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {recent.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow transaction={transaction} onSelect={setEditing} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {editing && <TransactionSheet finance={finance} editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tint,
  tone,
  delay,
}: {
  label: string;
  value: number;
  icon: typeof ArrowUpRight;
  tint: string;
  tone: 'emerald' | 'default';
  delay: number;
}) {
  return (
    <GlassCard className="p-4" delay={delay}>
      <span className="flex items-center gap-2 text-sm font-medium text-slate-400">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tint}26` }}
        >
          <Icon className="h-4 w-4" style={{ color: tint }} aria-hidden />
        </span>
        {label}
      </span>
      <div className="mt-3">
        <Money value={value} size="lg" tone={tone} />
      </div>
    </GlassCard>
  );
}
