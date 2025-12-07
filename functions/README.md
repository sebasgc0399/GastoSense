# Functions – GastoSense

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
  - `parseTransactionPhrase`: interpreta texto libre de gasto/ingreso; ajusta fecha relativa; descuenta cuota `parse`.
  - `transcribeAudio`: Whisper; audio base64 ≤10s; descuenta cuota `parse`.
  - `analyzeSummary`: genera respuesta IA (Espejo diario, Gastos hormiga, Resumen semanal) según `mode` (amable/regañón) y datos del mes; descuenta `analyze`.
- **Perfiles/cuotas**:
  - `getUserProfile`, `registerUserEntry`
  - `getUsageQuota`: consumo y límite semanal por rol (free 10/4, BYOK 70/20, managed 90/20, admin 400/400).
  - `setUserAdvisorMode`: guarda tono (amable/regañón) en perfil.
- **Claves**:
  - `setUserOpenAIKey`, `clearUserOpenAIKey` (BYOK en Secret Manager)
  - `setUserKeyPreference` (byok/managed, según rol/plan)
- **Roles/usuarios**:
  - `setUserRole` (solo admin), `listUsers` (hasta 200)
- **Planes/pagos**:
  - `getPlans`: precios totales por periodo.
  - `createWompiCheckout`: genera URL de pago con firma.
  - `wompiWebhook` (HTTP): valida firma/monto/moneda; actualiza rol, preferencia y expiración.
- **Scheduler**:
  - `expireSubscriptions` (cron diario) marca suscripciones vencidas como `expired`.

## Firestore (referencia rápida)
- `transactions`, `templates`, `budgets`, `users`, `usage`.
- Reglas: cada doc pertenece a `userId`; `users` editable sólo por admin; validaciones de tipos/enums y tamaños.

## Notas técnicas
- Región: `us-central1`, `maxInstances: 10`.
- BYOK se guarda en Secret Manager; clave gestionada via `OPENAI_API_KEY`.
- Rate limiting semanal por rol (`usage/{uid}` con clave de semana).
- Wompi: firma HMAC/SHA256, referencia `plan:period:uid:timestamp`.

## Desarrollo local
- Usa `npm run build` para asegurarte de tipado; no se incluye emulador en este README, pero puedes usar `firebase emulators:start` si lo tienes configurado.

## Próximos pasos sugeridos
- README por ambiente/secrets de ejemplo.
- Tests unitarios para helpers de validación y cálculo de cuotas.
- Ajustar límites o modos IA según planes futuros.
