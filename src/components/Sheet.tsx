import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton, cx } from './ui';

const CLOSE_ANIMATION_MS = 260;

interface SheetProps {
  title: string;
  /** Called once the closing animation has finished. Unmount the sheet here. */
  onClose: () => void;
  /** Receives `close`, which plays the exit animation before calling `onClose`. */
  children: (close: () => void) => ReactNode;
}

/**
 * Bottom sheet: dims and blurs the app behind it, slides up from the bottom,
 * locks page scroll, and closes on Escape, backdrop tap or the close button.
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog, unless a field inside it (autoFocus) already took it.
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden
        onClick={close}
        className={cx(
          'absolute inset-0 bg-black/60 backdrop-blur-sm',
          closing ? 'animate-backdrop-out' : 'animate-backdrop-in',
        )}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] outline-none',
          'border border-b-0 border-white/10 bg-slate-950/90 backdrop-blur-2xl',
          'shadow-[0_-20px_80px_-20px_rgba(99,102,241,0.35)]',
          closing ? 'animate-sheet-down' : 'animate-sheet-up',
        )}
      >
        <div className="sticky top-0 z-10 bg-slate-950/80 px-5 pb-3 pt-3 backdrop-blur-xl">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
            <IconButton icon={X} label="Close" onClick={close} className="h-9 w-9" />
          </div>
        </div>
        <div className="space-y-5 px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-2">{children(close)}</div>
      </div>
    </div>
  );
}
