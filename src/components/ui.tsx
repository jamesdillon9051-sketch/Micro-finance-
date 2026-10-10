import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { splitCurrency } from '../lib/format';

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** The frosted-glass surface every card is built from. */
export const GLASS =
  'border border-white/10 bg-white/5 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]';

/** Shared feedback for anything tappable: smooth transitions, hover lift, press-down. */
export const PRESS =
  'select-none transition-all duration-300 ease-in-out hover:scale-[1.03] active:scale-95 ' +
  'motion-reduce:hover:scale-100 motion-reduce:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400';

interface GlassCardProps {
  children: ReactNode;
  className?: string | undefined;
  /** Staggers the entrance animation. */
  delay?: number | undefined;
}

export function GlassCard({ children, className, delay }: GlassCardProps) {
  const style: CSSProperties | undefined = delay === undefined ? undefined : { animationDelay: `${delay}ms` };
  return (
    <section className={cx('animate-rise rounded-3xl p-5', GLASS, className)} style={style}>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'success' | 'glass' | 'danger' | 'ghost';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50',
  success:
    'bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/45',
  glass: `${GLASS} text-slate-100 hover:bg-white/10`,
  danger: 'border border-rose-400/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  ghost: 'text-slate-300 hover:bg-white/5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  icon?: LucideIcon | undefined;
  block?: boolean | undefined;
  large?: boolean | undefined;
}

export function Button({
  variant = 'glass',
  icon: Icon,
  block,
  large,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold disabled:pointer-events-none disabled:opacity-40',
        large ? 'min-h-14 px-6 text-base' : 'min-h-11 px-4 text-sm',
        block && 'w-full',
        VARIANT[variant],
        PRESS,
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="h-[1.15em] w-[1.15em] shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant | undefined;
}

export function IconButton({ icon: Icon, label, variant = 'glass', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
        VARIANT[variant],
        PRESS,
        className,
      )}
      {...rest}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Floating action button, kept above the tab bar and inside the phone-width column. */
export function Fab({
  label,
  icon: Icon,
  onClick,
  shortcut,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Keyboard shortcut to show beside the label on devices with a keyboard, e.g. "Ctrl K". */
  shortcut?: string | undefined;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md justify-end px-5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cx(
          'pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 pl-4 pr-5 text-sm font-semibold text-white',
          'shadow-xl shadow-indigo-500/40 hover:shadow-indigo-500/60',
          PRESS,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
        {label}
        {shortcut && (
          <kbd className="hidden rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/80 [@media(hover:hover)_and_(pointer:fine)]:inline">
            {shortcut}
          </kbd>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export type MoneySize = 'hero' | 'xl' | 'lg' | 'md' | 'sm';
export type Tone = 'default' | 'emerald' | 'rose' | 'amber' | 'muted';

const MONEY_SIZE: Record<MoneySize, { whole: string; fraction: string }> = {
  hero: { whole: 'text-6xl font-bold tracking-tighter', fraction: 'text-3xl font-semibold' },
  xl: { whole: 'text-4xl font-bold tracking-tight', fraction: 'text-xl font-semibold' },
  lg: { whole: 'text-2xl font-bold tracking-tight', fraction: 'text-base font-semibold' },
  md: { whole: 'text-lg font-semibold', fraction: 'text-sm font-medium' },
  sm: { whole: 'text-base font-semibold', fraction: 'text-xs font-medium' },
};

const MONEY_TONE: Record<Tone, string> = {
  default: 'text-white',
  emerald: 'bg-gradient-to-br from-emerald-200 via-emerald-300 to-teal-400 bg-clip-text text-transparent',
  rose: 'bg-gradient-to-br from-rose-200 via-rose-300 to-pink-400 bg-clip-text text-transparent',
  amber: 'bg-gradient-to-br from-amber-200 via-amber-300 to-orange-400 bg-clip-text text-transparent',
  muted: 'text-slate-400',
};

const MONEY_GLOW: Record<Tone, string> = {
  default: '',
  emerald: 'drop-shadow-[0_0_22px_rgba(52,211,153,0.35)]',
  rose: 'drop-shadow-[0_0_22px_rgba(251,113,133,0.35)]',
  amber: 'drop-shadow-[0_0_22px_rgba(251,191,36,0.35)]',
  muted: '',
};

interface MoneyProps {
  value: number;
  size?: MoneySize;
  tone?: Tone;
  /** Adds a soft coloured glow around gradient numbers. */
  glow?: boolean;
  /** Text shown before the amount, e.g. `+`. */
  prefix?: string;
  className?: string;
}

/** A currency amount with large dollars and quieter cents. */
export function Money({ value, size = 'md', tone = 'default', glow, prefix, className }: MoneyProps) {
  const { whole, fraction } = splitCurrency(value);
  const sizing = MONEY_SIZE[size];
  return (
    <span
      className={cx('inline-flex items-baseline leading-none', MONEY_TONE[tone], glow && MONEY_GLOW[tone], className)}
    >
      <span className={sizing.whole}>
        {prefix}
        {whole}
      </span>
      {/* No opacity on gradient tones: it would stop the child painting the parent's clipped gradient. */}
      <span className={cx(sizing.fraction, tone === 'default' && 'text-white/60')}>{fraction}</span>
    </span>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-sm font-medium text-slate-400', className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Status & feedback
// ---------------------------------------------------------------------------

export type Accent = 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

const CHIP: Record<Accent, string> = {
  emerald: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  rose: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  indigo: 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300',
  slate: 'border-white/10 bg-white/5 text-slate-300',
};

/** Status pill. Colour never stands alone: always pair it with an icon and a label. */
export function Chip({ accent = 'slate', icon: Icon, children }: { accent?: Accent; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium',
        CHIP[accent],
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

const BANNER: Record<Accent, string> = {
  emerald: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
  amber: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
  rose: 'border-rose-400/20 bg-rose-500/10 text-rose-200',
  indigo: 'border-indigo-400/20 bg-indigo-500/10 text-indigo-200',
  slate: 'border-white/10 bg-white/5 text-slate-200',
};

export function Banner({
  accent,
  icon: Icon,
  children,
}: {
  accent: Accent;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cx(
        'animate-rise flex items-start gap-3 rounded-2xl border p-4 text-sm backdrop-blur-md',
        BANNER[accent],
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
    </div>
  );
}

/** A rounded tile holding an icon, tinted with `color` (any CSS hex). */
export function IconTile({ icon: Icon, color, size = 'md' }: { icon: LucideIcon; color: string; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-2xl',
        size === 'lg' ? 'h-14 w-14' : 'h-11 w-11',
      )}
      style={{ backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      <Icon className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} style={{ color }} aria-hidden />
    </span>
  );
}

/** Thin meter. `value` is a percentage and may exceed 100 (the bar then stays full). */
export function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 overflow-hidden rounded-full bg-white/10"
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: `0 0 12px ${color}66`,
        }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-indigo-500/20 to-violet-500/10 shadow-[0_0_60px_-10px_rgba(99,102,241,0.6)]">
        <Icon className="h-9 w-9 text-indigo-300" aria-hidden />
      </span>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Large-title header that sticks to the top, with blur showing content scrolling beneath it. */
export function ScreenHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string | undefined;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-black/65 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+0.875rem)] backdrop-blur-2xl">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.75rem] font-bold leading-tight tracking-tight text-white">{title}</h1>
          {subtitle && <p className="-mt-0.5 truncate text-sm text-slate-400">{subtitle}</p>}
        </div>
        {trailing}
      </div>
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</h2>
      {action}
    </div>
  );
}
