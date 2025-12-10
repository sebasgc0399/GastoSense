# Ideas practicas con la API de ChatGPT (siguientes mejoras)

Estas propuestas se pueden implementar como nuevas callable functions en `functions/src/index.ts` y consumirlas desde el frontend (por ejemplo, en `QuickAddSheet` o en flujos de analitica). Todas buscan reducir friccion y elevar la calidad del dato antes de guardar en Firestore.

## 1) Reestructuracion y normalizacion avanzada de categorias
- **Que hace**: toma la descripcion cruda y devuelve categoria/subcategoria/tags normalizados segun un catalogo propio.
- **Flujo**:
  - Entrada: descripcion libre + lista de categorias/subcategorias/etiquetas permitidas (enviada desde cliente o leida de config).
  - LLM devuelve JSON `{sub_categoria, tags_adicionales}` y puede sugerir categoria principal corregida.
  - Se guarda junto con la transaccion o se muestra como sugerencia editable.
- **Prompt base**:  
  `Dado el gasto: "<DESCRIPCION>" y mi lista de categorias <CATEGORIAS>, devuelve sub_categoria (string de la lista) y tags_adicionales (array) con 2-4 etiquetas concretas. Responde JSON estricto.`
- **Beneficio**: datos coherentes para reportes; permite ver gasto real en "Cafeteria" vs. "Almuerzos".
- **Consideraciones**: validar que la categoria sugerida este en la lista; fallback si el modelo responde fuera de esquema; registrar confianza.

## 2) Resumen y analisis semantico de multiples gastos en una frase
- **Que hace**: parsea un texto largo y devuelve un array de movimientos estructurados.
- **Flujo**:
  - Entrada: texto libre que incluye varios montos, conceptos y un metodo de pago implicito.
  - LLM devuelve JSON array `[{monto, descripcion, categoria, metodo_pago}]` e infiere metodo_pago para todos si se menciona.
  - El cliente muestra vista previa y permite editar/guardar en lote.
- **Prompt base**:  
  `Extrae todos los gastos de este texto en un array JSON. Cada objeto debe tener monto (number), descripcion, categoria y metodo_pago. Si el texto dice que todo fue con tarjeta, aplica a todos. Responde solo JSON.`
- **Beneficio**: registra varios gastos del dia/viaje en un solo paso (texto o voz transcrita).
- **Consideraciones**: limitar longitud; validar que los montos suman con separadores correctos; manejar moneda por defecto (COP) y fecha hoy a menos que se indique.

## 3) Deteccion de transacciones anormales
- **Que hace**: compara un gasto nuevo contra el historial del usuario en la misma categoria y marca si es atipico.
- **Flujo**:
  - Cliente busca los ultimos N gastos de la categoria (e.g., 10) y calcula promedio/mediana.
  - Envia al LLM: monto actual, promedio, categoria, fecha y nota opcional.
  - LLM responde JSON `{es_atipico: bool, razon: string, sugerencia_categoria?: string}`.
  - Si es atipico, mostrar alerta y permitir corregir categoria o confirmar.
- **Prompt base**:  
  `Analiza el gasto $<MONTO> en "<CATEGORIA>" vs. promedio historico $<PROMEDIO>. ¿Es atipico? Responde JSON: es_atipico (bool), razon (string breve), sugerencia_categoria (opcional).`
- **Beneficio**: previene errores de captura y duplica registros; mejora confianza en el dataset.
- **Consideraciones**: definir umbral antes de llamar a LLM (ej. >3x promedio); evitar enviar grandes historicos (solo estadisticos); no bloquear el guardado si falla la llamada.

## Integracion sugerida
- **Nueva callable**: crear endpoints en `functions/src/index.ts` para cada idea, aplicando el mismo esquema de seguridad/cuotas que `parseTransactionPhrase` y `analyzeSummary`.
- **Esquema de respuesta**: validar con `response_format: json_schema` para mantener consistencia.
- **UI**:
  - Idea 1: boton "Mejorar categoria" en QuickAdd/editar, con sugerencias aplicables.
  - Idea 2: modo "Pegar lista" en QuickAdd que muestre tabla previa al guardado en lote.
  - Idea 3: etiqueta "Posible atipico" en la lista de movimientos y modal de correccion rapida.
- **Metrica**: registrar en `usage` el consumo de estas llamadas y exponer en la vista de cuota.

## 4) Generacion de presupuestos basados en la historia (planning inteligente)
- **Que hace**: propone limites de gasto para el siguiente mes combinando historicos y la intencion declarada del usuario (ej. "ahorrar mas en restaurantes y transporte").
- **Flujo**:
  - Backend obtiene promedios de los ultimos 3 meses por categoria (ej. comida, transporte, ocio).
  - Entrada del usuario: texto corto de objetivo/expectativa.
  - LLM devuelve JSON con `{categoria, presupuesto_sugerido, razon}` por categoria relevante.
  - El cliente muestra sugerencias y permite aceptarlas como nuevo presupuesto mensual (o por categoria).
- **Prompt base**:  
  `Historial 3 meses: <RESUMEN_POR_CATEGORIA>. Intencion: "<OBJETIVO_USUARIO>". Propón presupuesto para el siguiente mes. Responde JSON por categoria con campos: categoria (string), presupuesto_sugerido (number), razon (string breve).`
