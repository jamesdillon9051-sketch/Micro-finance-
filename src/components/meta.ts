import {
  Award,
  Banknote,
  Briefcase,
  Car,
  Clapperboard,
  Coins,
  CreditCard,
  Ellipsis,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  LifeBuoy,
  PiggyBank,
  Plane,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Umbrella,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { isExpenseCategory } from '../lib/budget';
import {
  CATEGORY_BUCKET,
  type BucketKey,
  type Category,
  type ExpenseCategory,
  type IncomeCategory,
  type VaultIcon,
} from '../types';

/**
 * Bucket colours are the first three slots of the reference categorical palette
 * (dark mode), validated for colour-blind separation on the card surface.
 * Bucket identity is the only thing these hues mean - alerts use rose/amber.
 */
export const BUCKET_META: Record<BucketKey, { label: string; color: string; blurb: string }> = {
  needs: { label: 'Needs', color: '#3987e5', blurb: 'Rent, bills, groceries' },
  wants: { label: 'Wants', color: '#d95926', blurb: 'Fun, dining, shopping' },
  savings: { label: 'Savings', color: '#199e70', blurb: 'Goals and investing' },
};

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
}

export const EXPENSE_META: Record<ExpenseCategory, CategoryMeta> = {
  housing: { label: 'Housing', icon: House },
  utilities: { label: 'Utilities', icon: Zap },
  groceries: { label: 'Groceries', icon: ShoppingCart },
  transport: { label: 'Transport', icon: Car },
  healthcare: { label: 'Health', icon: HeartPulse },
  insurance: { label: 'Insurance', icon: ShieldCheck },
  debt: { label: 'Debt', icon: CreditCard },
  education: { label: 'Education', icon: GraduationCap },
  dining: { label: 'Dining', icon: UtensilsCrossed },
  entertainment: { label: 'Entertainment', icon: Clapperboard },
  shopping: { label: 'Shopping', icon: ShoppingBag },
  subscriptions: { label: 'Subscriptions', icon: Repeat },
  travel: { label: 'Travel', icon: Plane },
  'personal-care': { label: 'Self care', icon: Sparkles },
  gifts: { label: 'Gifts', icon: Gift },
  'other-wants': { label: 'Other', icon: Ellipsis },
  'savings-contribution': { label: 'Saving', icon: PiggyBank },
  investments: { label: 'Investing', icon: TrendingUp },
  'emergency-fund': { label: 'Emergency', icon: LifeBuoy },
};

export const INCOME_META: Record<IncomeCategory, CategoryMeta> = {
  salary: { label: 'Salary', icon: Banknote },
  bonus: { label: 'Bonus', icon: Award },
  freelance: { label: 'Freelance', icon: Laptop },
  'investment-income': { label: 'Returns', icon: TrendingUp },
  'gift-received': { label: 'Gift', icon: Gift },
  'other-income': { label: 'Other', icon: Coins },
};

export function categoryMeta(category: Category): CategoryMeta {
  return isExpenseCategory(category) ? EXPENSE_META[category] : INCOME_META[category];
}

export const INCOME_COLOR = '#34d399';

/** The tint behind a category icon: its bucket's colour for expenses, emerald for income. */
export function categoryColor(category: Category): string {
  return isExpenseCategory(category) ? BUCKET_META[CATEGORY_BUCKET[category]].color : INCOME_COLOR;
}

export const VAULT_ICON_COMPONENTS: Record<VaultIcon, LucideIcon> = {
  'piggy-bank': PiggyBank,
  home: House,
  car: Car,
  plane: Plane,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  gift: Gift,
  briefcase: Briefcase,
  smartphone: Smartphone,
  umbrella: Umbrella,
};
