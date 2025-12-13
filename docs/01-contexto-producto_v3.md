# Contexto de producto — GastoSense (v3)

**Última actualización:** 2025-12-13  
**Propósito de este documento:** Dar contexto de producto (no técnico) para que cualquier agente/colaborador entienda **qué es GastoSense**, **qué ya existe**, **qué falta**, y **qué decisiones son “no negociables”**.

---

## 0) Nota importante (cambio de navegación planeado)

**Cambio propuesto (aún NO desarrollado):**
- El menú inferior quedará en **4 pestañas**: **Inicio / Movimientos / Métricas / Asesor IA**.
- **Configuración** deja de ser pestaña inferior y pasa a estar **arriba**, junto al botón de **Salir** (zona de cuenta).

**Motivo del cambio:**
- “Métricas” será el lugar de la **parte visual útil** (dashboard) sin sobrecargar Inicio.
- Configuración es una acción de “cuenta” y no debería competir con el flujo diario (registrar + revisar).

> Regla: el usuario debe poder registrar en segundos desde cualquier pestaña.

---

## 1) Qué es GastoSense

GastoSense es una **app web (mobile-first)** para **administrar gastos e ingresos** en segundos, con **presupuestos**, **métricas claras** y un **Asesor de IA** que entrega consejos **cortos y accionables** en español.

**Promesa central:**
1) *Registrar es ridículamente fácil* (texto libre, voz ≤10s y modo ultra-rápido por taps).  
2) *Entender y mejorar es simple* (presupuesto con alertas 80%/100% + métricas visuales + asesor con una acción concreta).  
3) *Privacidad primero* (BYOK opcional + minimización de datos enviados a IA).

**Navegación principal (menú inferior):**
- **Inicio** · resumen, alertas y CTA de “Registrar gasto”.
- **Movimientos** · lista, filtros, edición y plantillas.
- **Métricas** · dashboard visual útil (tendencias, categorías, proyección simple).
- **Asesor IA** · acciones guiadas con tono (amable, directo, exigente, regañón).

**Configuración (arriba, junto a “Salir”):**
- Cuenta, categorías, presupuestos, plan, privacidad/BYOK, soporte.

**Moneda:** COP como principal, con referencia rápida opcional a USD.

---

## 2) Para quién es (y cómo le ganamos a Monefy + MoneyBoard)

### 2.1 Arquetipos principales
**A) Usuario “Speed” (tipo Monefy)**
- Quiere registrar con **2 taps** y seguir su vida.
- Ama UI simple y visual.
- Tolera poco “detalle obligatorio”.

**B) Usuario “Power” (tipo MoneyBoard)**
- Quiere **profundidad útil**: recurrentes, filtros, proyección, control fino.
- Acepta complejidad *siempre que* sea opcional y clara.

### 2.2 Estrategia clave: “Rápido por defecto, profundo por opción”
- Cualquier movimiento se puede guardar con **mínimos campos** (categoría + monto).  
- Detalles (nota/nombre, método, fecha, tags, recibo) son **opcionales** y accesibles en 1 toque.
- **Métricas** entrega la profundidad visual (sin volver Inicio pesado).
- El Asesor IA convierte datos en **una sola acción concreta** (no solo “bonitos gráficos”).

---

## 3) Problema y propuesta de valor

### 3.1 Problemas reales del usuario
- Registrar manualmente en notas/Excel/Notion es lento y **no sostenible**.
- Apps “rápidas” suelen sacrificar análisis o detalle.
- Apps “profundas” suelen tener UX confusa o curva alta.
- La gente desconfía de “IA” si no es clara la privacidad.

### 3.2 Propuesta de valor (en 4 frases)
- **Registro fricción-cero**: Quick Add, frase natural y voz (≤10s).
- **Presupuesto claro**: tope mensual + por categoría, con alertas al **80%** y al **100%**.
- **Métricas visuales útiles**: dashboard que responde “¿en qué se fue?” y “¿cómo voy vs el mes?”.
- **Asesor IA accionable**: feedback breve (2–4 frases) + 1 acción.
- **Privacidad vendible**: BYOK opcional y minimización de datos (enviar agregados cuando sea posible).

---

## 4) Principios no negociables

1) **No bloquear guardado por fallas de IA.** Si IA falla, se guarda igual y se permite corregir.
2) **Mobile-first real.** Todo flujo crítico funciona con el pulgar en pantalla chica.
3) **Velocidad > perfección.** Mejor capturar rápido y corregir después.
4) **Explicabilidad simple.** El usuario entiende por qué se sugiere algo (sin tecnicismos).
5) **Privacidad por defecto.** Evitar enviar PII innecesaria al modelo.

