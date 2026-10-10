import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDayLabel, formatDueInDays, formatLedgerDate, ordinal, parseAmount, sanitizeAmountInput, splitCurrency } from './format';

describe('formatDueInDays', () => {
  it('describes upcoming, current and missed due dates', () => {
    expect([5, 2, 1, 0, -1, -3].map(formatDueInDays)).toEqual(['In 5 days', 'In 2 days', 'Tomorrow', 'Today', '1 day overdue', '3 days overdue']);
  });
});

describe('currency', () => {
  it('formats and splits dollars from cents', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(-12)).toBe('-$12.00');
    expect(splitCurrency(1234.5)).toEqual({ whole: '$1,234', fraction: '.50' });
    expect(splitCurrency(-0.05)).toEqual({ whole: '-$0', fraction: '.05' });
  });

  it('reads what people type', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('$12')).toBe(12);
    expect(parseAmount('')).toBeNaN();
    expect(sanitizeAmountInput('12.345.6abc')).toBe('12.34');
    expect(sanitizeAmountInput('.5')).toBe('.5');
  });
});

describe('dates', () => {
  it('labels days relative to today', () => {
    expect(formatDayLabel('2026-10-10', '2026-10-10')).toBe('Today');
    expect(formatDayLabel('2026-10-09', '2026-10-10')).toBe('Yesterday');
    expect(formatDayLabel('2026-10-05', '2026-10-10')).toBe('Mon, Oct 5');
    expect(formatDayLabel('2025-10-05', '2026-10-10')).toBe('Oct 5, 2025');
  });

  it('gives the ledger a date over a weekday, or a year for earlier years', () => {
    expect(formatLedgerDate('2026-10-09', '2026-10-10')).toEqual({ primary: 'Oct 9', secondary: 'Fri' });
    expect(formatLedgerDate('2025-12-31', '2026-10-10')).toEqual({ primary: 'Dec 31', secondary: '2025' });
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
  });
});
