# LumOS — Blueprint del sistema para ópticas

> Documento vivo. **Toda IA (Claude o Codex) debe leerlo antes de trabajar y actualizarlo al terminar.**
> Dueña del producto: Shuyana Córdova (optometrista, gerente de SHUVISION y Focus Óptica). No es programadora: todo se le explica en lenguaje simple.
> Última actualización: 2026-09-24.

---

## 1. Qué es LumOS

Un sistema de gestión para ópticas, parecido a Optox pero hecho a la medida de SHUVISION y Focus Óptica.
Cubre: pacientes e historia clínica, ventas y cobros, laboratorio, inventario, caja y bancos, cuentas por cobrar,
agenda, tareas, informes, facturación electrónica SRI, fidelización y asistentes con IA.

**Organizaciones**
- SHUVISION — matriz Shushufindi + sucursal Sacha (La Joya de los Sachas).
- Focus Óptica — Shushufindi. Empresa independiente: sus datos NO se mezclan con SHUVISION salvo que Shuyana lo autorice.

**Equipo y roles**
- Shuyana: superadmin (todo).
- Jassyra, Joi/Joao: admin_sucursal (supervisión, ventas, sin permisos totales).
- Tiffany (SHUVISION), Erick (Focus): optometra + vendedor.
- Yuli: vendedora (sin acceso completo a historia clínica).

**Tecnología**: Next.js 15 + React 19, Supabase (Postgres, proyecto `rbmmhcwvzmjafjauwvsr`), publicado en Vercel,
código en GitHub `shuyanacordova-dot/ssff-app` rama `main`.

---

## 2. Reglas de trabajo (obligatorias)

1. **Claude planifica y revisa; Codex construye.** Claude escribe la tarea con archivos exactos; Codex implementa; Claude revisa el cambio, aplica migraciones de base de datos y verifica.
2. **Nunca borrar trabajo.** No usar `git reset --hard`, `git checkout .`, ni borrar ramas o archivos que no se crearon en la misma tarea. Nunca borrar columnas ni tablas: solo agregar.
3. **Guardar y publicar siempre.** Cada tarea terminada = commit en `main` + push a GitHub + **publicar en Vercel con `npx vercel --prod`** (Vercel no se actualiza solo desde GitHub). Verificar en el sitio real que el cambio se ve.
4. **Base de datos**: todo cambio va como archivo en `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql` **y** se aplica al proyecto Supabase. Si una función cambia de parámetros, borrar la versión vieja y volver a dar permisos (ver lección L3).
5. **Permisos en dos capas**: la base de datos (RLS / `tiene_permiso`) y la pantalla deben coincidir (ver lección L6).
6. **Probar antes de decir "listo"**: compilar (`npx tsc --noEmit`) y probar en el navegador. Si no se pudo probar, decirlo claramente.
7. **Diseño**: mantener el estilo iOS "glass" (`.glass`, pastillas de estado, pestañas). No inventar estilos nuevos.
8. **Impresión**: usar el patrón `.print-area` / `.no-print` de `app/globals.css`. **Prohibido** usar selectores `:has()` en CSS de impresión (ver lección L2).
9. **Fechas**: Ecuador es UTC-5. Calcular rangos de día con la zona horaria explícita (ver lección L4).
10. **Actualizar este documento** al final de cada tarea: estado del módulo, archivos tocados, y cualquier error nuevo en la sección 6.

---

## 3. Estado actual por módulo (2026-09-24)

Leyenda: ✅ hecho · 🟡 parcial · ❌ falta

| Módulo | Estado | Notas |
|---|---|---|
| Login, roles, equipo, sucursales | ✅ | `app/login`, `app/equipo`, `app/configuracion/sucursales`. Sucursales: **Shuvision**, **Shuvision Sacha**, **Focus** |
| Ícono de la app (Dock / pantalla de inicio) | ✅ | Ojo de LumOS en `app/icon.png`, `app/apple-icon.png`, `public/icons/`, `app/manifest.ts` |
| Inicio / tareas y supervisión | ✅ | Tareas como checklist |
| Pacientes — crear ficha | ✅ | Edad calculada, ocupación, responsable de cuenta |
| Pacientes — editar ficha | ✅ | Botón "Editar datos" en la carpeta. Todo el equipo puede editar. Cada cambio queda en `pacientes_cambios` (antes/después, quién, cuándo). Falta probar con sesión real. |
| Historia clínica / revisiones | ✅ | Crear, ver, editar, imprimir. En celular: botones −/+ (pasos de 0,25), chip de signo para esfera, cilindro siempre negativo, botón "Transponer", eje 0–180 |
| Carpeta del paciente | 🟡 | Cuatro pestañas: Revisiones, Ventas, Fotos y documentos, Laboratorio con contador y órdenes. Pendientes Citas, Estado de cuenta, Comunicaciones. |
| Ventas y cobros | ✅ | Pantalla general: solo venta rápida. Lentes solo desde la carpeta del paciente. El formulario pide **solo sucursal** (la empresa sale de la sucursal). Métodos de pago: Efectivo, Transferencia, Tarjeta de crédito, Otro ("Crédito" solo en historial). Duplicados de importación jul–sep 2026 limpiados |
| Laboratorio | ✅ | Pestaña en carpeta; uso lejos/cerca/intermedio con cálculo automático; DNP de cerca; **compensación por distancia al vértice** (≥ ±4.00), **diámetro mínimo de luna** + tamaño estándar, **altura de montaje obligatoria** en progresivos/bifocales (por ojo), **aviso de anisometropía** (≥ 2.00 D). Todo en la orden impresa |
| Impresiones (receta, revisión, orden, recibo) | 🟡 | Hoja A4 aislada. Arreglado bloqueo de 5 minutos tras la primera impresión; en iPhone/iPad imprime en una ventana nueva. Falta prueba en el navegador real |
| Inventario | ✅ | Stock por sucursal, transferencias, alertas, búsqueda por marca/modelo/código. **Banco de lunas** (`/inventario/lunas`): lunas de bodega y de garantía por sucursal; la orden de laboratorio avisa "Tienes esta luna en bodega / de garantía" y permite usarla (descuenta y deja registro) |
| Caja, resumen del día | ✅ | Arranque real 25-sep-2026 (Yuli hace el cuadre de Shuvision). Días en hora de Ecuador (antes UTC). **Apertura de caja** (efectivo inicial) antes del primer cuadre. Abonos por transferencia piden banco. Resumen del día incluye abonos de ventas antiguas. Cuadre único por sucursal y fecha |
| Cuentas de bancos / cuadre global | 🟡 | Enlace existe pero apunta a la misma caja diaria |
| Cuentas por cobrar | ✅ | Pestañas por prioridad: **Urgentes** (> 30 días, más antigua primero), **Ventas recientes** (≤ 30 días), **Cobros mensuales** (frecuencia mensual), **Convenios** (acuerdo de pago con empresa). Cada paciente en una sola pestaña. Mensaje de WhatsApp guardado tras "Ver mensaje". Muestra solo la empresa activa (Shuvision o Focus) |
| Agenda | ✅ | Vista día y mes. Vendedores agendan. 29 controles futuros agendados desde las historias (estado "Programada" = por confirmar); 250 revisiones con fecha de control para el CRM. Falta Google Calendar |
| Convenios | ✅ | Empresas con descuento a rol. **Personas del convenio** (`/convenios/[id]`): clientes potenciales aunque no sean pacientes, estados (nuevo → contactado → interesado → agendó → cliente / no interesado), WhatsApp con mensaje de invitación editable por empresa, enlace automático con paciente por cédula. Plantilla Excel en `docs/plantillas/` |
| Informes y metas | ✅ | Las metas usan **"A cuenta del mes"** = lo pagado de las ventas creadas en el mes (igual que la columna "A cuenta" de Optox). Queda también `ingresos_total` (abonos por fecha de pago) disponible |
| Facturación SRI | 🟡 | Borradores internos. Tabla `emisores_sri` por **sucursal** (Shuvision 1804006391001 ✔; Sacha 2100060470001 y Focus 1722305412001 **por confirmar**, se entregaron con 10 dígitos). Falta todo el envío al SRI (proyecto P1) |
| Asistente Shu (IA) | 🟡 | Ayuda administrativa básica (`app/asistente`). **Fase D** |
| CRM / seguimiento de pacientes | 🟡 | `/crm` general "A quién contactar hoy" + pestaña **Comunicaciones** en la carpeta del paciente (historial y registro de contactos). Falta: lealtad/referidos, lentes de contacto |
| Tarjeta de lealtad y referidos | ❌ | **Fase B** |
| Auditoría general de cambios | 🟡 | `pacientes_cambios` activa para ediciones de pacientes. Falta pantalla para verla y auditoría de otros módulos. |
| Seguridad de funciones de base de datos | ✅ | 2026-09-24: se quitó el acceso sin sesión a 7 funciones. Solo `obtener_recibo_publico` es pública (a propósito). |

