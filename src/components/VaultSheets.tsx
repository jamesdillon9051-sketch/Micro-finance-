import { Check, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { addMonths, fromDateKey, toDateKey } from '../lib/dates';
import { formatCurrency, parseAmount } from '../lib/format';
import { VAULT_ICONS, type SavingsVault, type VaultIcon } from '../types';
import { Field, MoneyInput, Segmented, TextInput } from './forms';
import { VAULT_ICON_COMPONENTS } from './meta';
import { Sheet } from './Sheet';
import { Banner, Button, Label, PRESS, cx } from './ui';

// ---------------------------------------------------------------------------
// Create / edit a vault
// ---------------------------------------------------------------------------

interface VaultSheetProps {
  finance: UseFinanceStoreResult;
  editing?: SavingsVault | undefined;
  onClose: () => void;
}

export function VaultSheet({ finance, editing, onClose }: VaultSheetProps) {
  return (
    <Sheet title={editing ? 'Edit vault' : 'New vault'} onClose={onClose}>
      {(close) => <VaultForm finance={finance} editing={editing} close={close} />}
    </Sheet>
  );
}

function VaultForm({
  finance,
  editing,
  close,
}: {
  finance: UseFinanceStoreResult;
  editing: SavingsVault | undefined;
  close: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [target, setTarget] = useState(editing ? String(editing.targetAmount) : '');
  const [current, setCurrent] = useState('');
  const [targetDate, setTargetDate] = useState(
    editing?.targetDate ?? toDateKey(addMonths(fromDateKey(finance.today), 12)),
  );
  const [icon, setIcon] = useState<VaultIcon>(editing?.icon ?? 'piggy-bank');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = (): void => {
    const targetAmount = parseAmount(target);
    const startingAmount = current === '' ? 0 : parseAmount(current);
    if (name.trim() === '') return setError('Give the vault a name.');
    if (!(targetAmount > 0)) return setError('Enter a target amount greater than $0.');
    if (!(startingAmount >= 0)) return setError('The starting balance must be $0 or more.');
    if (!targetDate) return setError('Pick a target date.');

    const result = editing
      ? finance.updateVault(editing.id, { name: name.trim(), targetAmount, targetDate, icon })
      : finance.addVault({ name: name.trim(), targetAmount, currentAmount: startingAmount, targetDate, icon });
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
    finance.deleteVault(editing.id);
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
            placeholder="Holiday, Emergency fund..."
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Target amount">{(id) => <MoneyInput id={id} value={target} onChange={setTarget} />}</Field>
      {!editing && (
        <Field label="Already saved (optional)">{(id) => <MoneyInput id={id} value={current} onChange={setCurrent} />}</Field>
      )}
      <Field label="Target date">
        {(id) => <TextInput id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
      </Field>

      <div>
        <Label className="mb-3">Icon</Label>
        <div role="radiogroup" aria-label="Icon" className="grid grid-cols-5 gap-2">
          {VAULT_ICONS.map((key) => {
            const Icon = VAULT_ICON_COMPONENTS[key];
            const selected = key === icon;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={key.replace('-', ' ')}
                onClick={() => setIcon(key)}
                className={cx(
                  'flex h-14 items-center justify-center rounded-2xl border',
                  PRESS,
                  selected
                    ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.8)]'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10',
                )}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      {editing && (
        <p className="text-xs leading-relaxed text-slate-500">
          To change the balance, use Add money or Withdraw on the vault card.
        </p>
      )}
      {error && (
        <Banner accent="rose" icon={TriangleAlert}>
          {error}
        </Banner>
      )}

      <div className="space-y-3 pt-1">
        <Button type="submit" variant="primary" large block icon={Check}>
          {editing ? 'Save changes' : 'Create vault'}
        </Button>
        {editing && (
          <Button variant="danger" block icon={Trash2} onClick={remove}>
            {confirmDelete ? 'Tap again to delete' : 'Delete vault'}
          </Button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Add money / withdraw
// ---------------------------------------------------------------------------

type AdjustMode = 'add' | 'withdraw';

const ADJUST_OPTIONS = [
  { value: 'add', label: 'Add money' },
  { value: 'withdraw', label: 'Withdraw' },
] as const satisfies ReadonlyArray<{ value: AdjustMode; label: string }>;

const QUICK_AMOUNTS = [10, 50, 100, 500] as const;

export function AdjustVaultSheet({
  finance,
  vault,
  initialMode,
  onClose,
}: {
  finance: UseFinanceStoreResult;
  vault: SavingsVault;
  initialMode: AdjustMode;
  onClose: () => void;
}) {
  return (
    <Sheet title={vault.name} onClose={onClose}>
      {(close) => <AdjustForm finance={finance} vault={vault} initialMode={initialMode} close={close} />}
    </Sheet>
  );
}

function AdjustForm({
  finance,
  vault,
  initialMode,
  close,
}: {
  finance: UseFinanceStoreResult;
  vault: SavingsVault;
  initialMode: AdjustMode;
  close: () => void;
}) {
  const [mode, setMode] = useState<AdjustMode>(initialMode);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Enter an amount greater than $0.');
    const result = finance.adjustVaultBalance(vault.id, mode === 'add' ? value : -value);
    if (!result.ok) return setError(result.errors.join(' '));
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
      <p className="text-sm text-slate-400">Current balance {formatCurrency(vault.currentAmount)}</p>
      <Segmented label="Action" options={ADJUST_OPTIONS} value={mode} onChange={setMode} />
      <MoneyInput variant="hero" label="Amount" value={amount} onChange={setAmount} />
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((quick) => (
          <Button key={quick} variant="glass" className="flex-1" onClick={() => setAmount(String(quick))}>
            ${quick}
          </Button>
        ))}
      </div>
      {error && (
        <Banner accent="rose" icon={TriangleAlert}>
          {error}
        </Banner>
      )}
      <Button type="submit" variant={mode === 'add' ? 'success' : 'primary'} large block icon={Check}>
        {mode === 'add' ? 'Add to vault' : 'Withdraw'}
      </Button>
    </form>
  );
}
