import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFinanceStore, useFinanceStore } from './useFinanceStore';
import { useAllocationEditor } from './useAllocationEditor';

function setup() {
  const store = createFinanceStore({ storage: null, now: () => new Date(2026, 9, 10, 12) });
  const hook = renderHook(() => useAllocationEditor(useFinanceStore(store)));
  return { store, hook };
}

describe('useAllocationEditor', () => {
  it('rebalances live while dragging but saves nothing until release', () => {
    const { store, hook } = setup();
    act(() => hook.result.current.setBucketPercent('needs', 60));
    expect(hook.result.current.allocation).toEqual({ needs: 60, wants: 24, savings: 16 });
    expect(hook.result.current.isDragging).toBe(true);
    expect(store.getSnapshot().data.salary.allocation).toEqual({ needs: 50, wants: 30, savings: 20 });

    act(() => hook.result.current.commitAllocation());
    expect(store.getSnapshot().data.salary.allocation).toEqual({ needs: 60, wants: 24, savings: 16 });
    expect(hook.result.current.isDragging).toBe(false);
  });

  it('keeps the original proportions when a drag goes to an extreme and comes back', () => {
    const { hook } = setup();
    act(() => hook.result.current.setBucketPercent('needs', 100));
    expect(hook.result.current.allocation).toEqual({ needs: 100, wants: 0, savings: 0 });
    act(() => hook.result.current.setBucketPercent('needs', 50));
    expect(hook.result.current.allocation).toEqual({ needs: 50, wants: 30, savings: 20 });
  });

  it('always totals 100 across a whole drag', () => {
    const { hook } = setup();
    for (let percent = 0; percent <= 100; percent += 7) {
      act(() => hook.result.current.setBucketPercent('wants', percent));
      const { needs, wants, savings } = hook.result.current.allocation;
      expect(needs + wants + savings).toBe(100);
    }
  });

  it('starts a fresh drag from the newly saved split', () => {
    const { hook } = setup();
    act(() => hook.result.current.setBucketPercent('savings', 40));
    act(() => hook.result.current.commitAllocation());
    act(() => hook.result.current.setBucketPercent('needs', 0));
    // from {38, 22, 40}: wants:savings stays 22:40
    expect(hook.result.current.allocation).toEqual({ needs: 0, wants: 35, savings: 65 });
  });

  it('commits the salary on demand, and rejects junk', () => {
    const { store, hook } = setup();
    act(() => hook.result.current.setSalaryText('4250.5'));
    expect(store.getSnapshot().data.salary.monthlySalary).toBe(0);
    act(() => hook.result.current.commitSalary());
    expect(store.getSnapshot().data.salary.monthlySalary).toBe(4250.5);
    expect(hook.result.current.error).toBeNull();

    act(() => hook.result.current.setSalaryText('.'));
    act(() => hook.result.current.commitSalary());
    expect(hook.result.current.error).toMatch(/number/);
    expect(store.getSnapshot().data.salary.monthlySalary).toBe(4250.5);
  });

  it('follows salary changes made elsewhere', () => {
    const { store, hook } = setup();
    act(() => {
      store.actions.updateSalary({ monthlySalary: 3000 });
    });
    expect(hook.result.current.salaryText).toBe('3000');
    act(() => {
      store.actions.resetAll();
    });
    expect(hook.result.current.salaryText).toBe('');
  });
});
