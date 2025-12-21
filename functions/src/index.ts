/* eslint-disable max-len, require-jsdoc, operator-linebreak, quotes */
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import * as admin from "firebase-admin";
import crypto from "crypto";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall, onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {setGlobalOptions} from "firebase-functions/v2/options";
import OpenAI from "openai";
import {toFile} from "openai/uploads";

setGlobalOptions({region: "us-central1", maxInstances: 10});

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const auth = admin.auth();
const secretManager = new SecretManagerServiceClient();
const firebaseConfig =
  process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : undefined;
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  firebaseConfig?.projectId ||
  firebaseConfig?.project_id;

const openAIApiKey = defineSecret("OPENAI_API_KEY");
const maxUsers = Number(process.env.MAX_USERS || process.env.MAX_USER_COUNT || 0);
const wompiEventHashKey = process.env.WOMPI_EVENT_HASH_KEY || "";
const wompiDefaultDays = Number(process.env.WOMPI_DEFAULT_DAYS || 30);
const wompiPlanCurrency = (process.env.WOMPI_PLAN_CURRENCY || "COP").toUpperCase();
const wompiPlanByokPrice = Number(process.env.WOMPI_PLAN_BYOK_PRICE || 0);
const wompiPlanByokPromo = Number(process.env.WOMPI_PLAN_BYOK_PROMO || 0);
const wompiPlanByokPromoEnd = process.env.WOMPI_PLAN_BYOK_PROMO_END || "";
const wompiPlanProPrice = Number(process.env.WOMPI_PLAN_PRO_PRICE || 0);
const wompiPlanProPromo = Number(process.env.WOMPI_PLAN_PRO_PROMO || 0);
const wompiPlanProPromoEnd = process.env.WOMPI_PLAN_PRO_PROMO_END || "";
const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY || "";
const wompiIntegrityKey = process.env.WOMPI_INTEGRITY_KEY || "";
const wompiRedirectUrl = process.env.WOMPI_REDIRECT_URL || "";

type UserRole = "admin" | "free" | "paid_byok" | "paid_managed" | "gifted_managed";
type KeyPreference = "byok" | "managed";
type SubscriptionStatus = "active" | "expired";
type SubscriptionSource = "manual" | "stripe" | "promo" | "wompi";
type UsageKey = "parse" | "analyze";
type PlanId = "plan_byok" | "plan_pro";
type PlanPeriod = "monthly" | "quarterly" | "semiannual" | "annual";
type TargetPlan = "byok" | "pro";
type PaymentStatus = "PENDING" | "APPROVED" | "DECLINED" | "ERROR";

interface UserProfile {
  role: UserRole;
  openaiKeyStored: boolean;
  preferredKey?: KeyPreference | null;
  advisorMode?: AdvisorMode | null;
  subscription: {
    status: SubscriptionStatus;
    source: SubscriptionSource;
    expiresAt?: FirebaseFirestore.Timestamp | number | null;
    updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  };
  createdAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface ResolvedUserProfile {
  role: UserRole;
  openaiKeyStored: boolean;
  preferredKey?: KeyPreference;
  advisorMode?: AdvisorMode;
  subscription: {
    status: SubscriptionStatus;
    source: SubscriptionSource;
    expiresAt?: number;
    updatedAt?: number;
  };
}

type AdvisorMode = "amable" | "reganon";

interface SpendingSummary {
  month?: string;
  totalExpense?: number;
  totalIncome?: number;
  topCategories?: {category: string; amount: number}[];
  budget?: number;
  lastTransactions?: {
    amount: number;
    category: string;
    type: "expense" | "income";
    date: string;
    note?: string;
  }[];
  previousMonthExpense?: number;
  previousMonthIncome?: number;
}

interface ParsedTransaction {
  amount: number;
  category: string;
  categoryId?: string;
  note?: string;
  paymentMethod: "efectivo" | "debito" | "credito" | "digital" | "otro";
  type: "expense" | "income";
  date: string;
  confidence?: number;
  rawText?: string;
  categoryFallback?: boolean;
  categoryFallbackReason?: CategoryFallbackReason;
}

type CategoryFallbackReason = "explicit_other" | "no_match" | "ambiguous" | "empty";

interface CategoryCatalogEntry {
  id: string;
  label: string;
}

type CategoryResolution = {
  categoryId: string;
  fallbackReason?: CategoryFallbackReason;
};

interface CategoryCatalogCacheEntry {
  cachedAt: number;
  expiresAt: number;
  categoriesUpdatedAtSeen: number | null;
  data: CategoryCatalogEntry[];
}

const CATEGORY_CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CATEGORY_ID = "otros";
const categoryCatalogCache = new Map<
  string,
  CategoryCatalogCacheEntry
>();

const defaultUserProfile = (): UserProfile => ({
  role: "free",
  openaiKeyStored: false,
  advisorMode: "amable",
  subscription: {status: "expired", source: "manual"},
});

function normalizeUserProfile(data?: Partial<UserProfile>): ResolvedUserProfile {
  const subscription = data?.subscription ?? {status: "expired", source: "manual"};
  const expiresAtRaw = (
    subscription as {expiresAt?: FirebaseFirestore.Timestamp | number | null | undefined}
  ).expiresAt;
  let expiresAt: number | undefined;
  if (typeof expiresAtRaw === "number") {
    expiresAt = expiresAtRaw;
  } else if (
    expiresAtRaw &&
    typeof (expiresAtRaw as FirebaseFirestore.Timestamp).toMillis === "function"
  ) {
    expiresAt = (expiresAtRaw as FirebaseFirestore.Timestamp).toMillis();
  }
  const preferredRaw = (data?.preferredKey as KeyPreference | null | undefined) ?? undefined;
  const preferred =
    preferredRaw === "byok" || preferredRaw === "managed" ? preferredRaw : undefined;
  const advisorMode = clientSupportedMode((data?.advisorMode as string) ?? "")
    ? ((data?.advisorMode as AdvisorMode) ?? "amable")
    : "amable";

  return {
    role: (data?.role as UserRole) ?? "free",
    openaiKeyStored: data?.openaiKeyStored ?? false,
    preferredKey: preferred,
    advisorMode,
    subscription: {
      status: (subscription.status as SubscriptionStatus) ?? "expired",
      source: (subscription.source as SubscriptionSource) ?? "manual",
      expiresAt,
    },
  };
}

interface UsageDoc {
  week: string;
  parse?: number;
  analyze?: number;
  // Retrocompatibilidad con esquema anterior basado en dia
  date?: string;
}

interface WompiTransaction {
  status?: string;
  reference?: string;
  amount_in_cents?: number;
  currency?: string;
  id?: string;
  customer_email?: string;
  created_at?: string;
  payment_method_type?: string;
}

type Payment = {
  transactionId: string;
  uid: string;
  targetPlan: TargetPlan;
  months: number;
  amountInCents: number;
  currency: string;
  reference: string;
  status: PaymentStatus;
  processed: boolean;
  webhookCount: number;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  lastWebhookAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
};

interface WompiEvent {
  event?: string;
  data?: {transaction?: WompiTransaction};
  transaction?: WompiTransaction;
  signature?: {checksum?: string; properties?: string[]};
}

interface PlanConfig {
  id: PlanId;
  label: string;
  basePriceCents: number;
  promoPriceCents?: number;
  promoEndsAt?: number | null;
}

async function ensureUserCapacity() {
  if (!maxUsers || Number.isNaN(maxUsers)) return;
  const countSnap = await firestore.collection("users").count().get();
  const current = countSnap.data().count || 0;
  if (current >= maxUsers) {
    throw new HttpsError(
      "resource-exhausted",
      "Capacidad de usuarios alcanzada. Intenta más tarde.",
    );
  }
}

function sanitizePreferredKey(
  role: UserRole,
  preferredKey: KeyPreference | null | undefined,
  hasByok: boolean,
): KeyPreference | null {
  if (role === "free") {
    return null;
  }
  if (role === "paid_byok") {
    if (preferredKey === "byok" && hasByok) return "byok";
    if (preferredKey === "managed") return "managed";
    return hasByok ? "byok" : "managed";
  }
  if (role === "paid_managed" || role === "gifted_managed" || role === "admin") {
    if (preferredKey === "managed") return "managed";
    if (preferredKey === "byok" && hasByok) return "byok";
    return "managed";
  }
  return null;
}

async function getOrCreateUserProfile(uid: string): Promise<ResolvedUserProfile> {
  const ref = firestore.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ensureUserCapacity();
    const payload: UserProfile = {
      ...defaultUserProfile(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(payload);
    return normalizeUserProfile(payload);
  }
  return normalizeUserProfile(snap.data() as Partial<UserProfile> | undefined);
}

async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  const ref = firestore.doc(`users/${uid}`);
  await ref.set(
    {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

function subscriptionIsActive(profile: ResolvedUserProfile): boolean {
  if (profile.role === "gifted_managed" || profile.role === "admin") return true;
  if (profile.role !== "paid_managed") return false;
  if (profile.subscription.status !== "active") return false;
  if (profile.subscription.expiresAt && profile.subscription.expiresAt < Date.now()) {
    return false;
  }
  return true;
}

function membershipExpired(profile: ResolvedUserProfile): boolean {
  const expiresAt =
    typeof profile.subscription.expiresAt === "number"
      ? profile.subscription.expiresAt
      : (profile.subscription.expiresAt as admin.firestore.Timestamp | undefined)?.toMillis?.();
  if (profile.subscription.status !== "active") return true;
  if (expiresAt && expiresAt < Date.now()) return true;
  return false;
}

function ensureProjectId(): string {
  if (!projectId) {
    throw new HttpsError("internal", "ProjectId no esta configurado.");
  }
  return projectId;
}

function userSecretName(uid: string): string {
  const pid = ensureProjectId();
  return `projects/${pid}/secrets/user-openai-${uid}`;
}

async function ensureUserSecretExists(uid: string): Promise<string> {
  const name = userSecretName(uid);
  try {
    await secretManager.getSecret({name});
    return name;
  } catch (error: unknown) {
    const err = error as {code?: number};
    if (err?.code === 5 || err?.code === 404) {
      await secretManager.createSecret({
        parent: `projects/${ensureProjectId()}`,
        secretId: `user-openai-${uid}`,
        secret: {replication: {automatic: {}}},
      });
      return name;
    }
    throw error;
  }
}

async function saveUserOpenAIKey(uid: string, key: string) {
  const secret = await ensureUserSecretExists(uid);
  await secretManager.addSecretVersion({
    parent: secret,
    payload: {data: Buffer.from(key, "utf8")},
  });
}

async function deleteUserOpenAIKey(uid: string) {
  try {
    await secretManager.deleteSecret({name: userSecretName(uid)});
  } catch (error: unknown) {
    const err = error as {code?: number};
    if (err?.code === 5 || err?.code === 404) return;
    throw error;
  }
}

async function readUserOpenAIKey(uid: string): Promise<string | null> {
  try {
    const [version] = await secretManager.accessSecretVersion({
      name: `${userSecretName(uid)}/versions/latest`,
    });
    return version.payload?.data?.toString() ?? null;
  } catch (error: unknown) {
    const err = error as {code?: number};
    if (err?.code === 5 || err?.code === 404) return null;
    throw error;
  }
}

function managedKeyAllowed(profile: ResolvedUserProfile): boolean {
  return (
    profile.role === "admin" ||
    profile.role === "gifted_managed" ||
    profile.role === "free" ||
    profile.role === "paid_byok" ||
    (profile.role === "paid_managed" && subscriptionIsActive(profile))
  );
}

async function resolveOpenAIClient(uid: string): Promise<{
  client: OpenAI;
  source: "managed" | "byok";
  profile: ResolvedUserProfile;
  effectiveRoleForLimit: UserRole;
}> {
  const profile = await getOrCreateUserProfile(uid);
  const hasByok = profile.openaiKeyStored;
  const canUseManaged = managedKeyAllowed(profile);

  let source: "managed" | "byok" | null = null;

  if (profile.preferredKey === "byok" && hasByok) {
    source = "byok";
  } else if (profile.preferredKey === "managed" && canUseManaged) {
    source = "managed";
  }

  if (!source) {
    if ((profile.role === "paid_byok" || profile.role === "free") && hasByok) {
      source = "byok";
    }
  }

  if (!source && canUseManaged) {
    source = "managed";
  }
  if (!source && hasByok) {
    source = "byok";
  }

  if (!source) {
    throw new HttpsError(
      "permission-denied",
      "No tienes una API key disponible. Sube tu clave o activa una membresía.",
    );
  }

  if (source === "managed" && !managedKeyAllowed(profile)) {
    throw new HttpsError(
      "permission-denied",
      "Tu membresía no está activa para usar la clave administrada.",
    );
  }

  const apiKey =
    source === "managed" ? openAIApiKey.value() : await readUserOpenAIKey(uid);
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "No encontramos una API key configurada en el backend.",
    );
  }

  const expired = membershipExpired(profile);
  let effectiveRoleForLimit: UserRole =
    profile.role === "paid_byok" && source === "managed" ? "free" : profile.role;
  if (expired && (profile.role === "paid_byok" || profile.role === "paid_managed")) {
    effectiveRoleForLimit = "free";
  }

  return {client: new OpenAI({apiKey}), source, profile, effectiveRoleForLimit};
}

async function assertAdmin(uid: string) {
  const profile = await getOrCreateUserProfile(uid);
  if (profile.role === "admin") return;
  const user = await auth.getUser(uid);
  const isAdminClaim = Boolean(user.customClaims?.admin);
  if (!isAdminClaim) {
    throw new HttpsError("permission-denied", "Necesitas rol admin para esta acción.");
  }
}

async function syncAdminClaim(uid: string, makeAdmin: boolean) {
  const user = await auth.getUser(uid);
  const claims = {...(user.customClaims || {})};
  if (makeAdmin) {
    claims.admin = true;
  } else {
    delete claims.admin;
  }
  await auth.setCustomUserClaims(uid, claims);
}

function currentWeekKey(): string {
  // Usamos lunes UTC como inicio de semana para evitar desfases de zona horaria
  const now = new Date();
  const day = now.getUTCDay(); // 0 = domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
    diffToMonday * 86_400_000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}

function getWeeklyLimit(role: UserRole, key: UsageKey): number {
  const baseParse: Record<UserRole, number> = {
    free: 5,
    paid_byok: 70,
    paid_managed: 90,
    gifted_managed: 90,
    admin: 400,
  };
  const baseAnalyze: Record<UserRole, number> = {
    free: 2,
    paid_byok: 20,
    paid_managed: 20,
    gifted_managed: 20,
    admin: 400,
  };
  const table = key === "parse" ? baseParse : baseAnalyze;
  const limit = table[role];
  if (typeof limit === "number") return limit;
  return key === "parse" ? 10 : 4;
}

async function checkRateLimit(
  uid: string,
  key: UsageKey,
  profile: ResolvedUserProfile,
  roleForLimit?: UserRole,
): Promise<void> {
  const week = currentWeekKey();
  const ref = firestore.doc(`usage/${uid}`);
  const limit = getWeeklyLimit(roleForLimit ?? profile.role, key);

  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let data: UsageDoc = snap.exists ? ((snap.data() as UsageDoc) ?? {}) : {week};
    if (data.week !== week) {
      data = {week, parse: 0, analyze: 0};
    }
    const usedForKey = key === 'parse' ? data.parse ?? 0 : data.analyze ?? 0;
    if (usedForKey >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        'Has alcanzado el limite semanal de llamadas de IA para tu plan.',
      );
    }
    const nextKeyValue = usedForKey + 1;
    tx.set(ref, {...data, [key]: nextKeyValue});
  });
}

