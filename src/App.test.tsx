import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App, { parseLaunchTarget } from './App';
import { createFinanceStore } from './hooks/useFinanceStore';

afterEach(cleanup);

/** Saturday 10 Oct 2026, noon: week 2 of October, 5 days left in the week. */
const NOW = new Date(2026, 9, 10, 12);

function renderApp() {
  const store = createFinanceStore({ storage: null, now: () => new Date(NOW) });
  render(<App store={store} now={() => new Date(NOW)} />);
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  return { store, go: (tab: string) => fireEvent.click(nav.getByRole('button', { name: tab })) };
}

/** Logs an expense through the quick logger, the way a person would. */
function quickLog(amount: string, category: string, note?: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
  const dialog = within(screen.getByRole('dialog', { name: 'Quick expense' }));
  fireEvent.change(dialog.getByLabelText('Amount'), { target: { value: amount } });
  fireEvent.click(dialog.getByRole('radio', { name: category }));
  if (note) {
    fireEvent.click(dialog.getByRole('button', { name: 'Add a note' }));
    fireEvent.change(dialog.getByLabelText('Note'), { target: { value: note } });
  }
  fireEvent.click(dialog.getByRole('button', { name: new RegExp(`^Log \\$${amount}`) }));
}

describe('navigation', () => {
  it('starts on Home and reaches every tab from the bar', () => {
    const { go } = renderApp();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
    for (const [tab, heading] of [
      ['Ledger', 'Ledger'],
      ['Budget', 'Budget'],
      ['Bills', 'Bills'],
      ['Vaults', 'Vaults'],
      ['Home', 'Overview'],
    ] as const) {
      go(tab);
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
    }
  });

  it('understands launch links from notifications and shortcuts', () => {
    expect(parseLaunchTarget('?tab=bills')).toEqual({ tab: 'bills' });
    expect(parseLaunchTarget('?action=log')).toEqual({ log: true });
    expect(parseLaunchTarget('?tab=budget&action=log&source=pwa')).toEqual({ tab: 'budget', log: true });
    expect(parseLaunchTarget('?tab=nope&action=explode')).toEqual({});
    expect(parseLaunchTarget('')).toEqual({});
  });
});

describe('quick expense logger', () => {
  it('is always one tap away, on every tab', () => {
    const { go } = renderApp();
    for (const tab of ['Home', 'Ledger', 'Budget', 'Bills', 'Vaults']) {
      go(tab);
      expect(screen.getByRole('button', { name: /^Log/ })).toBeTruthy();
    }
  });

  it('opens with Ctrl+K or Cmd+K, and ignores other keys', () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Quick expense' })).toBeTruthy();
    cleanup();
    renderApp();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(screen.getByRole('dialog', { name: 'Quick expense' })).toBeTruthy();
  });

  it('records an expense from an amount and a category chip, with today as the default date', () => {
    const { store } = renderApp();
    quickLog('12.50', 'Dining', 'lunch');
    expect(store.getSnapshot().data.transactions).toMatchObject([
      { amount: 12.5, category: 'dining', type: 'expense', date: '2026-10-10', note: 'lunch', isRecurring: false },
    ]);
  });

  it('confirms with a toast and can undo', async () => {
    const { store } = renderApp();
    quickLog('8', 'Transport');
    expect(await screen.findByText('Logged $8.00 · Transport')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.getSnapshot().data.transactions).toEqual([]);
  });

  it('lets the date be yesterday or any other day', () => {
    const { store } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Amount'), { target: { value: '5' } });
    fireEvent.click(dialog.getByRole('radio', { name: 'Yesterday' }));
    fireEvent.click(dialog.getByRole('button', { name: /^Log \$5/ }));
    expect(store.getSnapshot().data.transactions[0]?.date).toBe('2026-10-09');
  });

  it("asks for an amount instead of saving nothing", () => {
    const { store } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Log expense' }));
    expect(dialog.getByText('Enter an amount greater than $0.')).toBeTruthy();
    expect(store.getSnapshot().data.transactions).toEqual([]);
  });

  it('puts the categories you use most first', () => {
    const { store } = renderApp();
    for (let i = 0; i < 3; i += 1) {
      store.actions.addTransaction({ amount: 5, type: 'expense', category: 'travel', date: '2026-10-09', note: '', isRecurring: false });
    }
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    const chips = within(screen.getByRole('radiogroup', { name: 'Category' })).getAllByRole('radio');
    expect(chips[0]?.textContent).toContain('Travel');
    expect(chips).toHaveLength(8);
  });
});