---

## 4. Hoja de ruta

### Fase A — Arreglos urgentes (en curso)
1. **Editar ficha del paciente** — botón "Editar datos" en la carpeta, con registro de quién cambió qué y cuándo.
2. **Pestaña "Laboratorio" en la carpeta del paciente** — lista de órdenes del paciente + botón visible "Nueva orden de laboratorio" (elige la venta y abre el formulario que ya existe).
3. **Impresiones — hecho, pendiente prueba**. Receta, revisión, orden, recibo, acuerdos, resumen del día e informes imprimen solo su documento en un iframe limpio. A4 por defecto, márgenes de 12 mm; ticket 80 mm conservado como opción técnica. Pendiente verificar en navegador receta/orden/recibo de una página con datos normales, historia extensa sin recortes ni hojas vacías, logos, cancelar y repetir impresión.
4. **Seguridad** — quitar permiso público (`anon`) a las 7 funciones listadas en la sección 3.

### Fase B — Relación con pacientes (CRM + fidelización) — **siguiente prioridad elegida por Shuyana (2026-09-24): CRM y recordatorios**
- Recordatorios de control (3 m / 6 m / 1 año) con cola "pendientes de enviar" por WhatsApp (siempre con confirmación humana).
- Seguimiento postventa (a los 7 días: "¿cómo te adaptaste a tus lentes?").
- Cumpleaños con mensaje y beneficio.
- **Tarjeta de lealtad y referidos**: código único por paciente, registro de "quién lo refirió", puntos o beneficios por referido, tarjeta imprimible/digital con QR.
- Segmentos: pacientes sin volver hace más de 1 año, con saldo, con convenio, usuarios de lentes de contacto.

### Fase C — Facturación electrónica SRI
- Generar XML de factura, firmar con la firma electrónica (.p12) de cada empresa, enviar al SRI (recepción y autorización), guardar número de autorización, generar RIDE (PDF) y enviarlo por correo/WhatsApp.
- Primero en **ambiente de pruebas** del SRI; luego producción.
- La firma electrónica y su clave NUNCA se guardan en el código; van cifradas en el servidor.

### Fase D — Asistentes IA
- Asistente de gestión: responde "¿cuánto vendimos esta semana?", "¿qué órdenes están atrasadas?", "¿quién debe más?".
- Asistente clínico: resume la historia del paciente y compara revisiones (apoyo, nunca reemplaza el criterio clínico). Control estricto de qué datos clínicos salen a un servicio externo.

### Fase E — Integraciones y respaldo
- Google Calendar (distinguir "control recomendado" de "cita confirmada").
- Make / WhatsApp / Notion.
- Respaldo externo independiente de Supabase.

---

## 5. Decisiones tomadas (no cambiar sin preguntar)