function validWompiCurrency(tx: WompiTransaction): boolean {
  if (!wompiPlanCurrency) return true;
  return (tx.currency || "").toUpperCase() === wompiPlanCurrency;
}

function targetPlanFromId(plan: string | PlanId): TargetPlan {
  return plan === "plan_byok" ? "byok" : "pro";
}

function isSamePaidPlan(currentRole: UserRole, targetPlan: TargetPlan): boolean {
  if (targetPlan === "byok") return currentRole === "paid_byok";
  return currentRole === "paid_managed" || currentRole === "gifted_managed";
}

function computeNewExpiresAt(
  currentSub: {status: SubscriptionStatus; expiresAt?: number | FirebaseFirestore.Timestamp | null} | undefined,
  currentRole: UserRole,
  targetPlan: TargetPlan,
  months: number,
): number {
  const nowMs = Date.now();
  const extraMs = months * wompiDefaultDays * 24 * 60 * 60 * 1000;
  const currentExpires =
    currentSub?.status === "active"
      ? typeof currentSub?.expiresAt === "number"
        ? currentSub.expiresAt
        : currentSub?.expiresAt && typeof (currentSub.expiresAt as FirebaseFirestore.Timestamp).toMillis === "function"
          ? (currentSub.expiresAt as FirebaseFirestore.Timestamp).toMillis()
          : undefined
      : undefined;
  const isActive = Boolean(currentExpires && currentExpires > nowMs);
  const samePlan = isActive && isSamePaidPlan(currentRole, targetPlan);
  if (samePlan && currentExpires) {
    return currentExpires + extraMs;
  }
  return nowMs + extraMs;
}

function parseWompiReference(
  ref?: string | null,
): {uid: string; plan: string; period: PlanPeriod; targetPlan: TargetPlan; months: number} | null {
  if (!ref) return null;
  const clean = ref.trim();
  const parts = clean.includes(":") ? clean.split(":") : clean.split("_");
  if (parts.length < 2) return null;
  const plan = parts[0];
  const maybePeriod = parts[1];
  const uid = parts[2] || parts[1];
  let period: PlanPeriod = "monthly";
  if (maybePeriod === "quarterly" || maybePeriod === "semiannual" || maybePeriod === "annual") {
    period = maybePeriod;
  }
  if (!uid) return null;
  const targetPlan = targetPlanFromId(plan as PlanId);
  const months = planPeriodMonths(period);
  return {uid, plan, period, targetPlan, months};
}

function getPlanConfig(plan: string): PlanConfig | null {
  if (plan === "plan_byok") {
    return {
      id: "plan_byok",
      label: "Plan BYOK",
      basePriceCents: wompiPlanByokPrice,
      promoPriceCents: wompiPlanByokPromo || undefined,
      promoEndsAt: wompiPlanByokPromoEnd ? Date.parse(wompiPlanByokPromoEnd) : null,
    };
  }
  if (plan === "plan_pro") {
    return {
      id: "plan_pro",
      label: "Plan PRO",
      basePriceCents: wompiPlanProPrice,
      promoPriceCents: wompiPlanProPromo || undefined,
      promoEndsAt: wompiPlanProPromoEnd ? Date.parse(wompiPlanProPromoEnd) : null,
    };
  }
  return null;
}

function planPeriodMonths(period: PlanPeriod): number {
  if (period === "quarterly") return 3;
  if (period === "semiannual") return 6;
  if (period === "annual") return 12;
  return 1;
}

function planPeriodDiscount(period: PlanPeriod): number {
  if (period === "quarterly") return 0.05;
  if (period === "semiannual") return 0.1;
  if (period === "annual") return 0.15;
  return 0;
}

function promoActive(cfg: PlanConfig): boolean {
  if (!cfg.promoPriceCents || !cfg.promoEndsAt) return false;
  return Date.now() < cfg.promoEndsAt;
}

function computePlanPrice(plan: PlanConfig, period: PlanPeriod): number | null {
  const months = planPeriodMonths(period);
  const discount = planPeriodDiscount(period);
  const pricePerMonth = promoActive(plan) && plan.promoPriceCents ? plan.promoPriceCents : plan.basePriceCents;
  if (!pricePerMonth || pricePerMonth <= 0) return null;
  const total = pricePerMonth * months;
  const finalTotal = Math.round(total * (1 - discount));
  return finalTotal;
}

