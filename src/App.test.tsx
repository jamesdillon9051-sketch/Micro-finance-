import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createFinanceStore } from './hooks/useFinanceStore';

afterEach(cleanup);

/** Saturday 10 Oct 2026, noon: week 2 of October, 5 days left in the week. */
const NOW = new Date(2026, 9, 10, 12);

function renderApp() {
  const store = createFinanceStore({ storage: null, now: () => new Date(NOW) });
  render(<App store={store} />);
  const nav = within(screen.getByRole('navigation', { name: 'Main' }));
  return { store, go: (tab: string) => fireEvent.click(nav.getByRole('button', { name: tab })) };
}

describe('App', () => {
  it('starts on Home and reaches every tab from the bar', () => {
    const { go } = renderApp();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
    for (const [tab, heading] of [
      ['Activity', 'Activity'],
      ['Budget', 'Budget'],
      ['Bills', 'Bills'],
      ['Vaults', 'Vaults'],
      ['Home', 'Overview'],
    ] as const) {
      go(tab);
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
    }
  });

  it('asks for a salary first, then shows the weekly limits and safe-to-spend', () => {
    const { go, store } = renderApp();
    go('Budget');
    expect(screen.getByText('Set your salary to begin')).toBeTruthy();

    const salary = screen.getByLabelText('Monthly take-home');
    fireEvent.change(salary, { target: { value: '3100' } });
    fireEvent.blur(salary);

    expect(store.getSnapshot().data.salary.monthlySalary).toBe(3100);
    expect(screen.queryByText('Set your salary to begin')).toBeNull();
    // (350 + 210) / 5 days left in the week
    expect(screen.getByText('Safe to spend today')).toBeTruthy();
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
    expect(store.getSnapshot().data.salary.allocation.needs).toBe(50); // still dragging

    fireEvent.pointerUp(needs);
    expect(store.getSnapshot().data.salary.allocation.needs).toBe(70);
  });

  it('records a transaction from the sheet and lowers the safe-to-spend amount', () => {
    const { go, store } = renderApp();
    store.actions.updateSalary({ monthlySalary: 3100 });

    go('Activity');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Amount'), { target: { value: '60' } });
    fireEvent.click(dialog.getByRole('radio', { name: 'Groceries' }));
    fireEvent.change(dialog.getByLabelText('Note'), { target: { value: 'weekly shop' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add transaction' }));

    expect(store.getSnapshot().data.transactions).toMatchObject([
      { amount: 60, category: 'groceries', type: 'expense', date: '2026-10-10', note: 'weekly shop' },
    ]);
    expect(screen.getByText('weekly shop')).toBeTruthy();

    go('Budget');
    // (560 - 60) / 5
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('shows a friendly error instead of saving an empty form', () => {
    const { go, store } = renderApp();
    go('Bills');
    fireEvent.click(screen.getByRole('button', { name: 'Add bill' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Add bill' }));
    expect(dialog.getByText('Give the bill a name.')).toBeTruthy();
    expect(store.getSnapshot().data.bills).toEqual([]);
  });

  it('offers the vault choice only once the preference needs one', () => {
    const { go, store } = renderApp();
    store.actions.updateSalary({ monthlySalary: 3100 });
    store.actions.addVault({
      name: 'Holiday',
      targetAmount: 1000,
      currentAmount: 0,
      targetDate: '2027-06-01',
      icon: 'plane',
    });
    go('Budget');
    expect(screen.queryByLabelText('Move surplus into')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'To vault' }));
    expect((screen.getByLabelText('Move surplus into') as HTMLSelectElement).value).toBe(
      store.getSnapshot().data.vaults[0]?.id,
    ); // the only vault is preselected
    expect(store.getSnapshot().data.salary.rolloverPreference).toBe('move-to-savings');
  });
});
