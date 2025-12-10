# Functions — GastoSense

Firebase Functions (Node 20, TypeScript) para IA, cuotas semanales, manejo de claves, planes/pagos y perfiles/roles. Toda la lógica de negocio vive aquí; no hay backend Express separado.

## Requisitos
- Node 20.x (coincide con `engines`)
- npm 9+
- Proyecto Firebase configurado (Auth, Firestore, Hosting, Functions, Secret Manager)
- Wompi para pagos

## Instalación y scripts
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
- `MAX_USERS` (límite de perfiles, opcional)

## Endpoints principales (callable / HTTP / schedulers)
- **IA**:
  - `parseTransactionPhrase`: interpreta texto libre; descuenta cuota `parse`.
  - `transcribeAudio`: Whisper (<=10s); descuenta cuota `parse`.
  - `analyzeSummary`: Espejo diario / Gastos hormiga / Resumen semanal; descuenta `analyze`.
- **Perfiles/cuotas**:
  - `getUserProfile`, `registerUserEntry`.
  - `getUsageQuota`: consumo y límite semanal por rol (free 5/2, BYOK 70/20, managed 90/20, admin 400/400; BYOK con clave gestionada o membresía expirada se degrada a free).
  - `setUserAdvisorMode`: guarda tono (amable/regańón) en perfil.
- **Claves**:
  - `setUserOpenAIKey`, `clearUserOpenAIKey` (BYOK en Secret Manager).
  - `setUserKeyPreference` (byok/managed, según rol/plan).
- **Roles/usuarios**:
  - `setUserRole` (solo admin), `listUsers` (hasta 200).
- **Planes/pagos**:
  - `getPlans`: precios totales por periodo.
  - `createWompiCheckout`: genera URL de pago con firma (referencia `plan:period:uid:timestamp`).
  - `wompiWebhook` (HTTP): valida firma/monto/moneda; calcula `expiresAt` extendiendo si renueva el mismo plan activo o reiniciando si cambia de plan/estaba vencido; actualiza rol (`paid_byok`/`paid_managed`), preferencia de clave (PRO ⇒ managed si no hay BYOK; BYOK ⇒ byok si no había) y suscripción activa.
- **Scheduler**:
  - `expireSubscriptions` (cron diario 00:00 UTC) marca suscripciones vencidas como `expired`.

## Firestore (referencia rápida)
- `transactions`, `templates`, `budgets`, `users`, `usage`.
- Reglas: cada doc pertenece a `userId`; `users` editable solo por admin; validaciones de tipos/enums y tamaños.

## Notas técnicas
- Región: `us-central1`, `maxInstances: 10`.
- BYOK se guarda en Secret Manager; clave gestionada via `OPENAI_API_KEY`.
- Rate limiting semanal por rol (`usage/{uid}` con clave de semana); membresía expirada degrada límites a free sin cambiar el rol almacenado.
- Wompi: firma HMAC/SHA256, referencia `plan:period:uid:timestamp`; helper `computeNewExpiresAt` extiende si es el mismo plan activo, o reinicia si cambia de plan o estaba vencido.

## Desarrollo local
- Usa `npm run build` para asegurarte de tipado; no se incluye emulador en este README, pero puedes usar `firebase emulators:start` si lo tienes configurado.
