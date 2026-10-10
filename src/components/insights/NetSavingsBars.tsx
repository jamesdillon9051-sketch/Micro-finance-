import { TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { MonthNet } from '../../lib/analytics';
import { roundMoney } from '../../lib/budget';
import { compactMoney } from '../../lib/color';
import { formatCurrency } from '../../lib/format';
import { AXIS_TICK, BASELINE_STROKE, GRID_STROKE, TooltipCard, TooltipRow } from './chartTheme';

const GAIN = '#34d399';
const LOSS = '#fb7185';
const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const asDate = (month: string): Date => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);

interface Datum extends MonthNet {
  label: string;
  /** Positive part and negative part are separate bars so each can round only its free end. */
  gain: number;
  loss: number;
  running: number;
}

function toData(months: readonly MonthNet[]): Datum[] {
  let running = 0;
  return months.map((month) => {
    running = roundMoney(running + month.net);
    return { ...month, label: monthLabel.format(asDate(month.month)), gain: Math.max(0, month.net), loss: Math.min(0, month.net), running };
  });
}

function isDatum(value: unknown): value is Datum {
  return typeof value === 'object' && value !== null && 'running' in value && 'label' in value;
}

function NetTooltip({ active, payload }: TooltipContentProps) {
  const entry: unknown = active ? payload[0]?.payload : undefined;
  if (!isDatum(entry)) return null;
  return (
    <TooltipCard title={monthYear.format(asDate(entry.month))}>
      <TooltipRow label="Income" value={formatCurrency(entry.income)} />
      <TooltipRow label="Spending" value={formatCurrency(entry.spending)} />
      <TooltipRow swatch={entry.net >= 0 ? GAIN : LOSS} label="Net" value={formatCurrency(entry.net)} />
      <TooltipRow label="Running total" value={formatCurrency(entry.running)} />
    </TooltipCard>
  );
}

/** What was left from each month's income after Needs and Wants, and how it adds up. */
export function NetSavingsBars({ months }: { months: readonly MonthNet[] }) {
  const data = toData(months);
  const total = data.at(-1)?.running ?? 0;
  const best = data.reduce<Datum | undefined>((top, month) => (top === undefined || month.net > top.net ? month : top), undefined);
  const hasData = months.some((month) => month.income > 0 || month.spending > 0);

  if (!hasData) {
    return <p className="py-10 text-center text-sm leading-relaxed text-slate-400">Once you have income and spending logged, your monthly net savings will chart here.</p>;
  }

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-400">
        <li className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: GAIN }} aria-hidden />
          Saved
        </li>
        <li className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-rose-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: LOSS }} aria-hidden />
          Overspent
        </li>
      </ul>

      <div className="h-52 w-full" role="img" aria-label={`Net savings for the last ${months.length} months, ${formatCurrency(total)} in total`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: 0 }} stackOffset="sign" barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} tick={AXIS_TICK} width={46} />
            <Tooltip content={NetTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <ReferenceLine y={0} stroke={BASELINE_STROKE} />
            <Bar dataKey="gain" stackId="net" fill={GAIN} maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={800} />
            <Bar dataKey="loss" stackId="net" fill={LOSS} maxBarSize={24} radius={[0, 0, 4, 4]} animationDuration={800} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-slate-400">Last {months.length} months</dt>
          <dd className={`mt-1 text-base font-semibold ${total >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(total)}</dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-slate-400">Best month</dt>
          <dd className="mt-1 text-base font-semibold text-white">
            {best ? `${best.label} · ${formatCurrency(best.net)}` : '—'}
          </dd>
        </div>
      </dl>

      <details className="group mt-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-indigo-300 transition-colors duration-300 hover:text-indigo-200">
          <span className="group-open:hidden">Show the numbers</span>
          <span className="hidden group-open:inline">Hide the numbers</span>
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Income, spending and net by month</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-500">
              <th scope="col" className="pb-2 font-medium">Month</th>
              <th scope="col" className="pb-2 text-right font-medium">Income</th>
              <th scope="col" className="pb-2 text-right font-medium">Spent</th>
              <th scope="col" className="pb-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.map((month) => (
              <tr key={month.month} className="border-t border-white/5 text-[13px]">
                <th scope="row" className="py-2 font-medium text-white">{month.label}</th>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatCurrency(month.income)}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{formatCurrency(month.spending)}</td>
                <td className="py-2 text-right tabular-nums text-white">{formatCurrency(month.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
