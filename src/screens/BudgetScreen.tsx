import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { RolloverCard } from '../components/budget/RolloverCard';
import { SafeToSpendCard } from '../components/budget/SafeToSpendCard';
import { SalarySplitCard } from '../components/budget/SalarySplitCard';
import { WeekScheduleCard } from '../components/budget/WeekScheduleCard';
import { WeeklyCapsCard } from '../components/budget/WeeklyCapsCard';
import { fromDateKey } from '../lib/dates';
import { formatShortDate } from '../lib/format';
import { ScreenHeader } from '../components/ui';

/** Salary allocation and the weekly budget engine: split, weekly limits, safe-to-spend and rollover. */
export function BudgetScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const { period } = finance.overview;
  const configured = finance.salary.monthlySalary > 0;
  return (
    <>
      <ScreenHeader
        title="Budget"
        subtitle={`${formatShortDate(fromDateKey(period.startDate))} – ${formatShortDate(fromDateKey(period.endDate))} · ${period.totalDays} days`}
      />
      <div className="space-y-4 px-4 pt-4">
        <SafeToSpendCard finance={finance} />
        {configured && <WeeklyCapsCard finance={finance} />}
        <SalarySplitCard finance={finance} />
        {configured && <RolloverCard finance={finance} />}
        {configured && <WeekScheduleCard finance={finance} />}
      </div>
    </>
  );
}