- El nombre del sistema es **LumOS** (antes Revelio / SSFF).
- Revisiones clínicas: se pueden editar (decisión 2026-09-24).
- Datos del paciente: los puede editar todo el equipo, incluidos vendedores; siempre queda registro (decisión 2026-09-24).
- Orden de módulos nuevos: primero CRM y recordatorios (decisión 2026-09-24).
- Nombres de sucursales: Shuvision, Shuvision Sacha y Focus (2026-09-24).
- Metas de venta = dinero cobrado en el mes, no el total vendido (2026-09-24).
- Venta rápida nunca incluye lentes (lunas ni lentes de contacto). El botón "Lentes" solo existe dentro de la carpeta del paciente (2026-09-24).
- El gráfico de metas muestra solo el dinero cobrado; no muestra el total vendido (2026-09-24).
- Metas = **"A cuenta"** de Optox: lo pagado de las ventas creadas en el mes (`cobrado_total`) (2026-09-24).
- Formulario de venta: solo sucursal, sin empresa. Métodos de pago: Efectivo, Transferencia, Tarjeta de crédito, Otro (2026-09-24).
- Fechas: se deben **ver** en todo registro, se deben poder **elegir** (registrar algo con fecha anterior) y **no repetir** (2026-09-24).
- Ventas duplicadas por importación: se **anulan** (no se borran), conservando la copia que coincide con Optox. Autorizado por Shuyana para septiembre; historial cuando envíe los Excel de Optox (2026-09-24).
- **Publicación**: Vercel NO se actualiza desde GitHub. Se publica con `npx vercel --prod` desde esta carpeta (enlazada en `.vercel/`). Después de cada entrega: commit + push + publicar (2026-09-24).
- Vendedor: ve datos de pacientes (no historia clínica), registra pacientes, agenda citas y ve cuentas por cobrar. Caja ve nombres de pacientes para cobrar (2026-09-24).
- La orden de laboratorio siempre está ligada a una venta (la base de datos lo exige).
- Vendedores no ven la historia clínica completa; al crear una orden, si no ven la graduación la escriben a mano.
- La herramienta vieja de cuadre en Notion (`cuadre-diario-notion-bridge`) sigue funcionando en paralelo. No escribir en ella ni migrar sus datos sin permiso.
- WhatsApp de "lentes listos" y "seguimiento" siempre con confirmación humana antes de enviar.
- Focus y SHUVISION no comparten datos automáticamente.
- No se instalan complementos/plugins de repositorios no verificados. Codex se usa mediante el plugin oficial ya instalado (`codex:rescue`).

---

## 6. Bitácora de errores y lecciones (para no repetirlos)

