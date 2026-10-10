import { Repeat } from 'lucide-react';
import { BUCKET_META, categoryColor, categoryMeta } from './meta';
import { CATEGORY_BUCKET, type Transaction } from '../types';
import { isExpenseCategory } from '../lib/budget';
import { IconTile, Money, cx } from './ui';

export function TransactionRow({ transaction, onSelect }: { transaction: Transaction; onSelect: (tx: Transaction) => void }) {
  const meta = categoryMeta(transaction.category);
  const income = transaction.type === 'income';
  const bucket = isExpenseCategory(transaction.category) ? BUCKET_META[CATEGORY_BUCKET[transaction.category]].label : 'Income';
  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left',
        'transition-all duration-300 ease-in-out hover:bg-white/5 active:scale-[0.98] active:bg-white/10',
        'focus-visible:outline-2 focus-visible:outline-indigo-400 motion-reduce:active:scale-100',
      )}
    >
      <IconTile icon={meta.icon} color={categoryColor(transaction.category)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-base font-medium text-white">
          {transaction.note || meta.label}
          {transaction.isRecurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Recurring" />}
        </span>
        <span className="block truncate text-sm text-slate-400">
          {transaction.note ? `${meta.label} · ${bucket}` : bucket}
        </span>
      </span>
      <Money value={transaction.amount} size="md" tone={income ? 'emerald' : 'default'} prefix={income ? '+' : '-'} />
    </button>
  );
}
