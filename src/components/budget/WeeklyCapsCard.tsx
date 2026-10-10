import { CircleAlert, CircleCheck, Repeat } from 'lucide-react';
import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { formatCurrency, formatShortDate } from '../../lib/format';
import { fromDateKey } from '../../lib/dates';
import { BUCKET_KEYS, type BucketKey, type WeeklyBucket } from '../../types';
import { BUCKET_META } from '../meta';
import { Chip, GlassCard, ProgressBar } from '../ui';

const OVER_COLOR = '#fb7185';

/** Strict weekly limits for each bucket, with how much of each has been used. */
export function WeeklyCapsCard({ finance }: { finance: UseFinanceStoreResult }) {
  const { weekly } = finance.overview;
  const start = formatShortDate(fromDateKey(weekly.week.start));
  const end = formatShortDate(fromDateKey(weekly.week.end));

  return (
    <GlassCard delay={60}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">This week's limits</h2>
        <span className="text-sm text-slate-400">
          {start} – {end}
        </span>
      </div>

      <div className="mt-5 space-y-6">
        {BUCKET_KEYS.map((bucket) => (
          <BucketRow key={bucket} bucket={bucket} data={weekly.buckets[bucket]} />
        ))}
      </div>
    </GlassCard>
  );
}

function BucketRow({ bucket, data }: { bucket: BucketKey; data: WeeklyBucket }) {
  const meta = BUCKET_META[bucket];
  const isSavings = bucket === 'savings';
  const over = !isSavings && data.remaining < 0;
  const hitTarget = isSavings && data.cap > 0 && data.spent >= data.cap;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-base font-semibold text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
          {meta.label}
        </span>
        <span className="text-sm text-slate-400">
          {isSavings ? 'Target' : 'Limit'} <span className="font-semibold text-white">{formatCurrency(data.cap)}</span>
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar
          value={data.percentUsed}
          color={over ? OVER_COLOR : meta.color}
          label={`${meta.label} ${isSavings ? 'saved' : 'used'} this week`}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-400">
          {formatCurrency(data.spent)} {isSavings ? 'saved' : 'spent'}
        </span>
        {over ? (
          <Chip accent="rose" icon={CircleAlert}>
            Over by {formatCurrency(-data.remaining)}
          </Chip>
        ) : hitTarget ? (
          <Chip accent="emerald" icon={CircleCheck}>
            Target reached
          </Chip>
        ) : (
          <span className="font-medium text-slate-200">
            {formatCurrency(data.remaining)} {isSavings ? 'to go' : 'left'}
          </span>
        )}
      </div>

      {data.carriedIn > 0 && (
        <div className="mt-2.5">
          <Chip accent="indigo" icon={Repeat}>
            Includes {formatCurrency(data.carriedIn)} carried over
          </Chip>
        </div>
      )}
    </div>
  );
}
