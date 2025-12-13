# Arquitectura técnica

## Visión general (alto nivel)
GastoSense se divide en 3 capas principales:
- **Frontend** (`frontend/`): app React (Vite) que renderiza UI, mantiene estado local y consume Firebase Auth + Firestore + Functions.
- **Backend serverless** (`functions/`): Firebase Functions con lógica de negocio (IA, cuotas, planes, Wompi, BYOK/keys, perfiles/admin).
- **Datos + seguridad** (Firestore + reglas): almacenamiento y enforcement de pertenencia por `userId` (y rol admin vía claims).

## Repositorio y carpetas
- `frontend/`: React 19 + TypeScript + Vite + Tailwind. UI cliente.
- `functions/`: Firebase Functions (Node 20) con lógica de negocio: IA, cuotas, planes, Wompi, manejo de claves y perfiles.
- `docs/`: documentación del producto y arquitectura (este archivo).
- `.github/workflows/`: CI (lint/build/tests en PRs).
- Raíz: configuración Firebase (`firebase.json`, reglas e índices de Firestore).

## Frontend (frontend/src)
El frontend pasó de un `App.tsx` monolítico a una arquitectura por **capas**:
- **AppShell** (`src/App.tsx`): composición de controllers/hooks + tabs + modales globales.
- **Pages** (`src/pages/*`): UI por tab (sin router por ahora).
- **Hooks por dominio** (`src/hooks/*`): “controllers” que encapsulan estado, side-effects y handlers por dominio.
- **Services** (`src/services/*`): acceso a Firestore/Functions (sin React) y funciones puras de integración.
- **Context** (`src/context/*`): Auth (login/logout) y Theme (modo claro/oscuro).
- **Utils** (`src/utils/*`): helpers puros (fechas, formatters, manejo de errores IA).
- **Types** (`src/types/*`): modelos compartidos.

### Entradas y configuración
- `src/main.tsx`: monta providers (`AuthProvider`, `ThemeProvider`) y renderiza `App`.
- `src/config/firebase.ts`: inicializa Firebase desde `VITE_FIREBASE_*` y expone `getFirebaseAuth/getFirestoreDb` (con manejo defensivo de init errors).

### AppShell (`src/App.tsx`)
Responsabilidades:
- **Auth gate**: si no hay sesión, muestra `LoginHero`.
- **Tabs**: controla `activeTab` (Inicio/Movimientos/Asesor IA/Configuración) sin React Router.
- **Composición**: crea y consume hooks por dominio y pasa props a las páginas.
- **Estado cross-tab**: estados que cruzan pantallas (p. ej. transacción seleccionada, upgrade/limits, abrir Quick Add).
- **Modales globales** (persisten entre tabs):
  - `QuickAddSheet`
  - `TransactionEditModal`
  - `UpgradeModal`
  - `LimitsHelpModal`
- **Acciones cross-tab**: helpers para navegar/scroll desde smart cards (`openMovements`, `openBudgets`, `openPlans`, `openAdvisor`).

### Pages (`src/pages/*`)
Cada tab vive en un archivo y recibe props tipadas (contratos explícitos):
- `HomePage`: métricas del mes, smart cards, presupuesto, templates recurrentes.
- `TransactionsPage`: lista de movimientos, filtros, paginación, selección para editar.
- `AdvisorPage`: UI de chat, acciones rápidas, locks por cuota/rol.
- `SettingsPage`: perfil, cuota IA, BYOK/preference, planes/checkout y admin.

### Hooks por dominio (`src/hooks/*`)
Los hooks contienen estado + efectos + handlers, manteniendo la UI idéntica (sin cambiar flows):
- `useTransactionsController`: listener de movimientos + filtros + paginación (`transactionsReady`, `error`, `txPage`, `txPageSize`).
- `useHomeMonthController`: listener del mes + derivados (income/expense/top/categories) + mes anterior + smart cards (índice y handlers touch/next/prev).
- `useBudgetController`: carga/guarda presupuesto total y por categoría.
- `useTemplatesController`: CRUD de templates + selección + “usar template” (abre `QuickAddSheet`).
- `useAdvisorController`: estado del chat + acciones IA + locks por rol/cuota.
  - **Privacidad/eficiencia**: la IA recibe **solo agregados**; `lastTransactions` se sanitiza (amount/category/type/date) sin texto libre/merchant/nota.