| # | Fecha | Qué pasó | Lección |
|---|---|---|---|
| L1 | 2026-09-24 | El botón "Crear orden de laboratorio" nunca aparecía: solo se mostraba si el producto vendido tenía categoría `lente`, pero las ventas antiguas no tenían producto ligado. | No ocultar botones importantes con condiciones que dependen de datos que pueden faltar. Probar con datos reales. |
| L2 | 2026-09-24 | Imprimir la historia clínica congelaba el navegador por un selector CSS `:has()` en `@media print`. | No usar `:has()` en CSS de impresión; usar clases (`.print-area`). |
| L3 | 2026-09-17 | Al agregar parámetros a una función de Supabase quedaba la versión vieja "huérfana". | Al cambiar la firma de una función: `drop function` de la versión anterior y repetir `revoke`/`grant`. |
| L4 | 2026-09-16 | Reportes del día salían corridos un día. | Usar rangos explícitos UTC-5 (ver `rangoGuayaquil` en `lib/resumen-dia.ts`). |
| L5 | 2026-09-17 | La casilla de convenio no se veía hasta agregar un producto. | Revisar que las opciones importantes siempre estén visibles. |
| L6 | 2026-09-23 | Vendedores no podían abrir carpetas aunque la base de datos se lo permitía (la pantalla los bloqueaba). | Permisos de pantalla y de base de datos deben coincidir. |
| L7 | 2026-09-17 | Se entregó un paquete grande de cambios sin probar en el navegador (sesión cerrada, sin credenciales). | No acumular muchos cambios sin probar. Entregar en partes pequeñas. |
| L8 | 2026-09-24 | Shuyana sintió que "las órdenes de trabajo se borraron". Revisión de git: **no se perdió código**; el botón estaba escondido dentro de cada tarjeta de venta y el filtro de L1 lo ocultaba. | Las funciones importantes necesitan un lugar visible y propio (pestaña "Laboratorio"). Anotar aquí cada entrega para poder demostrar qué existe. |
| L9 | 2026-09-24 | El chequeo de seguridad de Supabase mostró funciones creadas sin quitar el permiso público `anon`. | En cada función nueva: `revoke all ... from public, anon` y `grant execute ... to authenticated`. Correr `get_advisors` después de cada migración. |
| L10 | 2026-09-24 | Se pidió instalar un complemento desde un repositorio de GitHub no verificado. | No instalar código de fuentes no verificadas. Codex se usa con el plugin oficial ya instalado. |
| L11 | 2026-09-24 | Revisión del código: tres bloques de impresión combinaban `visibility: hidden` (conserva espacio), posición absoluta y finalmente fija de `.print-area`, con documentos dentro de modales con `max-height`/`overflow: auto`. Los parches de modal eran incompletos y no eliminaban el resto del layout; además había mínimos de altura y anchura móviles, y recibos por defecto en ticket. | Imprimir una copia aislada del documento, sin ancestros modales ni clases temporales en el body original. Esperar estilos/logos/fuentes, convertir controles a texto actual, usar A4 y flujo normal con saltos por secciones/filas. No usar `:has()`. Confirmar paginación real en navegador; TypeScript no la verifica. |
| L12 | 2026-09-24 | Vendedores no encontraban pacientes ni veían cuentas por cobrar: la pantalla los dejaba entrar (arreglo de L6) pero la base de datos (RLS de `pacientes_clinicos`, `paciente_empresas`, `citas_agenda`) solo permitía roles clínicos. | Al dar acceso a un rol, revisar **las dos capas** y probar simulando ese rol en SQL (`set local role authenticated` + `request.jwt.claims`). |
| L13 | 2026-09-24 | Lentes de contacto aparecían en venta rápida porque 5 productos estaban guardados como "accesorio". | Cuando algo "aparece donde no debe", revisar primero los datos (categorías), no solo el código. |
| L14 | 2026-09-24 | Shuyana no veía ningún cambio del día (metas, ícono, laboratorio): Vercel no estaba conectado a GitHub; las publicaciones se hacían a mano con la herramienta de Vercel y la última era de 23 h antes. | "Subido a GitHub" no es "publicado". Publicar con `npx vercel --prod` y comprobar en el sitio real (por ejemplo, que `/apple-icon.png` responda). |
| L15 | 2026-09-24 | Las ventas se importaron **tres veces** (folios 5120–5223, 5489–5601 y 5757–5768 solo con saldo). Metas, cuentas por cobrar y reportes salían inflados (Shuvision: $16,498 vs $7,839 real). | Toda importación debe guardar el folio de origen (Optox) y no insertar si ya existe. Comparar totales contra el sistema de origen después de importar. |
| L16 | 2026-09-24 | La anulación masiva de 118 ventas fue bloqueada por el control de permisos (cambio grande en datos compartidos). | Para cambios masivos de datos: mostrar el plan con números, pedir autorización explícita en el chat y dejar el SQL listo en `docs/pendientes/`. |
| L17 | 2026-09-24 | Con autorización explícita en el chat, la anulación masiva sí se pudo aplicar. Se usó el Excel completo de Optox como referencia y se revisó a mano cada caso dudoso (nombres escritos distinto, ventas con orden/garantía enlazada). | Cruzar siempre contra el sistema de origen, mostrar el resultado esperado por mes antes de aplicar, y nunca anular una copia con registros enlazados. |
| L18 | 2026-09-24 | "La orden no se guarda": sí se guardaba; la carpeta de un paciente abierto por búsqueda guardaba sus datos en memoria y no se recargaba. | Después de cada cambio, volver a leer los datos de la pantalla. Antes de decir "no se guardó", revisar la base de datos. |
| L19 | 2026-09-24 | Imprimir se bloqueaba 5 minutos: se esperaba un aviso "impresión terminada" que Safari no envía. | Nunca bloquear una acción del usuario esperando un evento del navegador; liberar enseguida. |
| L20 | 2026-09-25 | La caja calculaba el día en UTC (lo de después de las 19:00 caía al día siguiente) y el CRM salía vacío porque solo 10 de 3.021 pacientes importados estaban vinculados a su empresa. | Revisar en cada función `::date` sobre timestamptz (usar `at time zone \'America/Guayaquil\'`). Al importar, crear también los vínculos paciente–empresa. |
| L21 | 2026-09-25 | Codex alcanzó el límite de uso de la cuenta (hasta 28-sep) a mitad de 3 tareas. Claude revisó y terminó el trabajo parcial (faltaba mostrar la apertura de caja y toda la pantalla del CRM). | Revisar siempre el estado real de los archivos cuando una tarea falla; no asumir que quedó completa. |
| L22 | 2026-09-25 | Un componente de pantalla importó un valor (no solo tipos) desde un archivo de servidor y rompió la compilación de producción; además el comando siguió y publicó el intento. | Constantes compartidas en archivos sin código de servidor (`*-config.ts` / `*-labels.ts`). Publicar solo si `next build` termina con código 0. |
| L23 | 2026-09-25 | La importación de Optox guardó la hora de los abonos en formato 12 h y sin zona horaria; los de la tarde se corrieron al día anterior. Además, al anular duplicados, algunos abonos quedaron en la copia anulada y la venta que quedó viva no tenía pagos. | Al importar: fecha + hora de 24 h en `America/Guayaquil`, y cuadrar día por día contra el Resumen del día de Optox. Al anular duplicados: mover o recrear los abonos en la venta que queda. |
| L24 | 2026-09-25 | Primer día real de caja: Yuli veía la caja de partida ($131) pero no podía anotar efectivo, tarjetas y transferencias. El recuadro "Resumen de caja" solo muestra valores (el botón para anotar era discreto), el formulario de apertura estaba repetido dentro del formulario del cierre y los montos usaban campo numérico, que en celulares con coma decimal no deja escribir. | Pantallas de dinero: campo de texto con teclado decimal que acepta coma o punto; nunca un formulario dentro de otro; la acción principal debe verse como botón principal. |
| L25 | 2026-09-25 | Tras la depuración de duplicados, quedaron 34 copias "Migración OPTOX" que repetían ventas originales (inflaban cuentas por cobrar en $6,040) y 5 ventas sin su abono porque las copias con el pago fueron anuladas. | Toda depuración debe terminar con dos verificaciones: (1) ninguna venta vigente repetida por paciente, sucursal, día y total, incluidas las de "Migración"; (2) en cada venta vigente, `pagado` = suma de sus pagos. |
| L26 | 2026-09-25 | Una venta del 24-sep a las 4:37 pm aparecía como "Hoy" el 25-sep a las 2 pm: la antigüedad se calculaba por horas transcurridas (menos de 24 h = 0 días), y varias fechas se formateaban sin zona horaria (el servidor está en UTC). | Días = diferencia de fechas de calendario en `America/Guayaquil` (`diasCalendarioGuayaquil` en `lib/record-date.ts`). Todo formato de fecha lleva `timeZone: "America/Guayaquil"` o usa `formatRecordDate`. |
| L27 | 2026-09-25 | Desde que se agregaron los botones −/+ de Rx, ninguna historia clínica se guardaba si algún campo quedaba en cero ("0.00" sin signo) porque el servidor exigía signo; el error aparecía detrás del formulario abierto y el equipo creyó que se guardó. Además, en producción Next.js oculta el texto de los errores lanzados por acciones del servidor. | La validación del servidor debe aceptar exactamente lo que produce el campo de la pantalla (probar con cero y vacío). Los errores de guardado se muestran dentro del formulario. Las acciones importantes devuelven `{ ok, error }` en vez de lanzar. Revisar a diario que las tablas clave (consultas, ventas, abonos) reciban registros. |
| L28 | 2026-09-25 | El armazón ZIMI (código 002090) no aparecía para vender ni en inventario: la venta pedía solo 200 productos y Supabase devuelve máximo 1.000 filas por consulta aunque se pida más; con 1.350 productos activos, todo lo que va después en orden alfabético quedaba fuera. | Toda lista que pueda crecer (productos, stock, pacientes, ventas) se carga con `fetchAll` por páginas o se busca en el servidor; nunca `.limit(n)` como si fuera "todo". |

---

## 7. Mapa de archivos clave

