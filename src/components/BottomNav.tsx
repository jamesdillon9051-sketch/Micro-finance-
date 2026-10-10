import { ArrowLeftRight, CalendarClock, ChartPie, House, Vault, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

export type Tab = 'home' | 'activity' | 'budget' | 'bills' | 'vaults';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'activity', label: 'Activity', icon: ArrowLeftRight },
  { id: 'budget', label: 'Budget', icon: ChartPie },
  { id: 'bills', label: 'Bills', icon: CalendarClock },
  { id: 'vaults', label: 'Vaults', icon: Vault },
];

/** Fixed, thumb-reach tab bar with a frosted background that respects the iPhone home indicator. */
export function BottomNav({ active, onChange }: { active: Tab | null; onChange: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/10 bg-black/65 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={selected ? 'page' : undefined}
                className={cx(
                  'group relative flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium',
                  'transition-all duration-300 ease-in-out active:scale-90 motion-reduce:active:scale-100',
                  'focus-visible:outline-2 focus-visible:outline-indigo-400',
                  selected ? 'text-white' : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {selected && (
                  <span
                    aria-hidden
                    className="absolute -top-2 h-0.5 w-8 rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 shadow-[0_0_12px_2px_rgba(129,140,248,0.8)]"
                  />
                )}
                <span
                  className={cx(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ease-in-out',
                    selected ? 'bg-white/10' : 'group-hover:bg-white/5',
                  )}
                >
                  <Icon className={cx('h-[22px] w-[22px] transition-transform duration-300', selected && 'scale-110')} aria-hidden />
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
