# GastoSense

App web (mobile‑first) para registrar gastos/ingresos en segundos, fijar presupuestos y recibir consejos accionables de IA. Enfoque LatAm/COP, con captura rápida (texto, voz), BYOK seguro y planes pagos con Wompi.

## Características clave
- **Captura rápida**: formulario Quick Add, plantillas recurrentes y modo “frase IA” (texto o voz ≤10s con Whisper).
- **Presupuestos y control**: presupuesto mensual y por categoría, alertas visuales de uso (80% / 100%), top de categorías.
- **Movimientos en tiempo real**: filtros por rango/categoría, edición y borrado inline.
- **Asesor IA (chat estilo WhatsApp)**: 2 tonos (Amable, Regañón) con acciones rápidas: Espejo diario, Gastos hormiga, Resumen semanal.
- **Claves y privacidad**: BYOK almacenada en Secret Manager; puedes elegir entre tu key y la gestionada (según rol/plan).
- **Planes y pagos**: planes BYOK/PRO con periodos y descuentos; checkout con Wompi; panel admin para roles y suscripciones.
- **Temas**: claro/oscuro persistente.

## Arquitectura rápida
- **frontend/**: React 19 + TypeScript + Vite + Tailwind. UI, chat IA, Quick Add, planes y panel admin.
- **functions/**: Firebase Functions (Node 20). IA (parse/analyze), cuotas semanales por rol, manejo de claves, planes y Wompi, perfiles/roles, webhook y cron de expiración.
- **Firestore**: collections `transactions`, `budgets`, `templates`, `users`, `usage`.
- **Hosting**: Firebase Hosting sirve `frontend/dist`.

## Estructura
```
frontend/   # App React (Vite, Tailwind)
functions/  # Firebase Functions (callables + webhook + cron)
docs/       # Contexto, arquitectura e ideas de IA
firebase.json, firestore.rules, firestore.indexes.json
```

## Requisitos
- Node 20.x (coincide con engines de Functions).
- npm 9+ (o pnpm/yarn si prefieres, ajustando lockfiles).
- Cuenta Firebase y proyecto configurado; Wompi para pagos.

## Configuración rápida

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
4) `npm run dev` (local) / `npm run build` (producción).

### Functions
1) `cd functions`
2) `npm install`
3) Configura secretos/env en Firebase (ejemplos):
   - `OPENAI_API_KEY` (clave gestionada)
   - `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_KEY`, `WOMPI_EVENT_HASH_KEY`, `WOMPI_REDIRECT_URL`, `WOMPI_PLAN_*`, `WOMPI_PLAN_CURRENCY`
   - `MAX_USERS` (límite de perfiles)
4) `npm run lint && npm run build`
5) `firebase deploy --only functions` (predeploy ya corre lint+build).

### Hosting
1) Construye frontend: `cd frontend && npm run build`
2) Desde la raíz: `firebase deploy --only hosting`

## Flujos clave
- **Registrar movimiento**: Quick Add (manual/voz/frase) -> Firestore `transactions` -> vista Movimientos/Home en tiempo real.
- **Presupuesto**: guarda total/perCategory -> Firestore `budgets` -> alertas e indicadores en UI.
- **IA**: `parseTransactionPhrase` para modo frase; `analyzeSummary` para Espejo diario/Gastos hormiga/Resumen semanal; cuotas semanales por rol.
- **Pagos**: selecciona plan/periodo -> `createWompiCheckout` -> webhook `wompiWebhook` actualiza rol, preferencia y expiración.

## Notas de seguridad y privacidad
- BYOK se guarda solo en Secret Manager; nunca se expone al cliente.
- Envío a OpenAI: solo datos agregados o necesarios (evitar comercios sensibles/ubicaciones).
- Reglas de Firestore limitan acceso a documentos por `userId`; panel admin requiere claim `admin`.

## Próximos pasos (high-level)
- README específicos para `frontend/` y `functions/`.
- Export/backup de movimientos (CSV).
- Notificaciones de presupuesto (80%/100%) y vencimiento de suscripción.
- Mejora de clasificación automática por merchant/detalle de tarjeta.

## Pruebas sugeridas para validar cambios recientes (panel admin)
1. **Lint front-end**: `cd frontend && npm run lint` para asegurar que los cambios no rompieron las reglas de estilo ni el build.
2. **Carga inicial de admins**: inicia sesión con un usuario con rol `admin` y abre el panel. La lista de usuarios debe aparecer sin necesidad de tocar el buscador y el filtro de búsqueda debe estar vacío tras cargar.
3. **Actualización tras cambio de rol**: cambia el rol de un usuario desde el panel y confirma que la tabla se refresca inmediatamente con el nuevo rol sin tener que recargar la página.
4. **Búsqueda y reseteo**: aplica un término en el buscador de admins, recarga el perfil (por ejemplo, cerrando y volviendo a abrir la sesión) y verifica que el filtro se limpia y la lista completa vuelve a mostrarse.
5. **Errores visibles**: si ocurre un fallo en la carga de la lista, valida que se muestre un mensaje en consola y que la aplicación no se quede en estado de carga infinito.
6. **Listado completo**: crea o detecta más de cinco usuarios admin/managed y confirma que la tabla muestra todos los resultados filtrados (el límite anterior de 5 filas se eliminó para no ocultar entradas).