- Carpeta del paciente: `app/pacientes/patient-clinical-client.tsx` (pestañas, modales), acciones `app/pacientes/actions.ts`, datos `lib/clinical.ts`
- Historia clínica: `app/pacientes/consultation-form.tsx`, `consultation-detail.tsx`
- Impresiones: `app/pacientes/clinical-prescription-print.tsx` (receta), `app/pacientes/clinical-review-print.tsx` (revisión), `app/lab-order-print.tsx` (orden), `app/recibo/` (recibo), `app/print-letterhead.tsx` (membrete), `lib/print-document.ts`, CSS en `app/globals.css`
- Ventas: `app/ventas/sales-board.tsx` (incluye `SaleCard`), `cart.tsx`, `actions.ts`
- Laboratorio: `app/ventas/lab-order-modal.tsx`, `app/ventas/lab-actions.ts`, `lib/laboratorio.ts`, monitor `app/laboratorio/`
- Facturación: `app/facturacion/`, `lib/facturacion.ts`
- Asistente: `app/asistente/`
- Navegación: `app/app-navigation.tsx`, `app/dashboard-shell.tsx`
- Base de datos: `supabase/migrations/` (46 migraciones al 2026-09-24)

---

## 8. Preguntas abiertas para Shuyana

**Impresiones**
- ✅ Respondido 2026-09-24: se cortan o salen en varias hojas; papel A4 para todo.

**Facturación SRI** (necesario antes de empezar la Fase C)
- RUC de cada empresa, régimen (RIMPE emprendedor / negocio popular / general), si llevan contabilidad.
- ¿Tienen firma electrónica (.p12) vigente para cada RUC?
- Establecimiento y punto de emisión por sucursal (ej. 001-001, 002-001).
- ¿Hoy facturan con otro sistema? ¿Cuál es el último número de factura emitido?

**Tarjeta de lealtad**
- ¿Qué recibe quien refiere? (descuento, puntos, examen gratis, accesorio).
- ¿Qué recibe el referido?
- ¿Tarjeta física impresa, digital (WhatsApp) o ambas?

**Interfaz**
- ¿Qué pantallas usan más al día y cuáles se sienten lentas o confusas?
- ¿Se usa más en computadora, tablet o celular?

---

## 9. Registro de entregas

