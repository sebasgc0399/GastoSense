# AGENTS.md - GastoSense

Este repositorio es GastoSense (app web mobile-first para finanzas personales).
Sigue estas reglas siempre al proponer o aplicar cambios.

## Objetivo del agente
- Entregar cambios pequenos y seguros, priorizando velocidad de registro, UX premium/glass y estabilidad.
- Evitar sobre-ingenieria. Si algo es ambiguo, entrega una version funcional con supuestos minimos y pregunta lo imprescindible.

## Principios no negociables (producto)
- No bloquear el guardado si falla IA.
- Mobile-first real: flujos criticos pensados para el pulgar.
- Rapido por defecto, profundo por opcion.
- Privacidad por defecto: enviar agregados a IA, evitar PII.
- Costo/latencia: prompts cortos, limites por plan y degradacion elegante.

## Stack y estructura
- Frontend: React 19 + TypeScript + Vite + Tailwind + ECharts.
- Backend: Firebase Functions v2 (Node 20). No hay servidor Express separado.
- Datos: Firestore + reglas + Secret Manager (BYOK).
- AppShell sin router: tabs y modales globales viven en `frontend/src/App.tsx`.

## Comandos y tooling
- Usa npm y el lockfile del repo.
- Frontend: `npm -C frontend run dev|build|lint|test|test:run|test:coverage`.
- Functions: `npm -C functions run lint|build|test` (segun scripts disponibles).
- No agregar dependencias nuevas sin justificar impacto y alternativas.

## Contratos de datos
- Colecciones cliente: `transactions`, `templates`, `budgets`, `objectives`, `objectives/{objectiveId}/entries`, `users/{uid}/categories`.
- Colecciones internas (backend/admin): `users`, `usage`, `payments`, `advisorFreeChatUsage`, `importTransactionsUsage`, `users/{uid}/advisorChats`.
- No romper esquemas; si cambias contratos, incluye plan de migracion y actualiza reglas/indices.
- Mantener validacion estricta en Functions (no confiar en el cliente).

## UI/UX
- Mantener el estilo actual (premium/glass, simple, visual, mobile-first).
- Quick Add no debe ganar friccion ni pasos extra.
- Componentes pequenos y con una responsabilidad.
- Accesibilidad obligatoria: HTML semantico, aria, foco, teclado.
- No agregar `data-testid` salvo solicitud explicita.

## IA y costos
- Modelos actuales: `o4-mini` (primario), `gpt-5-mini` (fallback), `whisper-1` (audio).
- Formatos de salida: `[CHART_DATA]` y `[ACTION_DATA]` (JSON estricto).
- Fuente de verdad de prompts: `docs/SYSTEM_PROMPT_MAESTRO.md`.
- Nunca bloquear un guardado por falla de IA; ofrecer fallback.
- Minimizar tokens: agregados, limites, respuestas concisas.

## Pagos (Wompi)
- Checkout + webhook con validacion de firma, monto y moneda.
- Idempotencia via `payments/{transactionId}`.
- Cambios en pagos requieren pruebas minimas y revision cuidadosa.

## Calidad y pruebas
- TypeScript obligatorio; evitar `any` salvo justificacion con comentario breve.
- No dejar errores de lint, tipos o tests.
- Si tocaste hooks/utils o Functions, actualizar o agregar tests cuando aplique.

## Seguridad
- No exponer secretos en logs.
- No enviar PII innecesaria a IA.
- Respetar roles y `assertAdmin` en funciones admin.

## Comportamiento del agente
- Si la peticion es ambigua: maximo 3 preguntas concretas, o asumir y avanzar con supuestos claros.
- Refactors grandes o cambios de arquitectura: proponer plan breve antes de tocar mucho codigo.
- PRs pequenos y enfocados; documentar que cambio, por que y como se verifico.
