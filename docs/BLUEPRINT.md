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
3. **Guardar siempre.** Cada tarea terminada = un commit en `main` + push a GitHub. Nada queda "solo en la computadora".
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
| Login, roles, equipo, sucursales | ✅ | `app/login`, `app/equipo`, `app/configuracion/sucursales` |
| Inicio / tareas y supervisión | ✅ | Tareas como checklist |
| Pacientes — crear ficha | ✅ | Edad calculada, ocupación, responsable de cuenta |
| Pacientes — editar ficha | 🟡 | Implementado: formulario compartido con alta, permisos clínicos y auditoría antes/después. Pendiente aplicar `20260924193358_actualizar_paciente_clinico.sql` y probar con sesión real. |
| Historia clínica / revisiones | ✅ | Crear, ver detalle, **editar** (desde 2026-09-24), imprimir |
| Carpeta del paciente | 🟡 | Cuatro pestañas: Revisiones, Ventas, Fotos y documentos, Laboratorio con contador y órdenes. Pendientes Citas, Estado de cuenta, Comunicaciones. |
| Ventas y cobros | ✅ | Venta rápida / lentes, abonos, anulación, convenios, acuerdo de pago, folio |
| Laboratorio | 🟡 | Pestaña propia en carpeta con nueva orden, selector de ventas completadas y acceso al modal existente. Sin venta ofrece registrarla. Tarjetas con fecha, lente, estado y garantía; acceso en ventas renombrado. Pendiente prueba con sesión real. |
| Impresiones (receta, revisión, orden, recibo) | 🟡 | Implementado, pendiente prueba en navegador: contexto aislado por documento, A4 con márgenes de 12 mm, logos y espacios compactos, paginación sin modales. Incluye acuerdos, resumen del día e informes. TypeScript correcto. |
| Inventario | ✅ | Stock por sucursal, transferencias, alertas, pestañas por categoría |
| Caja, resumen del día | ✅ | Cuadre diario convive con la herramienta vieja de Notion (no tocar esa) |
| Cuentas de bancos / cuadre global | 🟡 | Enlace existe pero apunta a la misma caja diaria |
| Cuentas por cobrar | ✅ | Incluye mensaje de cobro con días de atraso |
| Agenda | ✅ | Vista día y mes. Falta Google Calendar |
| Convenios | ✅ | Empresas con descuento a rol |
| Informes y metas | ✅ | |
| Facturación SRI | 🟡 | Solo **borradores** internos (`app/facturacion`). No firma ni envía al SRI. **Fase C** |
| Asistente Shu (IA) | 🟡 | Ayuda administrativa básica (`app/asistente`). **Fase D** |
| CRM / seguimiento de pacientes | ❌ | **Fase B** |
| Tarjeta de lealtad y referidos | ❌ | **Fase B** |
| Auditoría general de cambios | 🟡 | `pacientes_cambios` activa para ediciones de pacientes. Falta pantalla para verla y auditoría de otros módulos. |
| Seguridad de funciones de base de datos | 🟡 | El chequeo de Supabase (2026-09-24) muestra 7 funciones que se pueden llamar sin iniciar sesión (`activar_cobro_insistente`, `actualizar_estado_garantia`, `actualizar_orden_laboratorio`, `crear_garantia`, `crear_orden_laboratorio` versión 11 parámetros, `registrar_pago_deuda_negocio`, `vincular_orden_garantia`). Hay que quitarles el permiso `anon`. `obtener_recibo_publico` es pública a propósito. |

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
| 2026-09-24 | Edición de pacientes con auditoría y pestaña Laboratorio. Archivos: `app/pacientes/actions.ts`, `app/pacientes/patient-clinical-client.tsx`, `app/ventas/sales-board.tsx`, `lib/clinical.ts`, `lib/ventas.ts`, `supabase/migrations/20260924193358_actualizar_paciente_clinico.sql`, `docs/BLUEPRINT.md`. Construido por Codex, revisado por Claude (permisos ampliados a todo el equipo). TypeScript sin errores; migración aplicada; prueba con sesión real pendiente. | (este commit) |

| 2026-09-24 | Impresión aislada A4. Archivos: `lib/print-document.ts`, `app/globals.css`, `app/recibo/[token]/page.tsx`, `app/recibo/print-button.tsx`, `app/ventas/lab-order-modal.tsx`, `app/laboratorio/lab-monitor-board.tsx`, `app/ventas/acuerdo-pago-view.tsx`, `app/cuentas-cobrar/cuentas-cobrar-board.tsx`, `app/resumen-dia/resumen-dia-board.tsx`, `app/informes/informes-board.tsx`, `docs/BLUEPRINT.md`. Receta/revisión conservan sus IDs existentes; componentes clínicos, orden y membrete reciben ajustes solo al imprimir. Modal de recibo en ventas/carpeta gestiona el enlace público, no contiene un documento imprimible propio. TypeScript correcto; prueba visual pendiente de Claude. Sin commit/push ni cambios de base de datos por instrucción expresa. | (este commit) |

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
