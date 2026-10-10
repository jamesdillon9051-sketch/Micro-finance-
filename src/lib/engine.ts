import {
  BUCKET_KEYS,
  CATEGORY_BUCKET,
  SPENDING_BUCKETS,
  type BucketAllocation,
  type BucketKey,
  type BucketSummary,
  type BudgetOverview,
  type BudgetPeriod,
  type DateKey,
  type FinanceData,
  type RolloverRecord,
  type SalaryConfig,
  type SpendingBucket,
  type Transaction,
  type WeekWindow,
  type WeeklyBucket,
  type WeeklyBudget,
} from '../types';
import { getBudgetPeriod, isExpenseCategory, roundMoney } from './budget';
import { addDays, diffInDays, fromDateKey, toDateKey } from './dates';

/** How far back the store will look for unsettled weeks (e.g. after the app sat unopened for months). */
const MAX_SETTLE_LOOKBACK_DAYS = 800;

// ---------------------------------------------------------------------------
// 1. Salary splitting
// ---------------------------------------------------------------------------

/** The two buckets that are not the one being dragged. */
const OTHER_BUCKETS: Record<BucketKey, readonly [BucketKey, BucketKey]> = {
  needs: ['wants', 'savings'],
  wants: ['needs', 'savings'],
  savings: ['needs', 'wants'],
};

/**
 * Sets `bucket` to `percent` and shares what is left (`100 - percent`) between the
 * other two in proportion to their current sizes, so the total is always exactly 100.
 * Percentages come out as whole numbers. If both others are 0 the remainder is split evenly.
 */
export function rebalanceAllocation(current: BucketAllocation, bucket: BucketKey, percent: number): BucketAllocation {
  const target = Math.round(Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0)));
  const [first, second] = OTHER_BUCKETS[bucket];
  const remainder = 100 - target;
  const othersTotal = current[first] + current[second];

  const firstShare =
    othersTotal > 0 ? Math.round((current[first] / othersTotal) * remainder) : Math.ceil(remainder / 2);

  const next: BucketAllocation = { ...current };
  next[bucket] = target;
  next[first] = firstShare;
  next[second] = remainder - firstShare;
  return next;
}

/** Monthly (pay-period) money for each bucket: salary x percentage. */
export function monthlyAllocation(salary: Pick<SalaryConfig, 'monthlySalary' | 'allocation'>): Record<BucketKey, number> {
  return {
    needs: roundMoney((salary.monthlySalary * salary.allocation.needs) / 100),
    wants: roundMoney((salary.monthlySalary * salary.allocation.wants) / 100),
    savings: roundMoney((salary.monthlySalary * salary.allocation.savings) / 100),
  };
}

// ---------------------------------------------------------------------------
// 2. Weekly caps
// ---------------------------------------------------------------------------

/**
 * Cuts a pay period into 7-day weeks starting on payday. The last week holds
 * whatever days are left (e.g. 3 days in a 31-day period), so weeks always cover the period exactly.
 */
export function getPeriodWeeks(period: Pick<BudgetPeriod, 'startDate' | 'totalDays'>): WeekWindow[] {
  const start = fromDateKey(period.startDate);
  const weeks: WeekWindow[] = [];
  for (let offset = 0; offset < period.totalDays; offset += 7) {
    const days = Math.min(7, period.totalDays - offset);
    weeks.push({
      index: weeks.length,
      start: toDateKey(addDays(start, offset)),
      end: toDateKey(addDays(start, offset + days - 1)),
      days,
    });
  }
  return weeks;
}

/**
 * Turns one monthly amount into a cap per week: `monthly x days / periodDays`
 * (i.e. `monthly x 7 / periodDays` for a full week). Rounding is done on the running
 * total, so the weekly caps always add up to exactly `monthly`.
 */
export function splitIntoWeeklyCaps(monthly: number, weeks: readonly WeekWindow[], totalDays: number): number[] {
  let previousTotal = 0;
  let daysSoFar = 0;
  return weeks.map((week) => {
    daysSoFar += week.days;
    const runningTotal = roundMoney((monthly * daysSoFar) / totalDays);
    const cap = roundMoney(runningTotal - previousTotal);
    previousTotal = runningTotal;
    return cap;
  });
}

export interface WeekScheduleRow {
  week: WeekWindow;
  /** Base cap per bucket for that week (before any carried-in surplus). */
  caps: Record<BucketKey, number>;
}

