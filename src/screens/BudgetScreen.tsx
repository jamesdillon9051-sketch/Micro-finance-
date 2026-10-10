import { useState } from 'react';
import { InsightsView } from '../components/insights/InsightsView';
import { Segmented } from '../components/forms';
import { RolloverCard } from '../components/budget/RolloverCard';
import { SafeToSpendCard } from '../components/budget/SafeToSpendCard';
import { SalarySplitCard } from '../components/budget/SalarySplitCard';
import { WeekScheduleCard } from '../components/budget/WeekScheduleCard';
import { WeeklyCapsCard } from '../components/budget/WeeklyCapsCard';
import { ScreenHeader } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { fromDateKey } from '../lib/dates';
import { formatShortDate } from '../lib/format';

type View = 'limits' | 'insights';

const VIEWS = [
  { value: 'limits', label: 'Limits' },
  { value: 'insights', label: 'Insights' },
] as const satisfies ReadonlyArray<{ value: View; label: string }>;

/** Salary allocation and the weekly budget engine, plus charts of where the money is going. */
export function BudgetScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const [view, setView] = useState<View>('limits');
  const { period } = finance.overview;
  const configured = finance.salary.monthlySalary > 0;
  return (
    <>
      <ScreenHeader
        title="Budget"
        subtitle={`${formatShortDate(fromDateKey(period.startDate))} – ${formatShortDate(fromDateKey(period.endDate))} · ${period.totalDays} days`}
      />
      <div className="space-y-4 px-4 pt-4">
        <Segmented label="Budget view" options={VIEWS} value={view} onChange={setView} />
        {view === 'limits' ? (
          <>
            <SafeToSpendCard finance={finance} />
            {configured && <WeeklyCapsCard finance={finance} />}
            <SalarySplitCard finance={finance} />
            {configured && <RolloverCard finance={finance} />}
            {configured && <WeekScheduleCard finance={finance} />}
          </>
        ) : (
          <InsightsView finance={finance} />
        )}
      </div>
    </>
  );
}
