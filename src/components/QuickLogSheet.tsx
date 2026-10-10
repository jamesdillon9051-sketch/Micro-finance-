import { Check, ChevronDown, CirclePlus, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { addDays, fromDateKey, toDateKey } from '../lib/dates';
import { formatCurrency, parseAmount } from '../lib/format';
import { CATEGORY_BUCKET, EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import { ExpenseCategoryPicker, MoneyInput, TextInput } from './forms';
import { BUCKET_META, EXPENSE_META, categoryColor } from './meta';
import { Sheet } from './Sheet';
import { useToast } from './toast';
import { Banner, Button, PRESS, cx } from './ui';

/** Shown first when there's no history to learn from. */
const DEFAULT_QUICK: readonly ExpenseCategory[] = [
  'groceries',
  'dining',
  'transport',
  'entertainment',
  'utilities',
  'shopping',
  'healthcare',
  'subscriptions',
];
const CHIP_COUNT = 8;
const RECENT_DAYS = 90;

/** The categories this person logs most (last 90 days), padded out with sensible defaults. */
export function quickCategories(transactions: UseFinanceStoreResult['transactions'], today: string): ExpenseCategory[] {
  const since = toDateKey(addDays(fromDateKey(today), -RECENT_DAYS));
  const counts = new Map<ExpenseCategory, number>();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.date < since) continue;
    const category = EXPENSE_CATEGORIES.find((candidate) => candidate === tx.category);
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
  return [...new Set([...frequent, ...DEFAULT_QUICK])].slice(0, CHIP_COUNT);
}

interface Props {
  finance: UseFinanceStoreResult;
  onClose: () => void;
  /** Switches to the full form, for income or when the quick one isn't enough. */
  onOpenFullForm: () => void;
}

/** A fast way to record an expense: type the amount, tap a category, press Enter. */
export function QuickLogSheet({ finance, onClose, onOpenFullForm }: Props) {
  return (
    <Sheet title="Quick expense" onClose={onClose}>
      {(close) => <QuickLogForm finance={finance} close={close} onOpenFullForm={onOpenFullForm} />}
    </Sheet>
  );
}

function QuickLogForm({
  finance,
  close,
  onOpenFullForm,
}: {
  finance: UseFinanceStoreResult;
  close: () => void;
  onOpenFullForm: () => void;
}) {
  const toast = useToast();
  const { today, transactions } = finance;
  const chips = useMemo(() => quickCategories(transactions, today), [transactions, today]);

  // Start on whatever was logged last: repeat purchases are then one tap.
  const lastCategory = useMemo(() => {
    const recent = [...transactions].reverse().find((tx) => tx.type === 'expense');
    return EXPENSE_CATEGORIES.find((candidate) => candidate === recent?.category);
  }, [transactions]);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>(lastCategory ?? chips[0] ?? 'groceries');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  const yesterday = toDateKey(addDays(fromDateKey(today), -1));
  const value = parseAmount(amount);
  const ready = value > 0;

  const submit = (): void => {
    if (!ready) return setError('Enter an amount greater than $0.');
    if (!date) return setError('Pick a date.');
    const result = finance.addTransaction({
      amount: value,
      type: 'expense',
      category,
      date,
      note: note.trim(),
      isRecurring: false,
    });
    if (!result.ok) return setError(result.errors.join(' '));
    const logged = result.value;
    toast({
      message: `Logged ${formatCurrency(logged.amount)} · ${EXPENSE_META[category].label}`,
      action: { label: 'Undo', onClick: () => finance.deleteTransaction(logged.id) },
    });
    close();
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <MoneyInput variant="hero" label="Amount" value={amount} onChange={setAmount} autoFocus inputRef={amountInput} />

      <div>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
          {chips.map((id) => {
            const meta = EXPENSE_META[id];
            const selected = id === category;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setCategory(id);
                  amountInput.current?.focus();
                }}
                className={cx(
                  'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium',
                  PRESS,
                  selected
                    ? 'border-indigo-400/70 bg-indigo-500/20 text-white shadow-[0_0_22px_-6px_rgba(99,102,241,0.9)]'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                <meta.icon className="h-4 w-4" style={{ color: categoryColor(id) }} aria-hidden />
                {meta.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((open) => !open)}
            className={cx(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-white/20 px-3.5 text-sm font-medium text-slate-400',
              PRESS,
              'hover:bg-white/5 hover:text-white',
            )}
          >
            More
            <ChevronDown className={cx('h-4 w-4 transition-transform duration-300', showAll && 'rotate-180')} aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Counts toward {BUCKET_META[CATEGORY_BUCKET[category]].label}.
        </p>
        {showAll && (
          <div className="mt-4 animate-fade-in">
            <ExpenseCategoryPicker value={category} onChange={setCategory} />
          </div>
        )}
      </div>

      <div>
        <div role="radiogroup" aria-label="Date" className="flex flex-wrap items-center gap-2">
          {(
            [
              ['Today', today],
              ['Yesterday', yesterday],
            ] as const
          ).map(([label, key]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={date === key}
              onClick={() => setDate(key)}
              className={cx(
                'min-h-11 rounded-full border px-4 text-sm font-medium',
                PRESS,
                date === key ? 'border-indigo-400/70 bg-indigo-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              {label}
            </button>
          ))}
          <TextInput
            type="date"
            aria-label="Pick another date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11! w-auto! min-w-0 flex-1 rounded-full! px-4! text-sm!"
          />
        </div>
      </div>

      {showNote ? (
        <TextInput
          type="text"
          aria-label="Note"
          placeholder="Add a note (optional)"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="animate-fade-in"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition-colors duration-300 hover:text-white"
        >
          <CirclePlus className="h-4 w-4" aria-hidden /> Add a note
        </button>
      )}

      {error && (
        <Banner accent="rose" icon={TriangleAlert}>
          {error}
        </Banner>
      )}

      <div className="space-y-3 pt-1">
        <Button type="submit" variant="primary" large block icon={Check}>
          {ready ? `Log ${formatCurrency(value)} · ${EXPENSE_META[category].label}` : 'Log expense'}
        </Button>
        <button
          type="button"
          onClick={() => {
            close();
            onOpenFullForm();
          }}
          className="block w-full py-1 text-center text-sm font-medium text-slate-400 transition-colors duration-300 hover:text-white"
        >
          Adding income, or need more options?
        </button>
      </div>
    </form>
  );
}