- `useSettingsController`: perfil + refresh cuota IA + BYOK/preference + planes/checkout + admin (incluye `plansRef`).
- `useIaQuota`: lectura/refresh de cuota semanal (parse/analyze) por usuario (con fallback/cache).
- `src/hooks/index.ts`: barrel exports para imports limpios.

### Services (`src/services/*`)
Servicios son wrappers de integración (sin estado React):
- `transactions.ts`: listener + CRUD Firestore de movimientos.
- `budgets.ts`: leer/guardar presupuestos.
- `templates.ts`: CRUD de templates y templates recurrentes.
- `functions.ts`: wrappers `httpsCallable` (parse/analyze/transcribe + perfil/roles/keys/cuotas/planes/Wompi).
- `users.ts`: perfil, preferencia de key, admin helpers (según rol/claims).
- `analytics.ts`: tracking de eventos del frontend.

### Login (Firebase Auth + Google)
Para soportar Safari iOS (ITP/partición de storage):
- En **iOS Safari** se usa `signInWithRedirect`.
- En otros navegadores se usa `signInWithPopup`.
- `AuthProvider` procesa `getRedirectResult(auth)` una sola vez al iniciar antes de `onAuthStateChanged`.
- Se manejan errores comunes con mensajes de ayuda (p. ej. `auth/missing-initial-state`, `auth/popup-blocked`).

Requisitos de configuración:
- Firebase Console → Authentication → Settings → Authorized domains:
  - `gastosense.web.app`
  - `gastosense.firebaseapp.com`
  - (y dominio custom si aplica)
- Google Cloud Console → OAuth Client:
  - Authorized JavaScript origins: `https://gastosense.web.app`, `https://gastosense.firebaseapp.com` (+ dev localhost si aplica)
  - Authorized redirect URIs:
    - `https://gastosense.web.app/__/auth/handler`
    - `https://gastosense.firebaseapp.com/__/auth/handler`

### Tests, coverage y CI (frontend)
- Runner: **Vitest** + **@testing-library/react** + **jsdom**.
- Tests viven en `frontend/tests/*` y mockean `src/services/*` (no dependen de Firebase real).
- `frontend/tests/tsconfig.json`: proyecto TS dedicado para que el IDE resuelva tipos/módulos en tests sin tocar el `tsconfig` de build.
- Coverage (Vitest): se mide solo `src/hooks/**` + `src/utils/**` para que el % refleje lo testeado en esta etapa; `coverage/` se ignora por git.
- CI: `.github/workflows/frontend-ci.yml` corre `npm ci` + `lint` + `build` + `test:coverage` en PRs.

## Firebase Functions (`functions/src/index.ts`)
- Config: region `us-central1`, `maxInstances: 10`; usa Admin SDK y Secret Manager; perfil por defecto rol `free` con `advisorMode` amable; respeta `MAX_USERS`/`MAX_USER_COUNT`.
- Resolucion de clave IA: `resolveOpenAIClient` decide entre BYOK y clave gestionada segun preferencia/rol; si la suscripcion expira se degradan limites a `free`; un `paid_byok` usando clave gestionada cuenta como `free` para limites.
- Cuotas semanales: semana arranca lunes UTC (`currentWeekKey`); `getWeeklyLimit` tabla parse/analyze (free 5/2, paid_byok 70/20, paid_managed y gifted 90/20, admin 400/400, fallback 10/4); `checkRateLimit` incrementa `usage/{uid}`.
- IA y captura:
  - `transcribeAudio`: valida base64 <=10s y ~6MB, transcribe con Whisper y descuenta cuota `parse`.
  - `parseTransactionPhrase`: extrae amount/category/type/paymentMethod/date con `gpt-4.1-mini` y json_schema; ajusta fechas relativas; descuenta cuota `parse`.
  - `analyzeSummary`: responde con vinetas segun `advisorMode` y datos de mes/presupuesto/top categorias/ultimos movimientos/mes anterior; descuenta cuota `analyze`.
  - `analyzeMonthlyDeep`: toma ultimos 3 meses/budgets por categoria y retorna plan con prioridades/acciones, tendencia global y senales clave; cuota `analyze`.
  - `setAdvisorMode`: persiste tono amable/reganon en perfil.
