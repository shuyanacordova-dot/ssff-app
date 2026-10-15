# Referidos y Recompensas, fase 2 — Panel en el CRM — Diseño

Fecha: 2026-10-15 · Estado: diseño aprobado en conversación (secciones 1 y 2), pendiente de revisión del documento por Shuyana.
Continúa `docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md` (fase 1, ya publicada con los programas **apagados**). Esta fase corresponde a lo que ese diseño llama "Panel" (§7 CRM → pestaña Referidos y §8 cómo se mide).

## 1. Objetivo

Que Shuyana y los administradores de sucursal vean, en una sola pantalla del CRM, **cuánto trae y cuánto cuesta** cada programa de referidos: indicadores del período, ranking de quienes más recomiendan y el detalle de cada referidor.

Decisiones ya tomadas:
- **Una óptica a la vez.** El panel muestra el programa de la óptica activa (SHUVISION o Focus). Nunca se mezclan en una pantalla y **no hay vista comparativa** (decisión de Shuyana, 2026-10-15).
- **Quién lo ve:** superadmin y administradores de sucursal. Vendedores, optómetras y caja no lo ven ni pueden abrirlo. Un administrador de sucursal ve solo los datos de su sucursal (lo exige la base de datos); la superadmin ve todas las de la óptica activa.
- **Con los programas apagados** el panel muestra ceros y un aviso claro ("El programa está apagado" / "Todavía no hay referidos en este período").
- **Sin gráficos, sin exportar, sin imprimir** en esta fase (YAGNI): tarjetas, una tabla y una ventana de detalle.

## 2. Dónde vive

- Ruta nueva `/crm/referidos` (página + tablero), con un botón **"Referidos"** en el encabezado del CRM, visible solo para superadmin y administrador de sucursal.
- Filtros por la URL, como ya hace el CRM con `?sucursal=`: `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&sucursal=<id|todas>`. Por defecto: el mes actual en hora de Ecuador (`America/Guayaquil`) y "Todas" las sucursales de la óptica. Atajos: "Este mes", "Mes pasado", "Últimos 30 días" y un rango manual.
- Interfaz en español, estilo glass existente (tarjetas `agenda-summary`, `task-card`, pestañas `tabs`). No se inventa CSS nuevo.

## 3. Qué muestra

### 3.1 Indicadores (todos de la óptica activa y, si se elige, de una sucursal)

"Sucursal" de un referido = la sucursal de su venta; si todavía no compró, la sucursal de quien lo registró; si no hay ninguna, solo cuenta en "Todas". "Período" se mide en fechas de Ecuador, con el día final incluido.

| Indicador | Cómo se calcula |
|---|---|
| Pacientes con código | Códigos del programa. **No** depende del período ni de la sucursal (se indica en pantalla). |
| Referidos registrados | Referidos creados en el período. |
| Que compraron | De esos registrados, los que tienen una venta aplicada y su venta no fue anulada (estado distinto de `revertido`). |
| Conversión | Que compraron ÷ registrados (si no hay registrados, "—"). |
| Ventas atribuidas | Suma del total de las ventas de referidos aplicadas en el período (no anuladas), y cuántas fueron. |
| Ticket promedio | Ventas atribuidas ÷ número de ventas. |
| Descuentos de bienvenida | Suma del descuento dado en esas ventas. |
| Créditos generados | Créditos por referido y ajustes positivos creados en el período. |
| Créditos usados | Créditos y bonos gastados en ventas **no anuladas** en el período. |
| Créditos pendientes | Lo que recibirán los referidores cuando sus referidos terminen de pagar (referidos `en_pago`), **hoy**, sin filtro de período. |
| Créditos vencidos | Créditos que vencieron sin usarse en el período. |
| Bonos entregados | Bonos por 3 y 5 referidos creados en el período (cantidad y monto). |
| **Costo del programa** | Descuentos de bienvenida + créditos y bonos **usados**. Lo generado y aún no usado es una deuda pendiente (no es costo) y lo vencido no cuesta: así nada se cuenta dos veces. |
| Ventas atribuidas − costo | Resultado simple, y el costo como porcentaje de las ventas atribuidas. |

Notas visibles en pantalla: (a) las ventas "atribuidas" son las de pacientes que llegaron con un código; el sistema no puede saber si habrían comprado sin él, así que no se llaman "incrementales"; (b) el margen exacto llegará cuando LumOS guarde el costo de cada producto (proyecto de proveedores y compras); (c) "Registrados" y "Ventas" se miden por fechas distintas (registro vs venta), por eso pueden no coincidir en un mismo período.

Cuando se filtra por una sucursal: un movimiento del monedero pertenece a la sucursal de la venta que lo originó o lo gastó; los ajustes manuales (sin venta) solo aparecen en "Todas".

### 3.2 Ranking de referidores

Los 20 con más actividad en el período, ordenados por referidos exitosos y luego por ventas traídas. Columnas: nombre, código, referidos exitosos (los que ya pagaron completo), ventas que trajeron, crédito ganado en el período (créditos + bonos) y crédito disponible hoy. Se puede reordenar por columna (en la pantalla). Tocar un nombre abre el detalle.

### 3.3 Detalle de un referidor

Ventana con: nombre, código y botón "Abrir carpeta"; resumen (exitosos, en espera, ventas traídas, crédito ganado/usado/disponible/vencido); lista de sus referidos del período (nombre, estado en palabras, fecha, sucursal, monto de la venta, descuento dado, crédito que generó) y sus últimos movimientos del monedero (tipo, monto, vencimiento, de qué referido viene).

