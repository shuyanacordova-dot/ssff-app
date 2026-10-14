# Referidos y Recompensas (Círculo Shu y Focus Friends) — Diseño

Fecha: 2026-10-14 · Estado: diseño aprobado en conversación (secciones 1 a 3), pendiente de revisión del documento por Shuyana.
Reemplaza el punto "Tarjeta de lealtad y referidos" (Fase B / P6) del BLUEPRINT.

## 1. Objetivo

Dos programas de referidos independientes, administrados desde LumOS y ligados al CRM:

| Programa | Óptica | Prefijo | Quién puede usar el código |
|---|---|---|---|
| Círculo Shu | SHUVISION (Matriz y Sacha) | `SHU-` | Solo SHUVISION |
| Focus Friends | Focus | `FOC-` | Solo Focus |

Resultado esperado: saber quién recomienda a quién, cuántos referidos terminan comprando, aplicar el descuento sin trabajo manual, entregar la recompensa solo cuando la venta esté 100 % pagada, controlar créditos pendientes/disponibles/vencidos, evitar fraude y duplicados, y medir cuánto cuesta y cuánto trae cada programa.

**Los programas nacen apagados.** Los montos son una propuesta inicial; Shuyana los revisa antes de encender nada.

## 2. Decisiones ya tomadas

- Programa = empresa (`empresa_id`). SHUVISION y Focus no se ven entre sí (RLS por empresa).
- La recompensa se gana **solo cuando la venta del referido está 100 % pagada**. Las ventas de **convenio (descuento a rol) no participan**.
- La compra mínima se mide **antes** del descuento de bienvenida.
- "Cliente nuevo" se mide por empresa: sin ventas vigentes anteriores en esa empresa.
- Tope de uso del crédito: 20 % de la compra (configurable), gastando primero el que vence antes.
- El crédito es un **descuento de la óptica**, no dinero cobrado. No entra a caja, no cuenta en "A cuenta del mes" ni en ingresos. Por eso **no** reutiliza `creditos_paciente` (saldo a favor por anulación, que sí es dinero ya cobrado) ni el método de pago `saldo_favor`.
- Sin cupones genéricos en la primera entrega (el descuento de bienvenida vive dentro del programa). Cupones sueltos quedan como módulo futuro.
- Panel como pestaña "Referidos" dentro del CRM, no menú nuevo.

## 3. Flujo (ejemplo Focus)

1. Al crear la ficha: "¿Quién te refirió?". Se escribe el código y la pantalla muestra el nombre de su dueño para confirmarlo (evita inventar referidos con códigos adivinados). Queda un `referido` en estado *registrado*.
2. Venta de $150 del paciente nuevo: el sistema valida programa activo, tope de presupuesto, cliente nuevo, compra mínima, no autorreferido, no convenio. Aplica -$15; total $135. El referido pasa a *en pago* y guarda una copia de las reglas vigentes (montos congelados).
3. Quien refirió ve $10 **pendientes** (derivado de referidos *en pago*; no es un movimiento).
4. Cuando la venta queda con saldo 0, se generan los $10 *disponibles* con vencimiento (60 días en Focus, 90 en SHUVISION) y se evalúan los bonos de 3 y 5 referidos. El referido pasa a *recompensado*.
5. Si la venta se anula: el referido pasa a *revertido* y se revierte la recompensa (ver 5.4).
6. Al comprar, quien refirió puede usar crédito: baja el total de su venta como descuento, hasta el 20 %, consumiendo primero el lote que vence antes.

## 4. Datos (migraciones nuevas, solo agregan; nombres orientativos, validar contra el esquema real)

1. **`programas_referidos`** — una fila por empresa: nombre comercial, prefijo, `activo` (default `false`), `recompensas_suspendidas`, compra mínima, descuento de bienvenida, crédito por referido, bono 3, bono 5, vigencia en días, tope % por compra, tope de presupuesto mensual, fechas de campaña, exclusiones de producto/categoría. Historial de cambios (quién, cuándo, antes/después) en la auditoría.
2. **`codigos_referido`** — (`programa_id`, `paciente_id`) único; `codigo` único por programa (`SHU-000458`), secuencial, nunca cambia ni se reutiliza. Se generan para todos los pacientes de la empresa al encender el programa, y para los nuevos al crearlos.
3. **`referidos`** — referidor, referido, programa, `venta_id`, estado (`registrado`, `en_pago`, `recompensado`, `rechazado`, `revertido`), motivo de rechazo, descuento aplicado y montos/reglas congelados. Único: un referido tiene un solo referidor por programa.
4. **`monedero_movimientos`** — libro append-only por (paciente, programa): `credito` (lote con `vence_en`), `bono_hito`, `uso` (con `lote_id`, `venta_id`), `vencimiento` (con `lote_id`), `reversa`, `ajuste` (usuario y motivo obligatorios). Saldo = suma. Restante de un lote = suma de sus movimientos. Nada se actualiza ni se borra. Único: un crédito por referido; un bono por (paciente, programa, hito).
5. **`referidos_auditoria`** — cambios de reglas, ajustes manuales, rechazos y reversas.

Vencimiento: un cron diario nuevo en `vercel.json` (hoy solo existe `/api/cron/mensajes`) escribe filas `vencimiento` por el restante de lotes vencidos.

## 5. Reglas en la base de datos

