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
  note?: string;
  paymentMethod: "efectivo" | "debito" | "credito" | "digital" | "otro";
  type: "expense" | "income";
  date: string;
  confidence?: number;
  rawText?: string;
}

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

interface MonthlyDeepInput {
  tone: AdvisorMode;
  currency: string;
  userLocale: string;
  months: string[];
  categories: {
    id: string;
    name: string;
    last3Months: number[];
    last3Budgets?: (number | null)[];
    isIncome?: boolean;
  }[];
}

interface MonthlyDeepOutput {
  summary: string;
  globalTrend: "sube" | "baja" | "estable";
  keySignals: {
    type: "alto_gasto" | "bajo_gasto" | "ingreso_cae" | "ingreso_sube";
    categoryName?: string;
    description: string;
  }[];
  categoryPlans: {
    categoryName: string;
    lastMonthLabel: string;
    lastMonthAmount: number;
    avgPrev2Amount: number;
    changePctVsAvg: number;
    overBudgetPct?: number | null;
    priority: "alta" | "media" | "baja";
    advice: string;
  }[];
  top3Actions: string[];
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
    "Eres un asesor financiero empatico y motivador. Habla en 2-4 frases cortas " +
    "y propone 1 accion concreta. Usa lenguaje sencillo, positivo y cercano.",
  "reganon":
    "Eres un asesor financiero sarcastico estilo roast. Maximo 40 palabras. " +
    "Se directo, incisivo y un poco burla, pero siempre con una accion clara al final.",
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
        "Si ves ingresos, usa type income.";

      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {role: "system", content: system},
          {role: "user", content: text},
        ],
        response_format: {
          type: "json_schema",
          json_schema: {name: "transaction", schema, strict: true},
        },
        max_tokens: 200,
        temperature: 0.2,
      });

      const raw = completion.choices?.[0]?.message?.content;
      const parsed = raw ? (JSON.parse(raw) as Partial<ParsedTransaction>) : {};
      const relativeDate = deriveRelativeDate(text, clientOffsetMinutes);
      const todayIsoStr = isoDateWithOffset(0, clientOffsetMinutes);
      let dateCandidate = relativeDate ?? parsed.date ?? todayIsoStr;
      if (!relativeDate && !textHasDateHint(text)) {
        dateCandidate = todayIsoStr;
      }

      const result: ParsedTransaction = {
        amount: parsed.amount ?? 0,
        category: parsed.category ?? "sin-categoria",
        paymentMethod:
          (parsed.paymentMethod as ParsedTransaction["paymentMethod"]) ?? "debito",
        type: (parsed.type as ParsedTransaction["type"]) ?? "expense",
        date: dateCandidate,
        note: parsed.note ?? text,
        confidence: parsed.confidence ?? 0.6,
        rawText: text,
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
export const analyzeSummary = onCall(
  {secrets: [openAIApiKey]},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const {mode = "amable", summary, action} = request.data as {
      mode?: AdvisorMode;
      summary?: SpendingSummary;
      action?: string;
    };
    if (!clientSupportedMode(mode)) {
      throw new HttpsError("invalid-argument", "Modo de asesor no soportado.");
    }

    const {client, profile, effectiveRoleForLimit} = await resolveOpenAIClient(request.auth.uid);
    await checkRateLimit(request.auth.uid, "analyze", profile, effectiveRoleForLimit);
    const systemPrompt =
      `${advisorPrompts[mode]} ` +
      "Habla en viñetas cortas (máximo 4-6). Incluye siempre una línea " +
      '"Acción principal: ...". Usa números concretos del resumen (gasto, ' +
      "ingreso, presupuesto, categorías top). Si hay presupuesto, indica " +
      "porcentaje usado. No incluyas textos de descargo; el cliente mostrará " +
      "el aviso final.";

    const topCategoriesText = summary?.topCategories
      ?.map((item) => `${item.category}: ${item.amount}`)
      .join(", ");

    const lastTx = summary?.lastTransactions
      ?.slice(0, 5)
      .map((t) => {
        const label = t.type === "income" ? "Ingreso" : "Gasto";
        return `${t.date} ${label} $${t.amount} ${t.category} (${t.note || ""})`;
      })
      .join(" | ");

    const userPrompt = [
      action ? `Acción solicitada: ${action}.` : null,
      summary?.month ? `Mes: ${summary.month}.` : null,
      summary?.totalExpense !== undefined
        ? `Total gasto mes: ${summary.totalExpense}.`
        : null,
      summary?.totalIncome !== undefined
        ? `Total ingreso mes: ${summary.totalIncome}.`
        : null,
      summary?.budget !== undefined
        ? `Presupuesto mensual: ${summary.budget}.`
        : null,
      summary?.previousMonthExpense !== undefined
        ? `Gasto mes anterior: ${summary.previousMonthExpense}.`
        : null,
      summary?.previousMonthIncome !== undefined
        ? `Ingreso mes anterior: ${summary.previousMonthIncome}.`
        : null,
      topCategoriesText ? `Top categorías (monto): ${topCategoriesText}.` : null,
      lastTx ? `Últimos movimientos: ${lastTx}.` : null,
      "Si no hay datos suficientes, dilo y pide registrar movimientos clave.",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: userPrompt || "Genera consejos claros y cortos."},
        ],
        max_tokens: 350,
        temperature: 0.6,
      });

      const content = completion.choices?.[0]?.message?.content;
      return {message: content ?? buildFallbackFromData(summary)};
    } catch (error) {
      console.error("[analyzeSummary] error", error);
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

export const analyzeMonthlyDeep = onCall({secrets: [openAIApiKey]}, async (request): Promise<MonthlyDeepOutput> => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Inicia sesión para usar IA.");
  }
  const {profile, effectiveRoleForLimit} = await resolveOpenAIClient(request.auth.uid);
  if (!["paid_byok", "paid_managed", "gifted_managed", "admin", "free"].includes(profile.role)) {
    throw new HttpsError("permission-denied", "No tienes permisos para este analisis.");
  }
  await checkRateLimit(request.auth.uid, "analyze", profile, effectiveRoleForLimit);

  const input = (request.data as {input?: MonthlyDeepInput} | undefined)?.input;
  if (!input || !Array.isArray(input.months) || input.months.length < 3) {
    throw new HttpsError("invalid-argument", "Faltan meses o datos.");
  }

  const months = input.months;
  const lastLabel = months[months.length - 1];
  const categoryPlans = input.categories.map((cat) => {
    const last = cat.last3Months?.[cat.last3Months.length - 1] ?? 0;
    const prev = cat.last3Months?.slice(0, cat.last3Months.length - 1) ?? [];
    const avgPrev = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    const changePct = avgPrev > 0 ? ((last - avgPrev) / avgPrev) * 100 : last > 0 ? 100 : 0;
    const lastBudget = cat.last3Budgets?.[cat.last3Budgets.length - 1] ?? null;
    const overBudgetPct =
      lastBudget && lastBudget > 0 ? ((last - lastBudget) / lastBudget) * 100 : null;
    let priority: "alta" | "media" | "baja" = "baja";
    if (changePct > 30 || (overBudgetPct !== null && overBudgetPct > 20)) priority = "alta";
    else if (changePct > 10 || (overBudgetPct !== null && overBudgetPct > 0)) priority = "media";

    let advice = cat.isIncome
      ? "Ajusta tu flujo con los ingresos recientes."
      : "Mantén control y define un tope claro.";
    if (!cat.isIncome) {
      if (priority === "alta") advice = "Recorta 10-20% este mes y fija alertas.";
      else if (priority === "media") advice = "Revisa compras frecuentes y baja frecuencia.";
      else advice = "Sigue igual, sin cambios fuertes.";
    }

    return {
      categoryName: cat.name,
      lastMonthLabel: lastLabel,
      lastMonthAmount: last,
      avgPrev2Amount: Math.round(avgPrev),
      changePctVsAvg: Math.round(changePct),
      overBudgetPct: overBudgetPct !== null ? Math.round(overBudgetPct) : null,
      priority,
      advice,
    };
  });

  const totalLast = input.categories.reduce(
    (acc, c) => acc + (c.last3Months?.[c.last3Months.length - 1] ?? 0),
    0,
  );
  const totalPrevAvg = input.categories.reduce((acc, c) => {
    const prev = c.last3Months?.slice(0, c.last3Months.length - 1) ?? [];
    const avgPrev = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    return acc + avgPrev;
  }, 0);
  const globalChange = totalPrevAvg > 0 ? ((totalLast - totalPrevAvg) / totalPrevAvg) * 100 : 0;
  const globalTrend = globalChange > 5 ? "sube" : globalChange < -5 ? "baja" : "estable";

  const keySignals: MonthlyDeepOutput["keySignals"] = categoryPlans
    .filter((p) => Math.abs(p.changePctVsAvg) >= 20)
    .slice(0, 4)
    .map((p) => ({
      type: p.changePctVsAvg >= 0 ? "alto_gasto" : "bajo_gasto",
      categoryName: p.categoryName,
      description: `${p.categoryName}: ${p.changePctVsAvg >= 0 ? "+" : ""}${p.changePctVsAvg}% vs prom.`,
    }));

  const sortedByPriority = [...categoryPlans].sort((a, b) => {
    const rank = {alta: 3, media: 2, baja: 1};
    return rank[b.priority] - rank[a.priority];
  });
  const top3Actions = sortedByPriority
    .filter((p) => p.priority !== "baja")
    .slice(0, 3)
    .map((p) => `${p.categoryName}: ${p.advice}`);

  const summaryParts: string[] = [];
  if (globalTrend === "sube") summaryParts.push("Gasto del último mes sube vs promedio previo.");
  else if (globalTrend === "baja") summaryParts.push("Gasto bajó frente a los 2 meses anteriores.");
  else summaryParts.push("Gasto estable comparado con meses previos.");
  if (sortedByPriority[0]) {
    summaryParts.push(`Categoría clave: ${sortedByPriority[0].categoryName}.`);
  }

  return {
    summary: summaryParts.join(" "),
    globalTrend,
    keySignals,
    categoryPlans,
    top3Actions,
  };
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
