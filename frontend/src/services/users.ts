import {
  callClearUserOpenAIKey,
  callGetUserProfile,
  callListUsers,
  callSetUserKeyPreference,
  callSetUserOpenAIKey,
  callSetUserRole,
  callRegisterUserEntry,
  callGetUsageQuota,
  callGetPlans,
  callCreateWompiCheckout,
} from './functions';
import type { KeyPreference, UserProfile, UserRole, PlanInfo, PlanPeriod } from '../types';

export interface AdminListedUser {
  uid: string;
  profile: UserProfile;
  createdAt: number | null;
  updatedAt: number | null;
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const resp = await callGetUserProfile();
  const data = resp.data as { profile?: UserProfile };
  return data?.profile ?? null;
}

export async function saveUserOpenAIKey(openaiKey: string, preferredKey?: KeyPreference) {
  await callSetUserOpenAIKey({ openaiKey, preferredKey });
}

export async function clearUserOpenAIKey() {
  await callClearUserOpenAIKey();
}

export async function updatePreferredKey(preferredKey: KeyPreference) {
  await callSetUserKeyPreference({ preferredKey });
}

export async function fetchUsersList(): Promise<AdminListedUser[]> {
  const resp = await callListUsers();
  const data = resp.data as { users?: AdminListedUser[] };
  return data?.users ?? [];
}

export async function adminSetUserRole(params: {
  uid: string;
  role: UserRole;
  preferredKey?: KeyPreference;
  subscription?: { status?: 'active' | 'expired'; source?: 'manual' | 'stripe' | 'promo'; expiresAt?: number | null };
}) {
  await callSetUserRole(params);
}

export async function registerUserEntry(): Promise<UserProfile | null> {
  const resp = await callRegisterUserEntry();
  const data = resp.data as { profile?: UserProfile };
  return data?.profile ?? null;
}

export interface UsageQuota {
  week: string;
  parse: { used: number; limit: number };
  analyze: { used: number; limit: number };
}

export async function fetchUsageQuota(): Promise<UsageQuota | null> {
  const resp = await callGetUsageQuota();
  const data = resp.data as UsageQuota;
  return data ?? null;
}

export async function fetchPlans(): Promise<PlanInfo[]> {
  const resp = await callGetPlans();
  const data = resp.data as { plans?: PlanInfo[] };
  return data?.plans ?? [];
}

export async function createWompiCheckout(planId: 'plan_byok' | 'plan_pro', period: PlanPeriod) {
  const resp = await callCreateWompiCheckout({ planId, period });
  return resp.data as {
    planId: string;
    period: PlanPeriod;
    reference: string;
    amountInCents: number;
    currency: string;
    url: string;
  };
}