/** Every week of a pay period with its base caps; the rows add up to the monthly allocation. */
export function getWeeklySchedule(
  salary: Pick<SalaryConfig, 'monthlySalary' | 'allocation'>,
  period: Pick<BudgetPeriod, 'startDate' | 'totalDays'>,
): WeekScheduleRow[] {
  const weeks = getPeriodWeeks(period);
  const monthly = monthlyAllocation(salary);
  const needs = splitIntoWeeklyCaps(monthly.needs, weeks, period.totalDays);
  const wants = splitIntoWeeklyCaps(monthly.wants, weeks, period.totalDays);
  const savings = splitIntoWeeklyCaps(monthly.savings, weeks, period.totalDays);
  return weeks.map((week) => ({
    week,
    caps: { needs: needs[week.index] ?? 0, wants: wants[week.index] ?? 0, savings: savings[week.index] ?? 0 },
  }));
}

function spentInRange(transactions: readonly Transaction[], bucket: BucketKey, start: DateKey, end: DateKey): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.date < start || tx.date > end) continue;
    if (isExpenseCategory(tx.category) && CATEGORY_BUCKET[tx.category] === bucket) total += tx.amount;
  }
  return roundMoney(total);
}

/** Surplus carried into the week starting `weekStart` from the week that ended the day before. */
function carriedInto(rollovers: readonly RolloverRecord[], bucket: SpendingBucket, weekStart: DateKey): number {
  const previousWeekEnd = toDateKey(addDays(fromDateKey(weekStart), -1));
  let total = 0;
  for (const record of rollovers) {
    if (record.action === 'carried' && record.bucket === bucket && record.weekEnd === previousWeekEnd) {
      total += record.amount;
    }
  }
  return roundMoney(total);
}

function isSpendingBucket(bucket: BucketKey): bucket is SpendingBucket {
  return bucket !== 'savings';
}

// ---------------------------------------------------------------------------
// 3. Daily safe-to-spend
// ---------------------------------------------------------------------------

/**
 * This week's strict limits and what is left of them. The week is the one that
 * contains `today`; surplus carried in from last week is included in the caps.
 */
export function getWeeklyBudget(
  data: Pick<FinanceData, 'salary' | 'transactions' | 'rollovers'>,
  today: Date,
): WeeklyBudget {
  const { salary, transactions, rollovers } = data;
  const period = getBudgetPeriod(salary.paydayDate, today);
  const weeks = getPeriodWeeks(period);
  const week = weeks[Math.min(weeks.length - 1, Math.floor(period.daysElapsed / 7))];
  if (!week) throw new Error('A pay period always has at least one week');

  const monthly = monthlyAllocation(salary);
  const daysRemaining = diffInDays(today, fromDateKey(week.end)) + 1;

  const buckets = {} as Record<BucketKey, WeeklyBucket>;
  for (const bucket of BUCKET_KEYS) {
    const baseCap = splitIntoWeeklyCaps(monthly[bucket], weeks, period.totalDays)[week.index] ?? 0;
    const carriedIn = isSpendingBucket(bucket) ? carriedInto(rollovers, bucket, week.start) : 0;
    const cap = roundMoney(baseCap + carriedIn);
    const spent = spentInRange(transactions, bucket, week.start, week.end);
    const remaining = roundMoney(cap - spent);
    buckets[bucket] = {
      bucket,
      baseCap,
      carriedIn,
      cap,
      spent,
      remaining,
      percentUsed: cap > 0 ? (spent / cap) * 100 : spent > 0 ? 100 : 0,
      perDay: roundMoney(remaining / Math.max(1, daysRemaining)),
    };
  }

  return {
    week,
    weekNumber: week.index + 1,
    weeksInPeriod: weeks.length,
    daysRemaining,
    buckets,
    spendable: {
      cap: roundMoney(buckets.needs.cap + buckets.wants.cap),
      spent: roundMoney(buckets.needs.spent + buckets.wants.spent),
      remaining: roundMoney(buckets.needs.remaining + buckets.wants.remaining),
    },
  };
}