function wompiSignature(amountInCents: number, currency: string, reference: string): string | null {
  if (!wompiIntegrityKey) return null;
  const payload = `${reference}${amountInCents}${currency}${wompiIntegrityKey}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

const advisorPrompts: Record<AdvisorMode, string> = {
  "amable":
    "Eres un 'Coach de Bienestar Financiero' cálido y paciente. " +
    "Tu prioridad es reducir la ansiedad financiera del usuario. " +
    "Usa un tono suave, celebra los pequeños logros y usa el 'nosotros' (ej. 'lo vamos a arreglar'). " +
    "Usa emojis positivos (🌱, ✨, 💪) pero sin saturar. " +
    "Estructura: 4-6 viñetas alentadoras y claras. " +
    "Cierra siempre con una acción pequeña y manejable para generar confianza.",

  "reganon":
    "Eres un Asesor Financiero estilo 'Roast' (Sarcástico y Brutalmente Honesto). " +
    "Tu trabajo es ofender al mal hábito financiero, no a la persona. " +
    "Usa ironía afilada, metáforas exageradas (ej. 'tu billetera está en la UCI') y preguntas retóricas dolorosas. " +
    "No saludes amablemente, ve directo al problema. " +
    "Si ves gastos hormiga, ridiculízalos. Si ves deuda, sé alarmista. " +
    "Estructura: Máximo 2-3 frases cortantes y directas a la yugular. " +
    "Cierra con una acción imperativa, casi una orden.",
};

const maxAudioDurationMs = 10_000;
const maxAudioBytes = 6_000_000;

function decodeBase64Audio(input: string, mimeOverride?: string): {buffer: Buffer; mimeType: string} {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:(.+);base64,(.+)$/);
  const base64 = match ? match[2] : trimmed;
  const mimeType = mimeOverride || match?.[1] || "application/octet-stream";
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (error) {
    console.error("[decodeBase64Audio] error", error);
    throw new HttpsError("invalid-argument", "audioBase64 no es valido.");
  }
  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "El audio esta vacio.");
  }
  return {buffer, mimeType};
}

function textHasDateHint(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\d{4}-\d{2}-\d{2}/.test(lower)) return true;
  if (/\b\d{1,2}-\d{1,2}\b/.test(lower)) return true;
  if (/\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(lower)) return true;
  if (/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(lower)) return true;
  return false;
}

function isoDateWithOffset(daysFromNow: number, offsetMinutes?: number): string {
  const offset = typeof offsetMinutes === "number" ? offsetMinutes : new Date().getTimezoneOffset();
  const nowMs = Date.now();
  const targetMs = nowMs + daysFromNow * 86_400_000;
  return new Date(targetMs - offset * 60_000).toISOString().slice(0, 10);
}

/**
 * Callable: transcribe audio (<=10s) a texto usando Whisper.
 */
export const transcribeAudio = onCall(
  {secrets: [openAIApiKey]},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const {audioBase64, mimeType, durationMs} = request.data as {
      audioBase64?: string;
      mimeType?: string;
      durationMs?: number;
    };
    if (!audioBase64 || typeof audioBase64 !== "string") {
      throw new HttpsError("invalid-argument", "Envía audioBase64 en formato base64.");
    }
    if (durationMs && durationMs > maxAudioDurationMs + 300) {
      throw new HttpsError("invalid-argument", "El audio debe durar maximo 10 segundos.");
    }

    const {buffer, mimeType: resolvedMime} = decodeBase64Audio(audioBase64, mimeType);
    if (buffer.length > maxAudioBytes) {
      throw new HttpsError(
        "invalid-argument",
        "El archivo de audio es muy grande. Limita la grabacion a 10 segundos (≈6 MB max).",
      );
    }

    const {client} = await resolveOpenAIClient(request.auth.uid);

    try {
      const file = await toFile(buffer, "grabacion.webm", {type: resolvedMime || "audio/webm"});
      const transcription = await client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "es",
      });
      const text = transcription?.text?.trim();
      if (!text) {
        throw new Error("Transcription empty");
      }
      return {text};
    } catch (error) {
      const errAny = error as {response?: {data?: unknown}; message?: string};
      console.error("[transcribeAudio] error", errAny?.response ?? errAny);
      const detail =
        (errAny?.response as {data?: {error?: {message?: string}}})?.data?.error?.message ||
        errAny?.message;
      const msg = detail ? `No se pudo transcribir el audio: ${detail}` : "No se pudo transcribir el audio.";
      throw new HttpsError("internal", msg);
    }
  },
);

const normalizeCategoryLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const singularizeLabel = (value: string) => {
  if (value.endsWith("es") && value.length > 3) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 2) return value.slice(0, -1);
  return value;
};

const getUserCategoriesUpdatedAt = async (uid: string): Promise<number | null> => {
  const snapshot = await firestore.doc(`users/${uid}`).get();
  const raw = snapshot.get("categoriesUpdatedAt");
  if (!raw) return null;
  if (typeof raw === "number") return raw;
  if (typeof (raw as FirebaseFirestore.Timestamp).toMillis === "function") {
    return (raw as FirebaseFirestore.Timestamp).toMillis();
  }
  return null;
};

const loadUserCategoryCatalog = async (
  uid: string,
): Promise<CategoryCatalogEntry[]> => {
  const cached = categoryCatalogCache.get(uid);
  const now = Date.now();
  const categoriesUpdatedAt = await getUserCategoriesUpdatedAt(uid);
  const cacheValid =
    !!cached &&
    cached.expiresAt > now &&
    categoriesUpdatedAt !== null &&
    cached.categoriesUpdatedAtSeen !== null &&
    cached.categoriesUpdatedAtSeen === categoriesUpdatedAt;
  if (cacheValid) return cached.data;
  const snapshot = await firestore
    .collection("users")
    .doc(uid)
    .collection("categories")
    .orderBy("order", "asc")
    .get();
  const data = snapshot.docs.map((docSnap) => {
    const rawLabel = docSnap.data()?.label;
    const label =
      typeof rawLabel === "string" && rawLabel.trim() ? rawLabel : docSnap.id;
    return {id: docSnap.id, label};
  });
  categoryCatalogCache.set(uid, {
    cachedAt: now,
    expiresAt: now + CATEGORY_CACHE_TTL_MS,
    categoriesUpdatedAtSeen: categoriesUpdatedAt,
    data,
  });
  return data;
};

const buildCategoryLookup = (categories: CategoryCatalogEntry[]) => {
  const byId: Record<string, CategoryCatalogEntry> = {};
  const idByNormalizedLabel: Record<string, string | null> = {};
  const addKey = (key: string, id: string) => {
    if (!key) return;
    if (!(key in idByNormalizedLabel)) {
      idByNormalizedLabel[key] = id;
      return;
    }
    if (idByNormalizedLabel[key] !== id) idByNormalizedLabel[key] = null;
  };

  for (const category of categories) {
    if (!category?.id) continue;
    byId[category.id] = category;
    const normalized = normalizeCategoryLabel(category.label || category.id);
    addKey(normalized, category.id);
    const singular = singularizeLabel(normalized);
    if (singular && singular !== normalized) addKey(singular, category.id);
  }

  return {byId, idByNormalizedLabel};
};

const resolveCategoryIdFromCatalog = (
  rawCategory: string,
  lookup: ReturnType<typeof buildCategoryLookup>,
): CategoryResolution => {
  const value = typeof rawCategory === "string" ? rawCategory.trim() : "";
  if (!value) {
    return {categoryId: FALLBACK_CATEGORY_ID, fallbackReason: "empty"};
  }
  const normalized = normalizeCategoryLabel(value);
  if (normalized === FALLBACK_CATEGORY_ID) {
    return {categoryId: FALLBACK_CATEGORY_ID, fallbackReason: "explicit_other"};
  }
  if (lookup.byId[value]) return {categoryId: value};
  const match = normalized ? lookup.idByNormalizedLabel[normalized] : undefined;
  if (typeof match === "string") return {categoryId: match};
  if (match === null) {
    return {categoryId: FALLBACK_CATEGORY_ID, fallbackReason: "ambiguous"};
  }
  return {categoryId: FALLBACK_CATEGORY_ID, fallbackReason: "no_match"};
};

/**
 * Callable: interpreta frase de movimiento y devuelve objeto estructurado.
 */
export const parseTransactionPhrase = onCall(
  {secrets: [openAIApiKey]},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const {text, clientOffsetMinutes} = request.data as {
      text?: string;
      clientOffsetMinutes?: number;
    };
    if (!text || typeof text !== "string") {
      throw new HttpsError("invalid-argument", "Debes enviar un campo 'text' con la frase.");
    }

    const {client, profile, effectiveRoleForLimit} = await resolveOpenAIClient(request.auth.uid);
    await checkRateLimit(request.auth.uid, "parse", profile, effectiveRoleForLimit);
    const categoryCatalog = await loadUserCategoryCatalog(request.auth.uid);
    const categoryLookup = buildCategoryLookup(categoryCatalog);
    const categoryList = categoryCatalog.length
      ? categoryCatalog.map((cat) => '- ' + cat.id + ': ' + cat.label).join('\\n')
      : '- ' + FALLBACK_CATEGORY_ID + ': Otros';

    const schema = {
      type: "object",
      properties: {
        amount: {type: "number"},
        category: {type: "string"},
        note: {type: "string"},
        paymentMethod: {
          type: "string",
          enum: ["efectivo", "debito", "credito", "digital", "otro"],
        },
        type: {type: "string", enum: ["expense", "income"]},
        date: {type: "string"},
      },
      required: ["amount", "category", "note", "paymentMethod", "type", "date"],
      additionalProperties: false,
    } as const;

    try {
      const system =
        "Eres un extractor de datos de transacciones. Devuelve JSON que cumpla " +
        "el esquema: amount (number), category (string), note (string), " +
        "paymentMethod (efectivo|debito|credito|digital|otro), " +
        "type (expense|income), date (YYYY-MM-DD). Usa la fecha de hoy si no " +
        "se indica, o ayer/anteayer/hace X dias si se menciona. Detecta " +
        "tarjeta de crédito/débito. Ejemplo: 'viaje por avianca a cali hoy me " +
        "costó 300000 pagué con tarjeta de crédito' => amount 300000, " +
        "category transporte, type expense, paymentMethod credito, date hoy. " +
        "Si ves ingresos, usa type income. " +
        "El campo category debe ser el id exacto de una categoria valida. " +
        "Si no hay una coincidencia clara, usa \"otros\". " +
        "Categorias validas (id: label):\\n" +
        categoryList;

      const primaryModel = "o4-mini";
      const fallbackModel = "gpt-5-mini";
      const createParseResponse = (model: string) =>
        client.responses.create({
          model,
          instructions: system,
          input: text,
          text: {
            format: {
              type: "json_schema",
              name: "transaction",
              schema,
              strict: true,
            },
          },
          reasoning: {effort: "low"},
          max_output_tokens: 400,
        });

      let response: Awaited<ReturnType<typeof createParseResponse>>;
      let modelUsed = primaryModel;
      try {
        response = await createParseResponse(primaryModel);
      } catch (error) {
        console.warn(
          `[parseTransactionPhrase] ${primaryModel} failed, retrying ${fallbackModel}.`,
          error,
        );
        modelUsed = fallbackModel;
        response = await createParseResponse(fallbackModel);
      }
      console.info(`[parseTransactionPhrase] model=${modelUsed}`);

      const raw = response.output_text?.trim();
      const parsed = raw ? (JSON.parse(raw) as Partial<ParsedTransaction>) : {};
      const relativeDate = deriveRelativeDate(text, clientOffsetMinutes);
      const todayIsoStr = isoDateWithOffset(0, clientOffsetMinutes);
      let dateCandidate = relativeDate ?? parsed.date ?? todayIsoStr;
      if (!relativeDate && !textHasDateHint(text)) {
        dateCandidate = todayIsoStr;
      }

      const rawCategory = typeof parsed.category === "string" ? parsed.category : "";
      const parsedType = (parsed.type as ParsedTransaction["type"]) ?? "expense";
      const isExpense = parsedType === "expense";
      const categoryResolution = resolveCategoryIdFromCatalog(rawCategory, categoryLookup);
      const categoryId = isExpense ? categoryResolution.categoryId : "";
      const categoryFallback = isExpense && categoryId === FALLBACK_CATEGORY_ID;
      const categoryFallbackReason = categoryFallback
        ? categoryResolution.fallbackReason ?? "no_match"
        : undefined;
      const baseConfidence = parsed.confidence ?? 0.6;
      const confidence = categoryFallback ? Math.min(baseConfidence, 0.4) : baseConfidence;
      const categoryValue = categoryFallback ? FALLBACK_CATEGORY_ID : rawCategory || "sin-categoria";

      const result: ParsedTransaction = {
        amount: parsed.amount ?? 0,
        category: categoryValue,
        categoryId,
        paymentMethod:
          (parsed.paymentMethod as ParsedTransaction["paymentMethod"]) ?? "debito",
        type: parsedType,
        date: dateCandidate,
        note: parsed.note ?? text,
        confidence,
        rawText: text,
        categoryFallback,
        categoryFallbackReason,
      };

      return {parsed: result};
    } catch (error) {
      console.error("[parseTransactionPhrase] error", error);
      throw new HttpsError("internal", "No se pudo interpretar la frase.");
    }
  },
);

/**
 * Callable: genera recomendaciones del asesor IA según modo y resumen.
 */
const advisorActionPlaybook: Record<string, string> = {
  "Espejo diario":
    "Objetivo: Foto instantánea del 'Ahora'. Enfócate SOLO en el ritmo de gasto vs días del mes.\n" +
    "Reglas de Exclusividad:\n" +
    "- NO menciones el acumulado total de deuda ni categorías grandes (eso es para 'En qué se va').\n" +
    "- NO hagas comparaciones semanales.\n" +
    "Instrucciones:\n" +
    "- Compara el día actual vs el % de presupuesto consumido (ej. 'Día 18 y ya vas al 88%').\n" +
    "- Menciona SOLO el movimiento más reciente de las últimas 24h.\n" +
    "- Acción final: Algo rápido para hacer HOY (ej. 'No gastes nada en las próximas 12h' o 'Revisa el gasto de ayer').",

  "Gastos hormiga":
    "Objetivo: Detectar micro-fugas de comportamiento.\n" +
    "Reglas de Exclusividad:\n" +
    "- PROHIBIDO mencionar Renta, Deudas, Servicios o gastos mayores a $50k.\n" +
    "- Ignora el presupuesto total.\n" +
    "Instrucciones:\n" +
    "- Busca patrones de gastos <$20k (comida, transporte, snacks).\n" +
    "- Usa la psicología: proyecta ese gasto a 1 año (multiplica x 12) para generar impacto.\n" +
    "- Acción final: Sugiere reemplazar un hábito específico (ej. 'Lleva café de casa mañana').\n" +
    "- Si detectas candidatos, finaliza con el bloque [CHART_DATA]. En [CHART_DATA], asegúrate de que el array esté ordenado de mayor a menor \"value\" para que el gráfico se vea coherente. Usa etiquetas descriptivas (ej. \"Desayuno 18/12\").\n" +
    "- Finaliza con [ACTION_DATA] tipo \"NAVIGATE_FILTER\" filtrando por la categoría detectada y, si aplica, por una nota sugerida (ej. \"Desayuno\").",

  "Resumen semanal":
    "Objetivo: Análisis de Tendencia y Volatilidad.\n" +
    "Reglas de Exclusividad:\n" +
    "- No listes gastos individuales pequeños.\n" +
    "Instrucciones:\n" +
    "- Explica el 'Por qué' del cambio (Delta). ¿Fue una semana atípica?\n" +
    "- Si el gasto subió por un pago único de deuda, aclara que fue 'puntual' y no 'estructural'.\n" +
    "- Acción final: Planificación para la próxima semana (ej. 'La próxima semana será más suave, mantén el perfil bajo').\n" +
    "- Finaliza con [ACTION_DATA] tipo \"NAVIGATE_FILTER\" con payload {\"period\":\"last_7_days\"} para ver los movimientos de los últimos 7 días.",

  "En qué se va la plata":
    "Objetivo: Auditoría Estructural (The Big Picture).\n" +
    "Reglas de Exclusividad:\n" +
    "- Este es el ÚNICO lugar donde debes analizar a fondo la Deuda y la Renta.\n" +
    "- No hables de gastos hormiga aquí.\n" +
    "Instrucciones:\n" +
    "- Desglosa Fijos (Deuda/Renta) vs Variables (Comida/Ocio).\n" +
    "- Si la deuda es >40%, lanza la alerta aquí.\n" +
    "- Acción final: Ajuste de presupuesto macro (ej. 'Ajusta el presupuesto de Comida -10% para compensar la Deuda').\n" +
    "- Finaliza con el bloque [CHART_DATA] conteniendo las 3 categorías principales y sus montos para graficar.\n" +
    "- OBLIGATORIO: Finaliza con [ACTION_DATA] {\"type\":\"OPEN_BUDGET\",\"payload\":{\"category\":\"comida\"},\"label\":\"Ajustar Comida\"}. Debe incluir \"label\" y \"payload.category\" con el id exacto de la categoría VARIABLE que recomiendes ajustar (sin placeholders y evitando \"deuda\"/\"renta\").",
};

function safeParseDateYYYYMMDD(input?: string): Date | null {
  if (!input || typeof input !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pctRounded(n: number, d: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Math.round((n / d) * 100);
}

type BudgetState = "sin_presupuesto" | "ok" | "alerta_80" | "excedido_100";
type DebtPlan = "unico" | "cuota" | "unknown";
type DebtMismatchExample = {date: string; amount: number; category: string};
type WeekMovementExample = {date: string; amount: number; category: string};
type WeekProxyFacts = {
  endDate: string;
  last7: number;
  prev7: number;
  last7Tx: number;
  prev7Tx: number;
  delta: number;
  deltaPct: number | null;
  topMovements: WeekMovementExample[];
};
type HormigaCandidate = {category: string; count: number; total: number; avg: number};
type AdvisorFacts = {
  budgetRemaining: number | null;
  budgetPct: number | null;
  budgetState: BudgetState;
  deltaExpense: number | null;
  deltaExpensePct: number | null;
  topCatsText: string | null;
  debtHint: boolean;
  debtPlan: DebtPlan;
  debtCategoryTxCount: number;
  debtMismatchTxCount: number;
  debtMismatchExamples: DebtMismatchExample[];
  weekProxy: WeekProxyFacts | null;
  hormigaCandidates: HormigaCandidate[];
  validDatedExpenseTxCount: number;
  totalExpenseTxCount: number;
};

type SummaryTx = NonNullable<SpendingSummary["lastTransactions"]>[number];

function amountBucketRelative(amount: number, anchor: number): string {
  if (!Number.isFinite(anchor) || anchor <= 0) return "S?";
  const r = amount / anchor;
  if (r <= 0.25) return "S1";
  if (r <= 0.5) return "S2";
  if (r <= 0.75) return "S3";
  return "S4";
}

function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function detectDebtPlan(noteNormalized: string): DebtPlan {
  const tokens = noteNormalized.split(/[^a-z0-9]+/).filter(Boolean);
  const hasToken = (t: string) => tokens.includes(t);
  const hasTokenPrefix = (p: string) => tokens.some((t) => t.startsWith(p));

  const cuotaKeywords = ["cuota fija", "mensualidad", "mensual", "installment"];
  if (includesAny(noteNormalized, cuotaKeywords) || hasToken("cuota") || hasToken("cuotas")) return "cuota";

  const hasUnicoPhrase = includesAny(noteNormalized, ["pago unico", "one-time", "one time", "una vez"]);
  const hasPagoUnicoSplit =
    (hasToken("pago") || noteNormalized.includes("pago")) && (hasToken("unico") || hasTokenPrefix("unic"));
  if (hasUnicoPhrase || hasPagoUnicoSplit) return "unico";
  return "unknown";
}

function computeAdvisorFacts(summary?: SpendingSummary): AdvisorFacts {
  const budget = typeof summary?.budget === "number" ? summary.budget : null;
  const totalExpense = typeof summary?.totalExpense === "number" ? summary.totalExpense : null;
  const budgetRemaining =
    totalExpense !== null && budget !== null ? Math.round(budget - totalExpense) : null;
  const budgetPct = totalExpense !== null && budget !== null ? pctRounded(totalExpense, budget) : null;
  const budgetState: BudgetState =
    budgetPct === null ? "sin_presupuesto" : budgetPct >= 100 ? "excedido_100" : budgetPct >= 80 ? "alerta_80" : "ok";

  const prevExpense = typeof summary?.previousMonthExpense === "number" ? summary.previousMonthExpense : null;
  const deltaExpense =
    totalExpense !== null && prevExpense !== null ? Math.round(totalExpense - prevExpense) : null;
  const deltaExpensePct =
    deltaExpense !== null && prevExpense !== null && prevExpense > 0
      ? Math.round((deltaExpense / prevExpense) * 100)
      : null;

  const topCatsText = (() => {
    const items = summary?.topCategories ?? [];
    if (!Array.isArray(items) || !items.length) return null;
    if (totalExpense === null || totalExpense <= 0) {
      return items
        .slice(0, 3)
        .map((c) => `${c.category}: ${c.amount}`)
        .join(", ");
    }
    return items
      .slice(0, 3)
      .map((c) => {
        const share = pctRounded(c.amount, totalExpense);
        return `${c.category}: ${c.amount}${share !== null ? ` (${share}%)` : ""}`;
      })
      .join(", ");
  })();

  const txs = Array.isArray(summary?.lastTransactions) ? summary?.lastTransactions ?? [] : [];
  const expenseTxs = txs.filter(
    (t) =>
      t &&
      t.type === "expense" &&
      typeof t.amount === "number" &&
      Number.isFinite(t.amount) &&
      t.amount > 0 &&
      typeof t.category === "string" &&
      typeof t.date === "string",
  );

  const totalExpenseTxCount = expenseTxs.length;
  const datedExpenseTxs = expenseTxs
    .map((t) => ({t, d: safeParseDateYYYYMMDD(t.date)}))
    .filter((x): x is {t: SummaryTx; d: Date} => Boolean(x.d));
  const validDatedExpenseTxCount = datedExpenseTxs.length;

  const {debtHint, debtPlan, debtCategoryTxCount, debtMismatchTxCount, debtMismatchExamples} = (() => {
    const bankKeywords = ["falabella", "davivienda"];

    const normalizeNote = (note?: string) => {
      if (typeof note !== "string") return "";
      const cleaned = note.replace(/\s+/g, " ").trim();
      return cleaned ? normalizeForMatch(cleaned) : "";
    };

    const isDebtCategory = (category: string) => normalizeForMatch(category) === "deuda";

    const noteSuggestsDebt = (noteNormalized: string) => {
      if (!noteNormalized) return false;
      const tokens = noteNormalized.split(/[^a-z0-9]+/).filter(Boolean);
      const hasBank = includesAny(noteNormalized, bankKeywords);
      const hasCreditCard =
        noteNormalized.includes("tarjeta de credito") ||
        noteNormalized.includes("tarjeta credito") ||
        noteNormalized.includes("tarjeta de credi") ||
        noteNormalized.includes("tarjeta credi") ||
        (noteNormalized.includes("tarjeta") &&
          (noteNormalized.includes("credito") ||
            noteNormalized.includes("tarjeta de credi") ||
            noteNormalized.includes("tarjeta credi") ||
            noteNormalized.includes("banco") ||
            hasBank));

      if (hasBank) return true;
      if (noteNormalized.includes("deuda")) return true;
      if (noteNormalized.includes("prestamo")) return true;
      if (hasCreditCard) return true;

      // Señales débiles: requieren 2+ para evitar falsos positivos (ej. "tarjeta Metro").
      let weak = 0;
      if (tokens.includes("credito") || tokens.some((t) => t.startsWith("cred"))) weak += 1;
      if (tokens.includes("banco")) weak += 1;
      if (tokens.includes("cuota") || tokens.includes("cuotas")) weak += 1;
      if (
        noteNormalized.includes("pago unico") ||
        (tokens.includes("pago") && tokens.some((t) => t.startsWith("unic")))
      ) {
        weak += 1;
      }
      if (tokens.includes("nomina")) weak += 1;
      return weak >= 2;
    };

    const debtTxs = expenseTxs.filter((t) => isDebtCategory(t.category));
    const debtCategoryTxCount = debtTxs.length;

    let debtHint = false;
    let cuotaCount = 0;
    let unicoCount = 0;

    for (const t of debtTxs) {
      const noteNorm = normalizeNote(t.note);
      const plan = detectDebtPlan(noteNorm);
      if (plan === "cuota") cuotaCount += 1;
      else if (plan === "unico") unicoCount += 1;
      if (plan !== "unknown" || noteSuggestsDebt(noteNorm)) debtHint = true;
    }

    const debtPlan: DebtPlan =
      cuotaCount === 0 && unicoCount === 0 ? "unknown" : cuotaCount >= unicoCount ? "cuota" : "unico";

    let debtMismatchTxCount = 0;
    const debtMismatchExamples: DebtMismatchExample[] = [];
    for (const t of expenseTxs) {
      if (isDebtCategory(t.category)) continue;
      const noteNorm = normalizeNote(t.note);
      if (!noteNorm) continue;
      const isMismatch = noteSuggestsDebt(noteNorm);
      if (!isMismatch) continue;
      debtMismatchTxCount += 1;
      if (debtMismatchExamples.length < 2) {
        debtMismatchExamples.push({
          date: t.date,
          amount: Math.round(t.amount),
          category: t.category,
        });
      }
    }

    return {debtHint, debtPlan, debtCategoryTxCount, debtMismatchTxCount, debtMismatchExamples};
  })();

  const weekProxy = (() => {
    if (validDatedExpenseTxCount < 10) return null;
    const maxMs = Math.max(...datedExpenseTxs.map((x) => x.d.getTime()));
    const end = new Date(maxMs);
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    const start7 = new Date(endDay);
    start7.setUTCDate(start7.getUTCDate() - 6);
    const start14 = new Date(endDay);
    start14.setUTCDate(start14.getUTCDate() - 13);

    let last7 = 0;
    let prev7 = 0;
    let last7Tx = 0;
    let prev7Tx = 0;
    for (const x of datedExpenseTxs) {
      const d = x.d;
      if (d >= start7 && d <= endDay) {
        last7 += x.t.amount;
        last7Tx += 1;
      } else if (d >= start14 && d < start7) {
        prev7 += x.t.amount;
        prev7Tx += 1;
      }
    }

    if (last7Tx < 2 || prev7Tx < 2) return null;
    const delta = last7 - prev7;
    const deltaPct = prev7 > 0 ? Math.round((delta / prev7) * 100) : null;
    const topMovements = datedExpenseTxs
      .filter((x) => x.d >= start7 && x.d <= endDay)
      .sort((a, b) => b.t.amount - a.t.amount)
      .slice(0, 2)
      .map((x) => ({date: x.t.date, amount: Math.round(x.t.amount), category: x.t.category}));
    return {
      endDate: endDay.toISOString().slice(0, 10),
      last7: Math.round(last7),
      prev7: Math.round(prev7),
      last7Tx,
      prev7Tx,
      delta: Math.round(delta),
      deltaPct,
      topMovements,
    };
  })();

  const hormigaCandidates = (() => {
    if (totalExpenseTxCount < 10) return [] as HormigaCandidate[];
    const amounts = expenseTxs.map((t) => t.amount).sort((a, b) => a - b);
    const p33 = amounts.length ? amounts[Math.floor(amounts.length * 0.33)] : null;
    if (p33 === null) return [] as HormigaCandidate[];
    const small = expenseTxs.filter((t) => t.amount <= p33);
    const freq = new Map<string, {category: string; bucket: string; count: number; total: number}>();
    for (const t of small) {
      const bucket = amountBucketRelative(t.amount, p33);
      const k = `${t.category}::${bucket}`;
      const cur = freq.get(k);
      if (!cur) freq.set(k, {category: t.category, bucket, count: 1, total: t.amount});
      else {
        cur.count += 1;
        cur.total += t.amount;
      }
    }
    const sorted = [...freq.values()]
      .filter((x) => x.count >= 2)
      .sort((a, b) => b.total - a.total)
      .map((x) => ({...x, total: Math.round(x.total)}));

    const picked: HormigaCandidate[] = [];
    const usedCategories = new Set<string>();
    for (const x of sorted) {
      if (usedCategories.has(x.category)) continue;
      usedCategories.add(x.category);
      picked.push({
        category: x.category,
        count: x.count,
        total: x.total,
        avg: Math.max(1, Math.round(x.total / x.count)),
      });
      if (picked.length >= 3) break;
    }
    return picked;
  })();

  return {
    budgetRemaining,
    budgetPct,
    budgetState,
    deltaExpense,
    deltaExpensePct,
    topCatsText,
    debtHint,
    debtPlan,
    debtCategoryTxCount,
    debtMismatchTxCount,
    debtMismatchExamples,
    weekProxy,
    hormigaCandidates,
    validDatedExpenseTxCount,
    totalExpenseTxCount,
  };
}

export const analyzeSummary = onCall(
  {secrets: [openAIApiKey]},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const {mode = "amable", summary, action = "Espejo diario"} = request.data as {
      mode?: AdvisorMode;
      summary?: SpendingSummary;
      action?: string;
    };
    if (!clientSupportedMode(mode)) {
      throw new HttpsError("invalid-argument", "Modo de asesor no soportado.");
    }

    const {client, profile, effectiveRoleForLimit} = await resolveOpenAIClient(request.auth.uid);
    await checkRateLimit(request.auth.uid, "analyze", profile, effectiveRoleForLimit);
    const systemPromptFinal = [
      advisorPrompts[mode],
      "Reglas:",
      "- Máximo 2 focos por respuesta.",
      "- No inventes datos ni porcentajes calculados (ej. % presupuesto, % categorias, variacion semanal): usa SOLO los provistos o derivados aqui.",
      "- Si sugieres un ajuste relativo (no calculado), usa SOLO 10% (ej. 'reduce 10%' / 'ajusta ±10%') o '1 ocurrencia menos' (no 15%, 20%, etc.).",
      "- No inventes funciones/acciones que la app no tiene (ej. 'marcar movimiento como prioridad', 'programar un movimiento', 'automatizar').",
      "- Si propones una acción, debe ser ejecutable en GastoSense hoy: registra, edita un movimiento (categoría/nota/fecha/método), abre/filtra Movimientos, ajusta presupuesto mensual o por categoría.",
      "- Evita lenguaje meta o de reglas internas (no digas 'según las reglas', 'no pidas', 'no debo'); habla como asesor directo.",
      "- Si citas la nota, cítala tal cual (o menciona solo keywords presentes). Prohibido inventar texto de nota.",
      "- No muestres campos internos ni tokens técnicos (ej. 'HECHOS_CALCULADOS', 'WEEK_PROXY', 'HORMIGA_CANDIDATES', 'N/D').",
      "- No pegues el bloque de datos tal cual: integra los números en español simple.",
      "- Moneda: usa siempre $ en el texto (no uses COP/₲/USD/MXN/EUR ni otros símbolos/códigos).",
      "- Tiempo: evita decir 'hoy', 'ayer', 'esta mañana'. Usa fechas YYYY-MM-DD de los movimientos (ej. 2025-12-17) o di 'movimientos recientes'.",
      "- Usa vocabulario alineado a la app: di 'edita/corrige' (no 'etiquetar' ni 'tags') y menciona 'movimientos'.",
      "- No sugieras escribir en apps externas; si necesitas identificar algo, usa la nota del movimiento.",
      "- Evita umbrales o topes fijos en dinero; si propones un limite, usa '1 ocurrencia menos' o un recorte pequeño por defecto (10%).",
      "- Estructura (en este orden): 1) Numero clave. 2) Insight principal (con 1 dato). 3) Micro-habito/accion de hoy. (Opcional) 4) Solo si cabe, 1 frase para el segundo foco sin abrir temas nuevos.",
      "- Solo habla de comparación semanal si la acción solicitada es 'Resumen semanal'. Si falta base con fecha, dilo y da un plan accionable de 7 días (2-3 micro-acciones).",
      "- En 'Resumen semanal', si explicas la causa del cambio, dilo como probable (ej. 'parece venir de...') y cita 1-2 movimientos de 'Movimientos grandes ultimos 7 dias' si estan disponibles.",
      "- Solo habla de 'gastos hormiga' si la acción solicitada es 'Gastos hormiga'. Si falta base, dilo y enfócate en cómo registrar esta semana para detectarlos.",
      "- En 'Gastos hormiga', cuando sugieras una nota, no uses 'hormiga' como etiqueta. Usa ejemplos como 'Desayuno', 'Almuerzo', 'Snack', 'Bebida', 'Domicilio'.",
      "- Si sugieres editar/corrige un movimiento específico, incluye su fecha (YYYY-MM-DD) y monto para que el usuario lo encuentre.",
      "- Si Accion principal es 'Abre Movimientos y filtra...', incluye 1-2 ejemplos concretos (fecha+monto+categoria) tomados de 'Movimientos recientes' o 'Movimientos grandes ultimos 7 dias'.",
      "- Regla de 'deuda fuera de categoría (por nota)': si el dato es 0, no sugieras corrección por deuda mal categorizada. Si es >0, cita 1 ejemplo exacto (fecha+monto+categoría) de los ejemplos listados.",
      "- Si una categoría domina (ej. 'deuda'), NO asumas automáticamente que es deuda 'real' ni que está 'mal categorizado'.",
      "  1) Primero, trátalo como una hipótesis: puede ser un pago real de deuda (según la nota) o un gasto clasificado de forma distinta.",
      "  2) Si la nota sugiere deuda pero la categoría no es 'deuda', sugiere revisar y corregir categoría (solo si hay evidencia).",
      "  3) Si la categoría es 'deuda' y la nota sugiere deuda, trátalo como deuda confirmada: no sugieras corregir esa categoría; pasa a la siguiente palanca (presupuesto/recortes en categorías variables).",
      "  4) Si la nota ya indica si es 'pago único' o 'cuota', no lo preguntes: úsalo para orientar el consejo.",
      "  Evita repetir este punto: menciona máximo una vez por respuesta.",
      "- No asumas intencion ni digas 'planificado/a': si algo viene de la nota, di 'confirmado por nota' o 'segun la nota'.",
      "- Accion principal: elige SOLO 1 patron valido: (A) 'Abre Movimientos y filtra por <categoria>'. (B) 'Edita/corrige el movimiento YYYY-MM-DD $MONTO (categoria/nota)'. (C) 'Ajusta el presupuesto (mensual o de <categoria>) en ±10%'.",
      "- No recomiendes activos/tickers/productos de inversión ni prometas retornos.",
      "- Incluye siempre una línea: Acción principal: ... (imperativo, 1 sola acción).",
      "- Bloques ocultos (si aplica): al FINAL y sin texto después. Orden: [CHART_DATA] (opcional) y luego [ACTION_DATA] (opcional).",
      "- [CHART_DATA] y [ACTION_DATA] deben ser JSON estricto (comillas dobles). No uses markdown, solo texto plano.",
      "- Si la visualización de datos aporta valor (ej. en 'En qué se va la plata' o 'Gastos hormiga'), incluye al final: [CHART_DATA] [{\"label\":\"Nombre\",\"value\":100}, ...].",
      "- Si sugieres una acción ejecutable en la app (filtrar movimientos, editar presupuesto), incluye AL FINAL (después de CHART_DATA si existe) un bloque: [ACTION_DATA] {\"type\":\"NAVIGATE_FILTER\",\"payload\":{\"category\":\"comida\",\"period\":\"current_month\"},\"label\":\"Ver gastos en comida\"}. Tipos validos: \"NAVIGATE_FILTER\", \"OPEN_BUDGET\", \"OPEN_MODAL\".",
      "- El botón [ACTION_DATA] debe coincidir con la 'Acción principal' sugerida en el texto.",
      mode === "reganon" ? "Formato: máximo 2-3 viñetas cortas." : "Formato: máximo 4-6 viñetas cortas.",
    ].join("\n");

    const lastTx = summary?.lastTransactions
      ?.slice(0, 5)
      .map((t) => {
        const label = t.type === "income" ? "Ingreso" : "Gasto";
        const note =
          typeof t.note === "string" ? t.note.replace(/\s+/g, " ").trim().slice(0, 60) : "";
        return `${t.date} ${label} $${t.amount} ${t.category}${note ? ` (${note})` : ""}`;
      })
      .join(" | ");

    const facts = computeAdvisorFacts(summary);
    const latestTxDate = (() => {
      const txs = Array.isArray(summary?.lastTransactions) ? summary.lastTransactions : [];
      const ms = txs
        .map((t) => (typeof t?.date === "string" ? safeParseDateYYYYMMDD(t.date)?.getTime() : null))
        .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      return ms.length ? new Date(Math.max(...ms)).toISOString().slice(0, 10) : null;
    })();
    const playbook =
      advisorActionPlaybook[action] ??
      advisorActionPlaybook[action.replace("qué", "que")] ??
      "Objetivo: dar consejos claros y concretos segun la accion solicitada.";

    const budgetStateLabel =
      facts.budgetState === "sin_presupuesto"
        ? "sin presupuesto"
        : facts.budgetState === "alerta_80"
          ? "alerta (>=80%)"
          : facts.budgetState === "excedido_100"
            ? "excedido (>=100%)"
            : "ok";

    const includeWeekFacts = action === "Resumen semanal";
    const includeHormigaFacts = action === "Gastos hormiga";

    if (includeWeekFacts || includeHormigaFacts) {
      console.info("[analyzeSummary] context", {
        action,
        mode,
        lastTransactions: summary?.lastTransactions?.length ?? 0,
        totalExpenseTxCount: facts.totalExpenseTxCount,
        validDatedExpenseTxCount: facts.validDatedExpenseTxCount,
        hasWeekProxy: Boolean(facts.weekProxy),
        hormigaCandidates: facts.hormigaCandidates.length,
        debtCategoryTxCount: facts.debtCategoryTxCount,
        debtMismatchTxCount: facts.debtMismatchTxCount,
      });
    }

    const userPrompt = [
      `Acción solicitada: ${action}.`,
      `Guía: ${playbook}`,
      "Datos disponibles (usa SOLO esto; no inventes):",
      summary?.month ? `- Mes: ${summary.month}.` : "- Mes: no disponible.",
      latestTxDate ? `- Fecha mas reciente en movimientos: ${latestTxDate}.` : "- Fecha mas reciente en movimientos: no disponible.",
      summary?.totalExpense !== undefined
        ? `- Gasto del mes: ${summary.totalExpense}.`
        : "- Gasto del mes: no disponible.",
      summary?.totalIncome !== undefined
        ? `- Ingreso del mes: ${summary.totalIncome}.`
        : "- Ingreso del mes: no disponible.",
      summary?.budget !== undefined
        ? `- Presupuesto mensual: ${summary.budget}. Usado: ${facts.budgetPct ?? "no disponible"}% (estado: ${budgetStateLabel})${
          typeof facts.budgetRemaining === "number" ? `; restante: ${facts.budgetRemaining}.` : "."
        }`
        : "- Presupuesto mensual: no disponible.",
      typeof facts.deltaExpense === "number"
        ? `- Cambio vs mes anterior (gasto): ${facts.deltaExpense} (${facts.deltaExpensePct ?? "no disponible"}%).`
        : "- Cambio vs mes anterior (gasto): no disponible.",
      facts.topCatsText
        ? `- Top categorías (con % si aplica): ${facts.topCatsText}.`
        : "- Top categorías: no disponible.",
      `- Deuda confirmada por nota (categoría 'deuda'): ${
        facts.debtHint ? "sí" : "no"
      }${facts.debtPlan !== "unknown" ? `; tipo=${facts.debtPlan}` : ""}.`,
      `- Deuda fuera de categoría (por nota): ${facts.debtMismatchTxCount}${
        facts.debtMismatchTxCount > 0
          ? facts.debtMismatchExamples.length
            ? ` (ej: ${facts.debtMismatchExamples
              .map((m) => `${m.date} $${m.amount} ${m.category}`)
              .join(" | ")})`
            : ""
          : " (no se detectaron ejemplos)."
      }.`,
      includeWeekFacts
        ? facts.weekProxy
          ? `- Comparación semanal (proxy con tus movimientos con fecha): ${facts.weekProxy.last7} vs ${facts.weekProxy.prev7} (delta ${facts.weekProxy.delta}${facts.weekProxy.deltaPct !== null ? `, ${facts.weekProxy.deltaPct}%` : ""}).`
          : "- Comparación semanal: aún no hay suficientes movimientos con fecha para comparar con confianza."
        : null,
      includeWeekFacts && facts.weekProxy?.topMovements.length
        ? `- Movimientos grandes ultimos 7 dias: ${facts.weekProxy.topMovements
          .map((m) => `${m.date} $${m.amount} ${m.category}`)
          .join(" | ")}.`
        : null,
      includeHormigaFacts
        ? facts.hormigaCandidates.length
          ? `- Candidatos (subconjunto de gastos pequeños) que parecen repetirse: ${facts.hormigaCandidates
            .map((h) => `${h.category} x${h.count} (total ${h.total}, promedio ${h.avg})`)
            .join(" | ")}.`
          : "- Candidatos (subconjunto de gastos pequeños): aún no hay base suficiente para confirmarlos."
        : null,
      lastTx ? `- Movimientos recientes: ${lastTx}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      // NOTE: `gpt-5-*` models are best used via the Responses API.
      const response = await client.responses.create({
        model: "o4-mini",
        instructions: systemPromptFinal,
        input: userPrompt || "Genera consejos claros y cortos.",
        reasoning: {effort: "low"},
        max_output_tokens: 2000,
        text: {verbosity: "medium"},
      });

      const content = response.output_text?.trim() || "";
      if (!content) {
        const reason = response.incomplete_details?.reason ?? null;
        const apiError = response.error?.message ?? null;
        console.warn("[analyzeSummary] empty output_text", {action, mode, reason, apiError});
        return {message: buildFallbackFromData(summary)};
      }
      return {message: content};
    } catch (error) {
      const errAny = error as {response?: {data?: unknown}; message?: string; status?: number};
      const detail =
        (errAny?.response as {data?: {error?: {message?: string}}})?.data?.error?.message ||
        errAny?.message;
      console.error("[analyzeSummary] error", {action, mode, status: errAny?.status, detail});
      return {message: buildFallbackFromData(summary)};
    }
  },
);

