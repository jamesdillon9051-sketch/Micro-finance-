import { Check, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { ordinal, parseAmount } from '../lib/format';
import type { BillReminder, ExpenseCategory } from '../types';
import { ExpenseCategoryPicker, Field, MoneyInput, Switch, TextInput, INPUT_CLASS } from './forms';
import { Sheet } from './Sheet';
import { Banner, Button, Label, cx } from './ui';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

interface Props {
  finance: UseFinanceStoreResult;
  editing?: BillReminder | undefined;
  onClose: () => void;
}

export function BillSheet({ finance, editing, onClose }: Props) {
  return (
    <Sheet title={editing ? 'Edit bill' : 'New bill'} onClose={onClose}>
      {(close) => <BillForm finance={finance} editing={editing} close={close} />}
    </Sheet>
  );
}

function BillForm({
  finance,
  editing,
  close,
}: {
  finance: UseFinanceStoreResult;
  editing: BillReminder | undefined;
  close: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? 1);
  const [category, setCategory] = useState<ExpenseCategory>(editing?.category ?? 'utilities');
  const [isAutoDeduct, setIsAutoDeduct] = useState(editing?.isAutoDeduct ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = (): void => {
    const value = parseAmount(amount);
    if (title.trim() === '') return setError('Give the bill a name.');
    if (!(value > 0)) return setError('Enter an amount greater than $0.');
    const input = {
      title: title.trim(),
      amount: value,
      dueDate,
      category,
      isAutoDeduct,
      notifiedThisMonth: editing?.notifiedThisMonth ?? false,
    };
    const result = editing ? finance.updateBill(editing.id, input) : finance.addBill(input);
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
    finance.deleteBill(editing.id);
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
      <Field label="Name">
        {(id) => (
          <TextInput
            id={id}
            type="text"
            placeholder="Rent, Internet, Phone..."
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field label="Amount">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
      <Field label="Due on" hint="In shorter months the bill falls on the last day of the month.">
        {(id) => (
          <select
            id={id}
            value={dueDate}
            onChange={(e) => setDueDate(Number(e.target.value))}
            className={cx(INPUT_CLASS, 'appearance-none')}
          >
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {ordinal(day)} of every month
              </option>
            ))}
          </select>
        )}
      </Field>
      <div>
        <Label className="mb-3">Category</Label>
        <ExpenseCategoryPicker value={category} onChange={setCategory} />
      </div>
      <Switch
        label="Auto-deduct"
        description="Record the expense automatically on the due date."
        checked={isAutoDeduct}
        onChange={setIsAutoDeduct}
      />

      {error && (
        <Banner accent="rose" icon={TriangleAlert}>
          {error}
        </Banner>
      )}

      <div className="space-y-3 pt-1">
        <Button type="submit" variant="primary" large block icon={Check}>
          {editing ? 'Save changes' : 'Add bill'}
        </Button>
        {editing && (
          <Button variant="danger" block icon={Trash2} onClick={remove}>
            {confirmDelete ? 'Tap again to delete' : 'Delete bill'}
          </Button>
        )}
      </div>
    </form>
  );
}
