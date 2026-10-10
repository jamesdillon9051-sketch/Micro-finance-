import { useMemo, useState } from 'react';
import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { burnRate, categoryBreakdown, monthlyNetSavings, rangeBounds, type AnalyticsRange } from '../../lib/analytics';
import { fromDateKey } from '../../lib/dates';
import { Segmented } from '../forms';
import { GlassCard } from '../ui';
import { BurnRateChart } from './BurnRateChart';
import { CategoryDonut } from './CategoryDonut';
import { NetSavingsBars } from './NetSavingsBars';

const RANGES = [
  { value: 'period', label: 'This period' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const satisfies ReadonlyArray<{ value: AnalyticsRange; label: string }>;

/** Spending by category, burn rate against the budget, and net savings over time. */
export function InsightsView({ finance }: { finance: UseFinanceStoreResult }) {
  const { transactions, salary, overview, today } = finance;
  const [range, setRange] = useState<AnalyticsRange>('period');
  const todayDate = fromDateKey(today);

  const breakdown = useMemo(() => {
    const { from, to } = rangeBounds(range, todayDate, overview.period);
    return categoryBreakdown(transactions, from, to);
    // todayDate is derived from `today`.
  }, [transactions, range, today, overview.period]);
  const rate = useMemo(() => burnRate({ salary, transactions }, todayDate), [salary, transactions, today]);
  const months = useMemo(() => monthlyNetSavings(transactions, todayDate, 6), [transactions, today]);

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="text-lg font-semibold text-white">Where it went</h2>
        <p className="mt-1 text-sm text-slate-400">Needs and Wants spending by category.</p>
        <div className="mt-4">
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
        </div>
        <div className="mt-5">
          <CategoryDonut breakdown={breakdown} />
        </div>
      </GlassCard>

      <GlassCard delay={60}>
        <h2 className="text-lg font-semibold text-white">Burn rate</h2>
        <p className="mt-1 text-sm text-slate-400">Cumulative Needs + Wants spending this pay period, against the budget.</p>
        <div className="mt-4">
          <BurnRateChart rate={rate} />
        </div>
      </GlassCard>

      <GlassCard delay={120}>
        <h2 className="text-lg font-semibold text-white">Net savings</h2>
        <p className="mt-1 text-sm text-slate-400">Income minus Needs + Wants spending, month by month.</p>
        <div className="mt-4">
          <NetSavingsBars months={months} />
        </div>
      </GlassCard>
    </div>
  );
}