| Fecha | Qué se entregó | Commit |
|---|---|---|
| 2026-09-24 | Arreglo de impresión que congelaba, botón de orden visible en ventas, edición de revisiones | `ef2a66c` |
| 2026-09-24 | Este Blueprint + reglas para IAs (`AGENTS.md`, `CLAUDE.md`) | `6804ec0` |
| 2026-09-24 | Edición de pacientes con auditoría y pestaña Laboratorio. Archivos: `app/pacientes/actions.ts`, `app/pacientes/patient-clinical-client.tsx`, `app/ventas/sales-board.tsx`, `lib/clinical.ts`, `lib/ventas.ts`, `supabase/migrations/20260924193358_actualizar_paciente_clinico.sql`, `docs/BLUEPRINT.md`. Construido por Codex, revisado por Claude (permisos ampliados a todo el equipo). TypeScript sin errores; migración aplicada; prueba con sesión real pendiente. | `40e5975` |
| 2026-09-24 | Seguridad: 7 funciones sin acceso público. `supabase/migrations/20260924193549_revocar_anon_funciones.sql` | `8c728eb` |
| 2026-09-24 | Impresión aislada A4. Archivos: `lib/print-document.ts`, `app/globals.css`, `app/recibo/[token]/page.tsx`, `app/recibo/print-button.tsx`, `app/ventas/lab-order-modal.tsx`, `app/laboratorio/lab-monitor-board.tsx`, `app/ventas/acuerdo-pago-view.tsx`, `app/cuentas-cobrar/cuentas-cobrar-board.tsx`, `app/resumen-dia/resumen-dia-board.tsx`, `app/informes/informes-board.tsx`, `docs/BLUEPRINT.md`. Receta/revisión conservan sus IDs existentes; componentes clínicos, orden y membrete reciben ajustes solo al imprimir. Modal de recibo en ventas/carpeta gestiona el enlace público, no contiene un documento imprimible propio. TypeScript correcto; prueba visual pendiente de Claude. Sin commit/push ni cambios de base de datos por instrucción expresa. Probado por Claude: recibo en una hoja A4. | `2cb18f1` |
| 2026-09-24 | Ícono para Dock/inicio, metas por dinero cobrado, venta rápida sin lentes, sucursales renombradas, vendedor con pacientes/agenda/cuentas por cobrar. Migración `20260924220247_vendedor_pacientes_agenda_metas_cobradas.sql` aplicada. | (este commit) |
| 2026-09-24 | Solo sucursal en ventas, métodos de pago, metas "A cuenta", fechas visibles, resumen del día sin anuladas, tabla de referencia Optox. | (este commit) |
| 2026-09-24 | Depuración de 332 duplicados (jul–sep), carpeta se recarga tras cambios, impresión sin bloqueo, búsqueda en inventario, Rx con botones −/+ en celular, uso del lente con cálculo de cerca/intermedio. | (este commit) |
| 2026-09-25 | Caja lista para el arranque (hora Ecuador, apertura, banco en abonos), cálculos ópticos avanzados, CRM v1, 2.897 pacientes vinculados a su empresa. | (este commit) |
| 2026-09-25 | Cuentas por cobrar ordenadas por prioridad en 4 pestañas y mensaje guardado. | (este commit) |
| 2026-09-25 | Pestaña Comunicaciones en la carpeta; tabla de emisores SRI por sucursal; proyectos largos y plan de salida de Optox en el Blueprint. | (este commit) |
| 2026-09-25 | Sucursal destacada en Laboratorio; 29 controles agendados desde historias; banco de lunas con alerta en la orden de laboratorio. | (este commit) |
| 2026-09-25 | Personas del convenio (clientes potenciales) y plantillas Excel (banco de lunas, personas de convenio). | (este commit) |
| 2026-09-25 | Carga de faltantes de Optox 22–24 sep (ventas, abonos, salidas) cuadrada contra las capturas; hallazgo de la hora de abonos importados (L23). | (este commit) |
| 2026-09-25 | Corrección de la hora de 172 abonos importados (aparecían el día anterior), con respaldo. | (este commit) |
| 2026-09-25 | Cuadre de caja: botón claro "Anotar valores y cerrar caja", abre en la sucursal elegida, montos aceptan coma o punto, apertura ya no se repite dentro del cierre. | (este commit) |
| 2026-09-25 | Menú de arriba: "Resumen del día" reemplaza a "Laboratorio" (Laboratorio sigue en el menú completo). | (este commit) |
| 2026-09-25 | Cuentas por cobrar → Más opciones → "Añadir pago": abre la carpeta del paciente en Ventas con el abono listo en esa venta (enlace `/pacientes?paciente=ID&venta=ID`). Montos del abono aceptan coma o punto. | (este commit) |
| 2026-09-25 | Cuentas por cobrar: pestaña "Todas", clasificación manual por tarjeta (Automática / Urgentes / Recientes / Mensuales / Convenios, guardada en `pacientes_clinicos.categoria_cobro`), "Ventas recientes" = hasta 3 meses (90 días). Migración `20260925180000_clasificar_deuda_manual.sql`. | (este commit) |
| 2026-09-25 | Cuentas por cobrar: "Añadir pago" ahora es un solo botón visible que abre la carpeta del paciente en Ventas (si debe una sola venta, con el abono abierto). Se quitaron del menú las opciones por venta con fecha y valor. | (este commit) |
| 2026-09-25 | Anulación de 34 ventas "Migración OPTOX" duplicadas y recuperación de 5 abonos ($540), con respaldo. | (este commit) |
| 2026-09-25 | Canje en cuentas por cobrar (solo Superadministradora): botón "Canje" baja el saldo sin contar como abono, caja, ingreso ni venta; queda en `canjes_venta` con monto, motivo, quién y cuándo. `validar_transicion_venta` acepta esa única excepción. Migración `20260925200000_canje_cuentas_cobrar.sql`. Probado: superadmin sí, vendedora no; abonos posteriores siguen funcionando. | (este commit) |
| 2026-09-25 | Primer canje real: José Vicente Zambrano, folio 5445, $5 (autorizado en chat). Tarjetas de cuentas por cobrar muestran solo "Saldo pendiente" bajo el nombre. Antigüedad de deudas y mensajes de cobro cuentan días de calendario en hora Ecuador (una venta de ayer ya no dice "Hoy"). Todas las fechas de ventas, pagos, garantías, órdenes, inventario, archivos y facturación se muestran en hora Ecuador. | (este commit) |
| 2026-09-25 | Cuentas por cobrar: pestaña **Apartados** (Más opciones → Marcar como apartado; plazo 90 días desde la venta; aviso "entregar solo cuando pague todo" en la venta; liberar = anular, que devuelve stock) y pestaña **Lentes rezagados** (órdenes listas/notificadas hace 30+ días, con saldo o sin él; avisar por WhatsApp y marcar entregado). Nuevas columnas `ventas.apartado`, `ventas.apartado_hasta`, `ordenes_laboratorio.listo_en` (se llena sola al pasar a listo). Migración `20260925210000_apartados_y_rezagados.sql`. | (este commit) |
| 2026-09-25 | Clasificación de deudas incluye "Apartados" (marca la venta como apartado) y "Lentes rezagados" (deudas de lentes listos no retirados, p. ej. de Optox). La pestaña Lentes rezagados junta esas deudas y las órdenes de laboratorio listas 30+ días. Migración `20260925220000_clasificar_deuda_rezagados.sql`. | (este commit) |
| 2026-09-25 | Anular venta con dos opciones: **devolver el dinero** (egreso de hoy desde caja o banco, clasificación "ajuste") o **no devolver** (queda como **saldo a favor** del paciente por empresa, tabla `creditos_paciente`). En ambos casos el producto vuelve al inventario y los abonos originales siguen contando en su día. Nuevo método de pago "Saldo a favor" en abonos y ventas desde la carpeta (no cuenta como dinero nuevo en caja, resumen ni informes). Migración `20260925230000_anulacion_devolver_o_saldo_favor.sql` (nueva `anular_venta_con_modo`; `registrar_abono_venta`, `registrar_venta`, cierres e informe mensual actualizados). Probado en transacción: crédito $715 → uso $6 → $709; devolución en caja = egreso de hoy; banco = movimiento de egreso. | (este commit) |
| 2026-09-25 | Cuentas por cobrar: pestañas "Cobros semanales" y "Cobros quincenales" (automáticas por frecuencia y elegibles en Clasificación); la tarjeta muestra la sucursal (etiqueta destacada, primera) en lugar del número de WhatsApp. Migración `20260925235000_clasificar_semanal_quincenal.sql`. | (este commit) |
| 2026-09-25 | Convenios: 191 personas importadas desde Notion ("Colaboradores — Convenios Empresariales") como clientes potenciales: Orientquinde 18, Transflorientsa 17, Transshuar 13, Sindicato del Municipio 143 (→ convenio "Municipio de Shushufindi"); 23 ya tenían carpeta (enlazadas por cédula). Botón **Crear carpeta** en cada persona (crea el paciente con nombre, cédula, teléfono y ocupación "cargo · Convenio X", lo enlaza y abre la carpeta) o **Abrir carpeta** si ya existe. Migración `20260926000000_convenio_personas_desde_notion.sql`. | (este commit) |
| 2026-09-25 | **Arreglo crítico: historias clínicas no se guardaban** (0 guardadas el 24 y 25-sep). Los campos Rx con valor cero guardan "0.00" sin signo y el servidor exigía + o −. Ahora el cero se acepta; el error se muestra dentro del formulario, en rojo, con el campo exacto; `crearConsulta`/`actualizarConsulta` devuelven el error en vez de lanzarlo. | (este commit) |
| 2026-09-25 | **Arreglo: productos que no aparecían para vender ni en inventario.** Venta cargaba solo 200 productos (hay 1.350 activos) e inventario chocaba con el tope de 1.000 filas de Supabase; ahora se cargan por páginas (`lib/supabase/fetch-all.ts`) en ventas, carpeta del paciente e inventario, también el stock. El buscador de la venta busca por nombre, código de barras, código, marca, modelo y color. | (este commit) |
| 2026-09-25 | Historia clínica: antecedente **Fotosensibilidad** (Sí/No) debajo de Hipersensibilidad (`antecedentes.fotosensibilidad`) y campo **Otros detalles** en Biomicroscopía (`biomicroscopia.otros_detalles`); se ven en el detalle y en la impresión. Duplicado "ZIMI ECONOMICO MORADO" (002090, creado hoy) desactivado a pedido de Shuyana. | (este commit) |
| 2026-09-25 | Venta de lentes: precio editable para **armazones y lunas** (campo "Precio $"); mínimo recomendado = el menor de precio 1/2/3 del catálogo; si se escribe menos aparece en rojo "Estás colocando un precio menor al del recomendado". `registrar_venta` usa `precio_unitario` enviado solo para montura/lente (otras categorías siempre precio de catálogo). Migración `20260926010000_precio_editable_lunas_armazones.sql`. | (este commit) |
| 2026-09-25 | Venta de lentes: mensaje "Precio mínimo de esta venta es de: Armazón $X · Lunas $Y (total)" bajo el total; se pone en rojo si el precio de armazones y lunas queda por debajo. | (este commit) |
| 2026-09-25 | Caja y Cuentas por cobrar muestran solo la sucursal donde se trabaja (la elegida en el menú); casilla **"Todas las sucursales"** arriba para ver todas (se recuerda por navegador, `app/todas-sucursales-toggle.tsx`). En cuentas por cobrar la Superadministradora ve también las otras empresas al marcarla. | (este commit) |
| 2026-09-25 | Menú: "Caja" renombrado a **"Cuadre de caja"** y agregado a la barra de arriba (Shuyana no lo encontraba). | (este commit) |
| 2026-09-25 | Inicio: tarjeta **Resumen del día** de la sucursal activa (ventas, cobrado por método, egresos, caja de partida, efectivo esperado; usa `previsualizar_cierre_caja`) con botones Registrar egreso / Ver resumen completo / Cuadre de caja; acceso rápido "Registrar egreso". Cuadre de caja: la sección de cierre diario va antes de Gastos recientes. | (este commit) |
| 2026-09-25 | Rendimiento: funciones de Vercel en **pdx1** (Oregón), junto a la base de datos Supabase (us-west-2); antes corrían en iad1 (Washington) y cada consulta cruzaba EE. UU. (`vercel.json`). Menú: **Mis deudas** (`/mi-espacio`) visible solo para la Superadministradora (`esSuperadminActual`). | (este commit) |
| 2026-09-25 | **Mis deudas v2** (`/mi-espacio`, solo Superadministradora): 5 tipos (proveedor, préstamo bancario, tarjeta, préstamo personal, gasto fijo), 3 formas de pago (cuotas fijas con cuotas ya pagadas, abonos libres, pago mensual fijo), vista del mes con tarjetas (por pagar, pagado, vencido, deuda total), pagos del mes y atrasados, deudas con barra de avance y próximo pago, historial, archivar, y opción de registrar el pago también como egreso de caja. Campo `ambito` preparado para que Erick (Focus) y Sacha gestionen lo suyo después. Migración `20260926020000_mis_deudas_v2.sql`; cálculos en `lib/mis-deudas-calc.ts`. | (este commit) |