---

## 5) Experiencia por sección (qué debe pasar ahí)

### 5.1 Inicio
**Objetivo:** en 10 segundos el usuario sabe “cómo va” y puede registrar.

Debe incluir:
- CTA principal: **“Registrar gasto”** siempre visible.
- Resumen del mes: gasto total, ingreso total (si existe), balance.
- Presupuestos: estado por categoría (top 3) y total.
- Alertas “inteligentes”:
  - 80%: “ojo, vas en X%”
  - 100%: “te pasaste en X”
- Acciones rápidas:
  - “Usa una plantilla”
  - “Ajusta presupuesto”
  - “Ver movimientos filtrados por categoría”
  - “Ir a Métricas” cuando el usuario quiera profundizar

> Inicio NO es para dashboards densos. Es para claridad rápida + acción inmediata.

### 5.2 Movimientos
**Objetivo:** encontrar, editar y entender sin fricción.

Debe incluir:
- Lista de movimientos (gastos/ingresos) con búsqueda/filtros por fecha, categoría y tipo.
- Edición rápida (cambiar categoría, monto, nota/nombre).
- Acciones:
  - “Duplicar” (gasto frecuente).
  - “Convertir en plantilla” (para recurrentes).
- (Opcional futuro) Adjuntar recibo/foto.

### 5.3 Métricas (nuevo, planeado)
**Objetivo:** la **parte visual útil**: entender patrones, tendencias y “cómo voy” sin esfuerzo.

Debe responder con claridad:
- “¿En qué se fue la plata este mes?”
- “¿Cómo voy vs presupuesto (total y por categoría)?”
- “¿Mi ritmo de gasto es saludable para terminar el mes?”
- “¿Qué cambió vs el mes pasado?”

Métricas mínimas (v1 sugerida):
- Distribución por categoría (mes actual) + top 5.
- Tendencia del gasto total por semana (mes actual).
- Comparativo vs mes anterior (total y top categorías).
- Estado de presupuestos (barras claras con %).
- (Si existe) Proyección simple “fin de mes” basada en ritmo actual y recurrentes.

Regla UX:
- **Sin sobrecargar**: 4–6 tarjetas máximo, cada una responde 1 pregunta.
- Cada tarjeta debe tener **CTA** (“Ver movimientos filtrados”, “Ajustar presupuesto”, “Abrir Asesor IA”).

### 5.4 Asesor IA
**Objetivo:** convertir datos → hábito → acción.

Características del asesor:
- Modos (tono): **amable, directo, exigente, regañón**.
- Respuestas breves (2–4 frases) + **una acción concreta**.
- Acciones típicas:
  - Espejo diario
  - Detección de gastos hormiga
  - Resumen semanal
  - ¿En qué se va la plata?
  - (Futuro) Análisis mensual profundo

Reglas:
- El asesor nunca regaña por regañar: siempre termina con una acción.
- Cuando falten datos, pide *un dato mínimo* o sugiere “registra 3 gastos hoy”.
- El asesor y Métricas se complementan:
  - Métricas = “visual y objetivo”
  - Asesor = “interpretación + acción”

### 5.5 Configuración (arriba, junto a “Salir”)
**Objetivo:** control, confianza y monetización (zona de cuenta).

Debe incluir:
- Perfil básico.
- **Categorías personalizables** (crear/editar/ordenar/activar).
- Presupuestos (gestión).
- Plan y facturación:
  - Selección de periodicidad: **Mensual / Trimestral / Semestral / Anual**
  - Descuentos escalonados (p.ej. trimestral -5%, semestral -10%, anual -15%).
- Privacidad / claves:
  - Preferencia BYOK vs clave gestionada (según rol/plan).
  - Explicación clara de “dónde queda mi clave” y qué se envía a IA.
- Ayuda/soporte y “exportar datos” (futuro cercano).

---

## 6) IA en GastoSense (qué hace y qué NO hace)

### 6.1 Qué sí hace
- **Parseo** de frase libre: extraer monto, categoría sugerida, tipo (gasto/ingreso) y descripción corta.
- **Transcripción** de audio corto (≤10s) para alimentar el parseo.
- **Análisis** basado en agregados (cuando sea posible):
  - distribución por categoría
  - tendencias
  - anomalías simples
  - recomendaciones

