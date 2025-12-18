# Sprint P0 — Navegación nueva + Config en header + Métricas v1 (v2)

**Estado:** listo para asignar al agente  
**Objetivo:** aplicar el cambio de navegación planeado sin router (AppShell), manteniendo Quick Add y el flujo actual.

## Decisiones confirmadas (Sebas)
- Bottom nav: **Inicio / Movimientos / Métricas / Asesor IA**
- **Configuración** sale del bottom nav y pasa al **header**, al lado de **Salir**
- **Sin routes** (no `react-router`): se mantiene el patrón `activeTab` en `App.tsx`
- Métricas v1: **Ingresos** y **Balance** se muestran **solo si hay datos**

---

## A) Estado actual verificado (para no romper el repo)
- Bottom nav y tabs hoy viven en:
  - `frontend/src/components/BottomNav.tsx`  
    `type TabKey = 'home' | 'transactions' | 'advisor' | 'settings'`
  - `frontend/src/App.tsx` usa `activeTab: TabKey` y renderiza pages por condicional:
    - `HomePage`, `TransactionsPage`, `AdvisorPage`, `SettingsPage`
- Header existe dentro de `App.tsx` (no componente aparte) y hoy solo tiene el botón **Salir**.
- `openPlans()` ya navega internamente con `setActiveTab('settings')` (sin routes).

---

## B) Alcance exacto del cambio (P0)

### 1) Bottom nav: agregar **Métricas** y remover **Config**
**Archivo:** `frontend/src/components/BottomNav.tsx`

- Actualizar el tipo para incluir `metrics` (y *puedes mantener* `settings` en el union para compatibilidad de `value`):
  - ✅ recomendado:
    - `type TabKey = 'home' | 'transactions' | 'metrics' | 'advisor' | 'settings';`
- Actualizar `tabs[]` para incluir **metrics** y eliminar **settings**:
  - `home`, `transactions`, `metrics`, `advisor`
- Icono:
  - usar un SVG existente si ya hay (p.ej. `/icons/Chart_64.svg`)
  - si no existe, dejar placeholder temporal (y se reemplaza luego)

**Nota de tipado importante:**  
`BottomNav` puede aceptar `value: TabKey` aunque el array `tabs` no contenga `'settings'`.  
Si `value === 'settings'`, no habrá ningún tab activo (OK).  
`onChange` solo debe emitir tabs del bottom nav (nunca `'settings'`).

---

### 2) AppShell: render de **MetricsPage**
**Archivo:** `frontend/src/App.tsx`

- Añadir:
  - `activeTab === 'metrics' && (<MetricsPage ... />)`
- Mantener:
  - `activeTab === 'settings' && (<SettingsPage ... />)`

---

### 3) Header: botón **Config** junto a **Salir** (sin rutas)
**Archivo:** `frontend/src/App.tsx` (header existente)

- Agregar un botón “Config” (ideal: icon + texto pequeño) junto al botón “Salir”:
  - `onClick={() => setActiveTab('settings')}`
- (Opcional recomendado) si `activeTab === 'settings'`, mostrar un botón “Atrás”:
  - `onClick={() => setActiveTab(prevMainTab)}`
  - Si no quieres manejar `prevMainTab`, alternativa simple:
    - al salir de Settings, volver a `'home'`

**Compatibilidad:** `openPlans()` sigue funcionando igual (setea settings).

---

## C) Métricas v1 (mínimo viable, “visual útil”)

### Objetivo de Métricas
Ser el lugar donde el usuario ve **visualización útil** (no solo números), sin sobrecargar **Inicio**.

### Reglas de render (clave)
- **Ingresos** y **Balance** solo si:
  - hay transacciones de tipo ingreso **o**
  - el total de ingresos del periodo > 0
- Si no hay movimientos del mes:
  - empty state con CTA: “Registrar mi primer gasto”

### Tarjetas recomendadas v1 (máximo 6)
1) **Gasto del mes** (total)
2) **Presupuesto total** (si existe) + progreso (barra)
3) **Top 3 categorías** (con % o barras)
4) **Tendencia vs mes anterior** (si hay datos previos)
5) **Ingresos del mes** *(condicional)*
6) **Balance** *(condicional)*

> Nota: si ya tienes agregados del Home controller, reutilízalos (sin fetch extra).

### CTAs útiles
- “Ver movimientos” (cambia tab a `transactions` y aplica filtro si ya existe)
- “Ajustar presupuesto” (cambia tab a settings o abre sección budgets si existe)

---

## D) Eventos analytics mínimos (P0)
Usar `frontend/src/services/analytics.ts` (no inventar demasiados):

- `tab_changed` (from, to)
- `metrics_viewed` (month, hasIncome, hasBudget, txCount)
- `settings_opened` (source: header|upgrade_modal|other)
- `quickadd_saved` (ya existe o se deja como TODO si ya trackean)

---

## E) Tests mínimos (P0)
**Objetivo:** no snapshots masivos; tests de lógica/derivados.

- 1 test de agregación/selector (si existe función pura o util):
  - con dataset: solo gastos → no muestra income/balance
  - con dataset: gastos+ingresos → sí muestra income/balance
- 1 test de UI Métricas:
  - empty state cuando txCount = 0
  - render de 3 tarjetas base cuando hay datos

---

## Checklist de PR (lo que debe traer el agente)
- [ ] Bottom nav: **Inicio / Movimientos / Métricas / Asesor IA**
- [ ] Settings removido del bottom nav
- [ ] Botón **Config** en header junto a **Salir**
- [ ] `openPlans()` y UpgradeModal siguen llevando a Settings
- [ ] Métricas v1: empty state + tarjetas base
- [ ] Condicional: Ingresos/Balance solo con datos
- [ ] Eventos analytics mínimos
- [ ] Tests mínimos pasan
- [ ] Screenshots mobile: bottom nav, header config, métricas vacío, métricas con datos, settings accesible

---

## Fuera de alcance (para no inflar P0)
- Diseño final del icono de Métricas
- Cashflow/proyección avanzada
- Filtros avanzados dentro de Métricas
- Conexión bancaria / importaciones
