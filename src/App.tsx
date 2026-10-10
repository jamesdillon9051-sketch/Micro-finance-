import { Download, RotateCcw, TriangleAlert, Upload, Wallet } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useFinanceStore } from './hooks/useFinanceStore';
import { BUCKET_KEYS, type BucketKey } from './types';

const BUCKET_STYLE: Record<BucketKey, { label: string; color: string }> = {
  needs: { label: 'Needs', color: '#0ea5e9' },
  wants: { label: 'Wants', color: '#f59e0b' },
  savings: { label: 'Savings', color: '#10b981' },
};

const formatMoney = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Minimal shell that exercises the whole stack (Tailwind, Lucide, Recharts and
 * the finance store). Replace it with the real screens.
 */
export default function App() {
  const store = useFinanceStore();
  const { salary, overview, storageError } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const chartData = BUCKET_KEYS.map((key) => ({
    key,
    name: BUCKET_STYLE[key].label,
    value: overview.buckets[key].allocated,
  }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = await store.importFromFile(file);
    setMessage(
      result.ok
        ? `Imported ${result.value.transactions} transactions, ${result.value.bills} bills, ${result.value.vaults} vaults.`
        : `Import failed: ${result.errors.join('; ')}`,
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-slate-950 p-4 text-slate-100">
      <header className="flex items-center gap-2">
        <Wallet className="h-6 w-6 text-emerald-400" aria-hidden />
        <h1 className="text-xl font-semibold">Micro Finance</h1>
      </header>

      {(storageError ?? message) && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {storageError ?? message}
        </p>
      )}

      <section className="rounded-2xl bg-slate-900 p-4">
        <label className="block text-sm text-slate-400" htmlFor="salary">
          Monthly salary
        </label>
        <input
          id="salary"
          type="number"
          min={0}
          inputMode="decimal"
          value={salary.monthlySalary}
          onChange={(event) => store.updateSalary({ monthlySalary: Number(event.target.value) })}
          className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="mt-2 text-sm text-slate-400">
          Pay period {overview.period.startDate} to {overview.period.endDate} · {overview.period.daysRemaining} days left
        </p>
      </section>

      <section className="rounded-2xl bg-slate-900 p-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                stroke="none"
                isAnimationActive={false}
              >
                {chartData.map((slice) => (
                  <Cell key={slice.key} fill={BUCKET_STYLE[slice.key].color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 space-y-3">
          {BUCKET_KEYS.map((key) => {
            const bucket = overview.buckets[key];
            return (
              <li key={key}>
                <div className="flex justify-between text-sm">
                  <span>{BUCKET_STYLE[key].label} ({salary.allocation[key]}%)</span>
                  <span className="text-slate-400">
                    {formatMoney(bucket.spent)} / {formatMoney(bucket.allocated)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, bucket.percentUsed)}%`, backgroundColor: BUCKET_STYLE[key].color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-slate-400">
          Safe to spend: <span className="font-medium text-slate-100">{formatMoney(overview.safeToSpend.perDay)}</span> per day
        </p>
      </section>

      <section className="flex gap-2">
        <button
          type="button"
          onClick={() => store.downloadBackup()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
        >
          <Download className="h-4 w-4" aria-hidden /> Export
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
        >
          <Upload className="h-4 w-4" aria-hidden /> Import
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Erase all data on this device?')) store.resetAll();
          }}
          className="flex items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
          aria-label="Reset all data"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleImport} />
      </section>
    </main>
  );
}
