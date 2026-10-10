import type { CSSProperties } from 'react';
import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { useAllocationEditor } from '../../hooks/useAllocationEditor';
import { roundMoney } from '../../lib/budget';
import { monthlyAllocation } from '../../lib/engine';
import { formatCurrency, ordinal } from '../../lib/format';
import { BUCKET_KEYS, type BucketKey } from '../../types';
import { Field, INPUT_CLASS, MoneyInput } from '../forms';
import { BUCKET_META } from '../meta';
import { GlassCard, cx } from '../ui';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/** Salary, payday and the Needs / Wants / Savings split. The three percentages always total 100. */
export function SalarySplitCard({ finance }: { finance: UseFinanceStoreResult }) {
  const { salary, overview } = finance;
  const editor = useAllocationEditor(finance);
  const monthly = monthlyAllocation({ monthlySalary: salary.monthlySalary, allocation: editor.allocation });
  const periodDays = overview.period.totalDays;

  return (
    <GlassCard delay={120}>
      <h2 className="text-lg font-semibold text-white">Salary &amp; split</h2>

      <div className="mt-5 space-y-5">
        <Field label="Monthly take-home">
          {(id) => (
            <MoneyInput
              id={id}
              value={editor.salaryText}
              onChange={editor.setSalaryText}
              onCommit={editor.commitSalary}
            />
          )}
        </Field>

        <Field label="Payday" hint="Your budget month, and its weeks, start on this day.">
          {(id) => (
            <select
              id={id}
              value={salary.paydayDate}
              onChange={(event) => finance.updateSalary({ paydayDate: Number(event.target.value) })}
              className={cx(INPUT_CLASS, 'appearance-none')}
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {ordinal(day)} of the month
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="mt-7">
        <div
          role="img"
          aria-label={BUCKET_KEYS.map((b) => `${BUCKET_META[b].label} ${editor.allocation[b]} percent`).join(', ')}
          className="flex h-3 gap-0.5 overflow-hidden rounded-full"
        >
          {BUCKET_KEYS.map((bucket) => (
            <span
              key={bucket}
              className="h-full min-w-0 transition-all duration-300 ease-in-out"
              style={{ flexGrow: editor.allocation[bucket], flexBasis: 0, backgroundColor: BUCKET_META[bucket].color }}
            />
          ))}
        </div>

        <div className="mt-6 space-y-7">
          {BUCKET_KEYS.map((bucket) => (
            <SliderRow
              key={bucket}
              bucket={bucket}
              percent={editor.allocation[bucket]}
              monthly={monthly[bucket]}
              weekly={roundMoney((monthly[bucket] * 7) / periodDays)}
              onChange={(value) => editor.setBucketPercent(bucket, value)}
              onCommit={editor.commitAllocation}
            />
          ))}
        </div>
      </div>

      {editor.error && <p className="mt-4 text-sm text-rose-300">{editor.error}</p>}
    </GlassCard>
  );
}

function SliderRow({
  bucket,
  percent,
  monthly,
  weekly,
  onChange,
  onCommit,
}: {
  bucket: BucketKey;
  percent: number;
  monthly: number;
  weekly: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const meta = BUCKET_META[bucket];
  const inputId = `slider-${bucket}`;
  const style = { '--pct': `${percent}%`, '--fill': meta.color } as CSSProperties;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="flex items-center gap-2 text-base font-medium text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
          {meta.label}
        </label>
        <span className="text-2xl font-bold tracking-tight text-white">{percent}%</span>
      </div>
      <input
        id={inputId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        className="slider mt-3"
        style={style}
        aria-valuetext={`${percent} percent`}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      <p className="mt-2.5 text-sm text-slate-400">
        {formatCurrency(monthly)} a month · about <span className="text-slate-200">{formatCurrency(weekly)}</span> a week
      </p>
    </div>
  );
}
