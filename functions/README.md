# Functions - GastoSense

Firebase Functions (Node 20, TypeScript) para IA, cuotas semanales, manejo de claves, planes/pagos y perfiles/roles. Toda la logica vive aqui; no hay backend Express separado.

## Requisitos
- Node 20.x (coincide con `engines`)
- npm 9+
- Proyecto Firebase configurado (Auth, Firestore, Hosting, Functions, Secret Manager)
- Wompi para pagos

## Instalacion y scripts
```bash
cd functions
npm install
npm run lint
npm run build
firebase deploy --only functions   # predeploy ya corre lint+build
```

## Config / secretos
Configura en Firebase (secrets o env) al menos:
- `OPENAI_API_KEY` (clave gestionada)
- `WOMPI_PUBLIC_KEY`
- `WOMPI_INTEGRITY_KEY`
- `WOMPI_EVENT_HASH_KEY`
- `WOMPI_REDIRECT_URL`
- `WOMPI_PLAN_*` (IDs y precios)
- `WOMPI_PLAN_CURRENCY`
- `MAX_USERS` (limite de perfiles, opcional)

## Endpoints principales (callable / HTTP / schedulers)

### IA
- `parseTransactionPhrase`: interpreta texto libre; descuenta cuota `parse`.
- `transcribeAudio`: Whisper (<=10s); descuenta cuota `parse`.
- `analyzeSummary`: asesor IA con 4 acciones:
  - Espejo diario
  - Gastos hormiga
  - Resumen semanal
  - En que se va la plata
  Respuesta puede incluir bloques `[CHART_DATA]` y `[ACTION_DATA]` (JSON estricto). Referencia: `docs/SYSTEM_PROMPT_MAESTRO.md`.

### Perfiles / cuotas
- `getUserProfile`, `registerUserEntry`
- `getUsageQuota`: consumo y limite semanal por rol (free 5/2, paid_byok 70/20, paid_managed 90/20, gifted_managed 90/20, admin 400/400).
- `setAdvisorMode`: guarda tono (amable/reganon) en perfil.

### Claves
- `setUserOpenAIKey`, `clearUserOpenAIKey` (BYOK en Secret Manager)
- `setUserKeyPreference` (byok/managed, segun rol/plan)

### Roles / usuarios
- `listUsers` (hasta 200)
- `setUserRole` (solo admin)

### Planes / pagos
- `getPlans`: precios totales por periodo
- `createWompiCheckout`: genera URL de pago con firma (referencia `plan:period:uid:timestamp`)
- `wompiWebhook` (HTTP, idempotente):
  - valida firma/monto/moneda
  - usa `payments/{transactionId}` para no procesar dos veces
  - calcula `expiresAt` extendiendo si renueva el mismo plan activo o reiniciando si cambia de plan/estaba vencido
  - actualiza rol (`paid_byok`/`paid_managed`) y preferencia de clave

### Scheduler
- `expireSubscriptions`: cron diario 00:00 UTC, marca suscripciones vencidas como `expired`.

## Firestore (referencia rapida)
- Colecciones: `transactions`, `templates`, `budgets`, `users`, `usage`, `payments`.
- Reglas: cada doc pertenece a `userId`; `users` editable solo por admin; validaciones de tipos/enums y tamanos.

## Notas tecnicas
- Region: `us-central1`, `maxInstances: 10`.
- BYOK se guarda en Secret Manager; clave gestionada via `OPENAI_API_KEY`.
- Rate limiting semanal por rol en `usage/{uid}`.
  - Membresia expirada degrada limites a free sin cambiar el rol almacenado.
  - Paid BYOK usando clave gestionada se trata como free para limites.
- `analyzeSummary` usa Responses API y produce texto + bloques opcionales para charts/acciones.

## Desarrollo local
- `npm run build` para validar tipado.
- Si tienes emuladores configurados: `firebase emulators:start`.
