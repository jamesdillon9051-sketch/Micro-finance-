import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { billStatusInMonth, buildMonthGrid, type BillCycle, type BillStatus } from '../../lib/bills';
import { fromDateKey, toDateKey } from '../../lib/dates';
import { formatMonthName, formatShortDate } from '../../lib/format';
import type { BillReminder, DateKey, Transaction } from '../../types';
import { categoryColor, categoryMeta } from '../meta';
import { GlassCard, IconButton, IconTile, Money, cx } from '../ui';

export const STATUS_LABEL: Record<BillStatus, string> = {
  overdue: 'Overdue',
  'due-today': 'Due today',
  upcoming: 'Upcoming',
  paid: 'Paid',
};

/** Dot colours; every status also has a text label wherever the dots are explained. */
const STATUS_DOT: Record<BillStatus, string> = {
  overdue: 'bg-rose-400',
  'due-today': 'bg-amber-400',
  upcoming: 'bg-indigo-300',
  paid: 'bg-emerald-400',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface Props {
  bills: readonly BillReminder[];
  transactions: readonly Transaction[];
  today: DateKey;
  onSelectBill: (bill: BillReminder) => void;
}

/** A month at a glance: each due date carries a dot for every bill, coloured by its status. */
export function BillCalendar({ bills, transactions, today, onSelectBill }: Props) {
  const todayDate = fromDateKey(today);
  const [view, setView] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [selected, setSelected] = useState<DateKey | null>(null);
  const isCurrentMonth = view.year === todayDate.getFullYear() && view.month === todayDate.getMonth();

  const byDay = useMemo(() => {
    const map = new Map<DateKey, BillCycle[]>();
    for (const bill of bills) {
      const cycle = billStatusInMonth(bill, transactions, view.year, view.month, todayDate);
      if (!cycle) continue;
      const key = toDateKey(cycle.due);
      map.set(key, [...(map.get(key) ?? []), cycle]);
    }
    return map;
    // todayDate is derived from `today`.
  }, [bills, transactions, view.year, view.month, today]);

  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view.year, view.month]);
  const step = (delta: number): void => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
    setSelected(null);
  };
  const selectedCycles = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <GlassCard delay={60}>
      <div className="flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => step(-1)} className="h-10 w-10" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-white" aria-live="polite">
            {formatMonthName(view.year, view.month)}
          </h2>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                setView({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
                setSelected(null);
              }}
              className="text-xs font-medium text-indigo-300 transition-colors duration-300 hover:text-indigo-200"
            >
              Back to today
            </button>
          )}
        </div>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => step(1)} className="h-10 w-10" />
      </div>

      <div role="grid" aria-label={`Bills due in ${formatMonthName(view.year, view.month)}`} className="mt-4">
        <div role="row" className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {WEEKDAYS.map((day, index) => (
            <span key={index} role="columnheader" aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}>
              {day}
            </span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1">
          {grid.map((cell, index) => {
            if (!cell) return <span key={`blank-${index}`} role="gridcell" aria-hidden />;
            const cycles = byDay.get(cell.date) ?? [];
            const isToday = cell.date === today;
            const isSelected = cell.date === selected;
            const label =
              cycles.length > 0
                ? `${formatShortDate(fromDateKey(cell.date))}: ${cycles.map((c) => `${c.bill.title} ${STATUS_LABEL[c.status].toLowerCase()}`).join(', ')}`
                : formatShortDate(fromDateKey(cell.date));
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={isSelected}
                aria-current={isToday ? 'date' : undefined}
                disabled={cycles.length === 0}
                onClick={() => setSelected(isSelected ? null : cell.date)}
                className={cx(
                  'mx-auto flex h-11 w-11 flex-col items-center justify-center gap-1 rounded-full text-sm',
                  'transition-all duration-300 ease-in-out',
                  cycles.length > 0 && 'hover:bg-white/10 active:scale-90 motion-reduce:active:scale-100',
                  isSelected ? 'bg-white/15 font-semibold text-white' : isToday ? 'font-semibold text-white ring-1 ring-indigo-400/70' : 'text-slate-300',
                  cycles.length === 0 && 'cursor-default text-slate-500',
                )}
              >
                <span className="leading-none">{cell.day}</span>
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {cycles.slice(0, 3).map((cycle) => (
                    <span key={cycle.bill.id} className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[cycle.status])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
        {(Object.keys(STATUS_LABEL) as BillStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span className={cx('h-2 w-2 rounded-full', STATUS_DOT[status])} aria-hidden />
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ul>

      {selectedCycles.length > 0 && (
        <ul className="mt-4 animate-fade-in divide-y divide-white/5 border-t border-white/10">
          {selectedCycles.map((cycle) => (
            <li key={cycle.bill.id}>
              <button
                type="button"
                onClick={() => onSelectBill(cycle.bill)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-300 hover:bg-white/5"
              >
                <IconTile icon={categoryMeta(cycle.bill.category).icon} color={categoryColor(cycle.bill.category)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">{cycle.bill.title}</span>
                  <span className="flex items-center gap-1.5 text-sm text-slate-400">
                    <span className={cx('h-2 w-2 rounded-full', STATUS_DOT[cycle.status])} aria-hidden />
                    {STATUS_LABEL[cycle.status]}
                  </span>
                </span>
                <Money value={cycle.bill.amount} size="md" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
