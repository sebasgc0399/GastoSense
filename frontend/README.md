# Frontend — GastoSense

React + TypeScript + Vite + Tailwind. Interfaz mobile-first para registrar gastos/ingresos, gestionar presupuestos y usar el Asesor IA en modo chat.

## Requisitos
- Node 20.x
- npm 9+ (usa el `package-lock.json` del repo)
- Variables en `frontend/.env`:
  ```
  VITE_FIREBASE_API_KEY=...
  VITE_FIREBASE_AUTH_DOMAIN=...
  VITE_FIREBASE_PROJECT_ID=...
  VITE_FIREBASE_STORAGE_BUCKET=...
  VITE_FIREBASE_MESSAGING_SENDER_ID=...
  VITE_FIREBASE_APP_ID=...
  ```

## Scripts
- `npm run dev` — servidor Vite
- `npm run build` — build producción
- `npm run preview` — servir el build
- `npm run lint` — ESLint (TS/React)

## Login (Firebase Auth + Google)
El login usa Firebase Auth con Google, con un flujo adaptado para Safari iOS:
- En iOS Safari se usa `signInWithRedirect` (los popups suelen fallar por ITP/gestión de ventanas).
- En el resto de navegadores se usa `signInWithPopup`.
- Al iniciar la app, `AuthProvider` procesa `getRedirectResult(auth)` una sola vez antes de suscribirse a `onAuthStateChanged`.
- Se muestran mensajes de ayuda para errores comunes (`auth/missing-initial-state`, `auth/popup-blocked`, etc.).

### Requisitos de dominios (muy importante)
Para que el redirect funcione en `web.app` y `firebaseapp.com`:
- Firebase Console → Authentication → Settings → Authorized domains:
  - `gastosense.web.app`
  - `gastosense.firebaseapp.com`
  - (y tu dominio custom si aplica)
- Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs:
  - Abre el OAuth Client que coincida con el `client_id` que aparece en “detalles del error”.
  - Authorized JavaScript origins:
    - `https://gastosense.web.app`
    - `https://gastosense.firebaseapp.com`
    - (dev) `http://localhost:5173` si usas Vite
  - Authorized redirect URIs:
    - `https://gastosense.web.app/__/auth/handler`
    - `https://gastosense.firebaseapp.com/__/auth/handler`
    - (y tu dominio custom: `https://TU_DOMINIO/__/auth/handler`)

### Troubleshooting rápido
- `Error 400: redirect_uri_mismatch`: falta registrar el `redirect_uri` exacto del error.
- `auth/missing-initial-state`: no completes el login en otra pestaña/navegador; evita modo privado en Safari.
- `auth/popup-blocked`: habilita popups o usa otro navegador; en iOS Safari se usa redirect.

## Estructura rápida
- `src/main.tsx` — arranque con `AuthProvider` y `ThemeProvider`.
- `src/App.tsx` — orquesta pestañas (Inicio, Movimientos, Asesor IA, Config), presupuestos, planes y admin.
- `src/context/` — `AuthContext` (login/logout), `ThemeContext` (tema claro/oscuro).
- `src/components/` — `LoginHero`, `QuickAddSheet`, `BudgetCard`, `CategoryBudgets`, `TransactionEditModal`, `BottomNav`, `ResponsiveSelect`, etc.
- `src/config/firebase.ts` — init de Firebase y configuración de Auth.
- `src/utils/isIOSSafari.ts` — detección robusta de Safari iOS.
- `src/services/` — Firestore/Functions (transacciones, presupuestos, plantillas, usuarios, IA, planes/pagos).
- `src/types/` — modelos compartidos (`Transaction`, `Budget`, `Template`, `UserProfile`, `PlanInfo`, etc.).

## Funcionalidad clave
- **Quick Add**: formulario rápido, plantillas recurrentes, modo frase IA y grabación voz (<=10s) para transcribir y clasificar.
- **Presupuestos**: total mensual y por categoría, alertas visuales 80/100%, top de categorías.
- **Movimientos**: filtros por fecha/categoría, edición/borrado inline, indicadores de cumplimiento por categoría.
- **Asesor IA (chat)**: tonos Amable/Regañón, acciones rápidas (Espejo diario, Gastos hormiga, Resumen semanal), feed con loader “IA escribiendo…”.
- **Planes y pagos**: selección de plan/periodo, checkout Wompi (vía callable), estado de membresía y cuotas IA.
- **Claves**: BYOK almacenada en backend (Secret Manager); preferencia entre key propia y gestionada (según rol/plan).
- **Tema**: claro/oscuro con persistencia local.


## Flujo de desarrollo
1) `npm install`
2) Crear `frontend/.env` (ver arriba)
3) `npm run dev`

## Notas
- Usa Firebase Auth (Google) y Firestore; las callable functions requieren que el proyecto y secretos estén configurados.
- Las cuotas de IA se actualizan tras cada llamada (parse/analyze) mediante `fetchUsageQuota`.
- `ResponsiveSelect` adapta selects en mobile (bottom sheet) y desktop (dropdown).