- Perfiles, claves y admin:
  - `getUserProfile`/`registerUserEntry` crean/leen perfil evitando sobrepasar `MAX_USERS`.
  - `getUsageQuota` expone limites y uso vigentes, semana y reset.
  - `setUserOpenAIKey`/`clearUserOpenAIKey`: almacena/borra BYOK en Secret Manager; `setUserKeyPreference` valida segun rol y suscripcion; `setUserRole` y `listUsers` solo admin (sincroniza custom claim `admin`).
- Planes y pagos Wompi:
  - `getPlans` arma precios por plan (BYOK/PRO) y periodo (mensual/trimestral/semestral/anual) con descuentos y promos (`WOMPI_PLAN_*_PRICE/PROMO/_END`).
  - `createWompiCheckout`: referencia `plan:period:uid:timestamp`, firma con `WOMPI_INTEGRITY_KEY`, agrega `redirect-url` si existe.
  - `wompiWebhook`: valida firma (`WOMPI_EVENT_HASH_KEY`), verifica moneda `WOMPI_PLAN_CURRENCY`, extiende `subscription.expiresAt` usando `WOMPI_DEFAULT_DAYS * meses`, asigna rol `paid_byok` o `paid_managed` y preferencia de clave.
  - `expireSubscriptions`: cron diario marca suscripciones vencidas como `expired`.
- Limites de audio: `maxAudioDurationMs` 10_000, `maxAudioBytes` 6_000_000.

## Datos y seguridad (Firestore)
- Colecciones: `transactions`, `templates`, `budgets`, `users`, `usage`.
- `usage` guarda `{week, parse, analyze}` por uid; se resetea cuando cambia la semana.
- Reglas (`firestore.rules`):
  - Auth obligatoria; cada doc debe pertenecer al `userId` del auth; `users` lectura por dueno o admin, escritura solo admin.
  - Validaciones: tipos y enums de `type/paymentMethod`, notas hasta 500 chars, `perCategory` mapa max 50 entradas; `templates` permite `recurring` bool y `frequency` weekly/monthly/yearly.
  - Presupuesto id `${uid}_${mes}` verificado con helper de prefijo.

## Integraciones externas
- OpenAI: `gpt-4.1-mini` para texto (`parseTransactionPhrase`, `analyzeSummary`, `analyzeMonthlyDeep`) y `whisper-1` para audio; BYOK via Secret Manager, clave gestionada `OPENAI_API_KEY`.
- Firebase: Auth (Google), Firestore, Hosting, Functions, Secret Manager.
- Wompi: checkout hospedado + webhook; firma HMAC/SHA256; moneda `WOMPI_PLAN_CURRENCY`.

## Configuracion y variables de entorno
- Frontend (`frontend/.env`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
- Functions (`functions/.env` o config): secreto `OPENAI_API_KEY`; `MAX_USERS` o `MAX_USER_COUNT`; `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_KEY`, `WOMPI_EVENT_HASH_KEY`, `WOMPI_REDIRECT_URL`, `WOMPI_PLAN_CURRENCY`, `WOMPI_DEFAULT_DAYS`, `WOMPI_PLAN_BYOK_PRICE`, `WOMPI_PLAN_BYOK_PROMO`, `WOMPI_PLAN_BYOK_PROMO_END`, `WOMPI_PLAN_PRO_PRICE`, `WOMPI_PLAN_PRO_PROMO`, `WOMPI_PLAN_PRO_PROMO_END`.

## Scripts y despliegue
- Frontend: `npm install`, `npm run dev`, `npm run build`, `npm run preview`.
- Functions: `npm install`, `npm run lint`, `npm run build`, `firebase deploy --only functions` (predeploy en `firebase.json` corre lint+build).
- Hosting Firebase: construir `frontend/dist` y `firebase deploy --only hosting`.

## Flujos de datos resumidos
- Registro de movimiento: usuario -> QuickAdd (manual/voz/frase/plantilla) -> Firestore `transactions` -> vistas Inicio/Movimientos en tiempo real.
- Presupuesto: usuario guarda total/perCategory -> Firestore `budgets` -> tarjetas inteligentes/alertas y calculo de percentiles en UI.
- Consejos IA: usuario lanza accion de asesor -> `analyzeSummary` o `analyzeMonthlyDeep` -> feed chat -> actualiza cuota `analyze`.
- Pagos: UI selecciona plan/periodo -> `createWompiCheckout` -> redireccion Wompi -> `wompiWebhook` valida y actualiza rol/suscripcion/preferencia -> limites se degradan cuando expira.