### 6.2 Qué no hace (por ahora)
- No da asesoría financiera “regulatoria” (inversiones complejas, impuestos, etc.).
- No requiere conexión bancaria para funcionar (eso puede ser futuro, no base).

---

## 7) Planes, roles y límites (visión de producto)

Roles:
- **Free**
- **BYOK pago**
- **Pro gestionado**
- **Admin/soporte** (interno)

Principios de monetización:
- El usuario *entiende* por qué pagar: más cuota IA, comodidad (clave gestionada), funciones avanzadas del asesor.
- El paywall se usa **cuando hay valor probado** (después de que el usuario vea el beneficio).

Límites sugeridos (ajustables):
- Free: parse 5/semana, analyze 2/semana
- BYOK pago: parse 70/semana, analyze 20/semana
- Pro gestionado: parse 90/semana, analyze 20/semana

---

## 8) Estado actual del producto (para que un agente sepa “qué hay” y “qué falta”)

> Nota: marca “Implementado/Parcial/Pendiente” según lo que ya esté en el repo hoy. Ajusta si algo ya cambió.

### 8.1 Registro de movimientos
- **Quick Add (modal/flujo rápido):** Implementado/Parcial
- **Frase libre (texto natural → movimiento):** Implementado/Parcial
- **Audio ≤10s (voz → texto → movimiento):** Implementado/Parcial
- **Modo ultra-rápido 2 taps (tipo Monefy):** Pendiente (en evaluación)
- **Edición rápida post-guardado:** Implementado/Parcial
- **Bulk add / pegar lista:** Pendiente

### 8.2 Categorías y presupuestos
- **Categorías customizables:** Implementado/Parcial
- **Presupuesto total + por categoría:** Implementado/Parcial
- **Alertas 80%/100% visibles:** Implementado/Parcial
- **Sugerencia de presupuesto “inteligente”:** Pendiente

### 8.3 Métricas (nuevo)
- **Tab Métricas (dashboard visual útil):** Pendiente (nuevo, planeado)
- **Tendencias + comparativo mes anterior:** Pendiente
- **Proyección fin de mes / cashflow lite:** Pendiente

### 8.4 Asesor IA
- **Modos de tono y acciones rápidas:** Implementado/Parcial
- **Análisis mensual profundo:** Pendiente

### 8.5 Monetización y confianza
- **Checkout + suscripciones por período:** Implementado/Parcial
- **Selector Mensual/Trimestral/Semestral/Anual + descuentos:** Implementado
- **Explicación de privacidad/BYOK dentro del flujo:** Parcial
- **Exportar datos (CSV/backup):** Pendiente

---

## 9) Roadmap de producto (alto nivel, no técnico)

### Próximo (0–30 días)
- Definir navegación final (menú inferior con Métricas + Configuración arriba).
- Diseñar y construir **Métricas v1** (4–6 tarjetas).
- Modo 2 taps (Speed) + “detalle opcional”.
- Mejoras de visualización (Inicio + Movimientos) sin complejidad.
- Recurrencias con plantillas en 1 toque desde un movimiento.

### Siguiente (31–60 días)
- Proyección simple (fin de mes / próximos 7–30 días).
- Bulk add (pegar lista / dictado múltiple con vista previa editable).
- Mejoras en filtros y reportes.

### Después (90+ días)
- Gastos compartidos (pareja/roomies) si hay demanda.
- Conexión bancaria / importación si hay señal fuerte.
- Adjuntos (recibos) si el segmento lo pide.

---

## 10) Glosario (términos del producto)
- **Movimiento:** gasto o ingreso.
- **Plantilla:** preconfiguración para registrar rápido (recurrente o frecuente).
- **Presupuesto:** tope mensual total o por categoría.
- **Gastos hormiga:** gastos pequeños frecuentes que se acumulan.
- **BYOK:** “Bring Your Own Key” (tu clave) para usar IA con tu propia API key.
- **Clave gestionada:** clave provista por el plan (si aplica).

---

## 11) Instrucciones para agentes (cómo contribuir sin romper la visión)

Cuando propongas cambios:
- Prioriza **velocidad de registro** y **claridad**.
- Mantén “simple por defecto, avanzado opcional”.
- No agregues fricción (pasos extra) a Quick Add.
- Cualquier cosa que toque privacidad/IA debe explicarse en lenguaje simple al usuario.
- Si algo es ambiguo, entrega una versión funcional con supuestos y deja preguntas mínimas.
