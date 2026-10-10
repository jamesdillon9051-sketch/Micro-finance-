import { useId, type ChangeEvent, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { sanitizeAmountInput } from '../lib/format';
import {
  BUCKET_KEYS,
  CATEGORY_BUCKET,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type ExpenseCategory,
  type IncomeCategory,
} from '../types';
import { BUCKET_META, EXPENSE_META, INCOME_COLOR, INCOME_META, type CategoryMeta } from './meta';
import { PRESS, cx } from './ui';

/** Look and feel shared by every text-like input; sizing is added separately. */
const INPUT_LOOK =
  'w-full rounded-2xl border border-white/10 bg-white/5 text-white outline-none ' +
  'placeholder:text-slate-500 transition-all duration-300 ease-in-out ' +
  'focus:border-indigo-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-indigo-500/20 disabled:opacity-40';

/** Standard field. 16px text stops iOS Safari zooming in when the field is focused. */
export const INPUT_CLASS = `${INPUT_LOOK} h-12 px-4 text-base`;

/** Label + control + optional hint/error, wired together with a generated id. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-400">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

interface MoneyInputProps {
  id?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onCommit?: (() => void) | undefined;
  /** `hero` is the big centred amount used at the top of the transaction sheet. */
  variant?: 'field' | 'hero';
  placeholder?: string;
  disabled?: boolean | undefined;
  label?: string | undefined;
  autoFocus?: boolean | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
}

export function MoneyInput({
  id,
  value,
  onChange,
  onCommit,
  variant = 'field',
  placeholder = '0.00',
  disabled,
  label,
  autoFocus,
  inputRef,
}: MoneyInputProps) {
  const hero = variant === 'hero';
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold text-slate-500',
          hero ? 'left-6 text-3xl' : 'left-4 text-base',
        )}
      >
        $
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(sanitizeAmountInput(event.target.value))}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit?.();
        }}
        className={cx(
          INPUT_LOOK,
          hero ? 'h-20 pl-12 pr-4 text-center text-5xl font-bold tracking-tight' : 'h-12 pl-8 pr-4 text-base font-medium',
        )}
      />
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(INPUT_CLASS, props.className)} />;
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const thumb: CSSProperties = {
    width: `calc((100% - 0.5rem) / ${options.length})`,
    transform: `translateX(${index * 100}%)`,
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative flex rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur-md"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 transition-transform duration-300 ease-in-out"
        style={thumb}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'relative z-10 min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors duration-300 ease-in-out active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-indigo-400',
            option.value === value ? 'text-white' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-1 text-left focus-visible:outline-2 focus-visible:outline-indigo-400"
    >
      <span className="min-w-0">
        <span className="block text-base font-medium text-white">{label}</span>
        {description && <span className="mt-0.5 block text-sm leading-snug text-slate-400">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          'relative h-8 w-14 shrink-0 rounded-full border transition-all duration-300 ease-in-out',
          checked
            ? 'border-transparent bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_20px_-2px_rgba(99,102,241,0.7)]'
            : 'border-white/10 bg-white/10',
        )}
      >
        <span
          className={cx(
            'absolute left-0.5 top-0.5 h-6.5 w-6.5 rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out',
            checked && 'translate-x-6',
          )}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Category pickers
// ---------------------------------------------------------------------------

function CategoryTile({
  meta,
  color,
  selected,
  onSelect,
}: {
  meta: CategoryMeta;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-0.5 py-2 text-[11px] font-medium leading-tight tracking-tight',
        PRESS,
        selected
          ? 'border-indigo-400/70 bg-indigo-500/15 text-white shadow-[0_0_24px_-6px_rgba(99,102,241,0.8)]'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10',
      )}
    >
      <Icon className="h-5 w-5" style={{ color }} aria-hidden />
      <span className="max-w-full truncate">{meta.label}</span>
    </button>
  );
}

/** Expense categories, grouped under the bucket each one is charged to. */
export function ExpenseCategoryPicker({
  value,
  onChange,
}: {
  value: ExpenseCategory;
  onChange: (value: ExpenseCategory) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Category" className="space-y-4">
      {BUCKET_KEYS.map((bucket) => (
        <div key={bucket}>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BUCKET_META[bucket].color }} aria-hidden />
            {BUCKET_META[bucket].label}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {EXPENSE_CATEGORIES.filter((category) => CATEGORY_BUCKET[category] === bucket).map((category) => (
              <CategoryTile
                key={category}
                meta={EXPENSE_META[category]}
                color={BUCKET_META[bucket].color}
                selected={value === category}
                onSelect={() => onChange(category)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function IncomeCategoryPicker({
  value,
  onChange,
}: {
  value: IncomeCategory;
  onChange: (value: IncomeCategory) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Category" className="grid grid-cols-4 gap-2">
      {INCOME_CATEGORIES.map((category) => (
        <CategoryTile
          key={category}
          meta={INCOME_META[category]}
          color={INCOME_COLOR}
          selected={value === category}
          onSelect={() => onChange(category)}
        />
      ))}
    </div>
  );
}
