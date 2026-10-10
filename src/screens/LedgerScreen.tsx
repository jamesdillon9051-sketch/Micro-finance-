import { Plus, Repeat, Search, SearchX, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { CategoryBadge } from '../components/CategoryBadge';
import { Field, INPUT_CLASS, Segmented, TextInput } from '../components/forms';
import { BUCKET_META, EXPENSE_META, INCOME_META, categoryMeta } from '../components/meta';
import { TransactionSheet } from '../components/TransactionSheet';
import { Button, EmptyState, GlassCard, IconButton, Money, PRESS, ScreenHeader, cx } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { sortNewestFirst } from '../lib/budget';
import { fromDateKey } from '../lib/dates';
import { filterTransactions, isUnfiltered, ledgerTotals, orderedRange, presetRange, type LedgerFilters, type RangePreset } from '../lib/ledger';
import { formatLedgerDate } from '../lib/format';
import { BUCKET_KEYS, CATEGORY_BUCKET, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Category, type Transaction } from '../types';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
] as const;

const RANGES: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'period', label: 'This period' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

const PAGE_SIZE = 60;

/** Turns the select's text back into a category, treating anything unknown as "all". */
function parseCategoryFilter(value: string): LedgerFilters['category'] {
  return [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((candidate) => candidate === value) ?? 'all';
}

const labelOf = (category: Category): string => categoryMeta(category).label;

export function LedgerScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const { transactions, overview, today } = finance;
  const [query, setQuery] = useState('');
  const [type, setType] = useState<LedgerFilters['type']>('all');
  const [category, setCategory] = useState<LedgerFilters['category']>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState<{ editing?: Transaction } | null>(null);

  const deferredQuery = useDeferredValue(query);
  const range =
    preset === 'custom'
      ? orderedRange(customFrom || null, customTo || null)
      : presetRange(preset, fromDateKey(today), overview.period);
  const filters: LedgerFilters = { query: deferredQuery, type, category, ...range };

  const rows = useMemo(
    () => sortNewestFirst(filterTransactions(transactions, filters, labelOf)),
    // `filters` is rebuilt every render; only its parts matter.
    [transactions, deferredQuery, type, category, range.from, range.to],
  );
  const totals = useMemo(() => ledgerTotals(rows), [rows]);
  const shown = rows.slice(0, visible);
  const filtered = !isUnfiltered(filters);

  const reset = (): void => {
    setQuery('');
    setType('all');
    setCategory('all');
    setPreset('all');
    setCustomFrom('');
    setCustomTo('');
    setVisible(PAGE_SIZE);
  };
  const touch = <T,>(setter: (value: T) => void) => (value: T): void => {
    setter(value);
    setVisible(PAGE_SIZE);
  };

  return (
    <>
      <ScreenHeader
        title="Ledger"
        subtitle={`${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'}`}
        trailing={<IconButton icon={Plus} label="Add transaction" variant="primary" onClick={() => setSheet({})} />}
      />

      <div className="space-y-3 px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search transactions"
            placeholder="Search notes, categories, amounts"
            value={query}
            onChange={(event) => touch(setQuery)(event.target.value)}
            className={cx(INPUT_CLASS, 'pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden')}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => touch(setQuery)('')}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-all duration-300 hover:bg-white/10 hover:text-white active:scale-90"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <Segmented label="Transaction type" options={TYPE_OPTIONS} value={type} onChange={touch(setType)} />

        <div role="radiogroup" aria-label="Date range" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={preset === option.value}
              onClick={() => touch(setPreset)(option.value)}
              className={cx(
                'min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium',
                PRESS,
                preset === option.value
                  ? 'border-indigo-400/70 bg-indigo-500/20 text-white shadow-[0_0_20px_-6px_rgba(99,102,241,0.9)]'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid animate-fade-in grid-cols-2 gap-3">
            <Field label="From">{(id) => <TextInput id={id} type="date" value={customFrom} max={customTo || undefined} onChange={(e) => touch(setCustomFrom)(e.target.value)} />}</Field>
            <Field label="To">{(id) => <TextInput id={id} type="date" value={customTo} min={customFrom || undefined} onChange={(e) => touch(setCustomTo)(e.target.value)} />}</Field>
          </div>
        )}

        <label className="block">
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(event) => touch(setCategory)(parseCategoryFilter(event.target.value))}
            className={cx(INPUT_CLASS, 'appearance-none')}
          >
            <option value="all">All categories</option>
            <optgroup label="Income">
              {INCOME_CATEGORIES.map((id) => (
                <option key={id} value={id}>
                  {INCOME_META[id].label}
                </option>
              ))}
            </optgroup>
            {BUCKET_KEYS.map((bucket) => (
              <optgroup key={bucket} label={BUCKET_META[bucket].label}>
                {EXPENSE_CATEGORIES.filter((id) => CATEGORY_BUCKET[id] === bucket).map((id) => (
                  <option key={id} value={id}>
                    {EXPENSE_META[id].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {transactions.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No transactions yet"
            body="Record what you earn and spend and it will show up here, ready to search and filter."
            action={
              <Button variant="primary" large icon={Plus} onClick={() => setSheet({})}>
                Add transaction
              </Button>
            }
          />
        ) : (
          <>
            <GlassCard className="p-4">
              <div aria-live="polite" className="flex items-baseline justify-between text-sm text-slate-400">
                <span>
                  {filtered ? `${rows.length} of ${transactions.length}` : rows.length} {rows.length === 1 ? 'result' : 'results'}
                </span>
                {filtered && (
                  <button type="button" onClick={reset} className="font-medium text-indigo-300 transition-colors duration-300 hover:text-indigo-200">
                    Clear filters
                  </button>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Total label="In" value={totals.income} tone="emerald" />
                <Total label="Out" value={totals.expenses} tone="default" />
                <Total label="Net" value={Math.abs(totals.net)} tone={totals.net >= 0 ? 'emerald' : 'rose'} prefix={totals.net < 0 ? '-' : ''} />
              </dl>
            </GlassCard>

            {rows.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matches"
                body="Nothing fits these filters. Try a different search or widen the date range."
                action={<Button onClick={reset}>Clear filters</Button>}
              />
            ) : (
              <GlassCard className="overflow-hidden px-0 py-1">
                <table className="w-full table-fixed text-left">
                  <caption className="sr-only">Transactions, newest first</caption>
                  <colgroup>
                    <col className="w-[4.25rem]" />
                    <col />
                    <col className="w-[7.5rem]" />
                  </colgroup>
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                      <th scope="col" className="py-3 pl-4 pr-2 font-medium">
                        Date
                      </th>
                      <th scope="col" className="px-2 py-3 font-medium">
                        Details
                      </th>
                      <th scope="col" className="py-3 pl-2 pr-4 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {shown.map((tx) => {
                      const date = formatLedgerDate(tx.date, today);
                      const income = tx.type === 'income';
                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSheet({ editing: tx })}
                          className="cursor-pointer transition-colors duration-300 hover:bg-white/5 active:bg-white/10"
                        >
                          <td className="py-3 pl-4 pr-2 align-top text-sm">
                            <span className="block font-medium text-white">{date.primary}</span>
                            <span className="block text-xs text-slate-500">{date.secondary}</span>
                          </td>
                          <td className="px-2 py-3 align-top">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSheet({ editing: tx });
                              }}
                              className="flex max-w-full items-center gap-1.5 text-left text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-indigo-400"
                            >
                              <span className="truncate">{tx.note || labelOf(tx.category)}</span>
                              {tx.isRecurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Recurring" />}
                            </button>
                            <span className="mt-1.5 block">
                              <CategoryBadge category={tx.category} />
                            </span>
                          </td>
                          <td className="py-3 pl-2 pr-4 text-right align-top">
                            <Money value={tx.amount} size="md" tone={income ? 'emerald' : 'default'} prefix={income ? '+' : '-'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </GlassCard>
            )}

            {rows.length > shown.length && (
              <Button block onClick={() => setVisible((count) => count + PAGE_SIZE)}>
                Show more ({rows.length - shown.length} left)
              </Button>
            )}
          </>
        )}
      </div>

      {sheet && <TransactionSheet finance={finance} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </>
  );
}

function Total({ label, value, tone, prefix }: { label: string; value: number; tone: 'emerald' | 'rose' | 'default'; prefix?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 truncate">
        <Money value={value} size="sm" tone={tone} {...(prefix ? { prefix } : {})} />
      </dd>
    </div>
  );
}
