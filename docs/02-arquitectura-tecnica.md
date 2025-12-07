# Arquitectura tecnica

## Repositorio y carpetas
- `frontend/`: React 19 + TypeScript + Vite + Tailwind. UI principal y logica cliente.
- `functions/`: Firebase Functions (Node 20) con toda la logica de negocio: IA, cuotas, planes, Wompi, manejo de claves y perfiles.
- Raiz: configuracion Firebase (`firebase.json`, reglas e indices de Firestore).

## Frontend (src/)
- **Entradas**: `main.tsx` monta `App` con `AuthProvider` y `ThemeProvider`.
- **Contextos**: `context/AuthContext.tsx` (login Google, logout con limpieza de caches) y `context/ThemeContext.tsx` (tema claro/oscuro en `data-theme`).
- **Componentes clave**:
  - `App.tsx`: orquesta pestañas, escucha movimientos en tiempo real, maneja presupuesto, plantillas, IA, planes y panel admin.
  - `QuickAddSheet.tsx`: formulario rapido; interpreta frase con `callParseTransactionPhrase`; grabacion y transcripcion con `callTranscribeAudio`; guarda/edita plantillas recurrentes.
  - `BudgetCard`, `CategoryBudgets`, `TransactionFilters`, `TransactionEditModal`, `TopExpensesChart`, `BottomNav`, `LoginHero`.
- **Servicios** (`src/services`):
  - `transactions.ts`: CRUD Firestore `transactions` con escuchas y filtros.
  - `budgets.ts`: CRUD Firestore `budgets` (documento `${uid}_${mes}`).
  - `templates.ts`: CRUD Firestore `templates`.
  - `users.ts` + `functions.ts`: llama callable functions (perfil, claves, roles, cuota, planes, Wompi, IA).
- **Datos**: `data/frequentCategories.ts` (categorias/metodos frecuentes).
- **Tipos**: `types/index.ts` centraliza modelos (Transaction, Budget, Template, UserProfile, PlanInfo, etc.).
- **Configuracion Firebase**: `config/firebase.ts` lee `VITE_FIREBASE_*` para app, auth y Firestore.

## Backend Express
- El directorio `backend/` se elimino. Toda la logica de IA y negocio vive ahora en Firebase Functions; no hay servidor Express separado en el flujo actual.

## Firebase Functions (`functions/src/index.ts`)
- Inicializa Admin SDK y Secret Manager; region `us-central1`; `maxInstances: 10`.
- **IA y captura**:
  - `transcribeAudio`: Whisper para audio <=10s base64; valida tamano/duracion; descuenta cuota `parse`.
  - `parseTransactionPhrase`: extrae amount/category/etc. de texto libre; ajusta fecha relativa; aplica cuota `parse`.
  - `analyzeSummary`: genera viñetas de consejos segun modo; usa datos del mes; aplica cuota `analyze`.
- **Perfiles y cuotas**:
  - `getUserProfile`, `registerUserEntry`: crea/obtiene perfil con rol por defecto `free`; respeta `MAX_USERS`.
  - `getUsageQuota`: devuelve consumo y limite semanal (por rol) de IA.
- **Planes y pagos**:
  - `getPlans`: precios totales por periodo con descuentos/promo (`WOMPI_PLAN_*`).
  - `createWompiCheckout`: genera URL de pago con firma (`WOMPI_INTEGRITY_KEY`), referencia `plan:period:uid:timestamp`.
  - `wompiWebhook`: valida firma (`WOMPI_EVENT_HASH_KEY`), verifica monto/moneda, actualiza rol/preferencia/expiracion segun plan; admite fuente `wompi`.
  - `expireSubscriptions` (cron diario 6:00 UTC-5): marca suscripciones activas pero vencidas como `expired`.
