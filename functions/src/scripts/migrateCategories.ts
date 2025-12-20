/* eslint-disable no-console */
import * as admin from 'firebase-admin';

/**
 * Usage:
 *  cd functions
 *  npm run build
 *  node lib/scripts/migrateCategories.js --uids=uid1,uid2 [--apply] [--delete-old]
 *
 * By default this runs in dry-run mode (no writes). Use --apply to execute writes.
 * Make sure you have GOOGLE_APPLICATION_CREDENTIALS or a default admin credential set.
 */

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const BATCH_LIMIT = 400;
const AUTO_ID_RE = /^[A-Za-z0-9]{20}$/;

type WriteOp =
  | { type: 'set'; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData; merge?: boolean }
  | {
      type: 'update';
      ref: FirebaseFirestore.DocumentReference;
      data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
    }
  | { type: 'delete'; ref: FirebaseFirestore.DocumentReference };

type CategoryDoc = {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  order?: number;
  isArchived?: boolean;
  isSystem?: boolean;
};

type Options = {
  uids: string[];
  apply: boolean;
  dryRun: boolean;
  deleteOld: boolean;
};

const normalizeLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const slugifyLabel = (value: string) =>
  normalizeLabel(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const isAutoId = (value: string) => AUTO_ID_RE.test(value);

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const commitOps = async (ops: WriteOp[], dryRun: boolean, label: string) => {
  if (!ops.length) return;
  if (dryRun) {
    console.log(`[dry-run] ${label}: ${ops.length} write(s)`);
    return;
  }
  for (const batchOps of chunk(ops, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const op of batchOps) {
      if (op.type === 'set') {
        if (op.merge) {
          batch.set(op.ref, op.data, { merge: true });
        } else {
          batch.set(op.ref, op.data);
        }
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
  console.log(`${label}: ${ops.length} write(s) committed`);
};

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  const uidsArg = args.find((arg) => arg.startsWith('--uids=') || arg.startsWith('--uid='));
  const uids = uidsArg
    ? uidsArg
        .split('=')[1]
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean)
    : [];
  const apply = args.includes('--apply');
  const deleteOld = args.includes('--delete-old');
  const dryRun = args.includes('--dry-run') || !apply;

  if (!uids.length) {
    console.error('Missing --uids. Example: --uids=uid1,uid2');
    process.exit(1);
  }

  return { uids, apply, dryRun, deleteOld };
};

const normalizeBudgetMap = (
  perCategory: Record<string, unknown>,
  resolveId: (raw: unknown) => string | null,
) => {
  const next: Record<string, unknown> = {};
  let changed = false;
  let keysChanged = 0;

  for (const [rawKey, rawValue] of Object.entries(perCategory)) {
    const resolvedKey = resolveId(rawKey) ?? rawKey;
    if (resolvedKey !== rawKey) {
      changed = true;
      keysChanged += 1;
    }

    const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const nextValue = Number.isFinite(numeric) ? numeric : rawValue;

    const existing = next[resolvedKey];
    if (existing === undefined) {
      next[resolvedKey] = nextValue;
      continue;
    }

    if (typeof existing === 'number' && typeof nextValue === 'number') {
      const maxValue = Math.max(existing, nextValue);
      if (maxValue !== existing) {
        next[resolvedKey] = maxValue;
      }
    }

    changed = true;
  }

  return { next, changed, keysChanged };
};

const migrateUser = async (uid: string, options: Options) => {
  console.log(`\n== Migrating ${uid} (${options.dryRun ? 'dry-run' : 'apply'}) ==`);

  const categoriesSnap = await db.collection(`users/${uid}/categories`).get();
  const categories: CategoryDoc[] = categoriesSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      label: (data.label as string) ?? doc.id,
      icon: data.icon as string | undefined,
      color: data.color as string | undefined,
      order: typeof data.order === 'number' ? data.order : Number(data.order) || 0,
      isArchived: data.isArchived as boolean | undefined,
      isSystem: data.isSystem as boolean | undefined,
    };
  });

  if (!categories.length) {
    console.log(`[${uid}] No categories found. Skipping.`);
    return;
  }

  const usedIds = new Set(categories.map((c) => c.id));
  const idMap = new Map<string, string>();
  const createOps: WriteOp[] = [];
  let fallbackCounter = 0;

  for (const category of categories) {
    if (category.isSystem) continue;
    if (!isAutoId(category.id)) continue;

    const labelSlug = slugifyLabel(category.label);
    if (labelSlug && labelSlug === category.id) continue;

    let base = labelSlug;
    if (!base) {
      base = `categoria-${Date.now()}-${fallbackCounter++}`;
    }

    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(candidate);
    idMap.set(category.id, candidate);

    const data: Record<string, unknown> = {
      label: category.label,
      icon: category.icon ?? 'Tag',
      order: typeof category.order === 'number' ? category.order : 0,
      isArchived: category.isArchived ?? false,
      isSystem: category.isSystem ?? false,
    };
    if (category.color) data.color = category.color;

    createOps.push({
      type: 'set',
      ref: db.doc(`users/${uid}/categories/${candidate}`),
      data,
    });
  }

  console.log(`[${uid}] Categories to rename: ${idMap.size}`);
  await commitOps(createOps, options.dryRun, `[${uid}] category creates`);

  const labelToId = new Map<string, string>();
  const validIds = new Set<string>();
  let maxOrder = categories.reduce((acc, c) => Math.max(acc, c.order ?? 0), 0);

  for (const category of categories) {
    const mappedId = idMap.get(category.id) ?? category.id;
    validIds.add(mappedId);
    const normalized = normalizeLabel(category.label ?? mappedId);
    if (normalized && !labelToId.has(normalized)) {
      labelToId.set(normalized, mappedId);
    }
  }

  let otrosId: string | null =
    labelToId.get(normalizeLabel('Otros')) ?? (validIds.has('otros') ? 'otros' : null);
  let otrosCreated = 0;

  const ensureOtrosCategory = async (): Promise<string> => {
    if (otrosId) return otrosId;
    otrosId = 'otros';
    validIds.add(otrosId);
    labelToId.set(normalizeLabel('Otros'), otrosId);
    maxOrder += 1;

    const data = {
      label: 'Otros',
      icon: 'Tag',
      order: maxOrder,
      isArchived: false,
      isSystem: true,
    };
    await commitOps(
      [
        {
          type: 'set',
          ref: db.doc(`users/${uid}/categories/${otrosId}`),
          data,
        },
      ],
      options.dryRun,
      `[${uid}] create "otros" category`,
    );
    otrosCreated += 1;
    return otrosId;
  };

  const resolveId = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const mapped = idMap.get(trimmed);
    if (mapped) return mapped;
    if (validIds.has(trimmed)) return trimmed;
    const normalized = normalizeLabel(trimmed);
    return normalized ? labelToId.get(normalized) ?? null : null;
  };

  let txUpdated = 0;
  let unresolvedMovedToOtros = 0;
  const txOps: WriteOp[] = [];
  let lastTx: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const txBase = db.collection('transactions').where('userId', '==', uid);

  while (true) {
    let txQuery = txBase.orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastTx) txQuery = txQuery.startAfter(lastTx);
    const snap = await txQuery.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data.type === 'income') continue;

      const rawCategory =
        typeof data.categoryId === 'string'
          ? data.categoryId
          : typeof data.category === 'string'
            ? data.category
            : '';

      let resolved = resolveId(rawCategory);
      if (!resolved) {
        resolved = await ensureOtrosCategory();
        unresolvedMovedToOtros += 1;
      }

      if (data.categoryId !== resolved || data.category !== resolved) {
        txOps.push({
          type: 'update',
          ref: docSnap.ref,
          data: { categoryId: resolved, category: resolved },
        });
        txUpdated += 1;
      }
    }

    lastTx = snap.docs[snap.docs.length - 1];
  }

  await commitOps(txOps, options.dryRun, `[${uid}] transactions`);

  let templatesUpdated = 0;
  const templateOps: WriteOp[] = [];
  const templatesSnap = await db.collection('templates').where('userId', '==', uid).get();
  for (const docSnap of templatesSnap.docs) {
    const data = docSnap.data();
    if (data.type === 'income') continue;

    const rawCategory =
      typeof data.categoryId === 'string'
        ? data.categoryId
        : typeof data.category === 'string'
          ? data.category
          : '';
    if (!rawCategory) continue;

    let resolved = resolveId(rawCategory);
    if (!resolved) {
      resolved = await ensureOtrosCategory();
      unresolvedMovedToOtros += 1;
    }

    if (data.categoryId !== resolved || data.category !== resolved) {
      templateOps.push({
        type: 'update',
        ref: docSnap.ref,
        data: { categoryId: resolved, category: resolved, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      });
      templatesUpdated += 1;
    }
  }
  await commitOps(templateOps, options.dryRun, `[${uid}] templates`);

  let budgetsUpdated = 0;
  let budgetKeysUpdated = 0;
  const budgetOps: WriteOp[] = [];
  let lastBudget: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const prefix = `${uid}_`;
  const budgetsBase = db.collection('budgets');

  while (true) {
    let budgetQuery = budgetsBase
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAt(prefix)
      .endAt(`${prefix}\uf8ff`)
      .limit(500);
    if (lastBudget) budgetQuery = budgetQuery.startAfter(lastBudget);
    const snap = await budgetQuery.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const perCategory = data.perCategory as Record<string, unknown> | undefined;
      if (!perCategory || typeof perCategory !== 'object') continue;

      const { next, changed, keysChanged } = normalizeBudgetMap(perCategory, resolveId);
      if (!changed) continue;

      budgetKeysUpdated += keysChanged;
      budgetsUpdated += 1;
      budgetOps.push({
        type: 'set',
        ref: docSnap.ref,
        data: { perCategory: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        merge: true,
      });
    }

    lastBudget = snap.docs[snap.docs.length - 1];
  }
  await commitOps(budgetOps, options.dryRun, `[${uid}] budgets`);

  const deleteOps: WriteOp[] = [];
  if (options.deleteOld && idMap.size) {
    for (const [oldId] of idMap.entries()) {
      deleteOps.push({
        type: 'delete',
        ref: db.doc(`users/${uid}/categories/${oldId}`),
      });
    }
  }
  await commitOps(deleteOps, options.dryRun, `[${uid}] category deletes`);

  console.log(
    `[${uid}] Summary: categoriesRenamed=${idMap.size}, otrosCreated=${otrosCreated}, ` +
      `txUpdated=${txUpdated}, templatesUpdated=${templatesUpdated}, budgetsUpdated=${budgetsUpdated}, ` +
      `budgetKeysUpdated=${budgetKeysUpdated}, unresolvedMovedToOtros=${unresolvedMovedToOtros}`,
  );
};

const main = async () => {
  const options = parseArgs();
  for (const uid of options.uids) {
    await migrateUser(uid, options);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
