import { CircleAlert, CircleCheck } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { BurnPoint, BurnRate } from '../../lib/analytics';
import { compactMoney } from '../../lib/color';
import { fromDateKey } from '../../lib/dates';
import { formatCurrency, formatShortDate } from '../../lib/format';
import { Chip } from '../ui';
import { AXIS_TICK, GRID_STROKE, TooltipCard, TooltipRow } from './chartTheme';

const SPENT = '#9085e9'; // categorical slot 7 (dark), validated on the dark surface
const PACE = '#64748b';
const LIMIT = '#fb7185';
const SURFACE = '#0d0d12';

function isPoint(value: unknown): value is BurnPoint {
  return typeof value === 'object' && value !== null && 'day' in value && 'pace' in value;
}

function BurnTooltip({ active, payload }: TooltipContentProps) {
  const entry: unknown = active ? payload[0]?.payload : undefined;
  if (!isPoint(entry)) return null;
  return (
    <TooltipCard title={`Day ${entry.day} · ${formatShortDate(fromDateKey(entry.date))}`}>
      {entry.spent !== null && <TooltipRow swatch={SPENT} label="Spent" value={formatCurrency(entry.spent)} />}
      <TooltipRow swatch={PACE} label="Even pace" value={formatCurrency(entry.pace)} />
    </TooltipCard>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </li>
  );
}

/** Cumulative spending through the pay period against an even pace and the budget limit. */
export function BurnRateChart({ rate }: { rate: BurnRate }) {
  const { points, limit, spent, dailyRate, projected, todayIndex } = rate;
  const todayPoint = points[todayIndex - 1];
  // Scale to what is drawn (the limit and the spending so far), not to the projection, which isn't plotted.
  const top = Math.max(limit, spent, 1) * 1.08;
  const lastDay = points.length;
  const ticks = [...new Set([1, ...points.filter((p) => p.day % 7 === 0).map((p) => p.day), lastDay])];
  const over = limit > 0 && projected > limit;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-400">
        <Key color={SPENT} label="Spent" />
        <Key color={PACE} label="Even pace" />
        <Key color={LIMIT} label="Budget limit" />
      </ul>

      <div className="h-56 w-full" role="img" aria-label={`Spending this pay period: ${formatCurrency(spent)} so far against a ${formatCurrency(limit)} limit`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="day" ticks={ticks} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis domain={[0, top]} tickFormatter={compactMoney} tickLine={false} axisLine={false} tick={AXIS_TICK} width={46} />
            <Tooltip content={BurnTooltip} cursor={{ stroke: 'rgba(255,255,255,0.25)' }} />
            <Area dataKey="spent" stroke="none" fill={SPENT} fillOpacity={0.1} isAnimationActive={false} />
            <Line dataKey="pace" stroke={PACE} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
            {limit > 0 && <ReferenceLine y={limit} stroke={LIMIT} strokeWidth={1.5} />}
            <Line dataKey="spent" stroke={SPENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={{ r: 4, fill: SPENT, stroke: SURFACE, strokeWidth: 2 }} animationDuration={800} />
            {todayPoint?.spent != null && <ReferenceDot x={todayPoint.day} y={todayPoint.spent} r={5} fill={SPENT} stroke={SURFACE} strokeWidth={2} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {limit > 0 ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Spent so far" value={formatCurrency(spent)} />
            <Stat label="Per day" value={formatCurrency(dailyRate)} />
            <Stat label="By payday" value={formatCurrency(projected)} emphasised />
          </dl>
          <div className="mt-3">
            {over ? (
              <Chip accent="rose" icon={CircleAlert}>
                On course to pass the limit by {formatCurrency(projected - limit)}
              </Chip>
            ) : (
              <Chip accent="emerald" icon={CircleCheck}>
                On course to finish {formatCurrency(limit - projected)} under the limit
              </Chip>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-slate-400">Set your monthly salary on the Limits tab to see your budget limit and pace.</p>
      )}
    </div>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className={`rounded-2xl border px-2 py-3 ${emphasised ? 'border-white/20 bg-white/10' : 'border-white/10 bg-white/5'}`}>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
