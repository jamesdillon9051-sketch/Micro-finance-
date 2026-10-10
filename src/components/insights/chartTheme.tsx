import type { ReactNode } from 'react';

/** Chart chrome: recessive so the data is the only loud thing. */
export const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 } as const;
export const GRID_STROKE = 'rgba(255,255,255,0.07)';
export const BASELINE_STROKE = 'rgba(255,255,255,0.28)';

/** The glass tooltip every chart shares. */
export function TooltipCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-36 rounded-2xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 text-sm shadow-xl backdrop-blur-xl">
      <p className="font-semibold text-white">{title}</p>
      <div className="mt-1 space-y-0.5 text-slate-300">{children}</div>
    </div>
  );
}

export function TooltipRow({ swatch, label, value }: { swatch?: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-slate-400">
        {swatch && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: swatch }} aria-hidden />}
        {label}
      </span>
      <span className="font-medium text-white">{value}</span>
    </p>
  );
}