## 4. Base de datos (migración nueva, solo funciones; no se cambia ninguna tabla ni función existente)

Dos funciones `SECURITY DEFINER` con `set search_path = ''`, `revoke ... from public, anon` y `grant execute ... to authenticated`, siguiendo el patrón de la fase 1:

1. `public.panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid default null) returns jsonb` → `{programa_activo, nombre, periodo:{desde,hasta}, sucursal, indicadores:{…}, ranking:[…], sucursales:[{id,nombre}]}`.
2. `public.panel_referidos_detalle(p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_sucursal uuid default null) returns jsonb` → `{referidor:{nombre,codigo,paciente_id}, resumen:{…}, referidos:[…], movimientos:[…]}` (movimientos: últimos 50, sin filtro de período).

Reglas de acceso (en las dos): `public.rol_referidos(p_empresa)` debe devolver `superadmin` o `admin_sucursal`; si no, `No autorizado`. Si el rol es `admin_sucursal`, la sucursal se **fuerza** a la de su usuario (se ignora lo que mande la pantalla); si ese administrador no tiene sucursal asignada, se rechaza. La superadmin puede dejar la sucursal vacía ("Todas") o elegir una de la empresa; una sucursal de otra empresa se rechaza.

Rango de fechas: `[p_desde 00:00, p_hasta + 1 día 00:00)` en `America/Guayaquil`; si `p_desde > p_hasta` se rechaza; si el rango supera 366 días se rechaza (evita consultas enormes).

Las funciones solo leen. Los índices necesarios ya existen (migración `20261015150000`). Los textos de error son en español y no exponen datos de otra óptica.

## 5. Código de la aplicación

| Archivo | Responsabilidad |
|---|---|
| `lib/referidos-panel.ts` | Tipos del panel, cálculo del período por defecto y atajos (puro, con prueba Node), y cargador del servidor `getPanelReferidos(searchParams)` que valida permisos de pantalla y llama a la función SQL. |
| `app/crm/referidos/page.tsx` | Página servidor (`force-dynamic`), lee `desde/hasta/sucursal`. |
| `app/crm/referidos/panel-board.tsx` | Tablero cliente: filtros, tarjetas, ranking, ventana de detalle. |
| `app/crm/referidos/actions.ts` | Acción del servidor `obtenerDetalleReferidor(...)` que llama a la función de detalle. |
| `app/crm/crm-board.tsx` y `lib/crm.ts` + `lib/crm-labels.ts` | Solo el botón "Referidos" y el dato `puedeVerReferidos` (rol superadmin o administrador de sucursal). |

La pantalla valida el rol además de la base de datos (permisos en dos capas, L6/L12).

## 6. Pruebas

- **SQL con reversa** (`supabase/tests/referidos_07_panel.sql`, mismo método que la fase 1: una sola transacción que termina en error): datos de prueba creados en la transacción; casos de ventas pagadas y a medias, anulación (queda fuera de ventas atribuidas y del costo), crédito generado pero no usado (no suma al costo), crédito usado y bono usado, vencidos, límites del período (una venta a las 23:30 hora de Ecuador cae en su día, no en el siguiente), filtro por sucursal (incluido el referido sin venta que cuenta por quien lo registró), administrador de sucursal forzado a la suya, vendedor rechazado, otra óptica rechazada, ranking ordenado y limitado a 20, programa apagado y sin datos devuelven ceros sin error.
- **Node** para las funciones puras del período y los atajos (`tests/referidos-panel.test.cjs`).
- `npx tsc --noEmit`; `npm run lint` sigue roto en el proyecto (sin configuración de ESLint).
- La pantalla no se puede probar con una sesión real desde esta herramienta; se revisa por lectura y se deja el paso a paso para que Shuyana la pruebe.

## 7. Entrega

Mismo método que la fase 1: un agente construye cada tarea y otro la revisa; las migraciones las aplica Claude tras la revisión; commit, push y publicación a Vercel al terminar. Orden: (1) funciones SQL y sus pruebas, (2) tipos, período y cargador, (3) pantalla, (4) botón en el CRM, documentación y publicación. El panel funciona con los programas apagados (ceros) y se llena solo cuando se enciendan.

## 8. Fuera de alcance

Vista comparativa SHUVISION vs Focus (decisión de Shuyana); gráficos; exportar o imprimir; avisos automáticos por WhatsApp y QR (fase 3); líneas separadas de descuento y crédito en el recibo y la pantalla para "autorizar combinar con otra promoción" (fase 2b, a pedido); revocar los permisos amplios de escritura sobre `ventas`/`pagos_venta` (tarea aparte); margen exacto por producto (proyecto de proveedores y compras).

## 9. Desviaciones de la fase 2 (2026-10-15)

- El ranking devuelve los 20 con más actividad; reordenar por otra columna en la pantalla reordena solo esos 20 (no consulta de nuevo a la base de datos).
- En el detalle de un referidor, el resumen (exitosos, ventas, crédito ganado/usado/vencido) respeta el período y la sucursal elegidos; el crédito disponible es el saldo de hoy de su monedero (es de toda la óptica).
- «Pacientes con código» es el total de hoy de la óptica y no depende del período ni de la sucursal.