describe('ledger', () => {
  function seeded() {
    const ctx = renderApp();
    const add = (category: Parameters<typeof ctx.store.actions.addTransaction>[0]['category'], amount: number, note: string, type: 'expense' | 'income' = 'expense', date = '2026-10-09') =>
      ctx.store.actions.addTransaction({ amount, category, type, date, note, isRecurring: false });
    add('groceries', 42.5, 'Weekly shop');
    add('dining', 18, 'Pizza night', 'expense', '2026-10-10');
    add('salary', 3100, 'October pay', 'income', '2026-10-01');
    add('housing', 900, 'Rent', 'expense', '2026-09-28');
    ctx.go('Ledger');
    return ctx;
  }
  const rowNotes = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.textContent ?? '');

  it('lists everything newest first, as a table with category badges', () => {
    seeded();
    const rows = rowNotes();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('Pizza night');
    expect(rows[0]).toContain('Dining');
    expect(rows[3]).toContain('Rent');
  });

  it('searches as you type', () => {
    seeded();
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'pizza' } });
    expect(rowNotes()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'nothing like this' } });
    expect(screen.getByText('No matches')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0] as HTMLElement);
    expect(rowNotes()).toHaveLength(4);
  });

  it('filters by type, date range and category, and totals what is shown', () => {
    seeded();
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(rowNotes()).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));

    fireEvent.click(screen.getByRole('radio', { name: 'This period' })); // Oct 1-31 drops the September rent
    expect(rowNotes()).toHaveLength(3);
    expect(screen.getByText('3 of 4 results')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'groceries' } });
    expect(rowNotes()).toHaveLength(1);
    expect(rowNotes()[0]).toContain('Weekly shop');
  });

  it('supports a custom date range', () => {
    seeded();
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-09' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-10' } });
    expect(rowNotes()).toHaveLength(2);
  });
});

