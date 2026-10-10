import { CircleAlert, CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { formatCurrency } from '../../lib/format';
import { Chip, GlassCard, Label, Money, cx, type Accent, type Tone } from '../ui';

type Status = 'setup' | 'ok' | 'low' | 'over';

const STATUS: Record<Exclude<Status, 'setup'>, { tone: Tone; accent: Accent; label: string; glow: string }> = {
  ok: { tone: 'emerald', accent: 'emerald', label: 'On track', glow: 'bg-emerald-500' },
  low: { tone: 'amber', accent: 'amber', label: 'Running low', glow: 'bg-amber-500' },
  over: { tone: 'rose', accent: 'rose', label: 'Over this week\'s limit', glow: 'bg-rose-500' },
};

/** Today's allowance: what is left of this week's Needs + Wants budget, spread over the days left in the week. */
export function SafeToSpendCard({ finance }: { finance: UseFinanceStoreResult }) {
  const { overview, salary, notifications } = finance;
  const { remaining, daysRemaining, perDay } = overview.safeToSpend;
  const { weekNumber, weeksInPeriod } = overview.weekly;

  const threshold = notifications.safeToSpendThreshold;
  const status: Status =
    salary.monthlySalary <= 0 ? 'setup' : perDay < 0 ? 'over' : threshold > 0 && perDay < threshold ? 'low' : 'ok';

  if (status === 'setup') {
    return (
      <GlassCard className="text-center">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15">
          <Sparkles className="h-7 w-7 text-indigo-300" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold text-white">Set your salary to begin</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
          Add your monthly salary below and we'll turn it into weekly limits and a safe daily amount to spend.
        </p>
      </GlassCard>
    );
  }

  const style = STATUS[status];
  const Icon = status === 'ok' ? CircleCheck : status === 'low' ? TriangleAlert : CircleAlert;

  return (
    <GlassCard className="relative overflow-hidden">
      <div
        aria-hidden
        className={cx('pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl', style.glow)}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <Label>Safe to spend today</Label>
          <Chip accent={style.accent} icon={Icon}>
            {style.label}
          </Chip>
        </div>

        <div className="mt-4" aria-live="polite">
          <Money value={perDay} size="hero" tone={style.tone} glow />
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Week {weekNumber} of {weeksInPeriod} · {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Step label="Left this week" value={formatCurrency(remaining)} />
          <Step label="÷ Days left" value={String(daysRemaining)} />
          <Step label="= Per day" value={formatCurrency(perDay)} emphasised />
        </dl>
      </div>
    </GlassCard>
  );
}

function Step({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className={cx('rounded-2xl border px-2 py-3', emphasised ? 'border-white/20 bg-white/10' : 'border-white/10 bg-white/5')}>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
