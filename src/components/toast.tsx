import { CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  message: string;
  action?: ToastAction | undefined;
  /** How long it stays, in ms. 0 keeps it until dismissed. */
  duration?: number | undefined;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

const DEFAULT_DURATION_MS = 5000;

/** Lets any component raise a brief message, optionally with an action such as Undo. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>((options) => {
    const id = nextId.current++;
    // One at a time keeps the screen calm: a new message replaces the old one.
    setToasts([{ ...options, id }]);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const duration = toast.duration ?? DEFAULT_DURATION_MS;

  useEffect(() => {
    if (duration === 0) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      className={cx(
        'pointer-events-auto flex w-full animate-pop items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 py-3 pl-4 pr-2 text-sm text-white',
        'shadow-2xl shadow-black/60 backdrop-blur-xl',
      )}
    >
      <CircleCheck className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="rounded-xl px-3 py-2 font-semibold text-indigo-300 transition-all duration-300 hover:bg-white/10 active:scale-95"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded-full p-2 text-slate-400 transition-all duration-300 hover:bg-white/10 hover:text-white active:scale-90"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
