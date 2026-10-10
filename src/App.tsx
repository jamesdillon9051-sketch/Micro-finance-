import { Plus, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BottomNav, TABS_IN_ORDER, type Tab } from './components/BottomNav';
import { QuickLogSheet } from './components/QuickLogSheet';
import { ToastProvider, useToast } from './components/toast';
import { TransactionSheet } from './components/TransactionSheet';
import { Fab, cx } from './components/ui';
import { useFinanceStore, type FinanceStore } from './hooks/useFinanceStore';
import { useNotifications } from './hooks/useNotifications';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { isMac } from './lib/platform';
import { UPDATE_READY_EVENT } from './lib/pwa';
import { BillsScreen } from './screens/BillsScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { VaultsScreen } from './screens/VaultsScreen';

type Route = Tab | 'settings';

interface LaunchTarget {
  tab?: Tab;
  /** Open the quick expense logger. */
  log?: boolean;
}

/**
 * Where a link asked the app to go: `/?tab=bills` (from a notification or a Home Screen shortcut)
 * or `/?action=log`. Anything unrecognised is ignored.
 */
export function parseLaunchTarget(search: string): LaunchTarget {
  const params = new URLSearchParams(search);
  const tab = TABS_IN_ORDER.find((candidate) => candidate === params.get('tab'));
  const target: LaunchTarget = {};
  if (tab) target.tab = tab;
  if (params.get('action') === 'log') target.log = true;
  return target;
}

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

/**
 * `store` and `now` are only for tests and previews; the app uses the shared, localStorage-backed
 * store and the real clock.
 */
export default function App({ store, now }: { store?: FinanceStore; now?: () => Date }) {
  return (
    <ToastProvider>
      <Shell store={store} now={now} />
    </ToastProvider>
  );
}

function Shell({ store, now }: { store: FinanceStore | undefined; now: (() => Date) | undefined }) {
  const finance = useFinanceStore(store);
  const notifier = useNotifications(finance, now);
  const toast = useToast();
  const online = useOnlineStatus();

  const [launch] = useState(() => (typeof window === 'undefined' ? {} : parseLaunchTarget(window.location.search)));
  const [route, setRoute] = useState<Route>(launch.tab ?? 'home');
  const [lastTab, setLastTab] = useState<Tab>(launch.tab ?? 'home');
  const [quickOpen, setQuickOpen] = useState(launch.log === true);
  const [fullFormOpen, setFullFormOpen] = useState(false);

  const goTo = useCallback((tab: Tab): void => {
    setLastTab(tab);
    setRoute(tab);
  }, []);

  const applyTarget = useCallback(
    (target: LaunchTarget): void => {
      if (target.tab) goTo(target.tab);
      if (target.log) setQuickOpen(true);
    },
    [goTo],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // A launch link has done its job; keep it out of the address bar so a reload doesn't repeat it.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // Cmd+K / Ctrl+K opens the quick logger from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Tapping a notification while the app is already open asks the service worker to tell us where to go.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<unknown>): void => {
      const data = event.data;
      if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'navigate' && 'url' in data && typeof data.url === 'string') {
        applyTarget(parseLaunchTarget(new URL(data.url, window.location.origin).search));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [applyTarget]);

  useEffect(() => {
    const onUpdate = (): void => toast({ message: 'A new version is ready.', action: { label: 'Reload', onClick: () => window.location.reload() }, duration: 0 });
    window.addEventListener(UPDATE_READY_EVENT, onUpdate);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onUpdate);
  }, [toast]);

  return (
    <div className="relative min-h-dvh text-slate-100">
      <AmbientGlow />
      {!online && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.25rem)] z-50 mx-auto flex w-fit animate-pop items-center gap-2 rounded-full border border-white/10 bg-slate-900/90 px-3.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-xl"
        >
          <WifiOff className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          Offline · everything is saved on this device
        </div>
      )}

      <div className="mx-auto max-w-md">
        <main key={route} className={cx('animate-fade-in pb-[calc(11rem+env(safe-area-inset-bottom))]')}>
          {route === 'home' && <HomeScreen finance={finance} goTo={goTo} openSettings={() => setRoute('settings')} />}
          {route === 'ledger' && <LedgerScreen finance={finance} />}
          {route === 'budget' && <BudgetScreen finance={finance} />}
          {route === 'bills' && <BillsScreen finance={finance} />}
          {route === 'vaults' && <VaultsScreen finance={finance} />}
          {route === 'settings' && <SettingsScreen finance={finance} notifier={notifier} onBack={() => setRoute(lastTab)} />}
        </main>
      </div>

      <Fab label="Log" icon={Plus} onClick={() => setQuickOpen(true)} shortcut={isMac() ? '⌘K' : 'Ctrl K'} />
      <BottomNav active={route === 'settings' ? null : route} onChange={goTo} />

      {quickOpen && (
        <QuickLogSheet finance={finance} onClose={() => setQuickOpen(false)} onOpenFullForm={() => setFullFormOpen(true)} />
      )}
      {fullFormOpen && <TransactionSheet finance={finance} onClose={() => setFullFormOpen(false)} />}
    </div>
  );
}
