export type TransactionType = 'expense' | 'income';

export type AdvisorMode = 'amable' | 'reganon';

export type PaymentMethod = 'efectivo' | 'debito' | 'credito' | 'digital' | 'otro';

export interface TransactionInput {
  amount: number;
  categoryId: string;
  note?: string;
  type: TransactionType;
  date: string;
  paymentMethod: PaymentMethod;
}

export interface Transaction extends TransactionInput {
  id: string;
  userId?: string;
}

export interface ParsedTransactionSuggestion extends TransactionInput {
  confidence?: number;
  rawText?: string;
}

export interface SpendingSummaryCard {
  title: string;
  value: string;
  detail: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface Budget {
  month: string; // YYYY-MM
  total: number;
  perCategory?: Record<string, number>;
  updatedAt?: string;
}

export interface Category {
  id: string; // Ej: 'comida' (mantiene compatibilidad)
  label: string; // Ej: 'Alimentacion'
  icon: string; // Nombre del icono Lucide (Ej: 'Utensils')
  color?: string;
  order: number;
  isArchived?: boolean;
  isSystem?: boolean;
}

export interface Template {
  id: string;
  name: string;
  categoryId?: string;
  amount?: number;
  note?: string;
  paymentMethod?: PaymentMethod;
  type?: TransactionType;
  userId?: string;
  recurring?: boolean;
  frequency?: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  lastUsedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IaQuota {
  role: UserRole;
  parseUsed: number;
  parseLimit: number;
  analyzeUsed: number;
  analyzeLimit: number;
  week?: string;
  resetAt?: string;
}

export type UserRole = 'admin' | 'free' | 'paid_byok' | 'paid_managed' | 'gifted_managed';
export type KeyPreference = 'byok' | 'managed';

export interface SubscriptionInfo {
  status: 'active' | 'expired';
  source: 'manual' | 'stripe' | 'promo' | 'wompi';
  expiresAt?: number | null;
}

export interface UserProfile {
  role: UserRole;
  openaiKeyStored: boolean;
  preferredKey?: KeyPreference;
  subscription: SubscriptionInfo;
  advisorMode?: AdvisorMode;
}

export type PlanPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export interface PlanPeriodInfo {
  period: PlanPeriod;
  months: number;
  discount: number;
  totalCents: number | null;
}

export interface PlanInfo {
  id: 'plan_byok' | 'plan_pro';
  label: string;
  currency: string;
  promoActive: boolean;
  promoEndsAt: number | null;
  basePriceCents: number;
  promoPriceCents: number | null;
  periods: PlanPeriodInfo[];
}
