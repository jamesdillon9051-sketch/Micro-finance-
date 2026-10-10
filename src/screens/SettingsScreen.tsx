import { ChevronLeft, CircleCheck, Download, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Field, INPUT_CLASS, MoneyInput, Switch } from '../components/forms';
import { Banner, Button, GlassCard, IconButton, ScreenHeader } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { parseAmount } from '../lib/format';

type Notice = { accent: 'emerald' | 'rose'; text: string };

export function SettingsScreen({ finance, onBack }: { finance: UseFinanceStoreResult; onBack: () => void }) {
  const { notifications, storageError } = finance;
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [threshold, setThreshold] = useState(
    notifications.safeToSpendThreshold === 0 ? '' : String(notifications.safeToSpendThreshold),
  );

  const commitThreshold = (): void => {
    const value = threshold.trim() === '' ? 0 : parseAmount(threshold);
    if (!Number.isFinite(value) || value < 0) {
      setNotice({ accent: 'rose', text: 'Enter the alert amount as a number.' });
      return;
    }
    const result = finance.updateNotifications({ safeToSpendThreshold: value });
    setNotice(result.ok ? null : { accent: 'rose', text: result.errors.join(' ') });
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = await finance.importFromFile(file);
    setNotice(
      result.ok
        ? {
            accent: 'emerald',
            text: `Restored ${result.value.transactions} transactions, ${result.value.bills} bills and ${result.value.vaults} vaults.`,
          }
        : { accent: 'rose', text: `Couldn't restore that file. ${result.errors.join(' ')}` },
    );
  };

  const reset = (): void => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3500);
      return;
    }
    finance.resetAll();
    setConfirmReset(false);
    setNotice({ accent: 'emerald', text: 'All data on this device was erased.' });
  };

  return (
    <>
      <ScreenHeader
        title="Settings"
        trailing={<IconButton icon={ChevronLeft} label="Back" onClick={onBack} />}
      />
      <div className="space-y-4 px-4 pt-4">
        {storageError && (
          <Banner accent="amber" icon={TriangleAlert}>
            {storageError}
          </Banner>
        )}
        {notice && (
          <Banner accent={notice.accent} icon={notice.accent === 'emerald' ? CircleCheck : TriangleAlert}>
            {notice.text}
          </Banner>
        )}

        <GlassCard>
          <h2 className="text-lg font-semibold text-white">Alerts</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Alerts appear inside the app. Push notifications and timed reminders aren't sent yet.
          </p>
          <div className="mt-4 space-y-4 divide-y divide-white/5">
            <Switch
              label="Overspend alerts"
              description="Warn me when a weekly limit is exceeded."
              checked={notifications.enableOverspendAlerts}
              onChange={(checked) => finance.updateNotifications({ enableOverspendAlerts: checked })}
            />
            <div className="pt-4">
              <Switch
                label="Bill alerts"
                description="Warn me when a bill is due within 3 days."
                checked={notifications.enableBillAlerts}
                onChange={(checked) => finance.updateNotifications({ enableBillAlerts: checked })}
              />
            </div>
            <div className="pt-4">
              <Switch
                label="Daily reminder"
                description="Remind me to log my spending."
                checked={notifications.enableDailyReminder}
                onChange={(checked) => finance.updateNotifications({ enableDailyReminder: checked })}
              />
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <Field label="Reminder time">
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={notifications.reminderTime}
                  disabled={!notifications.enableDailyReminder}
                  onChange={(event) => event.target.value && finance.updateNotifications({ reminderTime: event.target.value })}
                  className={INPUT_CLASS}
                />
              )}
            </Field>
            <Field
              label="Running-low threshold"
              hint="The safe-to-spend amount turns amber when your daily allowance drops below this."
            >
              {(id) => <MoneyInput id={id} value={threshold} onChange={setThreshold} onCommit={commitThreshold} />}
            </Field>
          </div>
        </GlassCard>

        <GlassCard delay={60}>
          <h2 className="text-lg font-semibold text-white">Backup &amp; restore</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Everything is stored on this device only. Export a backup file to keep a copy or move to a new phone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button icon={Download} onClick={() => finance.downloadBackup()}>
              Export
            </Button>
            <Button icon={Upload} onClick={() => fileInput.current?.click()}>
              Import
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Importing replaces everything currently on this device. A file that isn't a valid backup changes nothing.
          </p>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleImport} />
        </GlassCard>

        <GlassCard delay={120}>
          <h2 className="text-lg font-semibold text-white">Danger zone</h2>
          <div className="mt-4">
            <Button variant="danger" block icon={RotateCcw} onClick={reset}>
              {confirmReset ? 'Tap again to erase everything' : 'Erase all data'}
            </Button>
          </div>
        </GlassCard>
      </div>
    </>
  );
}
