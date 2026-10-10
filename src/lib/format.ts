import type { DateKey } from '../types';
import { diffInDays, fromDateKey } from './dates';

/** Change these two constants to re-localise every amount and date in the app. */
const LOCALE = 'en-US';
const CURRENCY = 'USD';

const currencyFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const wholeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
const dayWithYearFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
const shortFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' });
const monthYearFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' });

/** `$1,234.50`, `-$12.00`. */
export function formatCurrency(value: number): string {
  return currencyFormat.format(value);
}

/** `$1,235` - for tight spaces where cents are noise. */
export function formatCurrencyWhole(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${wholeFormat.format(Math.abs(value))}`;
}

/**
 * A currency amount split at the decimal point so the UI can set the cents
 * smaller than the dollars: `{ whole: '$1,234', fraction: '.50' }`.
 */
export function splitCurrency(value: number): { whole: string; fraction: string } {
  let whole = '';
  let fraction = '';
  let afterDecimal = false;
  for (const part of currencyFormat.formatToParts(value)) {
    if (part.type === 'decimal') afterDecimal = true;
    if (afterDecimal) fraction += part.value;
    else whole += part.value;
  }
  return { whole, fraction };
}

/** `Today`, `Yesterday`, otherwise `Mon, Oct 5` (with the year when it isn't this year). */
export function formatDayLabel(date: DateKey, today: DateKey): string {
  const days = diffInDays(fromDateKey(date), fromDateKey(today));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const target = fromDateKey(date);
  return target.getFullYear() === fromDateKey(today).getFullYear()
    ? dayFormat.format(target)
    : dayWithYearFormat.format(target);
}

/** `Oct 5` */
export function formatShortDate(date: Date): string {
  return shortFormat.format(date);
}

/** `Oct 2027` */
export function formatMonthYear(date: DateKey): string {
  return monthYearFormat.format(fromDateKey(date));
}

/** `Today`, `Tomorrow`, `In 5 days`, and for a missed date `1 day overdue` / `3 days overdue`. */
export function formatDueInDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
}

/** 1 -> `1st`, 22 -> `22nd`, 13 -> `13th`. */
export function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * Parses what a person typed into an amount field. Returns `NaN` for empty or
 * unparseable text so callers can show a friendly message.
 */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s$]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}

/** Keeps an amount field to digits, one decimal point and at most two decimals. */
export function sanitizeAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });

/** Two short lines for a table cell: `Oct 9` over `Fri` (or over the year, for earlier years). */
export function formatLedgerDate(date: DateKey, today: DateKey): { primary: string; secondary: string } {
  const target = fromDateKey(date);
  const sameYear = target.getFullYear() === fromDateKey(today).getFullYear();
  return {
    primary: shortFormat.format(target),
    secondary: sameYear ? weekdayFormat.format(target) : String(target.getFullYear()),
  };
}

/** `October 2026` */
export function formatMonthName(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex, 1));
}
