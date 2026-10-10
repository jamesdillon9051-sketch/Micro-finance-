import { Check, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { isExpenseCategory, isIncomeCategory } from '../lib/budget';
import { parseAmount } from '../lib/format';
import { CATEGORY_BUCKET, type ExpenseCategory, type IncomeCategory, type Transaction, type TransactionType } from '../types';
import { ExpenseCategoryPicker, Field, IncomeCategoryPicker, MoneyInput, Segmented, Switch, TextInput } from './forms';
import { BUCKET_META } from './meta';
import { Sheet } from './Sheet';
import { Banner, Button, Label } from './ui';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const satisfies ReadonlyArray<{ value: TransactionType; label: string }>;

interface Props {
  finance: UseFinanceStoreResult;
  /** The transaction being edited; omit to create a new one. */
  editing?: Transaction | undefined;
  onClose: () => void;
}

export function TransactionSheet({ finance, editing, onClose }: Props) {
  return (
    <Sheet title={editing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      {(close) => <TransactionForm finance={finance} editing={editing} close={close} />}
    </Sheet>
  );
}

function TransactionForm({
  finance,
  editing,
  close,
}: {
  finance: UseFinanceStoreResult;
  editing: Transaction | undefined;
  close: () => void;
}) {
  const [type, setType] = useState<TransactionType>(editing?.type ?? 'expense');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>(
    editing && isExpenseCategory(editing.category) ? editing.category : 'groceries',
  );
  const [incomeCategory, setIncomeCategory] = useState<IncomeCategory>(
    editing && isIncomeCategory(editing.category) ? editing.category : 'salary',
  );
  const [date, setDate] = useState(editing?.date ?? finance.today);
  const [note, setNote] = useState(editing?.note ?? '');
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = (): void => {
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Enter an amount greater than $0.');
    if (!date) return setError('Pick a date.');
    const input = {
      amount: value,
      type,
      category: type === 'expense' ? expenseCategory : incomeCategory,
      date,
      note: note.trim(),
      isRecurring,
    };
    const result = editing ? finance.updateTransaction(editing.id, input) : finance.addTransaction(input);
    if (!result.ok) return setError(result.errors.join(' '));
    close();
  };

  const remove = (): void => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3500);
      return;
    }
    finance.deleteTransaction(editing.id);
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
      <Segmented label="Transaction type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      <MoneyInput variant="hero" label="Amount" value={amount} onChange={setAmount} />

      <div>
        <Label className="mb-3">Category</Label>
        {type === 'expense' ? (
          <>
            <ExpenseCategoryPicker value={expenseCategory} onChange={setExpenseCategory} />
            <p className="mt-3 text-xs text-slate-500">
              Counts toward your {BUCKET_META[CATEGORY_BUCKET[expenseCategory]].label} budget.
            </p>
          </>
        ) : (
          <IncomeCategoryPicker value={incomeCategory} onChange={setIncomeCategory} />
        )}
      </div>

      <Field label="Date">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Note">
        {(id) => (
          <TextInput
            id={id}
            type="text"
            placeholder="Add a note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>
      <Switch label="Recurring" description="Mark this as something that repeats." checked={isRecurring} onChange={setIsRecurring} />

      {error && (
        <Banner accent="rose" icon={TriangleAlert}>
          {error}
        </Banner>
      )}

      <div className="space-y-3 pt-1">
        <Button type="submit" variant="primary" large block icon={Check}>
          {editing ? 'Save changes' : 'Add transaction'}
        </Button>
        {editing && (
          <Button variant="danger" block icon={Trash2} onClick={remove}>
            {confirmDelete ? 'Tap again to delete' : 'Delete transaction'}
          </Button>
        )}
      </div>
    </form>
  );
}