---

## 11. Pendientes abiertos (2026-09-24)

1. ✅ **Depuración julio–septiembre 2026 aplicada** (2026-09-24, autorizada por Shuyana): 332 ventas anuladas a su nombre, respaldadas en `depuracion_ventas_duplicadas` (migración `20260925001427`). Julio y agosto idénticos a Optox en las 3 sucursales. Cuentas por cobrar: 110 ventas con saldo, $17,590.
2. **Historial**: Excel completo de Optox recibido (7,627 ventas desde nov-2022). Enero–junio 2026 y años anteriores **no tienen duplicados** (el sistema tiene igual o menos que Optox). Sacha antes de junio 2026 no es válido (indicación de Shuyana); el sistema no tiene ventas de Sacha antes de julio.
3. ✅ **Faltantes de Optox 22–24 sep cargados** (2026-09-25, desde capturas del Resumen del día de las 3 sucursales; migración `20260925150000_optox_faltantes_22_24_sep.sql`): 6 ventas del 24-sep (Shuvision 6802, 6803; Sacha 174, 175; Focus 6565, 6566), 5 abonos del 23-sep que faltaban (2 habían quedado en copias anuladas), abono de $100 de Adriana Hurtado (5652), abono de $55 de Marjury Terán (5197) y 4 salidas del 24-sep. El abono $0 "Retiro sin novedad" de Sacha no se carga (es entrega, no dinero). **Historias clínicas de esos días aún no llegan.**
3b. ✅ **Duplicados de migración corregidos** (2026-09-25, autorizado por Shuyana; migración `20260925190000_anular_migraciones_duplicadas.sql`): 34 ventas "Migración OPTOX" (folios 5717–5750, $6,040 de saldo) anuladas con respaldo en `depuracion_ventas_duplicadas` (acción `anular_migracion_duplicada`); se conserva la venta original con productos y abonos (ej. Miguel Villaprado: queda 3883, se anula 5725). Recuperados 5 abonos ($540) en 5754, 5758, 5761, 5763, 5765. Verificado: 0 duplicados de migración restantes; cuentas por cobrar total $11,135.
4. Inconsistencias (recontadas 2026-09-25): 184 ventas vigentes donde `pagado` ≠ suma de sus pagos. Tipos: (a) ventas importadas con `pagado` pero sin filas de pago (el cobro no aparece en Resumen del día ni en "A cuenta" de ese día, ej. consumidores finales de $1–$10 en 2026); (b) ventas de total $0 con pagos (en Optox el abono se registró en una venta "$0" de seguimiento, ej. folio 4776 con $643). Solo 3 tienen saldo pendiente (ej. 5696 Sandra Rojas $180, 5610 Joselyn Linares $240). Pendiente: decidir con Shuyana si se reconstruyen con el Excel de abonos de Optox.
5. **Resumen del día**: solo muestra abonos de ventas creadas ese día; debe mostrar todos los abonos recibidos ese día.
6. **Elegir fecha**: permitir registrar revisión, venta, orden, cita y cuadre con fecha anterior (con registro de quién lo hizo), y evitar duplicados por fecha.

