# Arquitectura tecnica

## Vision general
GastoSense se divide en 3 capas principales:
- **Frontend** (`frontend/`): React 19 + Vite + Tailwind + ECharts. UI, chat IA, Quick Add, charts y acciones.
- **Backend serverless** (`functions/`): Firebase Functions con logica de negocio (IA, cuotas, planes, Wompi, BYOK/keys, perfiles/admin).
- **Datos + seguridad** (Firestore + reglas + Secret Manager): almacenamiento por `userId` y claves seguras.

## Repositorio y carpetas
- `frontend/`: app React (Vite).
- `functions/`: Firebase Functions (Node 20) con logica principal.
- `docs/`: documentacion del producto y arquitectura (incluye `SYSTEM_PROMPT_MAESTRO.md`).
- `.github/workflows/`: CI.
- Raiz: `firebase.json`, reglas e indices Firestore.

## Frontend (`frontend/src`)
Arquitectura por capas (sin router):
- **AppShell** (`src/App.tsx`): tabs, modales globales, y acciones cross-tab.
- **Pages** (`src/pages/*`): UI por tab.
- **Hooks** (`src/hooks/*`): controllers por dominio.
- **Services** (`src/services/*`): wrappers de Firestore/Functions.
- **Context** (`src/context/*`): Auth y Theme.
- **Utils** (`src/utils/*`): fechas, formatters, errores IA.
- **Types** (`src/types/*`): modelos compartidos.

### AppShell (src/App.tsx)
Responsabilidades:
- **Auth gate**: si no hay sesion, muestra `LoginHero`.
- **Tabs**: `activeTab` (Inicio/Movimientos/Asesor/Metrics/Config).
- **Modales globales**: `QuickAddSheet`, `TransactionEditModal`, `UpgradeModal`, `LimitsHelpModal`.
- **Acciones cross-tab**: `openMovements`, `openBudgets`, `openPlans`, `openAdvisor`.
- **Acciones IA**: `handleAiActionClick` interpreta `[ACTION_DATA]` y navega/abre presupuesto.

### Pages (src/pages/*)
- `HomePage`: metricas del mes, smart cards, presupuesto, templates recurrentes.
- `TransactionsPage`: lista, filtros, paginacion, seleccion para editar.
- `AdvisorPage`: chat IA + quick actions.
- `MetricsPage`: charts de evolucion (ECharts).
- `SettingsPage`: perfil, cuota IA, BYOK, planes y admin.

### Hooks por dominio (src/hooks/*)
- `useTransactionsController`: listener + filtros por fecha/categoria/busqueda (nota + categoria).
- `useHomeMonthController`: listener del mes + derivados + smart cards.
- `useBudgetController`: presupuesto total y por categoria.
- `useTemplatesController`: CRUD de templates.
- `useAdvisorController`:
  - Sanitiza `lastTransactions` (amount/category/type/date + note compacta opcional).
  - Parsea `[CHART_DATA]` y `[ACTION_DATA]` del texto IA.
  - Bloquea quick actions mientras `advisorLoading`.
  - Descarta respuestas viejas si cambia el modo (anti-race).
- `useSettingsController`: perfil, cuotas, BYOK, planes y admin.
- `useIaQuota`: lectura/refresh de cuota semanal.

### Asesor IA (UI)
- Quick actions y locks por rol/cuota.
- Feed con loader "IA escribiendo".
- Charts dinamicos en respuestas (bar horizontal) usando `chartTop`.
- Botones interactivos generados desde `[ACTION_DATA]`.

### Login (Firebase Auth + Google)
- iOS Safari usa `signInWithRedirect`.
- Otros navegadores usan `signInWithPopup`.
- `AuthProvider` procesa `getRedirectResult(auth)` una sola vez al inicio.

## Backend Functions (`functions/src/index.ts`)

### IA
- `parseTransactionPhrase`: `gpt-5-mini` via Responses API con `json_schema` estricto.
- `transcribeAudio`: `whisper-1`, max 10s y ~6MB.
- `analyzeSummary`: `o4-mini` via Responses API.
  - System prompt con guardrails y playbooks por accion.
  - Salida: texto + `[CHART_DATA]` opcional + `[ACTION_DATA]` opcional (JSON estricto).
  - Fuente de verdad: `docs/SYSTEM_PROMPT_MAESTRO.md`.

### Cuotas y roles
- Limites semanales por rol (`usage/{uid}`).
- `getUsageQuota` expone uso/limites.
- `setAdvisorMode` persiste tono en perfil.

### Claves
- BYOK en Secret Manager: `setUserOpenAIKey`, `clearUserOpenAIKey`.
- Preferencia de clave: `setUserKeyPreference`.

### Planes y pagos
- `getPlans`, `createWompiCheckout`, `wompiWebhook` (idempotente).
- `expireSubscriptions` (cron diario).
- Idempotencia con `payments/{transactionId}`.

### Admin
- `listUsers` y `setUserRole` (solo admin).
- `getUserProfile`, `registerUserEntry`.

## Datos y seguridad (Firestore)
- Colecciones: `transactions`, `templates`, `budgets`, `users`, `usage`, `payments`.
- Reglas: acceso por `userId`, escritura de `users` solo admin.

## Integraciones externas
- OpenAI: `gpt-5-mini`, `o4-mini`, `whisper-1`.
- Firebase: Auth, Firestore, Functions, Hosting, Secret Manager.
- Wompi: checkout + webhook.

## Configuracion y despliegue
- Frontend: `frontend/.env` con `VITE_FIREBASE_*`.
- Functions: secretos `OPENAI_API_KEY`, `WOMPI_*`, `MAX_USERS`.
- Deploy:
  - `cd frontend && npm run build` + `firebase deploy --only hosting`
  - `cd functions && npm run lint && npm run build` + `firebase deploy --only functions`
