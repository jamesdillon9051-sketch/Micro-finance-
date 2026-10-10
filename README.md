# Micro Finance

Personal finance PWA: React + TypeScript + Tailwind CSS v4 + Lucide Icons + Recharts, built with Vite.

```bash
npm install
npm run dev        # dev server
npm test           # unit + hook tests (vitest, jsdom)
npm run typecheck
npm run build
```

## Architecture

| File | Role |
| --- | --- |
| `src/types.ts` | Domain model: `SalaryConfig`, `Transaction`, `BillReminder`, `SavingsVault`, `NotificationSettings`, the settings-file envelope (`SettingsExport`) and derived budget types. |
| `src/hooks/useFinanceStore.ts` | `useFinanceStore()` hook plus the `createFinanceStore()` it is built on: state, validated CRUD actions, localStorage sync, JSON export / import. |
| `src/lib/schema.ts` | Runtime validation of every entity and of whole settings files; defaults. |
| `src/lib/budget.ts` | Pure calculations: pay period, bucket spending, safe-to-spend, auto-deduct bills. |
| `src/lib/dates.ts` | Local-time date helpers (`YYYY-MM-DD`, never UTC). |
| `src/App.tsx` | Throwaway shell that exercises the stack end to end. |

### Using the store

```tsx
const { salary, transactions, overview, addTransaction, downloadBackup, importFromFile } = useFinanceStore();

const result = addTransaction({ amount: 12.5, category: 'dining', type: 'expense', date: '2026-10-10', note: '', isRecurring: false });
if (!result.ok) console.error(result.errors); // nothing was changed
```

Every component that calls the hook shares one state, so no provider is required.

### Persistence and backups

* The whole app state lives under one localStorage key (`micro-finance:state`) as a `SettingsExport` document, written synchronously on every change.
* Unreadable saved data (corrupt, or written by a newer app version) is copied to `micro-finance:state:corrupt-backup` before the app starts fresh, and `storageError` explains what happened.
* Export produces the same document (`schema: "micro-finance.settings"`, `schemaVersion: 1`). Import is all-or-nothing: the file is fully validated first, and an invalid file changes nothing.
