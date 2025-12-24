# Plan de implementación (Backlog) — GastoSense

**Fecha:** 2025-12-13  
**Propósito:** Este documento es el **backlog maestro** (semi-técnico) de GastoSense: qué construir, en qué orden y con criterios de aceptación claros, para que un agente de desarrollo pueda implementar sin perder la visión del producto.

> **Nota de navegación (planeado, pendiente):** El menú inferior pasará a **Inicio / Movimientos / Métricas / Asesor IA**.  
> **Configuración** se moverá fuera del menú inferior y quedará en la zona superior (junto a “Salir”).  

---

## 0) Cómo usar este documento

- Cada ítem tiene: **Objetivo**, **Alcance**, **Criterio de aceptación**, **Dependencias**.
- Priorización:
  - **P0**: imprescindible para ganar vs Monefy/MoneyBoard o para estabilidad/monetización.
  - **P1**: gran impacto pero no bloquea el core loop.
  - **P2**: “nice to have”/futuro (o requiere señal).
- Estados sugeridos: `Pendiente` · `En progreso` · `Hecho` · `Bloqueado`.

---

## 1) Principios no negociables (para el agente)

1. **No bloquear el guardado si falla IA.**  
2. **Mobile-first real.** Todo flujo crítico funciona con el pulgar.  
3. **Rápido por defecto, profundo por opción.**  
4. **Privacidad por defecto.** En IA, enviar **agregados** cuando sea posible (evitar PII).  
5. **Costo/latencia:** preferir llamadas cortas, límites por plan, y degradación elegante.

---

## 2) Estructura del producto (módulos)

- **Registro (Quick Add):** manual + frase libre + audio ≤10s + plantillas + (pendiente) modo 2 taps + (pendiente) bulk add.
- **Movimientos:** lista + filtros + edición + duplicar + convertir a plantilla.
- **Presupuestos:** total + por categoría + alertas 80%/100%.
- **Métricas (nuevo):** dashboard visual útil (profundidad sin complicar Inicio).
- **Asesor IA:** acciones guiadas con tono; gating por plan; respuestas breves + 1 acción.
- **Planes & pagos:** Wompi + periodicidades + descuentos + idempotencia en webhook.
- **Privacidad/BYOK:** preferencia BYOK vs gestionada; Secret Manager; minimización de datos.

---

## 3) Fase 0 — Reorganización de navegación y cimientos (P0)

### GS-P0-001 — Nuevo menú inferior y “Configuración” arriba
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Ajustar navegación a: **Inicio / Movimientos / Métricas / Asesor IA**, y mover Configuración a header/menú cuenta (junto a Salir).
- **Alcance:**
  - Añadir tab **Métricas** (placeholder v1).
  - Reubicar acceso a Configuración y mantener accesibilidad (un toque desde header).
- **Criterio de aceptación:**
  - En mobile, bottom nav muestra 4 tabs nuevos.
  - Configuración accesible desde icono/cuenta en header.
  - Deep links / rutas existentes no rompen (redirigir si aplica).
- **Dependencias:** ninguna (UI routing).

### GS-P0-002 — Métricas placeholder + estados vacíos
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Crear la pantalla Métricas con skeleton + empty states (sin data aún).
- **Criterio de aceptación:**
  - Renderiza sin errores con 0 movimientos.
  - Copy claro: “Aún no hay datos — registra 3 gastos para ver métricas”.

---

## 4) Fase 1 — Speed killer (ganarle a Monefy) sin perder detalle (P0)

### GS-P0-010 — Modo “2 taps” dentro de Quick Add (Speed)
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Registrar un gasto en 3–6 segundos: **categoría → monto → guardar**.
- **Alcance:**
  - Grid de categorías con iconos.
  - Keypad numérico grande.
  - Toggle/CTA de “Agregar detalle” (abre campos avanzados sin fricción).
- **Criterio de aceptación:**
  - Con categorías precargadas: 1 gasto se registra con 2 acciones principales.
  - No requiere escribir texto para guardar.
  - Funciona igual para gasto e ingreso (si decides soportarlo).
- **Dependencias:** categorías personalizables estables.

### GS-P0-011 — “Detalle opcional” (Power) sin castigar Speed
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Que el usuario Power pueda añadir nombre/nota, método pago, fecha, tags **sin ralentizar** al usuario Speed.
- **Criterio de aceptación:**
  - Campos avanzados colapsados por defecto.
  - Guardar funciona con mínimos campos.
  - Edición post-guardado rápida desde Movimientos.

