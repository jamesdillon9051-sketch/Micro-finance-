import { describe, expect, it } from 'vitest';
import { compactMoney, lighten } from './color';

describe('lighten', () => {
  it('reproduces the shades that passed the colour-blind/ordinal validation', () => {
    expect([0, 0.22, 0.42, 0.62].map((t) => lighten('#3987e5', t))).toEqual(['#3987e5', '#65a1eb', '#8cb9f0', '#b4d1f5']);
    expect([0, 0.22, 0.42, 0.62].map((t) => lighten('#d95926', t))).toEqual(['#d95926', '#e17e56', '#e99f81', '#f1c0ad']);
    expect([0, 0.22, 0.42, 0.62].map((t) => lighten('#199e70', t))).toEqual(['#199e70', '#4cb38f', '#7ac7ac', '#a8dac9']);
  });

  it('goes to white at 1', () => {
    expect(lighten('#123456', 1)).toBe('#ffffff');
  });
});

describe('compactMoney', () => {
  it('abbreviates thousands', () => {
    expect(['0', '999', '1000', '1500', '12000', '125000'].map((v) => compactMoney(Number(v)))).toEqual(['$0', '$999', '$1K', '$1.5K', '$12K', '$125K']);
    expect(compactMoney(-2500)).toBe('-$2.5K');
  });
});
