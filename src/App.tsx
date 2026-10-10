import { useEffect, useState } from 'react';
import { BottomNav, type Tab } from './components/BottomNav';
import { cx } from './components/ui';
import { useFinanceStore, type FinanceStore } from './hooks/useFinanceStore';
import { ActivityScreen } from './screens/ActivityScreen';
import { BillsScreen } from './screens/BillsScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { VaultsScreen } from './screens/VaultsScreen';

type Route = Tab | 'settings';

/** Screens with a floating "add" button need extra room so it never covers the last item. */
const HAS_FAB: ReadonlySet<Route> = new Set<Route>(['home', 'activity', 'bills', 'vaults']);

/** Soft colour wash behind everything, so the frosted cards have something to blur. */
function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <div className="absolute -left-1/4 -top-32 h-[28rem] w-[28rem] rounded-full bg-indigo-600/25 blur-[100px]" />
      <div className="absolute -right-1/4 top-1/3 h-[24rem] w-[24rem] rounded-full bg-emerald-500/15 blur-[100px]" />
      <div className="absolute -bottom-32 left-1/4 h-[26rem] w-[26rem] rounded-full bg-violet-600/20 blur-[100px]" />
    </div>
  );
}

/** `store` is only for tests and previews; the app uses the shared, localStorage-backed store. */
export default function App({ store }: { store?: FinanceStore }) {
  const finance = useFinanceStore(store);
  const [route, setRoute] = useState<Route>('home');
  const [lastTab, setLastTab] = useState<Tab>('home');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const goTo = (tab: Tab): void => {
    setLastTab(tab);
    setRoute(tab);
  };

  return (
    <div className="relative min-h-dvh text-slate-100">
      <AmbientGlow />
      <div className="mx-auto max-w-md">
        <main
          key={route}
          className={cx('animate-fade-in', HAS_FAB.has(route) ? 'pb-[calc(11rem+env(safe-area-inset-bottom))]' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]')}
        >
          {route === 'home' && <HomeScreen finance={finance} goTo={goTo} openSettings={() => setRoute('settings')} />}
          {route === 'activity' && <ActivityScreen finance={finance} />}
          {route === 'budget' && <BudgetScreen finance={finance} />}
          {route === 'bills' && <BillsScreen finance={finance} />}
          {route === 'vaults' && <VaultsScreen finance={finance} />}
          {route === 'settings' && <SettingsScreen finance={finance} onBack={() => setRoute(lastTab)} />}
        </main>
      </div>
      <BottomNav active={route === 'settings' ? null : route} onChange={goTo} />
    </div>
  );
}