### GS-P0-012 — Plantillas en 1 toque + “Convertir en plantilla”
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Recurrentes y frecuentes en 1 tap (para retención).
- **Criterio de aceptación:**
  - Desde un movimiento: acción “Convertir en plantilla”.
  - Desde Quick Add: seleccionar plantilla y guardar sin editar.

### GS-P1-013 — Bulk add (pegar lista / dictado múltiple) con vista previa
- **Prioridad:** P1 · **Estado:** Pendiente
- **Objetivo:** Vencer el “Notas → Excel/Notion”: pegar texto con varios gastos y guardarlos en lote.
- **Alcance técnico sugerido:**
  - Callable `parseMultipleTransactions` (ver ideas IA) → array JSON.
  - UI de “preview editable” antes de guardar.
- **Criterio de aceptación:**
  - Entrada de 5–10 líneas produce 5–10 items editables.
  - Guardar en lote no se bloquea por 1 item inválido (señalarlo).
- **Dependencias:** reglas/validación de transacciones.

---

## 5) Fase 2 — Categorías & presupuestos “a prueba de abandono” (P0)

### GS-P0-020 — Categorías 100% customizables + creación inline
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial (según repo)
- **Objetivo:** Evitar el fracaso tipo “Wallet rígido”: crear/editar/ordenar categorías fácil.
- **Criterio de aceptación:**
  - Crear categoría desde Quick Add sin salir del flujo.
  - No hay duplicados (id/label) y hay al menos 1 activa.
  - Orden visible en grid y en listas.

### GS-P0-021 — Presupuestos por categoría + alertas 80%/100% (UX)
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial
- **Objetivo:** Alertas claras y accionables sin ser molestas.
- **Criterio de aceptación:**
  - Al cruzar 80%: estado “ojo”.
  - Al cruzar 100%: estado “excedido”.
  - CTA contextual: “Ver movimientos de esta categoría” y/o “Ajustar tope”.

### GS-P1-022 — Presupuesto inteligente (sugerencia) basado en 2–3 meses
- **Prioridad:** P1 · **Estado:** Pendiente
- **Objetivo:** Ayudar a configurar presupuestos rápido (reducción de fricción).
- **Alcance técnico sugerido:**
  - Callable `suggestBudgets` usando agregados (sin PII).
- **Criterio de aceptación:**
  - Propone topes razonables y editables.
  - Explica 1 línea: “Basado en tu promedio de X meses”.

---

## 6) Fase 3 — Métricas (nuevo tab) como “visual útil” (P0/P1)

> Meta: Ganarle a MoneyBoard en “utilidad” sin volverse complejo.

### Métricas v1 (P0): 4–6 tarjetas máximo
**Tarjetas recomendadas v1:**
1) **Gasto total del mes vs presupuesto** (barra + %).  
2) **Top categorías (3–5)** (mini barras).  
3) **Tendencia semanal** (últimas 4 semanas: gasto total).  
4) **Recurrentes próximos 7/30 días** (si hay plantillas recurrentes).  
5) **“Fin de mes estimado” (cashflow lite)** (P1 si requiere más).  

### GS-P0-030 — Métricas v1 (tarjetas 1–3) con datos locales
- **Prioridad:** P0 · **Estado:** Pendiente
- **Objetivo:** Dashboard útil con los datos que ya tienes (transactions + budgets).
- **Criterio de aceptación:**
  - Con 10 movimientos, muestra totales correctos por mes y por categoría.
  - Rendimiento ok en mobile (sin jank) con 500 movimientos.
- **Dependencias:** consultas/índices Firestore y/o agregación en cliente.

### GS-P1-031 — Cashflow lite (fin de mes estimado)
- **Prioridad:** P1 · **Estado:** Pendiente
- **Objetivo:** “Si sigues así, terminas el mes en X”.
- **Criterio de aceptación:**
  - Explica suposiciones (promedio diario/semanal).
  - No promete exactitud; es orientación.

### GS-P2-032 — “Reporte mensual” exportable desde Métricas
- **Prioridad:** P2 · **Estado:** Pendiente
- **Objetivo:** Compartible / guardable (PDF/imagen) para usuarios Power.
- **Criterio de aceptación:** exporta resumen sin PII sensible.

---

## 7) Fase 4 — Asesor IA (acción concreta + gating por plan) (P0/P1)

### GS-P0-040 — Marco único de acciones del Asesor
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial
- **Objetivo:** Todas las acciones del Asesor comparten: input agregado, output breve, 1 acción, tracking.
- **Criterio de aceptación:**
  - Respuesta 2–4 frases + 1 acción.
  - Siempre tolera “pocos datos” y sugiere siguiente paso.

