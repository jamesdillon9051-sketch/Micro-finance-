import { CircleCheck, Pencil, Plus, Repeat, Vault as VaultIcon } from 'lucide-react';
import { useState } from 'react';
import { VAULT_ICON_COMPONENTS } from '../components/meta';
import { ProgressRing } from '../components/ProgressRing';
import { AdjustVaultSheet, VaultSheet } from '../components/VaultSheets';
import { Button, Chip, EmptyState, GlassCard, IconButton, Label, Money, ProgressBar, ScreenHeader } from '../components/ui';
import type { UseFinanceStoreResult } from '../hooks/useFinanceStore';
import { roundMoney } from '../lib/budget';
import { diffInDays, fromDateKey } from '../lib/dates';
import { formatCurrency, formatMonthYear } from '../lib/format';
import type { SavingsVault } from '../types';

const SAVINGS_COLOR = '#34d399';

type Sheet =
  | { kind: 'edit'; vault?: SavingsVault }
  | { kind: 'adjust'; vault: SavingsVault; mode: 'add' | 'withdraw' };

export function VaultsScreen({ finance }: { finance: UseFinanceStoreResult }) {
  const { vaults, salary, today } = finance;
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const saved = roundMoney(vaults.reduce((sum, vault) => sum + vault.currentAmount, 0));
  const target = roundMoney(vaults.reduce((sum, vault) => sum + vault.targetAmount, 0));

  return (
    <>
      <ScreenHeader
        title="Vaults"
        subtitle={`${vaults.length} ${vaults.length === 1 ? 'goal' : 'goals'}`}
        trailing={<IconButton icon={Plus} label="New vault" variant="primary" onClick={() => setSheet({ kind: 'edit' })} />}
      />
      <div className="space-y-4 px-4 pt-4">
        {vaults.length === 0 ? (
          <EmptyState
            icon={VaultIcon}
            title="No vaults yet"
            body="Create a vault for something you're saving towards: a holiday, an emergency fund, a new car."
            action={
              <Button variant="primary" large icon={Plus} onClick={() => setSheet({ kind: 'edit' })}>
                Create a vault
              </Button>
            }
          />
        ) : (
          <>
            <GlassCard className="relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl" />
              <div className="relative">
                <Label>Total saved</Label>
                <div className="mt-3">
                  <Money value={saved} size="hero" tone="emerald" glow />
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  of {formatCurrency(target)} across {vaults.length} {vaults.length === 1 ? 'vault' : 'vaults'}
                </p>
                <div className="mt-4">
                  <ProgressBar value={target > 0 ? (saved / target) * 100 : 0} color={SAVINGS_COLOR} label="Total progress towards all vault targets" />
                </div>
              </div>
            </GlassCard>

            {vaults.map((vault, index) => {
              const Icon = VAULT_ICON_COMPONENTS[vault.icon];
              const pct = (vault.currentAmount / vault.targetAmount) * 100;
              const complete = vault.currentAmount >= vault.targetAmount;
              const daysLeft = diffInDays(fromDateKey(today), fromDateKey(vault.targetDate));
              const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.4375));
              const perMonth = roundMoney(Math.max(0, vault.targetAmount - vault.currentAmount) / monthsLeft);
              const receivesSurplus = salary.rolloverPreference === 'move-to-savings' && salary.rolloverVaultId === vault.id;

              return (
                <GlassCard key={vault.id} delay={60 + index * 40}>
                  <div className="flex items-center gap-4">
                    <ProgressRing value={pct} color={SAVINGS_COLOR} label={`${vault.name} progress`}>
                      <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold text-white">{vault.name}</h2>
                      <div className="mt-1">
                        <Money value={vault.currentAmount} size="lg" />
                      </div>
                      <p className="mt-0.5 text-sm text-slate-400">of {formatCurrency(vault.targetAmount)}</p>
                    </div>
                    <IconButton icon={Pencil} label={`Edit ${vault.name}`} onClick={() => setSheet({ kind: 'edit', vault })} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {complete ? (
                      <Chip accent="emerald" icon={CircleCheck}>
                        Goal reached
                      </Chip>
                    ) : (
                      <Chip accent="slate">
                        {daysLeft < 0 ? 'Target date passed' : `By ${formatMonthYear(vault.targetDate)}`}
                      </Chip>
                    )}
                    {!complete && daysLeft >= 0 && <Chip accent="slate">{formatCurrency(perMonth)} / month</Chip>}
                    {receivesSurplus && (
                      <Chip accent="indigo" icon={Repeat}>
                        Gets weekly surplus
                      </Chip>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button variant="success" onClick={() => setSheet({ kind: 'adjust', vault, mode: 'add' })}>
                      Add money
                    </Button>
                    <Button onClick={() => setSheet({ kind: 'adjust', vault, mode: 'withdraw' })} disabled={vault.currentAmount <= 0}>
                      Withdraw
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
          </>
        )}
      </div>

      {sheet?.kind === 'edit' && <VaultSheet finance={finance} editing={sheet.vault} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'adjust' && (
        <AdjustVaultSheet finance={finance} vault={sheet.vault} initialMode={sheet.mode} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