5.1 **Venta:** `registrar_venta` recibe `p_codigo_referido` y `p_usar_credito` opcionales; descuento y crédito se aplican dentro de la misma transacción, antes de validar pagos, y se muestran como líneas separadas en resumen y recibo. Al cambiar la firma: `drop function` de la versión vieja y repetir `revoke`/`grant` (L3, L9). Antes de modificar se leen las definiciones vigentes de `registrar_venta`, `registrar_abono_venta` y del trigger que protege ventas completadas.

5.2 **Recompensa:** trigger/función cuando una venta con referido *en pago* llega a saldo 0 y no está anulada. Idempotente por las restricciones únicas: pagos parciales, segundos pagos o reintentos no pagan dos veces.

5.3 **Fraude:** no autorreferido; no misma cédula, mismo teléfono ni mismo responsable de cuenta que el referidor; no convenio; no combinar con otra promoción salvo autorización de admin; un solo descuento de bienvenida por referido por programa.

5.4 **Anulación:** se revierte solo lo no gastado del crédito y de los bonos asociados. Si ya se gastó, nunca queda saldo negativo: se marca en auditoría para revisión de Shuyana.

5.5 **Presupuesto:** al alcanzar el tope mensual, el programa deja de aplicar descuentos y recompensas nuevos y avisa en el panel.

5.6 **Configuración no retroactiva:** cada referido guarda sus reglas al aplicarse el descuento; cambiar la configuración solo afecta lo nuevo.

## 6. Permisos (RLS y pantalla deben coincidir, L6/L12)

| Rol | Puede |
|---|---|
| superadmin (Shuyana) | Configurar, ajustes manuales, ver todo y auditoría |
| admin_sucursal | Ver panel y monederos de su empresa; autorizar combinar con otra promoción |
| optometra, vendedor | Ver código y saldo, registrar referido, aplicar beneficios que el sistema valide; sin editar reglas ni crear créditos a mano |

Funciones nuevas: `revoke ... from public, anon`, `grant ... to authenticated`; correr `get_advisors` tras cada migración.

## 7. Pantallas

- **Crear ficha:** campo "¿Quién te refirió?" con confirmación del nombre.
- **Carpeta del paciente → pestaña "Referidos":** código con Copiar y Compartir mi código (WhatsApp con el texto del programa), saldo disponible/pendiente/vencido, historial del monedero con el referido que generó cada crédito, quién lo refirió.
- **Venta (`app/ventas/cart.tsx`):** bloque de código de referido con motivo claro si no califica; interruptor "Usar crédito" con máximo permitido; descuento y crédito como líneas separadas.
- **CRM → pestaña "Referidos"** (admin/superadmin): indicadores filtrables por programa, sucursal y fechas; ranking de referidores; detalle de ventas por referidor.
- **Configuración → Referidos** (solo superadmin): tabla SHUVISION vs Focus, interruptores, tope, campañas, historial.

## 8. Panel: cómo se mide

- **Costo promocional** = descuentos de bienvenida + créditos y bonos **usados**. Créditos solo generados = compromiso pendiente (no costo); vencidos = no cuestan. Así no se cuenta nada dos veces.
- **Margen después de incentivos:** LumOS aún no guarda costo real por producto (proyecto P8). Por ahora: ventas atribuidas − costo del programa, y costo como % de ventas. Margen exacto cuando existan costos.
- **Ventas atribuidas vs. incrementales:** los referidos son clientes nuevos, pero el sistema no puede saber si habrían comprado sin el código; el panel lo indica.
- Indicadores: códigos activos, referidos registrados y que compraron, conversión, ventas atribuidas, ticket promedio, descuentos aplicados, créditos generados/usados/pendientes/vencidos, bonos entregados, costo total.

## 9. WhatsApp

"Compartir mi código" lo envía una persona con un toque (sin envío automático). El aviso "ganaste $10" entra a la cola del CRM y lo envía el equipo con confirmación humana; se respeta "No contactar". QR y enlace personal (sobre `app/tarjeta`) en la fase 3.

## 10. Pruebas

No hay sistema de pruebas automáticas (solo `tests/laboratorio-rx.test.cjs`). Se escriben guiones SQL que simulan cada caso dentro de una transacción con `rollback`, sin dejar datos, ejecutados simulando cada rol (`set local role authenticated` + claims). Casos: descuento y compra mínima; pago parcial y doble; anulación con recompensa gastada; código repetido, propio, misma cédula/teléfono; convenio excluido; vencimiento y orden FIFO; cambio de configuración sin efecto retroactivo; tope de presupuesto; aislamiento Focus/SHUVISION. Además `npx tsc --noEmit` y prueba en navegador con sesión real (si no se puede probar, se dice).

## 11. Fases (cada una: migración en `supabase/migrations/`, commit, push, `npx vercel --prod`, programa apagado)

1. **Núcleo:** configuración, códigos, referido en la ficha, validación en la venta, recompensas, monedero, bonos, vencimientos, auditoría, pestaña Referidos de la carpeta y Compartir básico.
2. **Panel** del CRM (indicadores, ranking, detalle).
3. **Automatización:** aviso en la cola del CRM, QR y enlace personal.

Cada fase tendrá su plan de implementación. No se enciende ningún programa sin que Shuyana revise montos y rentabilidad (Focus: $25 de beneficio sobre mínimo $120 ≈ 21 %; SHUVISION: $20 sobre $100 = 20 %, más bonos).

## 12. Fuera de alcance

Cupones genéricos, margen exacto por producto, envío automático por Meta/Make (siguen pausados por decisión del 2026-10-06), mezcla de datos entre SHUVISION y Focus.
