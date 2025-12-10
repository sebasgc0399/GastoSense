# Contexto de producto (GastoSense)

## Que es
- App web en espanol (mobile-first) para registrar ingresos/gastos, fijar presupuestos y recibir coaching de IA; pestanas Inicio, Movimientos, Asesor IA y Configuracion.
- Moneda base COP con referencia rapida a USD.

## Problema y propuesta de valor
- Reduce friccion al registrar gastos (modo rapido, frase natural y voz).
- Presupuesto claro: tope mensual y por categoria con alertas via tarjetas inteligentes.
- Consejos accionables via feed tipo chat con tono elegido (amable o reganon) basados en datos reales del usuario.
- Privacidad: BYOK opcional almacenado en Secret Manager; preferencia BYOK/gestionada segun rol.

## Publico objetivo
- Personas en Colombia/Latam que manejan finanzas personales en COP y quieren IA en espanol.
- Usuarios digitales que buscan algo mas simple que una hoja de calculo y con ayuda de IA.
- Segmentos: free (BYOK opcional), BYOK pago, PRO gestionado, administradores/soporte.

## Funcionalidades principales
- **Onboarding**: login con Google; crea perfil por defecto `free` (modo amable) respetando `MAX_USERS`; carga cuota semanal y planes.
- **Captura rapida**:
  - Sheet Quick Add con categorias frecuentes, metodo de pago, tipo (ingreso/gasto), fecha y nota.
  - Interpretacion de frase libre via `parseTransactionPhrase` con ajuste de fecha; fallback local si falla la IA.
  - Grabacion de audio <=10s y transcripcion con Whisper (`transcribeAudio`).
  - Plantillas guardadas (incluye recurrentes semanal/quincenal/mensual/anual) para registrar en un toque; recordatorios en Inicio.
- **Inicio**:
  - KPIs de gasto/ingreso/saldo del mes y presupuesto total/perCategory.
  - Tarjetas inteligentes que disparan alertas de presupuesto, redistribucion, recordar ingresos/plantillas y upsell cuando se agota la cuota IA.
  - Grafico de categorias top y recordatorios de plantillas recurrentes.
- **Movimientos**:
  - Lista con filtros por rango de fechas y categoria; edicion y borrado inline, paginada.
  - Indicadores de cumplimiento de presupuesto por categoria.
- **Asesor IA (Finanzas chat)**:
  - Feed tipo chat con tono amable/reganon y acciones rapidas: Espejo diario, Gastos hormiga, Resumen semanal, En que se va la plata, Analisis mensual profundo (3 meses vs presupuesto).
  - Respuestas usan datos reales (presupuesto, categorias top, ultimos movimientos, mes anterior) y muestran grafico top cuando aplica.
  - Guarda tono preferido en perfil y sincroniza cuota tras cada llamada.
- **Configuracion**:
  - Tema claro/oscuro; manejo de API keys (subir/borrar BYOK) y preferencia BYOK/gestionada segun rol.
  - Visualiza cuota semanal de IA con modal de ayuda y upgrade modal al agotar limites.
  - Panel admin: cambiar rol/preferencia/suscripcion de usuarios, listar hasta 200, copiar UID.

## Planes y limites de IA
- Limites semanales (lunes a domingo): free parse 5 / analyze 2; paid_byok 70 / 20; paid_managed y gifted 90 / 20; admin 400 / 400; fallback desconocido 10 / 4.
- Si la suscripcion vence se degrada a limites de free; un rol paid_byok usando clave gestionada cuenta como free para limites.
- Planes BYOK y PRO se compran via checkout Wompi (referencia `plan:period:uid:timestamp`, firma con `WOMPI_INTEGRITY_KEY`) con promo configurable y descuentos por periodo.

## Posicionamiento y marketing (borrador)
- Mensaje: "Registra y controla tus gastos en segundos, con un asesor IA en formato chat que habla tu idioma."
- Diferenciadores: captura por voz/frase, tarjetas inteligentes de presupuesto, feed IA con tono elegido, BYOK seguro y planes locales con Wompi.
- Estrategias:
  - 1) Activacion: CTA de "Registro rapido" fijo; sugerir plantillas y tarjetas que pidan registrar ingresos.
  - 2) Retencion: alertas de 80%/100% de presupuesto, recordatorios de plantillas y feed diario/semanal.
  - 3) Monetizacion: upgrade modal al agotar cuota IA y badges PRO/BYOK en acciones de asesor; promo activa en planes.
  - 4) Confianza: explicar que la API key BYOK queda en Secret Manager y que la clave gestionada se usa solo si el plan lo permite.

## KPIs iniciales sugeridos
- Activacion: usuarios que registran 3+ movimientos el primer dia.
- Retencion: MAU/WAU y registros semanales por usuario.
- Salud financiera: usuarios con presupuesto total y perCategory creados y que no exceden 100%.
- IA: uso de parse/analyze vs limite semanal y tasa de error de IA.
- Monetizacion: conversion a pago (Wompi), uso de clave gestionada vs BYOK, clics en upgrade modal.

## Roadmap breve
- Exportar/backup de movimientos (CSV).
- Notificaciones (email/push) de presupuesto al 80/100% y vencimiento de suscripcion.
- Mejorar clasificacion automatica por merchant/detalle de tarjeta.
- Anadir metas de ahorro y proyecciones mensuales.
