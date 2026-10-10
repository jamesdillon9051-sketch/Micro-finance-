import { Plus, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Segmented } from '../components/forms';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionSheet } from '../components/TransactionSheet';
import { Button, EmptyState, Fab, GlassCard, Money, ScreenHeader } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { roundMoney, sortNewestFirst } from '../lib/budget';
import { formatDayLabel } from '../lib/format';
import type { DateKey, Transaction } from '../types';

type Filter = 'all' | 'income' | 'expense';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
] as const satisfies ReadonlyArray<{ value: Filter; label: string }>;

const PAGE_SIZE = 60;

export function ActivityScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sheet, setSheet] = useState<{ editing?: Transaction } | null>(null);

  const filtered = useMemo(
    () => sortNewestFirst(finance.transactions).filter((tx) => filter === 'all' || tx.type === filter),
    [finance.transactions, filter],
  );
  const shown = filtered.slice(0, visible);

  const groups = useMemo(() => {
    const byDay = new Map<DateKey, Transaction[]>();
    for (const tx of shown) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);
    return [...byDay.entries()];
  }, [shown]);

  return (
    <>
      <ScreenHeader title="Activity" subtitle={`${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`} />
      <div className="space-y-4 px-4 pt-4">
        <Segmented label="Filter transactions" options={FILTERS} value={filter} onChange={(next) => { setFilter(next); setVisible(PAGE_SIZE); }} />

        {filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={filter === 'all' ? 'No transactions yet' : 'Nothing here'}
            body={
              filter === 'all'
                ? 'Record what you earn and spend and your budget will come to life.'
                : 'No transactions match this filter.'
            }
            action={
              filter === 'all' ? (
                <Button variant="primary" large icon={Plus} onClick={() => setSheet({})}>
                  Add transaction
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map(([date, items]) => {
            const net = roundMoney(items.reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), 0));
            return (
              <section key={date} aria-label={formatDayLabel(date, finance.today)}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-400">{formatDayLabel(date, finance.today)}</h2>
                  <Money value={Math.abs(net)} size="sm" tone="muted" prefix={net < 0 ? '-' : net > 0 ? '+' : ''} />
                </div>
                <GlassCard className="px-3 py-1">
                  <ul className="divide-y divide-white/5">
                    {items.map((tx) => (
                      <li key={tx.id}>
                        <TransactionRow transaction={tx} onSelect={(selected) => setSheet({ editing: selected })} />
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </section>
            );
          })
        )}

        {filtered.length > shown.length && (
          <Button block onClick={() => setVisible((count) => count + PAGE_SIZE)}>
            Show more
          </Button>
        )}
      </div>

      <Fab label="Add" icon={Plus} onClick={() => setSheet({})} />
      {sheet && <TransactionSheet finance={finance} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </>
  );
}