- **Claves y roles**:
  - `setUserOpenAIKey`: guarda BYOK en Secret Manager (`user-openai-{uid}`) y marca `openaiKeyStored`.
  - `clearUserOpenAIKey`: borra secreto y limpia preferencia.
  - `setUserKeyPreference`: valida segun rol (solo managed si plan permite; BYOK requiere clave cargada).
  - `setUserRole`: solo admin; cambia rol, suscripcion y preferencia; sincroniza custom claim `admin`.
  - `listUsers`: solo admin; lista hasta 200 perfiles.
- **Rate limiting**:
  - `checkRateLimit`: documento `usage/{uid}` por semana (clave lunes UTC) con contadores separados `parse` y `analyze`; limite semanal depende del rol (free parse 10/analyze 4; paid_byok 70/20; paid_managed/gifted 90/20; admin 400/400).
- **Resolucion de clave OpenAI**:
  - Si usuario tiene BYOK y la prefiere, se usa; si rol permite clave administrada y esta activa, se usa `OPENAI_API_KEY` (secreto). Roles gift/admin siempre pueden managed.

## Datos y seguridad (Firestore)
- Colecciones:
  - `transactions`: amount, category, type, paymentMethod, date, userId, note, createdAt.
  - `templates`: name, category, amount, note, paymentMethod, type, recurring, frequency, userId.
  - `budgets`: id `${uid}_${mes}` con month, total, perCategory, userId, updatedAt.
  - `users`: perfil (role, openaiKeyStored, preferredKey, subscription{status,source,expiresAt}).
  - `usage`: conteo diario de IA por uid.
- Reglas (`firestore.rules`):
  - Autenticacion obligatoria; cada documento debe pertenecer al `userId` del auth.
  - Validaciones de campos: tipos, enums de `type/paymentMethod`, tamanos maximos, mapa `perCategory` con hasta 50 entradas.
  - `users` solo lectura para dueño o admin; escritura solo admin. Todo lo demas denegado.

## Integraciones externas
- **OpenAI**: modelos `gpt-4.1-mini` para texto y `whisper-1` para audio. BYOK almacenado en Secret Manager; clave gestionada via secreto `OPENAI_API_KEY`.
- **Firebase**: Auth (Google), Firestore, Hosting (public `frontend/dist`), Functions, Secret Manager.
- **Wompi**: checkout hospedado y webhook de eventos de transaccion; integra firma HMAC/SHA256.

## Configuracion y variables de entorno
- Frontend (`frontend/.env`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
- Backend Express (`backend/.env`): `OPENAI_API_KEY`, `PORT`, `FRONTEND_ORIGIN`.
- Functions (`functions/.env` o config): secretos `OPENAI_API_KEY`; env `MAX_USERS`, `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_KEY`, `WOMPI_EVENT_HASH_KEY`, `WOMPI_REDIRECT_URL`, `WOMPI_PLAN_*`, `WOMPI_DEFAULT_DAYS`, `WOMPI_PLAN_CURRENCY`.

## Scripts y despliegue
- Frontend: `npm install`, `npm run dev`, `npm run build`, `npm run preview`.
- Backend: `npm install`, `npm run dev` (ts-node-dev), `npm run build`, `npm start`.
- Functions: `npm install`, `npm run lint`, `npm run build`, `firebase deploy --only functions`. Predeploy en `firebase.json` ejecuta lint+build.
- Hosting Firebase: construye `frontend/dist` (verifica ruta correcta en `firebase.json`), deploy con `firebase deploy --only hosting`.

## Flujos de datos resumidos
- **Registro de movimiento**: usuario -> QuickAdd (manual/voz/frase) -> Firestore `transactions` -> vista Movimientos/Home con escucha en tiempo real.
- **Presupuesto**: usuario guarda total/perCategory -> Firestore `budgets` -> calculo de alertas/percentiles en UI.
- **Consejos IA**: UI compone resumen -> `analyzeSummary` -> mensaje -> muestra en pestaña Asesor y actualiza cuota.
- **Pagos**: UI selecciona plan/periodo -> `createWompiCheckout` -> redireccion a Wompi -> webhook `wompiWebhook` valida y actualiza rol/suscripcion/preferencia.
