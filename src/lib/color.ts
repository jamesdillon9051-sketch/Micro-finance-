/** Mixes a `#rrggbb` colour toward white by `amount` (0 = unchanged, 1 = white). */
export function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channel = (offset: number): string => {
    const base = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(base + (255 - base) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** Whole-dollar amounts with K for thousands, for axis ticks: `$0`, `$500`, `$1.5K`, `$12K`. */
export function compactMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1000) return `${sign}$${Math.round(abs)}`;
  const thousands = abs / 1000;
  return `${sign}$${Number.isInteger(thousands) || thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}K`;
}
