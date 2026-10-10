import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import { MAX_NAMED_SLICES, type CategoryBreakdown } from '../../lib/analytics';
import { lighten } from '../../lib/color';
import { formatCurrency } from '../../lib/format';
import { CATEGORY_BUCKET } from '../../types';
import { BUCKET_META, EXPENSE_META } from '../meta';
import { Label, Money } from '../ui';
import { TooltipCard, TooltipRow } from './chartTheme';

/**
 * Same-bucket categories are told apart by lightness (steps validated as a visible, colour-blind-safe
 * ramp on the dark surface); the bucket itself is told by hue, matching every other screen.
 */
const SHADE_STEPS = [0, 0.22, 0.42, 0.62] as const;
const OTHER_COLOR = '#64748b';

interface Datum {
  id: string;
  label: string;
  amount: number;
  percent: number;
  fill: string;
  bucketLabel: string;
}

function toData(breakdown: CategoryBreakdown): Datum[] {
  const used: Record<string, number> = {};
  return breakdown.slices.map((slice) => {
    if (slice.id === 'other') {
      return { id: 'other', label: `Other (${slice.members})`, amount: slice.amount, percent: slice.percent, fill: OTHER_COLOR, bucketLabel: 'Mixed' };
    }
    const bucket = CATEGORY_BUCKET[slice.id];
    const step = used[bucket] ?? 0;
    used[bucket] = step + 1;
    return {
      id: slice.id,
      label: EXPENSE_META[slice.id].label,
      amount: slice.amount,
      percent: slice.percent,
      fill: lighten(BUCKET_META[bucket].color, SHADE_STEPS[Math.min(step, SHADE_STEPS.length - 1)] ?? 0),
      bucketLabel: BUCKET_META[bucket].label,
    };
  });
}

function isDatum(value: unknown): value is Datum {
  return typeof value === 'object' && value !== null && 'label' in value && 'fill' in value && 'percent' in value;
}

function DonutTooltip({ active, payload }: TooltipContentProps) {
  const entry: unknown = active ? payload[0]?.payload : undefined;
  if (!isDatum(entry)) return null;
  return (
    <TooltipCard title={entry.label}>
      <TooltipRow swatch={entry.fill} label={entry.bucketLabel} value={formatCurrency(entry.amount)} />
      <TooltipRow label="Share" value={`${entry.percent}%`} />
    </TooltipCard>
  );
}

/** Where the money went: the top categories as a donut, with the same numbers in a table beneath it. */
export function CategoryDonut({ breakdown }: { breakdown: CategoryBreakdown }) {
  const data = toData(breakdown);
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm leading-relaxed text-slate-400">No spending in this range yet. Log an expense and it will appear here.</p>;
  }
  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[15rem]" role="img" aria-label={`Spending by category, ${formatCurrency(breakdown.total)} in total`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={2}
              cornerRadius={5}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              animationDuration={800}
              animationEasing="ease-out"
            >
              {data.map((slice) => (
                <Cell key={slice.id} fill={slice.fill} />
              ))}
            </Pie>
            <Tooltip content={DonutTooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <Label>Spent</Label>
          <Money value={breakdown.total} size="lg" className="mt-1" />
        </div>
      </div>

      <table className="mt-5 w-full text-left text-sm">
        <caption className="sr-only">Spending by category</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wider text-slate-500">
            <th scope="col" className="pb-2 font-medium">
              Category
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Share
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((slice) => (
            <tr key={slice.id} className="border-t border-white/5">
              <th scope="row" className="py-2.5 font-medium text-white">
                <span className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: slice.fill }} aria-hidden />
                  <span className="truncate">{slice.label}</span>
                </span>
              </th>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{slice.percent}%</td>
              <td className="py-2.5 text-right tabular-nums text-slate-200">{formatCurrency(slice.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {breakdown.slices.some((slice) => slice.id === 'other') && (
        <p className="mt-2 text-xs text-slate-500">The {MAX_NAMED_SLICES} biggest categories are shown; the rest are grouped as Other.</p>
      )}
    </div>
  );
}