/**
 * Callable: devuelve el perfil del usuario (crea documento base si no existe).
 */
export const getUserProfile = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const targetUid =
    typeof request.data?.uid === "string" ? (request.data.uid as string) : request.auth.uid;
  if (targetUid !== request.auth.uid) {
    await assertAdmin(request.auth.uid);
  }
  const profile = await getOrCreateUserProfile(targetUid);
  return {uid: targetUid, profile};
});

/**
 * Callable: registra la entrada del usuario y respeta el límite de capacidad.
 * Si ya existe, solo devuelve el perfil.
 */
export const registerUserEntry = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const profile = await getOrCreateUserProfile(request.auth.uid);
  return {uid: request.auth.uid, profile};
});

/**
 * Callable: devuelve uso y limite semanal de IA (parse/analyze) para el usuario.
 */
export const getUsageQuota = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const profile = await getOrCreateUserProfile(request.auth.uid);
  const week = currentWeekKey();
  const expired = membershipExpired(profile);
  let effectiveRoleForLimit: UserRole =
    profile.role === "paid_byok" && (!profile.openaiKeyStored || profile.preferredKey === "managed")
      ? "free"
      : profile.role;
  if (expired && (profile.role === "paid_byok" || profile.role === "paid_managed")) {
    effectiveRoleForLimit = "free";
  }
  const parseLimit = getWeeklyLimit(effectiveRoleForLimit, "parse");
  const analyzeLimit = getWeeklyLimit(effectiveRoleForLimit, "analyze");

  const ref = firestore.doc(`usage/${request.auth.uid}`);
  const snap = await ref.get();
  let usedParse = 0;
  let usedAnalyze = 0;
  if (snap.exists) {
    const data = snap.data() as UsageDoc;
    if (data.week === week) {
      usedParse = data.parse ?? 0;
      usedAnalyze = data.analyze ?? 0;
    }
  }

  return {
    week,
    parse: {used: usedParse, limit: parseLimit},
    analyze: {used: usedAnalyze, limit: analyzeLimit},
  };
});

