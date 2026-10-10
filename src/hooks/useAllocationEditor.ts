import { useCallback, useEffect, useRef, useState } from 'react';
import { parseAmount } from '../lib/format';
import { rebalanceAllocation } from '../lib/engine';
import type { BucketAllocation, BucketKey, Result, SalaryConfig } from '../types';

interface Source {
  salary: SalaryConfig;
  updateSalary: (patch: Partial<SalaryConfig>) => Result<SalaryConfig>;
}

const editable = (amount: number): string => (amount === 0 ? '' : String(amount));

/**
 * Editing state for the salary field and the three percentage sliders.
 *
 * - Moving one slider rebalances the other two so the total stays exactly 100.
 * - The rebalance always starts from where the drag began, so dragging a slider
 *   to an extreme and back restores the original proportions.
 * - Nothing is saved while dragging: call `commitAllocation` on release.
 */
export function useAllocationEditor({ salary, updateSalary }: Source) {
  const [draft, setDraft] = useState<BucketAllocation | null>(null);
  const draftRef = useRef<BucketAllocation | null>(null);
  const dragStart = useRef<BucketAllocation | null>(null);
  const [salaryText, setSalaryText] = useState(() => editable(salary.monthlySalary));
  const [error, setError] = useState<string | null>(null);

  // Keep the field in step when the salary changes from elsewhere (import, reset, another tab).
  useEffect(() => {
    setSalaryText(editable(salary.monthlySalary));
  }, [salary.monthlySalary]);

  const setBucketPercent = useCallback(
    (bucket: BucketKey, percent: number): void => {
      dragStart.current ??= salary.allocation;
      const next = rebalanceAllocation(dragStart.current, bucket, percent);
      draftRef.current = next;
      setDraft(next);
    },
    [salary.allocation],
  );

  const commitAllocation = useCallback((): void => {
    const pending = draftRef.current;
    draftRef.current = null;
    dragStart.current = null;
    setDraft(null);
    if (!pending) return;
    const result = updateSalary({ allocation: pending });
    setError(result.ok ? null : result.errors.join(' '));
  }, [updateSalary]);

  const commitSalary = useCallback((): void => {
    const amount = salaryText.trim() === '' ? 0 : parseAmount(salaryText);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter your monthly salary as a number.');
      return;
    }
    if (amount === salary.monthlySalary) {
      setError(null);
      return;
    }
    const result = updateSalary({ monthlySalary: amount });
    setError(result.ok ? null : result.errors.join(' '));
  }, [salary.monthlySalary, salaryText, updateSalary]);

  return {
    /** What the sliders show: the in-progress drag if there is one, otherwise the saved split. */
    allocation: draft ?? salary.allocation,
    isDragging: draft !== null,
    setBucketPercent,
    commitAllocation,
    salaryText,
    setSalaryText,
    commitSalary,
    error,
  };
}
