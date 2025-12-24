# GastoSense

App web (mobile-first) para registrar gastos/ingresos en segundos, fijar presupuestos y recibir consejos accionables de IA. Enfoque global con moneda neutral ($), captura rapida (texto/voz), BYOK seguro y planes pagos con Wompi.

## Caracteristicas clave
- **Captura rapida**: formulario Quick Add, plantillas recurrentes y modo "frase IA" (texto o voz <=10s con Whisper).
- **Presupuestos y control**: presupuesto mensual y por categoria, alertas visuales de uso (80% / 100%), top de categorias.
- **Movimientos en tiempo real**: filtros por rango/categoria/busqueda (nota + categoria), edicion y borrado inline.
- **Asesor IA (chat estilo WhatsApp)**: 2 tonos (Amable, Reganon) y 4 acciones rapidas (Espejo diario, Gastos hormiga, Resumen semanal, En que se va la plata).
  - Respuestas pueden incluir bloques `[CHART_DATA]` y `[ACTION_DATA]` para graficos dinamicos y botones interactivos.
- **Claves y privacidad**: BYOK almacenada en Secret Manager; puedes elegir entre tu key y la gestionada (segun rol/plan).
- **Planes y pagos**: planes BYOK/PRO con periodos y descuentos; checkout con Wompi; panel admin para roles y suscripciones.
- **Temas**: claro/oscuro persistente.

## Arquitectura rapida
- **frontend/**: React 19 + TypeScript + Vite + Tailwind + ECharts. UI, chat IA, Quick Add, planes y panel admin.
- **functions/**: Firebase Functions (Node 20). IA (parse/analyze), cuotas semanales por rol, manejo de claves, planes y Wompi, perfiles/roles, webhook y cron de expiracion.
- **Firestore**: collections `transactions`, `budgets`, `templates`, `users`, `usage`.
- **Hosting**: Firebase Hosting sirve `frontend/dist`.

## Estructura
```
frontend/   # App React (Vite, Tailwind)
functions/  # Firebase Functions (callables + webhook + cron)
docs/       # Contexto, arquitectura e IA
firebase.json, firestore.rules, firestore.indexes.json
```

## Requisitos
- Node 20.x (coincide con engines de Functions).
- npm 9+ (o pnpm/yarn si prefieres, ajustando lockfiles).
- Cuenta Firebase y proyecto configurado; Wompi para pagos.

## Configuracion rapida

### Frontend
1) `cd frontend`
2) `npm install`
3) Crea `.env` con las claves de Firebase:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
4) `npm run dev` (local) / `npm run build` (produccion).

### Functions
1) `cd functions`
2) `npm install`
3) Configura secretos/env en Firebase (ejemplos):
   - `OPENAI_API_KEY` (clave gestionada)
   - `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_KEY`, `WOMPI_EVENT_HASH_KEY`, `WOMPI_REDIRECT_URL`, `WOMPI_PLAN_*`, `WOMPI_PLAN_CURRENCY`
   - `MAX_USERS` (limite de perfiles)
4) `npm run lint && npm run build`
5) `firebase deploy --only functions` (predeploy ya corre lint+build).

### Hosting
1) Construye frontend: `cd frontend && npm run build`
2) Desde la raiz: `firebase deploy --only hosting`

## Flujos clave
- **Registrar movimiento**: Quick Add (manual/voz/frase) -> Firestore `transactions` -> vistas Movimientos/Home en tiempo real.
- **Presupuesto**: guarda total/perCategory -> Firestore `budgets` -> alertas e indicadores en UI.
- **IA**:
  - `parseTransactionPhrase` para modo frase (texto/voz).
  - `analyzeSummary` para Espejo diario/Gastos hormiga/Resumen semanal/En que se va la plata.
  - Respuesta puede incluir texto + `[CHART_DATA]` + `[ACTION_DATA]`, parseado por el frontend para graficos/botones.
- **Pagos**: selecciona plan/periodo -> `createWompiCheckout` -> webhook `wompiWebhook` actualiza rol, preferencia y expiracion.

## Docs utiles
- `docs/SYSTEM_PROMPT_MAESTRO.md`: reglas y playbooks del Asesor IA (single source of truth).
- `docs/04-plan-implementacion-gastosense.md` y `docs/05-sprint-p0-navegacion-metricas_v2.md`: planificacion y sprints.

## Notas de seguridad y privacidad
- BYOK se guarda solo en Secret Manager; nunca se expone al cliente.
- Envio a OpenAI: solo datos agregados o necesarios (evitar comercios sensibles/ubicaciones).
- Reglas de Firestore limitan acceso a documentos por `userId`; panel admin requiere claim `admin`.

## Proximos pasos (high-level)
- README especificos para `frontend/` y `functions/`.
- Export/backup de movimientos (CSV).
- Notificaciones de presupuesto (80%/100%) y vencimiento de suscripcion.
- Mejora de clasificacion automatica por merchant/detalle de tarjeta.

## Pruebas sugeridas (panel admin)
1) `cd frontend && npm run lint`
2) Inicia sesion con un usuario con rol `admin` y abre el panel.
3) Cambia el rol de un usuario y confirma que la tabla se refresca sin recargar.
4) Aplica un termino en el buscador de admins, vuelve a iniciar sesion y verifica que el filtro se limpia.
5) Si ocurre un fallo en la carga, valida que no quede en estado de carga infinito.
6) Con mas de cinco usuarios admin/managed, confirma que la tabla muestra todos los resultados filtrados.
