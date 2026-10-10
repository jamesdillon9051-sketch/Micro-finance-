import { describe, expect, it } from 'vitest';
import type { BillReminder, FinanceData, SavingsVault, Transaction } from '../types';
import {
  buildSettingsExport,
  createDefaultFinanceData,
  parseBill,
  parseSettingsExport,
  parseSettingsJson,
  parseTransaction,
} from './schema';

const NOW = new Date(2026, 9, 10, 12);

const transaction: Transaction = {
  id: 't1',
  amount: 42.5,
  category: 'groceries',
  type: 'expense',
  date: '2026-10-09',
  note: 'weekly shop',
  isRecurring: false,
};
const bill: BillReminder = {
  id: 'b1',
  title: 'Internet',
  amount: 60,
  dueDate: 12,
  category: 'utilities',
  isAutoDeduct: true,
  notifiedThisMonth: false,
};
const vault: SavingsVault = {
  id: 'v1',
  name: 'Holiday',
  targetAmount: 2000,
  currentAmount: 350,
  targetDate: '2027-06-01',
  icon: 'plane',
};

const fullData = (): FinanceData => ({
  ...createDefaultFinanceData(NOW),
  transactions: [transaction],
  bills: [bill],
  vaults: [vault],
});

/** A settings document as plain JSON, easy to tamper with in tests. */
const doc = (data: unknown = JSON.parse(JSON.stringify(fullData()))): Record<string, unknown> => ({
  schema: 'micro-finance.settings',
  schemaVersion: 1,
  exportedAt: NOW.toISOString(),
  data,
});

const errorsOf = (value: unknown): string[] => {
  const result = parseSettingsExport(value, NOW);
  if (result.ok) throw new Error('expected the document to be rejected');
  return result.errors;
};

describe('settings document', () => {
  it('round-trips through JSON without losing anything', () => {
    const data = fullData();
    const text = JSON.stringify(buildSettingsExport(data, NOW));
    const result = parseSettingsJson(text, NOW);
    expect(result).toEqual({ ok: true, value: data });
  });

  it('rejects text that is not JSON', () => {
    expect(parseSettingsJson('{nope', NOW)).toEqual({ ok: false, errors: ['The file is not valid JSON'] });
  });

  it('rejects other JSON files and non-objects', () => {
    expect(errorsOf({ hello: 'world' })[0]).toMatch(/not a Micro Finance backup/);
    expect(errorsOf([1, 2])[0]).toMatch(/must be an object/);
    expect(errorsOf(null)[0]).toMatch(/must be an object/);
  });

  it('rejects unsupported and newer schema versions with a clear message', () => {
    expect(errorsOf({ ...doc(), schemaVersion: 2 })[0]).toMatch(/newer version/);
    expect(errorsOf({ ...doc(), schemaVersion: 'one' })[0]).toMatch(/Unsupported schemaVersion/);
  });

  it('treats meta as optional and fills it from the clock', () => {
    const data = JSON.parse(JSON.stringify(fullData())) as Record<string, unknown>;
    delete data['meta'];
    const result = parseSettingsExport(doc(data), NOW);
    expect(result.ok && result.value.meta).toEqual({ billsMonth: '2026-10', lastAutoDeductDate: null, lastSettledThrough: null });
  });

  it('requires every other section', () => {
    for (const key of ['salary', 'transactions', 'bills', 'vaults', 'notifications']) {
      const data = JSON.parse(JSON.stringify(fullData())) as Record<string, unknown>;
      delete data[key];
      expect(errorsOf(doc(data)).join('\n'), key).toContain(`data.${key}`);
    }
  });

  it('reports the path of each problem and applies nothing', () => {
    const data = JSON.parse(JSON.stringify(fullData())) as FinanceData;
    data.transactions[0]!.amount = -5;
    data.salary.allocation = { needs: 50, wants: 30, savings: 10 };
    data.notifications.reminderTime = '25:99';
    data.vaults[0]!.targetDate = '2026-02-30';
    const errors = errorsOf(doc(data)).join('\n');
    expect(errors).toContain('data.transactions[0].amount');
    expect(errors).toContain('percentages must add up to 100');
    expect(errors).toContain('data.notifications.reminderTime');
    expect(errors).toContain('data.vaults[0].targetDate');
  });

  it('rejects duplicate ids within a collection', () => {
    const data = { ...fullData(), transactions: [transaction, { ...transaction, note: 'again' }] };
    expect(errorsOf(doc(JSON.parse(JSON.stringify(data))))[0]).toContain('used more than once');
  });

  it('caps how many errors are reported', () => {
    const data = { ...fullData(), transactions: Array.from({ length: 200 }, () => 'junk') };
    const errors = errorsOf(doc(data));
    expect(errors.length).toBeLessThanOrEqual(26);
  });
});

