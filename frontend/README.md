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
- `npm run test` — Vitest (watch)
- `npm run test:coverage` — tests + coverage report

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
- `src/App.tsx` — **AppShell**: compone hooks por dominio, controla tabs y monta modales globales.
- `src/pages/` — UI por tab: `HomePage`, `TransactionsPage`, `AdvisorPage`, `SettingsPage` (sin React Router por ahora).
- `src/hooks/` — lógica por dominio (controllers/hooks), exportada vía `src/hooks/index.ts`.
- `src/context/` — `AuthContext` (login/logout), `ThemeContext` (tema claro/oscuro).
- `src/components/` — `LoginHero`, `QuickAddSheet`, `BudgetCard`, `CategoryBudgets`, `TransactionEditModal`, `BottomNav`, `ResponsiveSelect`, etc.
- `src/config/firebase.ts` — init de Firebase y configuración de Auth.
- `src/utils/` — helpers reutilizables (`dates.ts`, `format.ts`, `aiErrors.ts`, `isIOSSafari.ts`).
- `src/services/` — Firestore/Functions (transacciones, presupuestos, plantillas, usuarios, IA, planes/pagos).
- `src/types/` — modelos compartidos (`Transaction`, `Budget`, `Template`, `UserProfile`, `PlanInfo`, etc.).
- `tests/` — unit tests con Vitest + Testing Library (mocks de `src/services/*`).
- `.github/workflows/frontend-ci.yml` — CI (lint + build + test:coverage).

## Arquitectura (post-refactor de App.tsx)
Este repo empezó con un `App.tsx` monolítico. El refactor lo dejó como **composición** de páginas + hooks, para que el proyecto pueda crecer sin volver al monolito.

### AppShell (src/App.tsx)
Responsabilidades:
- **Auth gate**: si no hay sesión, renderiza `LoginHero`.
- **Tabs**: estado `activeTab` (sin router) y render de `pages/*`.
- **Cross-tab state**: estado global que cruza pantallas (ej. `selectedTx`, `showQuickAdd`, upgrade/limits modals).
- **Modales globales** (persisten entre tabs):
  - `QuickAddSheet` (crear + interpretar frase IA + templates)
  - `TransactionEditModal` (editar/borrar)
  - `UpgradeModal` (upgrade por cuota/feature lock)
  - `LimitsHelpModal` (ayuda de límites)
- **Acciones cross-tab**: helpers para “abrir” secciones desde smart cards (`openMovements`, `openBudgets`, `openPlans`, `openAdvisor`).

### Pages (src/pages/*)
Cada tab vive en su archivo y recibe props tipadas (contrato explícito):
- `HomePage`: métricas del mes, smart cards, presupuesto, templates recurrentes.
- `TransactionsPage`: lista, filtros, paginación, borrado/selección para editar.
- `AdvisorPage`: chat del asesor IA, quick actions y locks.
- `SettingsPage`: perfil, cuota IA, BYOK, planes/checkout y admin.

### Hooks por dominio (src/hooks/*)
La lógica “grande” se movió a hooks (sin cambiar UI/flows):
- `useTransactionsController`: listener de movimientos + filtros + paginación + estados `ready/error`.
- `useHomeMonthController`: listener del mes + derivados (income/expense/top/categories) + smart cards + handlers.
- `useBudgetController`: cargar/guardar presupuesto total y por categoría.
- `useTemplatesController`: CRUD de templates + selección + “usar template” (apertura de Quick Add).
- `useAdvisorController`: estado del chat + acciones IA + locks por rol/cuota.
  - Privacidad: payload a IA va **agregado**; `lastTransactions` se sanitiza (solo amount/category/type/date).
- `useSettingsController`: perfil + quota refresh + BYOK/preference + planes/checkout + admin (incluye `plansRef`).
- `useIaQuota`: fetch de cuota IA (fallback/cache por usuario).