/** Pay-period totals, this week's caps and today's safe-to-spend, all from one call. */
export function summarizeBudget(
  data: Pick<FinanceData, 'salary' | 'transactions' | 'rollovers'>,
  today: Date,
): BudgetOverview {
  const { salary, transactions } = data;
  const period = getBudgetPeriod(salary.paydayDate, today);

  const spent: Record<BucketKey, number> = { needs: 0, wants: 0, savings: 0 };
  let periodIncome = 0;
  let periodExpenses = 0;
  for (const tx of transactions) {
    // DateKeys are zero-padded, so string comparison is chronological.
    if (tx.date < period.startDate || tx.date > period.endDate) continue;
    if (tx.type === 'income') {
      periodIncome += tx.amount;
      continue;
    }
    periodExpenses += tx.amount;
    if (isExpenseCategory(tx.category)) spent[CATEGORY_BUCKET[tx.category]] += tx.amount;
  }

  const monthly = monthlyAllocation(salary);
  const buckets = {} as Record<BucketKey, BucketSummary>;
  for (const bucket of BUCKET_KEYS) {
    const allocated = monthly[bucket];
    const bucketSpent = roundMoney(spent[bucket]);
    buckets[bucket] = {
      bucket,
      allocated,
      spent: bucketSpent,
      remaining: roundMoney(allocated - bucketSpent),
      percentUsed: allocated > 0 ? (bucketSpent / allocated) * 100 : bucketSpent > 0 ? 100 : 0,
    };
  }

  const weekly = getWeeklyBudget(data, today);
  return {
    period,
    buckets,
    periodIncome: roundMoney(periodIncome),
    periodExpenses: roundMoney(periodExpenses),
    weekly,
    safeToSpend: {
      remaining: weekly.spendable.remaining,
      daysRemaining: weekly.daysRemaining,
      perDay: roundMoney(weekly.spendable.remaining / Math.max(1, weekly.daysRemaining)),
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Surplus rollover
// ---------------------------------------------------------------------------

/**
 * Settles every week that finished before `today` and hasn't been settled yet:
 * the unspent part of its Needs / Wants cap (cap + anything carried in - spent) is
 *  - carried into the next week's cap, or
 *  - added to the chosen savings vault, or
 *  - dropped,
 * depending on `salary.rolloverPreference`. Overspent weeks produce nothing.
 *
 * It is idempotent: each (week, bucket) is recorded once in `rollovers`, and
 * `meta.lastSettledThrough` stops finished weeks from being looked at again. Weeks
 * are settled oldest first, so surplus compounds correctly across several missed weeks
 * and across the boundary between two pay periods. The first ever run only sets the
 * marker: weeks that ended before the app was in use are not settled retroactively.
 */
export function settleCompletedWeeks(data: FinanceData, today: Date): FinanceData {
  const yesterday = toDateKey(addDays(today, -1));
  const marker = data.meta.lastSettledThrough;
  if (marker === null) return withSettledThrough(data, yesterday);
  if (marker >= yesterday) return data;

  const lookbackLimit = toDateKey(addDays(today, -MAX_SETTLE_LOOKBACK_DAYS));
  const settledThrough = marker < lookbackLimit ? lookbackLimit : marker;
  const { salary } = data;
  const monthly = monthlyAllocation(salary);
  const settledOn = toDateKey(today);

  let rollovers = data.rollovers;
  let vaults = data.vaults;

  let cursor = addDays(fromDateKey(settledThrough), 1);
  while (toDateKey(cursor) <= yesterday) {
    const period = getBudgetPeriod(salary.paydayDate, cursor);
    const weeks = getPeriodWeeks(period);
    const caps = {
      needs: splitIntoWeeklyCaps(monthly.needs, weeks, period.totalDays),
      wants: splitIntoWeeklyCaps(monthly.wants, weeks, period.totalDays),
    };

    for (const week of weeks) {
      if (week.end <= settledThrough || week.end > yesterday) continue;
      for (const bucket of SPENDING_BUCKETS) {
        const id = `${week.start}:${bucket}`;
        if (rollovers.some((record) => record.id === id)) continue;

        const cap = caps[bucket][week.index] ?? 0;
        const surplus = roundMoney(
          cap + carriedInto(rollovers, bucket, week.start) - spentInRange(data.transactions, bucket, week.start, week.end),
        );
        if (surplus <= 0) continue;

        const base = { id, weekStart: week.start, weekEnd: week.end, bucket, amount: surplus, settledOn };
        if (salary.rolloverPreference === 'carry-forward') {
          rollovers = [...rollovers, { ...base, action: 'carried', vaultId: null }];
        } else if (salary.rolloverPreference === 'move-to-savings') {
          const vault = vaults.find((candidate) => candidate.id === salary.rolloverVaultId);
          if (!vault) continue; // no valid destination: the surplus lapses rather than going somewhere unintended
          vaults = vaults.map((candidate) =>
            candidate.id === vault.id
              ? { ...candidate, currentAmount: roundMoney(candidate.currentAmount + surplus) }
              : candidate,
          );
          rollovers = [...rollovers, { ...base, action: 'moved', vaultId: vault.id }];
        }
      }
    }
    cursor = addDays(fromDateKey(period.endDate), 1);
  }

  return { ...data, rollovers, vaults, meta: { ...data.meta, lastSettledThrough: yesterday } };
}

function withSettledThrough(data: FinanceData, day: DateKey): FinanceData {
  return { ...data, meta: { ...data.meta, lastSettledThrough: day } };
}