/**
 * Callable: devuelve precios y promo de planes (BYOK / PRO) por periodo.
 */
export const getPlans = onCall(async () => {
  const plansRaw: Array<PlanConfig | null> = [
    getPlanConfig("plan_byok"),
    getPlanConfig("plan_pro"),
  ];
  const plans: PlanConfig[] = plansRaw.filter((p): p is PlanConfig => Boolean(p));

  const periods: PlanPeriod[] = ["monthly", "quarterly", "semiannual", "annual"];
  const mapped = plans.map((plan) => ({
    id: plan.id,
    label: plan.label,
    currency: wompiPlanCurrency,
    promoActive: promoActive(plan),
    promoEndsAt: plan.promoEndsAt || null,
    basePriceCents: plan.basePriceCents,
    promoPriceCents: plan.promoPriceCents || null,
    periods: periods.map((p) => ({
      period: p,
      months: planPeriodMonths(p),
      discount: planPeriodDiscount(p),
      totalCents: computePlanPrice(plan, p),
    })),
  }));

  return {plans: mapped};
});

/**
 * Callable: genera URL de checkout de Wompi para un plan/periodo.
 * Construye referencia plan:period:uid y retorna amount/moneda/url.
 */
export const createWompiCheckout = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  if (!wompiPublicKey) {
    throw new HttpsError("failed-precondition", "Wompi no está configurado (falta WOMPI_PUBLIC_KEY).");
  }
  const {planId, period} = request.data as {planId?: PlanId; period?: PlanPeriod};
  if (!planId || !["plan_byok", "plan_pro"].includes(planId)) {
    throw new HttpsError("invalid-argument", "planId inválido.");
  }
  const periodSafe: PlanPeriod =
    period === "quarterly" || period === "semiannual" || period === "annual" ? period : "monthly";

  const planCfg = getPlanConfig(planId);
  if (!planCfg) {
    throw new HttpsError("invalid-argument", "plan no encontrado.");
  }
  const amount = computePlanPrice(planCfg, periodSafe);
  if (!amount || amount <= 0) {
    throw new HttpsError("failed-precondition", "Precio no configurado para el plan.");
  }

  const uniqueSuffix = Date.now().toString();
  const reference = `${planId}:${periodSafe}:${request.auth.uid}:${uniqueSuffix}`;
  const sig = wompiSignature(amount, wompiPlanCurrency, reference);
  const params = new URLSearchParams();
  params.append("public-key", wompiPublicKey);
  params.append("currency", wompiPlanCurrency);
  params.append("amount-in-cents", amount.toString());
  params.append("reference", reference);
  if (sig) {
    params.append("signature:integrity", sig);
  }
  if (wompiRedirectUrl) {
    params.append("redirect-url", wompiRedirectUrl);
  }
  const checkoutUrl = `https://checkout.wompi.co/p/?${params.toString()}`;

  return {
    planId,
    period: periodSafe,
    reference,
    amountInCents: amount,
    currency: wompiPlanCurrency,
    url: checkoutUrl,
  };
});

