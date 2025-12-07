# Politica de Privacidad (Borrador) - GastoSense

**Aviso**: Este documento es un borrador de referencia y no constituye asesoria legal. Ajusta con tu abogado segun tu jurisdiccion y modelo de negocio.

## 1. Datos que recopilamos
- Identidad: UID de Firebase, email (segun login).
- Uso financiero: registros de gastos/ingresos, presupuestos, plantillas.
- IA: texto/voz enviados para interpretar (modo frase) y para analisis (acciones de Asesor IA).
- Pagos: datos de transaccion gestionados por Wompi (no almacenamos tarjetas).
- Metadatos tecnicos: logs basicos (IP aproximada, dispositivo/navegador) para seguridad y diagnostico.

## 2. Para que usamos los datos
- Operar la app (guardar movimientos, presupuestos, plantillas).
- Proveer funciones de IA (interpretar frase, sugerir resumen/ahorros).
- Gestionar planes, facturacion y prevencion de fraude.
- Mejorar estabilidad y soporte (analytics basicos y logs).

## 3. Base legal / fundamento
- Ejecucion del servicio (registro y visualizacion de datos financieros del usuario).
- Consentimiento (uso de IA y procesamiento de audio/texto).
- Interes legitimo (seguridad, prevencion de abuso).
- Cumplimiento contractual/legales (pagos, facturacion).

## 4. Compartimos con
- Firebase (Auth, Firestore, Hosting) para identidad y datos de app.
- OpenAI (modelos de texto/voz) solo con el contenido necesario para la funcion solicitada; preferimos enviar datos agregados/anonymizados cuando aplica.
- Wompi para procesar pagos.
- Proveedores de seguridad/observabilidad en caso de uso (ajustar si aplica).

## 5. BYOK
- Si usas tu propia API key, se guarda en Secret Manager y no se expone al cliente. No se comparte con terceros salvo para ejecutar la llamada a OpenAI.

## 6. Retencion
- Datos operativos se conservan mientras la cuenta este activa o segun obligaciones legales. Se pueden borrar a peticion, salvo restricciones contables o legales.

## 7. Derechos del usuario
- Acceso, rectificacion, eliminacion, portabilidad (segun ley aplicable).
- Retiro de consentimiento para IA/voz (puede limitar funcionalidades).
- Oposicion y limitacion del tratamiento en los casos previstos por la ley.

## 8. Seguridad
- Acceso autenticado, reglas de Firestore por usuario, almacenamiento de BYOK en Secret Manager.
- Cifrado en transito (HTTPS). Cifrado en reposo gestionado por Firebase/Google Cloud.

## 9. Transferencias internacionales
- Los servicios de Firebase/OpenAI pueden operar en infraestructura global. Ajustar clausulas de transferencia (p.ej. SCCs) segun jurisdiccion aplicable.

## 10. Menores
- El servicio no esta dirigido a menores de edad. Si se suben datos de menores, solicita su eliminacion.

## 11. Cookies y tracking
- Uso limitado a lo necesario para autenticacion y funcionamiento. Añadir detalle si se integran analiticas o trackers adicionales.

## 12. Contacto
- Correo de privacidad/soporte: definir.

## 13. Cambios
- Si se actualiza esta politica, se notificara en la app o por correo cuando el cambio sea relevante.