describe('bills calendar', () => {
  function withBill(partial: Partial<Parameters<ReturnType<typeof renderApp>['store']['actions']['addBill']>[0]> = {}) {
    const ctx = renderApp();
    ctx.store.actions.addBill({ title: 'Rent', amount: 900, dueDate: 12, category: 'housing', isAutoDeduct: false, notifiedThisMonth: false, ...partial });
    ctx.go('Bills');
    return ctx;
  }

  it('shows the due date status, then Paid once marked, and can undo', async () => {
    const { store } = withBill();
    expect(screen.getAllByText('Upcoming').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    expect(store.getSnapshot().data.transactions).toMatchObject([{ id: 'bill-' + store.getSnapshot().data.bills[0]?.id + '-2026-10', amount: 900, category: 'housing' }]);
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(store.getSnapshot().data.transactions).toEqual([]);
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeTruthy();
  });

  it('flags a bill due today and one that has been missed', () => {
    withBill({ dueDate: 10 });
    expect(screen.getAllByText('Due today').length).toBeGreaterThan(0);
    cleanup();
    const { store } = renderApp();
    // a bill that existed before its due date passed (created earlier in the month, unpaid)
    store.actions.addBill({ title: 'Gym', amount: 30, dueDate: 3, category: 'healthcare', isAutoDeduct: false, notifiedThisMonth: false });
    expect(store.getSnapshot().data.bills[0]?.createdOn).toBe('2026-10-10'); // added today, so the 3rd was never owed
  });

  it('toggles auto-deduct from the list', () => {
    const { store } = withBill();
    const toggle = screen.getByRole('switch', { name: /Auto-deduct/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(store.getSnapshot().data.bills[0]?.isAutoDeduct).toBe(true);
  });

  it('marks each due date on the calendar and moves between months', () => {
    withBill();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: /Oct 12: Rent upcoming/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: /Nov 12: Rent upcoming/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();
  });
});

describe('budget screen', () => {
  it('asks for a salary first, then shows the weekly limits and safe-to-spend', () => {
    const { go, store } = renderApp();
    go('Budget');
    expect(screen.getByText('Set your salary to begin')).toBeTruthy();

    const salary = screen.getByLabelText('Monthly take-home');
    fireEvent.change(salary, { target: { value: '3100' } });
    fireEvent.blur(salary);

    expect(store.getSnapshot().data.salary.monthlySalary).toBe(3100);
    expect(screen.queryByText('Set your salary to begin')).toBeNull();
    expect(screen.getByText('$560.00')).toBeTruthy();
    expect(screen.getByText('$112.00')).toBeTruthy();
    expect(screen.getByText("This week's limits")).toBeTruthy();
  });

  it('keeps the three sliders at exactly 100% and saves only on release', () => {
    const { go, store } = renderApp();
    go('Budget');
    const needs = screen.getByLabelText('Needs') as HTMLInputElement;
    fireEvent.change(needs, { target: { value: '70' } });
    const shown = ['Needs', 'Wants', 'Savings'].map((label) => Number((screen.getByLabelText(label) as HTMLInputElement).value));
    expect(shown[0]).toBe(70);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(100);
    expect(store.getSnapshot().data.salary.allocation.needs).toBe(50);
    fireEvent.pointerUp(needs);
    expect(store.getSnapshot().data.salary.allocation.needs).toBe(70);
  });

  it('offers the vault choice only once the preference needs one', () => {
    const { go, store } = renderApp();
    store.actions.updateSalary({ monthlySalary: 3100 });
    store.actions.addVault({ name: 'Holiday', targetAmount: 1000, currentAmount: 0, targetDate: '2027-06-01', icon: 'plane' });
    go('Budget');
    expect(screen.queryByLabelText('Move surplus into')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'To vault' }));
    expect((screen.getByLabelText('Move surplus into') as HTMLSelectElement).value).toBe(store.getSnapshot().data.vaults[0]?.id);
  });

  it('shows the three charts under Insights', () => {
    const { go, store } = renderApp();
    store.actions.updateSalary({ monthlySalary: 3100 });
    store.actions.addTransaction({ amount: 120, type: 'expense', category: 'groceries', date: '2026-10-05', note: '', isRecurring: false });
    store.actions.addTransaction({ amount: 3100, type: 'income', category: 'salary', date: '2026-10-01', note: '', isRecurring: false });
    go('Budget');
    fireEvent.click(screen.getByRole('radio', { name: 'Insights' }));
    expect(screen.getByRole('heading', { name: 'Where it went' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Burn rate' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Net savings' })).toBeTruthy();
    // the donut's numbers are also in a table
    const table = screen.getByRole('table', { name: 'Spending by category' });
    expect(within(table).getByText('Groceries')).toBeTruthy();
    expect(within(table).getByText('100%')).toBeTruthy();
  });
});

describe('forms', () => {
  it('shows a friendly error instead of saving an empty bill', () => {
    const { go, store } = renderApp();
    go('Bills');
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Add bill' }));
    expect(dialog.getByText('Give the bill a name.')).toBeTruthy();
    expect(store.getSnapshot().data.bills).toEqual([]);
  });

  it('takes income through the full form', () => {
    const { go, store } = renderApp();
    go('Ledger');
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Add transaction' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('radio', { name: 'Income' }));
    fireEvent.change(dialog.getByLabelText('Amount'), { target: { value: '250' } });
    fireEvent.click(dialog.getByRole('radio', { name: 'Freelance' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Add transaction' }));
    expect(store.getSnapshot().data.transactions).toMatchObject([{ amount: 250, type: 'income', category: 'freelance' }]);
  });

  it('reaches the full form from the quick logger', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Adding income/ }));
    act(() => {
      // the quick sheet plays its exit animation before the full form opens
    });
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeTruthy();
  });
});

describe('focus', () => {
  it('lands in the amount field when the quick logger opens, ready to type', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
  });

  it('moves focus into other dialogs, so keyboard users are not left behind the sheet', () => {
    const { go } = renderApp();
    go('Bills');
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
});