/**
 * HTTP webhook: actualiza suscripción desde Wompi (transaction.updated).
 * Se valida firma HMAC SHA256 con WOMPI_EVENT_HASH_KEY.
 * Espera reference con formato plan:uid o plan_uid.
 */
export const wompiWebhook = onRequest({region: "us-central1", maxInstances: 2}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  if (!wompiEventHashKey) {
    res.status(500).send("Wompi no configurado");
    return;
  }
  const signatureHeader =
    (req.headers["x-event-checksum"] as string | undefined)?.trim() ||
    (req.headers["integrity-signature"] as string | undefined)?.trim() ||
    (req.headers["x-event-signature"] as string | undefined)?.trim();

  let payload: unknown;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (error) {
    console.error("No se pudo parsear el body", error);
    res.status(400).send("Body inválido");
    return;
  }

  const wompiPayload = payload as WompiEvent;
  const tx = wompiPayload?.data?.transaction || wompiPayload?.transaction;
  const refParsed = parseWompiReference(tx?.reference);
  if (!refParsed?.uid) {
    res.status(200).send("ok");
    return;
  }

  // Validación flexible de firma (compatibilidad Wompi eventos)
  let sigValid = false;
  try {
    const headerSig = signatureHeader?.startsWith("checksum=")
      ? signatureHeader.split("checksum=")[1]
      : signatureHeader;
    const rawExpected = headerSig
      ? crypto.createHmac("sha256", wompiEventHashKey).update(req.rawBody).digest("hex")
      : null;

    const props = wompiPayload.signature?.properties;
    const checksumBody = wompiPayload.signature?.checksum;
    let propsExpected: string | null = null;
    if (props && props.length) {
      const values: string[] = [];
      props.forEach((path) => {
        const segments = path.split(".");
        let current: unknown = wompiPayload;
        segments.forEach((s) => {
          if (current && typeof current === "object" && s in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[s];
          } else {
            current = undefined;
          }
        });
        if (current !== undefined && current !== null) {
          values.push(String(current));
        }
      });
      propsExpected = crypto.createHash("sha256").update(values.join("") + wompiEventHashKey).digest("hex");
    }

    if (headerSig && (headerSig === rawExpected || headerSig === propsExpected || headerSig === checksumBody)) {
      sigValid = true;
    } else if (checksumBody && (checksumBody === propsExpected || checksumBody === rawExpected)) {
      sigValid = true;
    }
  } catch (err) {
    console.error("Error evaluando firma de evento", err);
  }

  if (!sigValid) {
    console.warn("Firma de evento no validada, continuando por compatibilidad");
    // No bloqueamos en sandbox; se procesa igual.
  }

  const status = tx?.status?.toUpperCase?.() || "";
  const relevantStatus: PaymentStatus[] = ["APPROVED", "PENDING", "DECLINED", "ERROR"];
  if (!relevantStatus.includes(status as PaymentStatus)) {
    res.status(200).send("ok");
    return;
  }

  if (!tx) {
    res.status(200).send("ok");
    return;
  }

  const planCfg = getPlanConfig(refParsed.plan as PlanId);
  if (!planCfg) {
    console.error("Plan no reconocido en reference", refParsed.plan);
    res.status(200).send("Plan no válido");
    return;
  }
  if (!validWompiCurrency(tx)) {
    console.error("Moneda no coincide", {txCurrency: tx?.currency, expectedCurrency: wompiPlanCurrency});
    res.status(200).send("Moneda inválida");
    return;
  }
  const expectedAmount = computePlanPrice(planCfg, refParsed.period);
  if (!expectedAmount || tx.amount_in_cents !== expectedAmount) {
    console.error("Monto no coincide", {
      txAmount: tx?.amount_in_cents,
      expectedAmount,
      plan: planCfg.id,
      period: refParsed.period,
    });
    res.status(200).send("Monto inválido");
    return;
  }

  try {
    await firestore.runTransaction(async (t) => {
      const paymentRef = firestore.collection("payments").doc(tx.id as string);
      const paymentSnap = await t.get(paymentRef);
      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      const statusUpper = status as PaymentStatus;

      if (!paymentSnap.exists) {
        const newPayment: Payment = {
          transactionId: tx.id as string,
          uid: refParsed.uid,
          targetPlan: refParsed.targetPlan,
          months: refParsed.months,
          amountInCents: tx.amount_in_cents ?? expectedAmount,
          currency: tx.currency || wompiPlanCurrency,
          reference: tx.reference || "",
          status: statusUpper,
          processed: false,
          webhookCount: 1,
          createdAt: nowTs,
          lastWebhookAt: nowTs,
        };

        if (statusUpper === "APPROVED") {
          const currentProfile = await getOrCreateUserProfile(refParsed.uid);
          const newExpiresAtMillis = computeNewExpiresAt(
            currentProfile.subscription,
            currentProfile.role,
            refParsed.targetPlan,
            refParsed.months,
          );
          const isByok = refParsed.targetPlan === "byok";
          let newPreferredKey = currentProfile.preferredKey;
          if (isByok) {
            if (!currentProfile.preferredKey) newPreferredKey = "byok";
          } else if (!currentProfile.openaiKeyStored || !currentProfile.preferredKey) {
            newPreferredKey = "managed";
          }
          t.set(
            firestore.collection("users").doc(refParsed.uid),
            {
              role: isByok ? "paid_byok" : "paid_managed",
              subscription: {
                status: "active",
                source: "wompi",
                expiresAt: admin.firestore.Timestamp.fromMillis(newExpiresAtMillis),
                updatedAt: nowTs,
              },
              ...(newPreferredKey ? {preferredKey: newPreferredKey} : {}),
            },
            {merge: true},
          );
          newPayment.processed = true;
        }

        t.set(paymentRef, newPayment);
        return;
      }

      const existing = paymentSnap.data() as Payment;

      if (existing.processed) {
        t.update(paymentRef, {
          status: statusUpper,
          webhookCount: admin.firestore.FieldValue.increment(1),
          lastWebhookAt: nowTs,
        });
        return;
      }

      if (statusUpper === "APPROVED") {
        const currentProfile = await getOrCreateUserProfile(existing.uid);
        const newExpiresAtMillis = computeNewExpiresAt(
          currentProfile.subscription,
          currentProfile.role,
          existing.targetPlan,
          existing.months,
        );
        const isByok = existing.targetPlan === "byok";
        let newPreferredKey = currentProfile.preferredKey;
        if (isByok) {
          if (!currentProfile.preferredKey) newPreferredKey = "byok";
        } else if (!currentProfile.openaiKeyStored || !currentProfile.preferredKey) {
          newPreferredKey = "managed";
        }
        t.set(
          firestore.collection("users").doc(existing.uid),
          {
            role: isByok ? "paid_byok" : "paid_managed",
            subscription: {
              status: "active",
              source: "wompi",
              expiresAt: admin.firestore.Timestamp.fromMillis(newExpiresAtMillis),
              updatedAt: nowTs,
            },
            ...(newPreferredKey ? {preferredKey: newPreferredKey} : {}),
          },
          {merge: true},
        );
        t.update(paymentRef, {
          status: statusUpper,
          processed: true,
          webhookCount: admin.firestore.FieldValue.increment(1),
          lastWebhookAt: nowTs,
        });
        return;
      }

      t.update(paymentRef, {
        status: statusUpper,
        webhookCount: admin.firestore.FieldValue.increment(1),
        lastWebhookAt: nowTs,
      });
    });
  } catch (error) {
    console.error("Error actualizando suscripción Wompi", error);
    res.status(500).send("error");
    return;
  }

  res.status(200).send("ok");
});

