# Contexto de producto (GastoSense)

## Que es
- App web en espanol para registrar ingresos/gastos personales, fijar presupuestos y recibir consejos de IA.
- Enfoque mobile-first con navegacion por pestañas (Inicio, Movimientos, Asesor IA, Configuracion).
- Moneda base COP; muestra estimado USD para referencia rapida.

## Problema y propuesta de valor
- Reduce friccion al registrar gastos (formulario simple, plantillas recurrentes, captura por voz y frases naturales).
- Visibilidad del presupuesto mensual y alertas por categoria para evitar sobrepasar limites.
- Consejos accionables generados por IA segun datos reales del usuario y su modo de tono preferido.
- Control de privacidad con BYOK (el usuario puede usar su propia API key de OpenAI almacenada en Secret Manager).

## Publico objetivo
- Personas en Colombia/Latam que manejan finanzas personales en COP.
- Usuarios digitales que buscan algo mas simple que una hoja de calculo y con ayuda de IA.
- Segmentos: free (BYOK obligatorio), BYOK pago, PRO gestionado, administradores/soporte.

## Funcionalidades principales
- **Onboarding**: ingreso con Google; crea perfil y aplica limites de capacidad.
- **Captura rapida**:
  - Formulario Quick Add con categorias frecuentes, metodo de pago, tipo (ingreso/gasto) y fecha.
  - Interpretacion de frase libre via OpenAI (parseTransactionPhrase) con ajuste de fecha segun texto.
  - Grabacion de audio <=10s y transcripcion con Whisper (transcribeAudio).
  - Plantillas guardadas (incluye recurrentes con frecuencia) para registrar en un click.
- **Inicio**:
  - KPIs de gasto/ingreso/saldo del mes y presupuesto mensual con seguimiento por categoria.
  - Top de categorias de gasto y tarjetas de insights dinamicos.
  - Recordatorios de plantillas recurrentes.
- **Movimientos**:
  - Lista con filtros por rango de fechas y categoria; edicion y borrado inline.
  - Indicadores de cumplimiento de presupuesto por categoria.
- **Asesor IA**:
  - Modos de tono (amable, directo, exigente, reganon) y acciones prediseñadas.
  - Resumen usa datos de presupuesto, categorias top, ultimos movimientos y comparativo con mes anterior.
- **Configuracion**:
  - Cambio de tema claro/oscuro.
  - Gestion de API keys: guardar/eliminar BYOK, elegir preferencia entre BYOK y clave administrada (segun rol).
  - Quota diaria de uso de IA y estado de suscripcion (rol, fuente, vencimiento).
  - Seleccion y pago de planes (BYOK/PRO) por periodos, pago via Wompi.
  - Panel admin: cambiar rol/preferencia/suscripcion de usuarios, listar hasta 200, copiar UID.

## Posicionamiento y marketing (borrador)
- Mensaje: "Registra y controla tus gastos en segundos, con un asesor de IA que habla tu idioma."
- Diferenciadores: captura por voz/frase natural, BYOK seguro en Secret Manager, alertas de presupuesto y planes locales con Wompi.
- Estrategias:
  - 1) Activacion: mostrar CTA de "Registro rapido" siempre visible; sugerir plantillas al primer registro.
  - 2) Retencion: alertas de 80%/100% de presupuesto y recordatorios de plantillas recurrentes.
  - 3) Monetizacion: resaltar beneficios del plan PRO (clave administrada, mas cuota IA) y promo activa si aplica.
  - 4) Confianza: explicar que la API key BYOK nunca sale del backend.

## KPIs iniciales sugeridos
- Activacion: porcentaje de usuarios que registran 3+ movimientos el primer dia.
- Retencion: MAU/WAU y numero de registros semanales por usuario.
- Salud financiera: usuarios con presupuesto creado y sin sobrepasar 100%.
- IA: llamadas de parse/analyze por usuario y tasa de error de IA.
- Monetizacion: conversión a pago (Wompi), uso de clave administrada vs BYOK.

## Roadmap breve
- Exportar/backup de movimientos (CSV).
- Notificaciones (email/push) de presupuesto al 80% y vencimiento de suscripcion.
- Mejorar clasificacion automatica por merchant/detalle de tarjeta.
- Añadir metas de ahorro y proyecciones mensuales.
