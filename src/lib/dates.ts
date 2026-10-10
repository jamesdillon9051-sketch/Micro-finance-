import type { DateKey, MonthKey } from '../types';

const MS_PER_DAY = 86_400_000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** Local-time `YYYY-MM-DD`. Deliberately avoids `toISOString()`, which is UTC and can be off by a day. */
export function toDateKey(date: Date): DateKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

export function toMonthKey(date: Date): MonthKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}`;
}

/** True only for real calendar dates ("2026-02-30" is rejected). */
export function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

export function isValidTimeOfDay(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Local midnight of a `DateKey`. The key must already be valid. */
export function fromDateKey(key: DateKey): Date {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from `from` to `to`; robust to DST shifts. */
export function diffInDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * The date `dayOfMonth` falls on in the given month, clamped to the month's
 * last day. `monthIndex` may overflow (-1 = previous December, 12 = next January).
 */
export function dayInMonth(dayOfMonth: number, year: number, monthIndex: number): Date {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const y = firstOfMonth.getFullYear();
  const m = firstOfMonth.getMonth();
  return new Date(y, m, Math.min(dayOfMonth, daysInMonth(y, m)));
}

/** The next date (today included) on which `dayOfMonth` occurs, clamped to short months. */
export function nextOccurrence(dayOfMonth: number, today: Date): Date {
  const start = startOfDay(today);
  const thisMonth = dayInMonth(dayOfMonth, start.getFullYear(), start.getMonth());
  return thisMonth >= start ? thisMonth : dayInMonth(dayOfMonth, start.getFullYear(), start.getMonth() + 1);
}

/** Same day-of-month `months` later, clamped to the target month's last day. */
export function addMonths(date: Date, months: number): Date {
  return dayInMonth(date.getDate(), date.getFullYear(), date.getMonth() + months);
}
