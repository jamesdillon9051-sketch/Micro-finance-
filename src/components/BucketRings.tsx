import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import { formatCurrency } from '../lib/format';
import { BUCKET_KEYS, type BucketKey, type BucketSummary } from '../types';
import { BUCKET_META } from './meta';

export interface RingDatum {
  key: BucketKey;
  label: string;
  fill: string;
  /** 0-100; a ring never draws past a full circle. */
  pct: number;
  used: number;
  allocated: number;
}

export function toRingData(buckets: Record<BucketKey, BucketSummary>): RingDatum[] {
  // Recharts draws the first datum innermost, so Needs (the biggest bucket) goes last to sit on the outside.
  return [...BUCKET_KEYS].reverse().map((key) => ({
    key,
    label: BUCKET_META[key].label,
    fill: BUCKET_META[key].color,
    pct: Math.min(100, buckets[key].percentUsed),
    used: buckets[key].spent,
    allocated: buckets[key].allocated,
  }));
}

function isRingDatum(value: unknown): value is RingDatum {
  return typeof value === 'object' && value !== null && 'label' in value && 'fill' in value && 'used' in value;
}

function RingTooltip({ active, payload }: TooltipContentProps) {
  const entry: unknown = active ? payload[0]?.payload : undefined;
  if (!isRingDatum(entry)) return null;
  const datum = entry;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 text-sm shadow-xl backdrop-blur-xl">
      <p className="flex items-center gap-2 font-semibold text-white">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: datum.fill }} aria-hidden />
        {datum.label}
      </p>
      <p className="mt-0.5 text-slate-400">
        {formatCurrency(datum.used)} of {formatCurrency(datum.allocated)}
      </p>
    </div>
  );
}

/**
 * One ring per bucket, Apple-Watch style: each ring fills as that bucket's
 * budget is used. The numbers live in the table rows beside/below the chart.
 */
export function BucketRings({ data }: { data: RingDatum[] }) {
  return (
    <div className="absolute inset-0" role="img" aria-label="Budget usage by bucket">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="48%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={14}
          barGap={2}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
          <RadialBar
            dataKey="pct"
            angleAxisId={0}
            cornerRadius={7}
            background={{ fill: 'rgba(255,255,255,0.06)' }}
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Tooltip content={RingTooltip} cursor={false} />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
