import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { fromDateKey } from '../../lib/dates';
import { getWeeklySchedule, monthlyAllocation } from '../../lib/engine';
import { formatCurrency, formatShortDate } from '../../lib/format';
import { BUCKET_META } from '../meta';
import { Chip, GlassCard, cx } from '../ui';

/** Every week of the pay period with its base limits: the table behind the weekly caps. */
export function WeekScheduleCard({ finance }: { finance: UseFinanceStoreResult }) {
  const { salary, overview } = finance;
  const rows = getWeeklySchedule(salary, overview.period);
  const totals = monthlyAllocation(salary);
  const currentIndex = overview.weekly.week.index;

  return (
    <GlassCard delay={240}>
      <h2 className="text-lg font-semibold text-white">Week by week</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        Each week gets its share of the month: monthly amount × 7 ÷ {overview.period.totalDays} days. The last week is
        shorter, so everything adds up exactly.
      </p>

      <div className="-mx-1 mt-4 overflow-x-auto">
        <table className="w-full min-w-[19rem] text-left text-[13px]">
          <thead>
            <tr className="text-slate-400">
              <th scope="col" className="px-1 pb-2 font-medium">
                Week
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">
                {BUCKET_META.needs.label}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">
                {BUCKET_META.wants.label}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">
                {BUCKET_META.savings.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ week, caps }) => {
              const current = week.index === currentIndex;
              return (
                <tr key={week.index} className={cx('border-t border-white/5', current && 'bg-white/[0.07]')}>
                  <th scope="row" className="rounded-l-xl px-1 py-2.5 font-medium text-white">
                    <span className="block">
                      {formatShortDate(fromDateKey(week.start))}
                      {week.days > 1 && `–${formatShortDate(fromDateKey(week.end))}`}
                    </span>
                    {current && (
                      <span className="mt-1 block">
                        <Chip accent="indigo">This week</Chip>
                      </span>
                    )}
                  </th>
                  <td className="px-1 py-2.5 text-right tabular-nums text-slate-200">{formatCurrency(caps.needs)}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums text-slate-200">{formatCurrency(caps.wants)}</td>
                  <td className="rounded-r-xl px-1 py-2.5 text-right tabular-nums text-slate-200">
                    {formatCurrency(caps.savings)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 font-semibold text-white">
              <th scope="row" className="px-1 pt-3">
                Month
              </th>
              <td className="px-1 pt-3 text-right tabular-nums">{formatCurrency(totals.needs)}</td>
              <td className="px-1 pt-3 text-right tabular-nums">{formatCurrency(totals.wants)}</td>
              <td className="px-1 pt-3 text-right tabular-nums">{formatCurrency(totals.savings)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </GlassCard>
  );
}