### GS-P0-041 — Gating por rol (locks) con modal legible
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial
- **Objetivo:** Free ve lo permitido y entiende por qué pagar.
- **Criterio de aceptación:**
  - Botones bloqueados muestran explicación legible (no cortada).
  - CTA de upgrade claro.

### GS-P1-042 — “Análisis mensual profundo” (feature premium)
- **Prioridad:** P1 · **Estado:** Pendiente
- **Objetivo:** Insight de 3 meses + acciones (tipo MoneyBoard power).
- **Alcance técnico:** callable `analyzeMonthlyDeep` ya existe (revisar calidad del output).
- **Criterio de aceptación:**
  - Incluye: top cambios, señales clave, 3 acciones, 1 riesgo.
  - Usa agregados (evitar PII).

---

## 8) Fase 5 — Pagos, planes, y confianza (P0)

### GS-P0-050 — Periodicidades + descuentos (implementado) y UX de selección
- **Prioridad:** P0 · **Estado:** Hecho (lógica) / Pendiente (pulir UX/copy)
- **Objetivo:** Maximizar conversión con selector claro, manteniendo coherencia de precios.
- **Hecho (según producto actual):**
  - Selector de periodicidad: **Mensual / Trimestral / Semestral / Anual**.
  - Descuentos acumulados: **Trimestral -5%**, **Semestral -10%**, **Anual -15%** (vs mensual).
- **Pendiente (UX recomendado):**
  - Mostrar “equivalente mensual” (ej: “≈ $X/mes pagando anual”).
  - Badges: **Anual = Mejor precio**; Semestral = Popular (cuando datos lo justifiquen).
- **Criterio de aceptación (UX):**
  - El usuario entiende en <5s cuánto paga hoy y cuánto ahorra.
  - No hay inconsistencias entre precio mostrado y cobrado.

### GS-P0-051 — Idempotencia y robustez en webhook Wompi
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial
- **Objetivo:** Evitar doble aplicación por webhooks repetidos.
- **Criterio de aceptación:**
  - Repetir el mismo evento no duplica beneficios ni corrompe estado.
  - Logs y trazabilidad por transaction id.

### GS-P0-052 — Pantalla de privacidad/BYOK clara (copy + controles)
- **Prioridad:** P0 · **Estado:** Pendiente/Parcial
- **Objetivo:** Reducir fricción y aumentar confianza.
- **Criterio de aceptación:**
  - Explica BYOK vs gestionada en lenguaje simple.
  - Permite activar/desactivar BYOK fácilmente.
  - Indica qué se envía a IA (agregados cuando sea posible).

---

## 9) No funcionales (calidad) — siempre activos (P0)

### GS-P0-060 — Seguridad Firestore & validaciones
- **Objetivo:** proteger datos por `userId`, validaciones de enums y formatos.
- **Criterio de aceptación:**
  - Tests básicos de reglas (allow/deny).
  - No hay lecturas cruzadas entre usuarios.

### GS-P0-061 — Observabilidad y costos IA
- **Objetivo:** medir latencia/errores/costo aproximado por acción.
- **Criterio de aceptación:**
  - Eventos: `ai_parse_called`, `ai_analyze_called`, `ai_error`, `wompi_checkout_started`, `subscription_activated`.
  - Dashboard básico (logs/BigQuery si aplica en el futuro).

### GS-P0-062 — Performance (mobile)
- **Objetivo:** Quick Add y listas fluidas.
- **Criterio de aceptación:**
  - Movimientos: scroll fluido con 500–2000 items (virtualización si hace falta).
  - Métricas: cálculos memoizados; no recalcular en cada render.

### GS-P0-063 — Tests mínimos
- **Objetivo:** proteger el core loop.
- **Criterio de aceptación:**
  - Unit tests: format helpers, controllers/hooks.
  - Functions: tests de validación + rate limit + webhook happy path.

---

## 10) Ideas IA adicionales (del documento de ideas) — backlog (P1/P2)

- **Normalización avanzada (subcategorías/tags)**: `normalizeCategories` (P1).
- **Detección de anomalías / “gasto atípico”**: por categoría y por día (P1).
- **Sugerencias de plantillas** (merchant frecuente) (P2).
- **Resumen semántico mensual** (sin PII) (P2).

---

## 11) Preguntas abiertas (para decidir sin bloquear)
1) ¿El modo “2 taps” será **default** o **toggle** dentro de Quick Add?
2) ¿El modo 2 taps cubre también **ingresos** o solo **gastos**?
3) ¿En Métricas v1, “cashflow lite” entra en P0 o lo dejamos P1?

