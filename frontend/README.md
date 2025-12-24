# Frontend - GastoSense

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
- `npm run dev` - servidor Vite
- `npm run build` - build produccion
- `npm run preview` - servir el build
- `npm run lint` - ESLint (TS/React)
- `npm run test` - Vitest (watch)
- `npm run test:run` - Vitest (single run)
- `npm run test:coverage` - tests + coverage report

## Login (Firebase Auth + Google)
Flujo adaptado para Safari iOS:
- iOS Safari usa `signInWithRedirect` (popups suelen fallar).
- Resto de navegadores usa `signInWithPopup`.
- `AuthProvider` procesa `getRedirectResult(auth)` una sola vez antes de `onAuthStateChanged`.
- Errores comunes se mapean a mensajes utiles.

### Dominios requeridos
- Firebase Console -> Authentication -> Settings -> Authorized domains:
  - `gastosense.web.app`
  - `gastosense.firebaseapp.com`
  - (tu dominio custom si aplica)
- Google Cloud Console -> OAuth Client:
  - Authorized JavaScript origins:
    - `https://gastosense.web.app`
    - `https://gastosense.firebaseapp.com`
    - (dev) `http://localhost:5173`
  - Authorized redirect URIs:
    - `https://gastosense.web.app/__/auth/handler`
    - `https://gastosense.firebaseapp.com/__/auth/handler`
    - (tu dominio custom) `https://TU_DOMINIO/__/auth/handler`

## Estructura rapida
- `src/main.tsx` - arranque con `AuthProvider` y `ThemeProvider`.
- `src/App.tsx` - AppShell: tabs, modales globales y acciones cross-tab.
- `src/pages/` - UI por tab: `HomePage`, `TransactionsPage`, `AdvisorPage`, `SettingsPage`, `MetricsPage`.
- `src/hooks/` - logica por dominio (controllers).
- `src/context/` - Auth y Theme.
- `src/components/` - UI reusable (Quick Add, filtros, modales, charts).
- `src/services/` - Firestore y Functions (transacciones, presupuestos, IA, planes).
- `src/utils/` - helpers (`dates.ts`, `format.ts`, `aiErrors.ts`).
- `tests/` - unit tests con Vitest + Testing Library.

## Funcionalidad clave
- **Quick Add**: registro rapido + plantillas recurrentes.
- **Interpretar (IA parse)**: frase de texto/voz (<=10s) -> sugerencia de transaccion.
- **Movimientos**: filtros por fecha, categoria y busqueda (nota + categoria), edicion/borrado inline.
- **Presupuesto**: total mensual y por categoria con alertas 80/100%.
- **Asesor IA (chat)**:
  - 4 acciones: Espejo diario, Gastos hormiga, Resumen semanal, En que se va la plata.
  - Respuestas pueden incluir bloques `[CHART_DATA]` y `[ACTION_DATA]`.
  - El frontend parsea esos bloques y renderiza:
    - **Grafico dinamico** (chartTop).
    - **Boton interactivo** (chip) que navega o abre presupuesto.
  - Proteccion anti-race: si el usuario cambia de modo, se descartan respuestas viejas.
  - UI bloquea quick actions mientras `advisorLoading` esta activo.
- **Graficos (ECharts)**: metrics y charts dedicados (`CategorySpendChart`, `EvolutionChart`).

## Asesor IA: parsing de bloques
El parser vive en `src/hooks/useAdvisorController.ts`:
- `[CHART_DATA]` -> `chartTop` (array de `{ category, amount }`).
- `[ACTION_DATA]` -> `actionData` (boton con payload).
Documento de referencia: `docs/SYSTEM_PROMPT_MAESTRO.md`.

## Arquitectura (AppShell)
`src/App.tsx` orquesta:
- **Auth gate** (renderiza `LoginHero` si no hay sesion).
- **Tabs** sin router (estado `activeTab`).
- **Modales globales**: `QuickAddSheet`, `TransactionEditModal`, `UpgradeModal`, `LimitsHelpModal`.
- **Acciones cross-tab**: `openMovements`, `openBudgets`, `openPlans`, `openAdvisor`.

## Tests + CI
- Unit tests enfocados en hooks y utils (sin Firebase real).
- Mocks de `src/services/*` con `vi.mock`.
- Coverage solo para `src/hooks/**` y `src/utils/**`.
- CI (GitHub Actions): lint + build + test:coverage.

## Smoke test checklist
- [ ] Login Google en desktop + Safari iOS (redirect).
- [ ] Tabs Inicio/Movimientos/Asesor/Config estables.
- [ ] Quick Add guarda y actualiza listas.
- [ ] Interpretar IA crea transaccion valida.
- [ ] Editar y borrar movimiento desde modal.
- [ ] Presupuesto total y por categoria se guarda y refleja alertas.
- [ ] Asesor IA responde y renderiza chart/boton cuando aplica.
- [ ] Planes/checkout/admin sin errores (si rol admin).