/**
 * Scheduled task: marca suscripciones vencidas como expiradas diariamente.
 */
export const expireSubscriptions = onSchedule(
  {region: "us-central1", schedule: "0 0 * * *"}, // 00:00 UTC diario
  async () => {
    const now = Date.now();
    const snap = await firestore
      .collection("users")
      .where("subscription.status", "==", "active")
      .where("subscription.expiresAt", "<", admin.firestore.Timestamp.fromMillis(now))
      .limit(500)
      .get();

    const batch = firestore.batch();
    snap.docs.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          subscription: {
            status: "expired",
            source: (doc.get("subscription.source") as SubscriptionSource) || "manual",
            expiresAt: doc.get("subscription.expiresAt") || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    });
    if (!snap.empty) {
      await batch.commit();
    }
  },
);

/**
 * Callable: guarda la API key BYOK del usuario en Secret Manager y marca el estado.
 */
export const setUserOpenAIKey = onCall(
  {},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const {openaiKey, preferredKey} = request.data as {
      openaiKey?: string;
      preferredKey?: KeyPreference;
    };
    if (!openaiKey || typeof openaiKey !== "string") {
      throw new HttpsError("invalid-argument", "Envía openaiKey como string.");
    }
    const trimmed = openaiKey.trim();
    if (trimmed.length < 20 || trimmed.length > 200) {
      throw new HttpsError("invalid-argument", "La API key no tiene un largo válido.");
    }

    await getOrCreateUserProfile(request.auth.uid);
    await saveUserOpenAIKey(request.auth.uid, trimmed);
    await updateUserProfile(request.auth.uid, {
      openaiKeyStored: true,
      preferredKey: preferredKey === "managed" ? "managed" : "byok",
    });

    return {status: "ok", source: "byok"};
  },
);