### Mapa rápido (qué vive dónde)
- **Movimientos**: `useTransactionsController` + `TransactionsPage` + `src/services/transactions.ts` (listener + CRUD).
- **Inicio (mes actual + insights)**: `useHomeMonthController` + `HomePage` + `src/services/transactions.ts` (listener del mes + fetch mes anterior).
- **Presupuesto**: `useBudgetController` + `HomePage` + `src/services/budgets.ts`.
- **Templates**: `useTemplatesController` + `HomePage`/`QuickAddSheet` + `src/services/templates.ts`.
- **Asesor IA**: `useAdvisorController` + `AdvisorPage`/`QuickAddSheet` + `src/services/functions.ts` (callables) + cuota vía `useIaQuota`.
- **Configuración/Admin/Planes/Keys**: `useSettingsController` + `SettingsPage` + `src/services/users.ts`/`src/services/functions.ts`.

### Utils (src/utils/*)
- `dates.ts`: helpers de fechas (ej. `todayIso`, `monthStartIso`, etc.).
- `format.ts`: formatters (COP/USD/date) reutilizables.
- `aiErrors.ts`: normalización de errores IA (`isResourceExhausted`, `mapAiError`, extractor de `code`).

## Tests + coverage + CI
Unit tests están pensados para ser **estables** (sin depender de Firebase/Auth ni UI) y se enfocan en hooks/utils.

### Cómo correr tests
- `npm run test` (watch)
- `npm run test:coverage` (genera `coverage/` con HTML; está ignorado por git)

### Tipado en IDE (tests)
Los tests tienen su propio `tsconfig` para que TypeScript resuelva módulos y tipos correctamente:
- `tests/tsconfig.json`

Si el IDE muestra `Cannot find module ...` en archivos dentro de `tests/`:
- Ejecuta `npm install` dentro de `frontend/` (para instalar `vitest`/Testing Library).
- Reinicia TypeScript Server (VS Code: “TypeScript: Restart TS server”) para que detecte `tests/tsconfig.json`.

### Mocks (sin Firebase)
Los tests mockean `src/services/*` con `vi.mock(...)` para simular listeners/callables.

### Coverage “real” (solo hooks/utils)
`vite.config.ts` configura coverage para medir solo:
- `src/hooks/**` y `src/utils/**`
y excluir UI/servicios/context para que el % refleje lo que estamos testeando en esta etapa.

### CI
GitHub Actions corre en PRs:
- lint
- build
- test:coverage

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

## Smoke test checklist (8 flujos críticos)
- [ ] **Login**: Google en desktop + Safari iOS (redirect) y vuelve autenticado a la app.
- [ ] **Tabs**: navegar Inicio/Movimientos/Asesor IA/Config sin errores y con UI estable.
- [ ] **Quick Add**: abrir `QuickAddSheet`, guardar gasto/ingreso y ver reflejo en listas/métricas.
- [ ] **Interpretar (IA parse)**: pegar frase, recibir sugerencia y guardar la transacción.
- [ ] **Editar/Eliminar**: abrir `TransactionEditModal`, editar una transacción y borrar otra.
- [ ] **Presupuesto**: guardar presupuesto total + por categoría y ver alertas/indicadores.
- [ ] **Asesor IA (2 acciones)**: ejecutar 2 quick actions (p.ej. “Resumen semanal” + “Gastos hormiga”) y validar respuesta + decremento de cuota.
- [ ] **Planes/Checkout/Admin**: ver planes/periodos, iniciar checkout Wompi; (si rol admin) listar usuarios, cambiar rol/estado y guardar.

## Notas
- Usa Firebase Auth (Google) y Firestore; las callable functions requieren que el proyecto y secretos estén configurados.
- Las cuotas de IA se actualizan tras cada llamada (parse/analyze) mediante `fetchUsageQuota`.
- `ResponsiveSelect` adapta selects en mobile (bottom sheet) y desktop (dropdown).
