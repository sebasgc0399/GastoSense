# Sprint P0.1 — Pulido de Métricas v1 (post-implementación)

**Contexto:** Ya está implementado el cambio de navegación (Inicio / Movimientos / Métricas / Asesor IA), Config en header, y una primera versión de Métricas con empty-state, tarjetas base, analytics y tests mínimos.

Este documento define el **pulido incremental** para dejar Métricas v1 “lista para usuarios reales” sin aumentar complejidad ni añadir fetch duplicado.

---

## 0) Principios (no negociables)
1) **Sin fetch duplicado:** Métricas debe reusar `useHomeMonthController` y `useBudgetController` (vía props desde `App.tsx`).
2) **Rápido por defecto:** la pantalla carga rápido y evita renders pesados si no hay datos.
3) **Condicional por datos:** Ingresos/Balance solo si hay ingresos; secciones avanzadas solo si tienen sentido.
4) **No bloquear guardado:** Quick Add sigue funcionando cross-tab y el guardado no depende de IA.

---

## 1) Estado actual (confirmado)
- `BottomNav` ahora incluye: `home | transactions | metrics | advisor` (y mantiene `settings` como TabKey solo para navegación interna).
- `SettingsPage` sigue siendo `activeTab === 'settings'` (para `openPlans()` y UpgradeModal).
- `MetricsPage` recibe por props: `monthTransactions`, `monthlyIncome`, `monthlyExpense`, `availableBalance`, `previousMonth`, `budget`, `topExpenses` (según implementación).
- `shouldShowIncomeAndBalance()`:
  - `monthlyIncome > 0 || monthTransactions.some(t.type==='income')`
- Empty state: `txCount === 0`.

---

## 2) Ajustes prioritarios (P0.1)

### GS-P0.1-001 — Evitar duplicación de CTAs en empty state
**Problema:** en empty state aparecen CTAs grandes y además el FAB “Registrar gasto”, generando redundancia visual.

**Cambio:**
- Si `txCount === 0`: mantener el bloque “Aún no hay datos” con botón principal **Registrar mi primer gasto**.
- Ocultar el FAB (o deshabilitarlo visualmente) solo en empty state.

**Criterio de aceptación:**
- En empty state no hay dos CTAs principales compitiendo.
- El usuario siempre tiene un camino claro para registrar el primer gasto.

---

### GS-P0.1-002 — Secciones condicionales por “hay gastos”
**Problema:** si hay solo ingresos o gasto del mes = 0, “Top categorías” y/o “Tendencia” pueden verse vacías o confusas.

**Cambio:**
- Definir `hasExpenses = monthlyExpense > 0 || monthTransactions.some(t.type==='expense')`.
- Mostrar:
  - “Top categorías de gasto” **solo si `hasExpenses`**.
  - “Tendencia vs mes anterior” **solo si `previousMonth != null`** (y si hay base comparable).

**Criterio de aceptación:**
- Si `monthlyExpense === 0`, no se renderiza el chart de top categorías.
- Si `previousMonth === null`, se muestra un estado “cargando comparativo” o se omite la tarjeta.

---

### GS-P0.1-003 — Estados del bloque “Presupuesto total”
**Problema:** cuando `budget.total` es 0 o no existe, la tarjeta debe guiar a la acción.

**Cambio:**
- Si no hay presupuesto o `budget.total <= 0`:
  - Mostrar tarjeta “Define tu presupuesto” con CTA principal “Ajustar presupuesto”.
  - El texto no debe mostrar “$0 / $0” ni porcentajes inválidos.
- Si hay presupuesto:
  - Mostrar progreso y CTAs (Ajustar / Ver movimientos).

**Criterio de aceptación:**
- Nunca hay división por cero ni progreso NaN.
- El usuario entiende qué hacer si aún no definió presupuesto.

---

### GS-P0.1-004 — Extraer utilidades de agregación (evitar lógica inline repetida)
**Problema:** la agregación está duplicada (Home controller, TransactionsPage, etc.), complicando tests y consistencia.

**Cambio:**
Crear `frontend/src/utils/txAgg.ts` con helpers puros, por ejemplo:
- `sumByType(transactions, 'expense'|'income')`
- `buildCategorySpendMap(transactions)` (solo expenses)
- `topCategories(spendMap, n)`
- `hasType(transactions, type)`

**Criterio de aceptación:**
- `useHomeMonthController` usa helpers (reduce inline minimizado).
- `MetricsPage` usa helpers para `hasIncome/hasExpenses`.
- Tests unitarios básicos para helpers.

---

### GS-P0.1-005 — Tests de UI para ingresos y estados vacíos
**Problema:** el test UI “con datos” hoy solo cubre el caso sin ingresos; ingresos/balance se testean solo por helper.

**Cambio (tests):**
En `frontend/tests/metricsPage.test.tsx` agregar:
1) Caso “con ingresos”: render con `monthTransactions` incluyendo `income` y verificar que aparezcan tarjetas “Ingresos del mes” y “Balance”.
2) Caso “solo ingresos”: `monthlyExpense=0` y verificar que **NO** se muestre “Top categorías de gasto”.
3) Caso “sin presupuesto”: `budget.total=0` y verificar que se muestre “Define tu presupuesto” (o el copy final).

**Criterio de aceptación:**
- `npm run test:run` pasa.
- Tests cubren: empty, con gastos, con ingresos, sin presupuesto.

---

## 3) Recomendaciones de UX (microcopy y jerarquía)
- Título: mantener “Métricas” + subtítulo corto (“Visualiza tu mes en segundos.”).
- “Mes de referencia”: dejar la explicación tal como está, pero el selector debe sentirse rápido (sin reflows).
- En “Tendencia vs mes anterior”: mostrar frase con dirección:
  - “Subiste $X” / “Bajaste $X” / “Igual que el mes anterior”.
- En “Top categorías”: si hay más de 3 categorías relevantes, considerar “Ver todas” (P1).

---

## 4) Analytics (ajustes mínimos)
Mantener lo implementado y asegurar payload consistente:
- `tab_changed`: `{ from, to }`
- `metrics_viewed`: `{ month, txCount, hasIncome, hasBudget, expense, income }` (agregados, sin PII)
- `settings_opened`: `{ source }`

---

## 5) Checklist de PR (definición de “Done”)
- [ ] Empty state sin CTA duplicada (FAB oculto o equivalente).
- [ ] Secciones condicionales: Top categorías y Tendencia solo cuando aplica.
- [ ] Tarjeta Presupuesto con estado “sin presupuesto”.
- [ ] Helpers de agregación en `utils/txAgg.ts` + tests.
- [ ] Tests UI adicionales (ingresos / solo ingresos / sin presupuesto).
- [ ] Screenshots mobile: empty, con gastos+ingresos, con solo gastos.