7. ✅ **Hora de los abonos importados corregida** (2026-09-25, autorizado por Shuyana: "SI CORRIGE"; migración `20260925160000_corregir_hora_abonos_importados.sql`): la importación había guardado la hora en formato 12 h y los abonos de 1–4 pm aparecían el día anterior. 172 abonos de ventas vigentes ($10,309.95) quedaron a las 12:00 de su fecha; respaldo de la hora anterior en `correccion_hora_abonos`. Los 19 abonos de ventas anuladas (duplicados) no se tocaron. Verificado: Shuvision 22-sep $13 y 23-sep $632, igual que Optox.
8. **Make – Focus separado**: plan Free (2 escenarios activos, 1.000 operaciones/mes). Todos los escenarios (Cumpleaños, Cobros, Control anual, Convenios) envían desde un solo número y leen de Notion. Para separar Focus: registrar el número de Focus en Meta (WhatsApp Cloud API), crear su conexión en Make y filtrar por empresa. Probablemente requiere subir de plan en Make.
9. **WhatsApp Business de las 3 ópticas dentro de LumOS** (propuesta): conectar cada número a la API oficial de WhatsApp (Meta Cloud API, con "coexistencia" para seguir usando la app en el celular), bandeja de mensajes en LumOS ligada a la carpeta del paciente (pestaña Comunicaciones), asistente con IA que sugiere o envía respuestas a preguntas frecuentes (horarios, estado de la orden, saldo) y siempre pide confirmación en lo sensible. Make queda solo para campañas.

---

## 10. Ideas del especialista (propuestas, pendientes de aprobar por Shuyana)

**CRM y recordatorios (Fase B, prioridad elegida)**
1. *Bandeja diaria "A quién contactar hoy"*: una sola lista con motivo, mensaje de WhatsApp listo y botón "Enviado" (confirmación humana).
2. *Control vencido*: usa el "próximo control" de la última revisión.
3. *Examen sin compra*: pacientes que se hicieron la revisión y no compraron en 15–30 días (la mayor fuga de ventas en ópticas).
4. *Lentes listos sin retirar*: órdenes "notificado" hace más de 7 días.
5. *Postventa*: a los 7 días de la entrega, "¿cómo te adaptaste?"; si hay problema, crea tarea al optometrista.
6. *Cumpleaños* con beneficio.
7. *Inactivos*: más de 12 meses sin visita.
8. *Lentes de contacto*: recordatorio de reposición según duración.
9. Historial de contactos por paciente (pestaña "Comunicaciones" en la carpeta).

**Fidelización**
- Tarjeta de lealtad con código/QR por paciente, "¿quién te refirió?" al crear la ficha, beneficios por referido, ranking de mejores referidores.
- Encuesta de satisfacción corta después de la entrega y enlace para reseña en Google.

**Indicadores clave para ópticas (Informes)**
- Conversión examen → venta por optometrista y por sucursal.
- Ticket promedio; porcentaje de progresivos, antirreflejo y fotocromáticos.
- Días promedio de entrega por laboratorio y porcentaje de garantías por laboratorio.
- Comisiones por vendedor.

**Otros módulos sugeridos**
- Proveedores y compras (órdenes de compra, cuentas por pagar).
- Portal del paciente: receta digital, recibo y estado de su orden con un enlace.

---

## 12. Proyectos largos (hoja de ruta para dejar Optox)

**Meta de Shuyana (2026-09-25): dejar de pagar Optox a fin de septiembre de 2026.** Arranque real de LumOS: 25-sep-2026 (cuadres de caja de las 3 sucursales empiezan ese día con una apertura).

### Antes de apagar Optox (bloqueantes)
| # | Qué | Por qué bloquea | Estado |
|---|---|---|---|
| B1 | Facturación electrónica | **No bloquea**: Shuyana siempre factura con el facturador gratuito del SRI, no con Optox. P1 queda como mejora. | ✅ no bloquea |
| B2 | Exportar de Optox todo lo que falte: ventas y abonos desde 22/23/24-sep, historias clínicas desde 23-sep, inventario actual, catálogo y precios | Después no habrá acceso | 🟡 esperando capturas/Excel |
| B3 | Una semana de marcha blanca: cada cuadre de LumOS comparado con el conteo real | Confirmar que los números cuadran | ⏳ desde 25-sep |
| B4 | Inventario inicial contado por sucursal | El stock debe partir de un conteo real | ❌ |
| B5 | Equipo capacitado (Yuli caja; optometristas historia + orden; vendedoras venta + CRM) | Evitar volver a Optox "por costumbre" | ❌ |

### Proyectos largos
| # | Proyecto | Contenido | Depende de |
|---|---|---|---|
| P1 | **Facturación electrónica SRI** | XML factura v1.1, firma XAdES-BES con .p12 por RUC, envío a web services de recepción/autorización, RIDE PDF, correo/WhatsApp al paciente, notas de crédito, ambiente pruebas → producción. Firma y clave cifradas (nunca por chat). No se necesita usuario/clave del portal SRI. | Datos de cada RUC: razón social, dirección, establecimiento/punto de emisión, régimen, contabilidad, último secuencial; archivos .p12 |
| P2 | **Asistente virtual de gestión** ("Asistente Shu") | Responde en lenguaje natural sobre ventas, cobros, caja, laboratorio, metas; alertas proactivas ("trabajos atrasados", "diferencias de caja recurrentes"); acciones con confirmación | Datos limpios (hecho), P5 |
| P3 | **Asistente clínico** | Resume la historia completa, compara revisiones, sugiere exámenes complementarios; apoyo, no reemplaza el criterio clínico; control estricto de qué datos salen a la IA | P2 |
| P4 | **WhatsApp Business de las 3 ópticas en LumOS** | API oficial por número (coexistencia con la app), bandeja ligada a Comunicaciones, respuestas sugeridas por IA, Make solo para campañas | Registro de números en Meta; separar Focus en Make |
| P5 | **Inicio por cargo y menú corto** | Yuli: caja, cobros, CRM; optometristas: agenda y revisiones; Shuyana: metas, alertas, supervisión; menú con Pacientes, Agenda, Caja, CRM, Laboratorio y "Administración" | — |
| P6 | **Fidelización y referidos** | Código/QR por paciente, "¿quién te refirió?", beneficios, ranking | Reglas de beneficios (Shuyana) |
| P7 | **Lentes de contacto** | Plantillas por marca/duración y recordatorio de reposición en el CRM | — |
| P8 | **Proveedores y compras** (siguiente) | Ficha de proveedor (laboratorios Provisión, OPTEC, Indulentes, Importlens y proveedores de armazones), órdenes de compra, recepción que suma al inventario, cuentas por pagar con vencimientos, costo real por producto | Lista de proveedores (Notion o Excel) |
| P9 | **Respaldo externo** | Copia diaria fuera de Supabase | — |
