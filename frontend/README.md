# Frontend – GastoSense

React 19 + TypeScript + Vite + Tailwind. Interfaz mobile‑first para registrar gastos/ingresos, gestionar presupuestos y usar el Asesor IA en modo chat (tonos Amable o Regañón).

## Requisitos
- Node 20.x
- npm 9+ (usa el lock actual)
- Variables en `.env`:
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
- `npm run preview` — sirviendo el build
- `npm run lint` — ESLint (TS/React)

## Estructura rápida
- `src/main.tsx` — arranque con `AuthProvider` y `ThemeProvider`.
- `src/App.tsx` — orquesta pestañas (Inicio, Movimientos, Asesor IA, Config), presupuestos, planes y admin.
- `src/context/` — `AuthContext` (login/logout, UID), `ThemeContext` (tema claro/oscuro persistente).
- `src/components/` — QuickAddSheet (modo rápido y modo frase/voz), BudgetCard, CategoryBudgets, TransactionEditModal, BottomNav, ResponsiveSelect, etc.
- `src/services/` — llamadas a Firestore/Functions (transacciones, presupuestos, plantillas, usuarios, IA, planes/pagos).
- `src/types/` — modelos compartidos (Transaction, Budget, Template, UserProfile, PlanInfo…).
- `public/` — assets estáticos.

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
2) Crear `.env` (ver arriba)
3) `npm run dev`

## Notas
- Usa Firebase Auth (Google) y Firestore; las callable functions requieren que el proyecto y secretos estén configurados.
- Las cuotas de IA se actualizan tras cada llamada (parse/analyze) mediante `fetchUsageQuota`.
- Componente `ResponsiveSelect` adapta selects en mobile (bottom sheet) y desktop (dropdown).
