import { Bell, BellOff, CircleCheck, Download, Share, SquarePlus, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { useNotifications } from '../hooks/useNotifications';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Banner, Button, Chip, GlassCard } from './ui';

type Notifier = ReturnType<typeof useNotifications>;

/** Turning notifications on, plus what to do when the browser or iPhone won't allow it yet. */
export function NotificationsCard({ notifier }: { notifier: Notifier }) {
  const { support, enable, sendTest } = notifier;
  const install = useInstallPrompt();

  return (
    <GlassCard delay={30}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Phone notifications</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Bill reminders, safe-to-spend warnings and an evening check-in, delivered by your device.
          </p>
        </div>
        {support.permission === 'granted' && (
          <Chip accent="emerald" icon={CircleCheck}>
            On
          </Chip>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {support.needsInstall ? (
          <Banner accent="indigo" icon={Share}>
            On iPhone and iPad, notifications only work once the app is on your Home Screen. Follow the steps below, then open it from there and come back to this screen.
          </Banner>
        ) : support.permission === 'unsupported' ? (
          <Banner accent="amber" icon={BellOff}>
            This browser can't show notifications.
          </Banner>
        ) : support.permission === 'denied' ? (
          <Banner accent="amber" icon={TriangleAlert}>
            Notifications are blocked. Allow them for this app in your browser's site settings (on iPhone: Settings → Notifications), then reload.
          </Banner>
        ) : support.permission === 'default' ? (
          <Button variant="primary" large block icon={Bell} onClick={() => void enable()}>
            Turn on notifications
          </Button>
        ) : (
          <Button block icon={Bell} onClick={() => void sendTest()}>
            Send a test notification
          </Button>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          Reminders are checked while the app is open or running in the background. Phones can pause an app you've closed, so a
          reminder for a time it wasn't running arrives the next time you open it.
        </p>
      </div>

      {!install.installed && (
        <div className="mt-5 border-t border-white/10 pt-5">
          <h3 className="text-base font-semibold text-white">Add to your Home Screen</h3>
          {install.canPromptInstall ? (
            <div className="mt-3">
              <Button variant="primary" block icon={Download} onClick={() => void install.install()}>
                Install app
              </Button>
            </div>
          ) : install.showIosSteps ? (
            <ol className="mt-3 space-y-3 text-sm text-slate-300">
              <Step number={1}>
                Tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-indigo-300" aria-label="Share" /> Share button in Safari's toolbar.
              </Step>
              <Step number={2}>
                Choose <SquarePlus className="mx-0.5 inline h-4 w-4 align-text-bottom text-indigo-300" aria-hidden /> <strong className="font-semibold text-white">Add to Home Screen</strong>, then tap Add.
              </Step>
              <Step number={3}>Open Micro Finance from your Home Screen. It runs full-screen and works offline.</Step>
            </ol>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Use your browser's menu and choose Install app (or Add to Home Screen) to run it full-screen and offline.
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-200">{number}</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
