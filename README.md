# Micro Finance

Personal finance PWA: React + TypeScript + Tailwind CSS v4 + Lucide Icons + Recharts, built with Vite.

```bash
npm install
npm run dev        # dev server
npm test           # logic, hook and UI tests (vitest, jsdom)
npm run typecheck
npm run build
```

## Architecture

| Path | Role |
| --- | --- |
| `src/types.ts` | Domain model and the settings-file envelope (`SettingsExport`). |
| `src/hooks/useFinanceStore.ts` | `useFinanceStore()` and the `createFinanceStore()` behind it: shared state, validated actions, localStorage sync, JSON export / import, daily maintenance. |
| `src/hooks/useAllocationEditor.ts` | Slider / salary editing state: live rebalancing while dragging, saved on release. |
| `src/lib/engine.ts` | The budget engine (pure): salary split, weekly caps, safe-to-spend, surplus rollover. |
| `src/lib/budget.ts`, `dates.ts`, `format.ts` | Pay periods and auto-deduct bills; local-time date maths; currency/date formatting. |
| `src/lib/schema.ts` | Runtime validation of every entity and of whole settings files. |
| `src/components/`, `src/screens/` | The mobile UI: design-system primitives (`ui.tsx`, `forms.tsx`, `Sheet.tsx`), five tab screens and a settings screen. |

State is shared by every component that calls `useFinanceStore()`; no provider is needed. Every action validates its input and returns `{ ok, value }` or `{ ok: false, errors }`.

## Budget engine

1. **Salary split.** `salary x percentage` gives each bucket's amount for the pay period. Moving one slider rebalances the other two in proportion, so the total is always exactly 100%.
2. **Weekly caps.** A pay period (payday to the day before the next payday; the calendar month when payday is the 1st) is cut into 7-day weeks that start on payday. A full week's cap is `monthly x 7 / days in the period`. The last week is shorter (for example 3 days in a 31-day month) and gets `monthly x days / period days`, so the weekly caps add up to the monthly amount to the cent.
3. **Safe to spend today.** `(this week's Needs + Wants caps, including carried-over surplus, minus what was spent this week) / days left in the week, today included`. It drops as you spend today and is negative when the week is overspent. Savings is a target, not a limit, and is not part of it.
4. **Surplus rollover.** When a week has finished, the unspent part of its Needs and Wants cap is handled by the chosen preference:
   * `none`: it lapses.
   * `carry-forward`: it is added to the next week's cap for that bucket (and compounds if left unspent again, including across two pay periods).
   * `move-to-savings`: it is added to the chosen savings vault. If no valid vault is chosen, it lapses rather than going somewhere unintended.

   Overspending is never carried over as debt. Settlement is idempotent (a ledger holds one record per week and bucket), catches up on weeks that finished while the app was closed, and does not back-fill weeks from before the app was first used.

### Known limits

* Bills count as spending in the week they are paid, so the week rent leaves your account will show Needs over its weekly cap.
* Weeks start on payday, not on Monday. Changing the payday mid-period shifts the week boundaries.
* The rollover ledger records what actually happened and is not recalculated when you later edit old transactions or change the salary.

## Persistence and backups

* All app state lives under one localStorage key (`micro-finance:state`) as a `SettingsExport` document, written synchronously on every change.
* Unreadable saved data (corrupt, or written by a newer app version) is copied to `micro-finance:state:corrupt-backup` before the app starts fresh, and `storageError` explains what happened.
* Export produces the same document (`schema: "micro-finance.settings"`, `schemaVersion: 1`). Import is all-or-nothing: the file is fully validated first, and an invalid file changes nothing. Backups made before weekly rollover existed still import.

Not built yet: a web manifest, service worker and app icons (so it isn't installable yet), and push notifications. The alert toggles currently drive in-app banners only.
