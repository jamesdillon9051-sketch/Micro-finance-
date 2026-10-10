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
| `src/lib/bills.ts`, `ledger.ts`, `analytics.ts`, `notify.ts` | Pure, tested logic: bill status and the calendar grid, ledger search and filters, the three chart series, and which notifications are due. |
| `src/lib/notifier.ts`, `pwa.ts`, `platform.ts` | Browser glue: Notifications API (via the service worker), service-worker registration, iOS / install detection. |
| `src/hooks/useNotifications.ts`, `useInstallPrompt.ts`, `useOnlineStatus.ts` | Deliver due alerts, offer installation, track connectivity. |
| `src/components/`, `src/screens/` | The mobile UI: design-system primitives (`ui.tsx`, `forms.tsx`, `Sheet.tsx`, `toast.tsx`), five tab screens (Home, Ledger, Budget with Limits and Insights, Bills, Vaults) and Settings. |
| `public/manifest.json`, `public/sw.js`, `public/icons/` | PWA manifest, service worker and icons. |

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

## Daily use

* **Quick expense.** The floating **Log** button (on every screen) or **Cmd/Ctrl + K** opens a one-field logger: type an amount, tap a category chip, press Enter. Your most-used categories come first, and a toast offers **Undo**. Income and the full set of options live in the Ledger's **+** form.
* **Ledger.** A searchable table with type, date-range (this period, 7 / 30 days, custom) and category filters, running totals for what is shown, and category badges.
* **Bills.** A month calendar plus a list. Each bill is **Overdue**, **Due today**, **Upcoming** or **Paid**; each can be set to auto-deduct, or marked paid by hand. A bill counts as paid for a month when its payment transaction exists (auto-deducted and hand-marked payments share one id per bill and month), and a bill isn't called overdue for dates before it was added.
* **Insights** (Budget > Insights). Spending by category (donut; the 4 biggest plus Other), cumulative burn rate against the budget limit and an even pace, and net savings by month. Every chart has its numbers in a table.

## Install, offline and notifications

* **Install.** On iPhone: Safari > Share > **Add to Home Screen**, then open it from the Home Screen. Settings walks through this. On Android/desktop Chromium there is an **Install app** button.
* **Offline.** The service worker caches the app shell and every built asset when it first installs, so the app opens with no connection. All data is in `localStorage` on the device. Each release gets its own cache (stamped by `vite.config.ts`), and an in-app notice offers a reload when an update has taken over.
* **Notifications** (Settings > Phone notifications). Bills due in 2 days and on the day, a warning when safe-to-spend falls below your alert level, and an evening check-in at your chosen time. Each is sent once (a log of sent keys is kept in the saved data). iPhone only allows notifications after the app is on the Home Screen (iOS 16.4+), and the permission request must come from a tap.

**What notifications cannot do.** They are checked by the app itself: on launch, on returning to the app, every minute while it runs, and when your data changes. A web app can't run code once a phone has suspended it, so a reminder for a time the app wasn't running arrives the next time it is opened. Reliable delivery to a closed phone needs a push server (Web Push), which this local-only app deliberately doesn't have.

### Deploying

Serve `sw.js` with `Cache-Control: no-cache` (and everything under `/assets/` as immutable) so browsers pick up new releases. HTTPS is required for service workers and notifications. To change the icon, edit `public/icon.svg` and run `node scripts/generate-icons.mjs` (needs Playwright; see the script header).
