import type { Category } from '../types';
import { categoryColor, categoryMeta } from './meta';

/** A small pill naming a category, with its icon in the bucket's colour (the text stays neutral). */
export function CategoryBadge({ category }: { category: Category }) {
  const meta = categoryMeta(category);
  const color = categoryColor(category);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium text-slate-200"
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}40` }}
    >
      <meta.icon className="h-3 w-3" style={{ color }} aria-hidden />
      {meta.label}
    </span>
  );
}