describe('weekly rollover fields', () => {
  it('rejects a rollover vault that is not in the backup', () => {
    const data = JSON.parse(JSON.stringify(fullData()));
    data.salary.rolloverVaultId = 'ghost';
    expect(errorsOf(doc(data))[0]).toContain('rolloverVaultId');
    data.salary.rolloverVaultId = vault.id;
    expect(parseSettingsExport(doc(data), NOW).ok).toBe(true);
  });

  it('defaults the new fields when an older backup lacks them', () => {
    const data = JSON.parse(JSON.stringify(fullData()));
    delete data.rollovers;
    delete data.salary.rolloverVaultId;
    delete data.meta.lastSettledThrough;
    const result = parseSettingsExport(doc(data), NOW);
    expect(result.ok && [result.value.rollovers, result.value.salary.rolloverVaultId, result.value.meta.lastSettledThrough]).toEqual([
      [],
      null,
      null,
    ]);
  });

  it('validates ledger records', () => {
    const record = {
      id: '2026-10-01:needs',
      weekStart: '2026-10-01',
      weekEnd: '2026-10-07',
      bucket: 'needs',
      amount: 12.5,
      action: 'carried',
      vaultId: null,
      settledOn: '2026-10-08',
    };
    const withRecords = (...records: unknown[]) => doc({ ...JSON.parse(JSON.stringify(fullData())), rollovers: records });
    expect(parseSettingsExport(withRecords(record), NOW).ok).toBe(true);
    expect(errorsOf(withRecords({ ...record, bucket: 'savings' }))[0]).toContain('bucket');
    expect(errorsOf(withRecords({ ...record, amount: 0 }))[0]).toContain('amount');
    expect(errorsOf(withRecords({ ...record, weekEnd: '2026-09-30' }))[0]).toContain('weekEnd');
    expect(errorsOf(withRecords({ ...record, action: 'moved', vaultId: null }))[0]).toContain('vaultId');
    expect(errorsOf(withRecords(record, { ...record }))[0]).toContain('used more than once');
  });
});

describe('entity validation', () => {
  it('rounds money to 2 decimals and drops unknown properties', () => {
    const result = parseTransaction({ ...transaction, amount: 10.126, extra: 'x' });
    expect(result.ok && result.value.amount).toBe(10.13);
    expect(result.ok && 'extra' in result.value).toBe(false);
  });

  it('pairs the category with the transaction type', () => {
    expect(parseTransaction({ ...transaction, category: 'salary' }).ok).toBe(false);
    expect(parseTransaction({ ...transaction, type: 'income', category: 'groceries' }).ok).toBe(false);
    expect(parseTransaction({ ...transaction, type: 'income', category: 'salary' }).ok).toBe(true);
  });

  it('rejects inherited object keys as categories', () => {
    expect(parseTransaction({ ...transaction, category: 'constructor' }).ok).toBe(false);
    expect(parseBill({ ...bill, category: 'toString' }).ok).toBe(false);
  });

  it('rejects zero/negative/NaN amounts and bad days', () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
      expect(parseTransaction({ ...transaction, amount }).ok, String(amount)).toBe(false);
    }
    for (const dueDate of [0, 32, 1.5, '3']) {
      expect(parseBill({ ...bill, dueDate }).ok, String(dueDate)).toBe(false);
    }
  });

  it('requires non-empty titles', () => {
    expect(parseBill({ ...bill, title: '   ' }).ok).toBe(false);
  });
});