- **Beneficio**: convierte datos historicos en planes accionables y proactivos; motiva ahorro concreto.
- **Consideraciones**: limitar categorias a las principales; validar que el monto sugerido no sea negativo y que siga una reduccion razonable (ej. max 50% recorte sin confirmacion extra); permitir override manual antes de guardar en Firestore.

## 5) Finanzas chat y simples (feed tipo WhatsApp con IA)
- **Que hace**: convierte la app en un feed estilo chat mezclando mensajes de IA y acciones rapidas de gasto, con personalidad seleccionable (solo dos tonos: amable y regañón).
- **Casos de uso**:
  - **Espejo diario**: balance proactivo cada noche o bajo demanda, ajustado al tono elegido. Usa totales del dia, promedio diario y categoria top del dia.
  - **Detector de gastos hormiga**: identifica compras pequenas y recurrentes (cafes, suscripciones) y sugiere recortes indoloros con ahorro estimado.
  - **Resumen semanal**: compara ultimos 7 dias vs semana anterior y resalta deltas por categoria (ej. "Gastaste $50 menos en restaurantes").
- **Prompts base**:
  - Espejo diario (regañón): system "Asesor financiero sarcastico y roast. Max 40 palabras. Se directo, humor acido." + user `Datos del dia: {total_hoy: X, promedio_diario: Y, categoria_top: "Comida Rapida"}. ¿Como lo hice hoy?`
  - Gastos hormiga (amable): system "Analista empatico. Detecta 1-2 gastos hormiga o suscripciones. Da ahorro potencial y accion concreta. Usa emojis." + user `Transacciones recurrentes: ...`
  - Resumen semanal (tono elegido entre amable/regañón): system "Asesor <tono>. Resume ultimos 7 dias vs 7 previos. Devuelve viñetas cortas y una accion principal." + user `Semana actual: {...}; Semana previa: {...}; Categoria_top: ...`
- **Prompts por tono (usar como system según selección)**:
  - Tono amable: "Eres un asesor financiero empatico y motivador. Habla en 2-4 frases cortas, propone 1 accion concreta. Mantén lenguaje sencillo, positivo y cercano."
  - Tono regañón: "Eres un asesor financiero sarcástico estilo roast. Máx 40 palabras. Sé directo, incisivo y un poco burlón, pero siempre con una acción clara al final."
- **Requisitos de UI**:
  - Selector de personalidad (solo amable o regañón) en onboarding/Ajustes; persiste y se envia como modo al prompt.
  - Feed cronologico tipo chat: mezcla mensajes de IA con eventos (nuevo gasto, alerta, resumen).
  - Micrograficos adjuntos (pie/barras simples) junto a la respuesta de IA cuando pida "¿En que se va mi dinero?".
  - Alertas push cuando una categoria se acerca al limite de presupuesto.
- **No funcional**:
  - Preprocesar datos: enviar solo agregados (totales por categoria, promedios) para cuidar tokens/costo.
  - Privacidad: anonimizar comercios; no enviar ubicaciones ni nombres innecesarios.
  - Latencia: usar modelos rapidos (gpt-4.1-mini/gpt-3.5) para interacciones diarias; respuesta percibida rapida (spinner optimista en el feed).

## 6) Planes, limites de IA y psicologia de upgrade (semanal)
- **Estructura de precios** (ejemplo): Pro lista 30k (oferta 25k por 6 meses); BYOK lista 20k (oferta 15k por 6 meses); Free $0. Oferta como "precio fundador" que se conserva si mantiene la suscripcion activa.
- **Plan Free (engancha pero fricciona al heavy user)**:
  - IA limitada: parse (frases) max 10/semanales; analyze max 4/semanales.
  - Sin analisis avanzado (hormiga, alertas avanzadas, comparativos profundos).
  - Basicos: registro manual, plantillas simples, presupuesto mensual, graficas basicas.
  - Mensaje: "Te sirve, pero si usas mucho la IA te quedas corto."
- **Plan BYOK (20k -> 15k oferta, para power users tech)**:
  - Usa su API key; tu costo marginal es bajo.
  - IA amplia: parse hasta 70/semanales; analyze hasta 20/semanales.
  - Desbloquea IA avanzada (hormiga, resumen semanal/mensual, todos los tonos, registro en lote asistido).
  - Posicionamiento: "Exprime IA sin limite mental; ideal si manejas tu propia key."
- **Plan Pro gestionado (30k -> 25k oferta, cero configuracion)**:
  - Tu pagas IA; limites moderados pero superiores a Free: parse 90/semanales; analyze 20/semanales.
  - Incluye analisis avanzados, comparativos 3 meses, recomendaciones por categoria, recordatorios inteligentes y prioridad en features nuevas.
  - Mensaje: "No configures nada; la IA trabaja por ti."
- **Tabla sugerida para getWeeklyLimit(role, key)**:
  - parse (semanal): free 5, paid_byok 70, paid_managed 90, gifted_managed 90, admin 400.
  - analyze (semanal): free 2, paid_byok 20, paid_managed 20, gifted_managed 20, admin 400.
  - fallback: parse 5, analyze 2.
- **UX para upsell**:
  - Mostrar progreso de cuota semanal (ej. "80% usado") y CTA al plan superior justo al agotarse.
  - Features vistas con candado: tarjetas de "gastos hormiga" o "analisis mensual profundo" etiquetadas Pro.
  - En planes: anclar precio lista tachado vs oferta; copy "mientras mantengas activa la suscripcion, conservas este precio".
  - Mensajes de valor: "Si ahorras 25k/mes en hormiga, el plan se paga solo."
