import { PiggyBank, Repeat, TriangleAlert } from 'lucide-react';
import type { UseFinanceStoreResult } from '../../hooks/useFinanceStore';
import { fromDateKey } from '../../lib/dates';
import { formatShortDate } from '../../lib/format';
import type { RolloverPreference, RolloverRecord } from '../../types';
import { INPUT_CLASS, Segmented } from '../forms';
import { BUCKET_META } from '../meta';
import { Banner, GlassCard, IconTile, Money, cx } from '../ui';

const OPTIONS = [
  { value: 'none', label: 'Off' },
  { value: 'carry-forward', label: 'Carry over' },
  { value: 'move-to-savings', label: 'To vault' },
] as const satisfies ReadonlyArray<{ value: RolloverPreference; label: string }>;

const EXPLANATION: Record<RolloverPreference, string> = {
  none: 'Money left at the end of a week simply lapses. Every week starts from its base limit.',
  'carry-forward': "What's left of a week's Needs and Wants limits is added to next week's limits.",
  'move-to-savings': "What's left of a week's Needs and Wants limits is moved into your chosen savings vault.",
};

const HISTORY_LENGTH = 6;

/** Chooses what happens to unspent weekly money, and lists what has been rolled over so far. */
export function RolloverCard({ finance }: { finance: UseFinanceStoreResult }) {
  const { salary, vaults, rollovers } = finance;
  const preference = salary.rolloverPreference;
  const history = [...rollovers].reverse().slice(0, HISTORY_LENGTH);
  const needsVault = preference === 'move-to-savings';

  const choose = (next: RolloverPreference): void => {
    // With only one vault there is nothing to decide, so preselect it.
    const onlyVault = vaults.length === 1 ? (vaults[0]?.id ?? null) : null;
    finance.updateSalary({
      rolloverPreference: next,
      ...(next === 'move-to-savings' && salary.rolloverVaultId === null ? { rolloverVaultId: onlyVault } : {}),
    });
  };

  return (
    <GlassCard delay={180}>
      <h2 className="text-lg font-semibold text-white">Weekly surplus</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">What should happen to money you didn't spend this week?</p>

      <div className="mt-4">
        <Segmented label="Rollover" options={OPTIONS} value={preference} onChange={choose} />
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{EXPLANATION[preference]}</p>
      </div>

      {needsVault && (
        <div className="mt-4 space-y-3">
          {vaults.length === 0 ? (
            <Banner accent="amber" icon={TriangleAlert}>
              Create a savings vault first, then pick it here. Until then, surplus lapses.
            </Banner>
          ) : (
            <>
              <label htmlFor="rollover-vault" className="block text-sm font-medium text-slate-400">
                Move surplus into
              </label>
              <select
                id="rollover-vault"
                value={salary.rolloverVaultId ?? ''}
                onChange={(event) => finance.updateSalary({ rolloverVaultId: event.target.value || null })}
                className={cx(INPUT_CLASS, 'appearance-none')}
              >
                <option value="">Choose a vault…</option>
                {vaults.map((vault) => (
                  <option key={vault.id} value={vault.id}>
                    {vault.name}
                  </option>
                ))}
              </select>
              {salary.rolloverVaultId === null && (
                <Banner accent="amber" icon={TriangleAlert}>
                  Pick a vault. Until you do, surplus lapses.
                </Banner>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">History</h3>
        {history.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Surplus from finished weeks will show up here. Weeks that ended before today are not back-filled.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5">
            {history.map((record) => (
              <HistoryRow key={record.id} record={record} vaultName={vaults.find((v) => v.id === record.vaultId)?.name} />
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

function HistoryRow({ record, vaultName }: { record: RolloverRecord; vaultName: string | undefined }) {
  const moved = record.action === 'moved';
  return (
    <li className="flex items-center gap-3 py-3">
      <IconTile icon={moved ? PiggyBank : Repeat} color={BUCKET_META[record.bucket].color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-white">
          {BUCKET_META[record.bucket].label} · week of {formatShortDate(fromDateKey(record.weekStart))}
        </p>
        <p className="truncate text-sm text-slate-400">
          {moved ? `Moved to ${vaultName ?? 'a vault'}` : 'Carried into the next week'}
        </p>
      </div>
      <Money value={record.amount} size="md" tone="emerald" prefix="+" />
    </li>
  );
}