/**
 * Callable: elimina la API key BYOK del usuario.
 */
export const clearUserOpenAIKey = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  await deleteUserOpenAIKey(request.auth.uid);
  await updateUserProfile(request.auth.uid, {
    openaiKeyStored: false,
    preferredKey: null,
  });
  return {status: "ok"};
});

/**
 * Callable: usuario elige preferencia de clave (BYOK vs administrada) si su rol lo permite.
 */
export const setUserKeyPreference = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const {preferredKey} = request.data as {preferredKey?: KeyPreference};
  if (preferredKey !== "byok" && preferredKey !== "managed") {
    throw new HttpsError("invalid-argument", "preferredKey debe ser byok o managed.");
  }

  const profile = await getOrCreateUserProfile(request.auth.uid);
  if (preferredKey === "byok" && !profile.openaiKeyStored) {
    throw new HttpsError("failed-precondition", "Primero sube tu API key.");
  }
  if (preferredKey === "managed" && !managedKeyAllowed(profile)) {
    throw new HttpsError(
      "permission-denied",
      "Tu plan no permite usar la clave administrada.",
    );
  }

  await updateUserProfile(request.auth.uid, {preferredKey});
  return {status: "ok"};
});

/**
 * Callable: solo admin. Actualiza rol, suscripción y preferencia de clave.
 */
export const setUserRole = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  await assertAdmin(request.auth.uid);

  const {uid, role, subscription, preferredKey} = request.data as {
    uid?: string;
    role?: UserRole;
    preferredKey?: KeyPreference;
    subscription?: {
      status?: SubscriptionStatus;
      source?: SubscriptionSource;
      expiresAt?: number | null;
    };
  };

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid es requerido.");
  }
  const allowedRoles: UserRole[] = [
    "admin",
    "free",
    "paid_byok",
    "paid_managed",
    "gifted_managed",
  ];
  if (!role || !allowedRoles.includes(role)) {
    throw new HttpsError("invalid-argument", "role no es válido.");
  }

  const currentProfile = await getOrCreateUserProfile(uid);
  const update: Partial<UserProfile> = {role};

  const preferredInput =
    preferredKey === "byok" || preferredKey === "managed" ? preferredKey : currentProfile.preferredKey;
  const subInput = subscription ?? {};
  const shouldUpdateSubscription =
    subInput.status !== undefined ||
    subInput.source !== undefined ||
    subInput.expiresAt !== undefined;

  if (shouldUpdateSubscription) {
    const expiresAtInput =
      subInput.expiresAt === undefined
        ? currentProfile.subscription.expiresAt
        : subInput.expiresAt;
    const expiresAtTimestamp =
      expiresAtInput === null || expiresAtInput === undefined
        ? expiresAtInput
        : admin.firestore.Timestamp.fromMillis(Number(expiresAtInput));

    update.subscription = {
      status:
        (subInput.status as SubscriptionStatus) ??
        (currentProfile.subscription.status as SubscriptionStatus) ??
        "expired",
      source:
        (subInput.source as SubscriptionSource) ??
        (currentProfile.subscription.source as SubscriptionSource) ??
        "manual",
      ...(expiresAtTimestamp !== undefined ? {expiresAt: expiresAtTimestamp} : {}),
    };
  }

  const sanitizedPreferred = sanitizePreferredKey(
    role,
    preferredInput as KeyPreference | null | undefined,
    currentProfile.openaiKeyStored,
  );
  update.preferredKey = sanitizedPreferred;

  await updateUserProfile(uid, update);
  await syncAdminClaim(uid, role === "admin");
  return {status: "ok"};
});

/**
 * Callable: solo admin. Lista perfiles de usuarios (máximo 200 documentos).
 */
export const listUsers = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  await assertAdmin(request.auth.uid);

  const snap = await firestore
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const users = snap.docs.map((doc) => {
    const data = normalizeUserProfile(doc.data() as Partial<UserProfile>);
    return {
      uid: doc.id,
      profile: data,
      createdAt:
        (doc.get("createdAt") as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? null,
      updatedAt:
        (doc.get("updatedAt") as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? null,
    };
  });

  return {users};
});

function clientSupportedMode(mode: string): mode is AdvisorMode {
  return ["amable", "reganon"].includes(mode);
}

export const setAdvisorMode = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const {mode} = request.data as {mode?: string};
  if (!mode || !clientSupportedMode(mode)) {
    throw new HttpsError("invalid-argument", "Modo no soportado.");
  }
  await updateUserProfile(request.auth.uid, {advisorMode: mode});
  const profile = await getOrCreateUserProfile(request.auth.uid);
  return {advisorMode: profile.advisorMode};
});

function deriveRelativeDate(text: string, offsetMinutes?: number): string | null {
  const lower = text.toLowerCase();
  const offset = typeof offsetMinutes === "number" ? offsetMinutes : new Date().getTimezoneOffset();
  const nowMs = Date.now();
  const toIso = (ms: number) => new Date(ms - offset * 60_000).toISOString().slice(0, 10);

  if (lower.includes("anteayer")) {
    return toIso(nowMs - 2 * 86_400_000);
  }
  if (lower.includes("ayer")) {
    return toIso(nowMs - 86_400_000);
  }
  if (lower.includes("hoy") || lower.includes("ahora")) {
    return toIso(nowMs);
  }

  const agoMatch = lower.match(/hace\s+(\d+)\s*d[ií]as?/);
  if (agoMatch) {
    const days = Number(agoMatch[1]) || 0;
    return toIso(nowMs - days * 86_400_000);
  }

  const weekdayMatch = lower.match(
    /(lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[áa]bado|sabado|domingo)\s+pasad[oa]/,
  );
  if (weekdayMatch) {
    const map: Record<string, number> = {
      lunes: 1,
      martes: 2,
      miércoles: 3,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sábado: 6,
      sabado: 6,
      domingo: 0,
    };
    const target = map[weekdayMatch[1]];
    if (target !== undefined) {
      const clientNow = new Date(nowMs - offset * 60_000);
      const current = clientNow.getUTCDay();
      let diff = current - target;
      if (diff <= 0) diff += 7;
      const targetMs = nowMs - diff * 86_400_000;
      return toIso(targetMs);
    }
  }

  const dayOfMonth = lower.match(/\b(?:el|para el|dia|d[ií]a)\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const dayNum = Number(dayOfMonth[1]);
    if (dayNum >= 1 && dayNum <= 31) {
      const temp = new Date(nowMs - offset * 60_000);
      temp.setUTCDate(1);
      temp.setUTCDate(dayNum);
      return temp.toISOString().slice(0, 10);
    }
  }

  return null;
}

function buildFallbackFromData(summary?: SpendingSummary): string {
  const lines: string[] = [];
  if (summary?.totalExpense !== undefined) {
    lines.push(`Gasto del mes: $${summary.totalExpense.toLocaleString()}.`);
  }
  if (summary?.totalIncome !== undefined) {
    lines.push(`Ingreso del mes: $${summary.totalIncome.toLocaleString()}.`);
  }
  if (summary?.budget !== undefined && summary.totalExpense !== undefined) {
    const pct = summary.budget > 0
      ? Math.round((summary.totalExpense / summary.budget) * 100)
      : 0;
    lines.push(`Presupuesto: $${summary.budget.toLocaleString()} (${pct}% usado).`);
  }
  if (summary?.topCategories?.length) {
    const top = summary.topCategories
      .slice(0, 3)
      .map((c) => `${c.category}: $${c.amount.toLocaleString()}`)
      .join(" | ");
    lines.push(`Top categorías: ${top}.`);
  }
  lines.push("Acción principal: reduce un gasto discrecional y registra ingresos faltantes.");
  return lines.join(" ");
}
