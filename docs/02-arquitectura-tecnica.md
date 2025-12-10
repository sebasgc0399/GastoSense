# Arquitectura tecnica

## Repositorio y carpetas
- `frontend/`: React 19 + TypeScript + Vite + Tailwind. UI cliente.
- `functions/`: Firebase Functions (Node 20) con logica de negocio: IA, cuotas, planes, Wompi, manejo de claves y perfiles.
- Raiz: configuracion Firebase (`firebase.json`, reglas e indices de Firestore).

## Frontend (src/)
- Entradas: `main.tsx` monta `App` con `AuthProvider` y `ThemeProvider`.
- Contextos y hooks: `context/AuthContext.tsx` (login Google, logout, limpia caches), `context/ThemeContext.tsx` (tema claro/oscuro en `data-theme`), `hooks/useIaQuota` (lee cuota semanal).
- Componentes clave:
  - `App.tsx`: orquesta tabs Inicio/Movimientos/Asesor/Configuracion; escucha movimientos en tiempo real; maneja presupuestos, plantillas, feed IA, upgrade/planes y panel admin.
  - `QuickAddSheet.tsx`: formulario rapido; interpreta frase con `callParseTransactionPhrase`; grabacion/transcripcion con `callTranscribeAudio`; guarda/edita plantillas recurrentes.
  - `BudgetCard`, `CategoryBudgets`, `TopExpensesChart`, `TransactionFilters`, `TransactionEditModal`, `BottomNav`, `LoginHero`, `UpgradeModal`, `LimitsHelpModal`.
- Servicios (`src/services`):
  - `functions.ts`: wrappers httpsCallable (`analyzeSummary`, `analyzeMonthlyDeep`, `parseTransactionPhrase`, `transcribeAudio`, perfil/roles/claves/cuotas/planes/Wompi/advisorMode).
  - `transactions.ts`, `budgets.ts`, `templates.ts`: CRUD Firestore + escuchas y filtros.
  - `users.ts`: integra funciones para perfil, BYOK/managed, cuota IA, planes, checkout Wompi, tono de asesor y tareas admin (roles, listado de usuarios).
- Datos y tipos: `data/frequentCategories.ts` (categorias/metodos frecuentes); `types/index.ts` modelos (Transaction, Budget, Template con recurrencia, UserProfile, PlanInfo, IaQuota, etc.).
- Config Firebase: `config/firebase.ts` lee `VITE_FIREBASE_*` y expone app/auth/firestore.

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
