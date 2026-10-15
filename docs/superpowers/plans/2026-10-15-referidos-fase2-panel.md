# Referidos y Recompensas — Fase 2 (Panel en el CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la superadmin y a los administradores de sucursal una pantalla `/crm/referidos` con los indicadores del programa de referidos de la óptica activa, un ranking de referidores y el detalle de cada uno.

**Architecture:** Dos funciones SQL de solo lectura (`panel_referidos` y `panel_referidos_detalle`) comparten un ayudante interno que valida rol, período y sucursal. Un cargador del servidor y una acción las llaman, y un tablero cliente las muestra. Un botón en el CRM abre la pantalla solo a los roles permitidos.

**Tech Stack:** Next.js 15 + React 19 + TypeScript, Supabase Postgres (proyecto `rbmmhcwvzmjafjauwvsr`), pruebas SQL dentro de transacciones que se deshacen y pruebas Node (`node --test tests/*.test.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md` (leerlo primero; la fase 1 está en `docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md`). Leer también `docs/BLUEPRINT.md` (secciones 2, 5 y 6) y `AGENTS.md`.

## Global Constraints

- **Una óptica a la vez.** Nunca se mezclan SHUVISION y Focus en una pantalla y **no hay vista comparativa**.
- **Quién lo ve:** superadmin y administradores de sucursal; vendedores, optómetras y caja no lo ven ni pueden abrirlo (pantalla y base de datos). Un `admin_sucursal` ve **solo su sucursal** (la base de datos fuerza la sucursal de su usuario); si no tiene sucursal asignada se rechaza.
- Solo lectura: **no se cambia ninguna tabla ni función existente** de la fase 1. Una migración nueva con funciones nuevas únicamente.
- Funciones: `SECURITY DEFINER`, `set search_path = ''`, `revoke all ... from public, anon`, `grant execute ... to authenticated` (L9); helper interno `revoke all ... from public, anon, authenticated`. Correr `get_advisors` tras aplicar. Mensajes de error en español.
- Período: fechas de Ecuador (`America/Guayaquil`, UTC-5), día final incluido; intervalo `[desde 00:00, hasta+1 00:00)`; `desde <= hasta`; máximo 366 días. Por defecto: el mes actual hasta hoy. Atajos: "Este mes", "Mes pasado", "Últimos 30 días" y rango manual (L4).
- Sucursal de un referido = la de su venta; si aún no compró, la de quien lo registró; si no hay ninguna, solo cuenta en "Todas". Un movimiento del monedero pertenece a la sucursal de la venta que lo originó o lo gastó; los ajustes manuales (sin venta) solo aparecen en "Todas".
- **Costo del programa** = descuentos de bienvenida + créditos y bonos **usados en ventas no anuladas**. Lo generado y aún no usado es deuda pendiente (no costo) y lo vencido no cuesta: nada se cuenta dos veces. Ventas "atribuidas" (no "incrementales"); el margen exacto llegará con costos por producto.
- Con los programas apagados el panel muestra ceros y un aviso claro. Sin gráficos, sin exportar, sin imprimir.
- Interfaz en español, estilo glass existente (`agenda-summary`, `task-card`, `tabs`, `notice`, `modal-backdrop`/`new-patient-modal`). No inventar CSS. Sin `:has()` en CSS de impresión.
- Migraciones: archivo nuevo `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`; nunca editar migraciones viejas; solo agregar. Verificar con `npx tsc --noEmit`; `npm run lint` no funciona (no hay `eslint.config.*`); pruebas Node con `node --test tests/*.test.cjs` (la forma `tests/` falla en Node 24).
- Publicar al final: commit + push + `npx vercel --prod` (autorización permanente de Shuyana). Las migraciones las aplica el controlador tras la revisión, nunca el implementador.

## Review Focus

Entradas que el diseño implica y que una prueba obvia no cubriría; cada una tiene su caso en la tarea indicada:

1. **Frontera del día en Ecuador:** una venta a las 23:30 hora de Ecuador pertenece a su día, no al siguiente (Task 1, caso P9; Task 2, `hoyEcuador`).
2. **Administrador de sucursal forzado:** aunque la pantalla pida otra sucursal o "todas", el administrador de Sacha solo ve Sacha (Task 1, P7).
3. **Referido registrado y sin venta:** cuenta por la sucursal de quien lo registró, y solo en "Registrados" (Task 1, P5/P6).
4. **Venta anulada y crédito no usado:** una venta anulada sale de ventas atribuidas y del costo; un crédito generado y no usado no suma al costo (Task 1, P2/P3).
5. **Programa apagado / sin datos:** ceros, `conversion` y `ticket` nulos (no `NaN` ni división por cero), ranking vacío, sin error (Task 1, P11; Task 4, tablero).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261015160000_referidos_panel.sql` | Ayudante interno de contexto + `panel_referidos` + `panel_referidos_detalle` |
| `supabase/tests/referidos_07_panel.sql` | Pruebas SQL con reversa (se usa con el preludio de la fase 1) |
| `lib/referidos-panel.ts` | Tipos del panel y funciones puras (períodos, formato) — importable desde cliente |
| `tests/referidos-panel.test.cjs` | Prueba Node de las funciones puras |
| `lib/referidos-panel-data.ts` | Cargador del servidor `getPanelReferidos` |
| `app/crm/referidos/actions.ts` | Acción del servidor `obtenerDetalleReferidor` |
| `app/crm/referidos/page.tsx` | Página servidor (`force-dynamic`) |
| `app/crm/referidos/panel-board.tsx` | Tablero cliente: filtros, tarjetas, ranking, detalle |
| `lib/crm.ts`, `lib/crm-labels.ts`, `app/crm/crm-board.tsx` | Solo el botón "Referidos" y el dato `puedeVerReferidos` |

## Cómo se ejecuta una prueba SQL (igual que en la fase 1)

La base de datos real es la única que hay. Cada prueba se manda a `mcp__4d0b09ce-0efa-434f-8f0b-fd65b491ada1__execute_sql` (proyecto `rbmmhcwvzmjafjauwvsr`; cargar la herramienta con ToolSearch `select:mcp__4d0b09ce-0efa-434f-8f0b-fd65b491ada1__execute_sql`) como **una sola cadena** = `[migración] + [supabase/tests/referidos_00_preludio.sql] + [prueba]`. Una llamada es **una transacción** y la prueba termina siempre con un error a propósito: `PRUEBAS_OK: …` = pasó; `FALLO …` = ese caso falló. Se puede quitar de la cadena enviada las líneas de comentario `--`. Para aplicar de verdad: `apply_migration` (solo el controlador). El preludio enciende los dos programas dentro de la transacción y crea `pg_temp.paciente`, `pg_temp.vender`, `pg_temp.vender_falla` y las variables `t.*` (`t.su` superadmin, `t.vend_shu` vendedor de Shuvisión, `t.vend_focus` administrador de Focus, `t.suc_shu`, `t.shu`, `t.focus`). **Usuarios reales (verificado el 2026-10-15):** Focus tiene 1 `admin_sucursal` (sucursal Focus); Shuvisión tiene 1 superadmin y 1 vendedor en la sucursal "Shuvision" y 3 `admin_sucursal` en "Shuvision Sacha".

---

### Task 0: Condiciones previas

**Files:** ninguno.

- [ ] **Step 1: Árbol y línea base**

Run: `git status --short | grep -v DS_Store; git log --format='%h %s' -3; npx tsc --noEmit && echo TSC_OK`
Expected: sin cambios propios pendientes (puede haber archivos de otra sesión "Facturación": no tocarlos), `TSC_OK`.

- [ ] **Step 2: La base está como se espera (solo lectura)**

Con `execute_sql`: `select (select count(*) from public.programas_referidos where activo) as encendidos, (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('panel_referidos','panel_referidos_detalle')) as ya_existen, (select count(*) from public.referidos) as referidos;`
Expected: `encendidos = 0`, `ya_existen = 0`, `referidos = 0`. Si `ya_existen > 0`, detenerse y avisar.

---

### Task 1: Migración — funciones del panel y sus pruebas

**Files:**
- Create: `supabase/migrations/20261015160000_referidos_panel.sql`
- Create: `supabase/tests/referidos_07_panel.sql`

**Interfaces:**
- Consumes: tablas y funciones de la fase 1 (`programas_referidos`, `codigos_referido`, `referidos`, `monedero_movimientos`, `public.rol_referidos(uuid)`, `app_private.saldo_disponible_monedero(uuid, uuid)`), `ventas`, `sucursales`, `usuarios`, `pacientes_clinicos`, `paciente_empresas`.
- Produces:
  - `app_private.contexto_panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid) returns table (o_programa uuid, o_sucursal uuid, o_ini timestamptz, o_fin timestamptz)`
  - `public.panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid default null) returns jsonb` con la forma: `{programa_activo, nombre, periodo:{desde,hasta}, sucursal, sucursales:[{id,nombre}], indicadores:{codigos, registrados, compraron, conversion, ventas_n, ventas_total, ticket, descuentos, pendientes, creditos_generados, creditos_usados, creditos_vencidos, bonos_n, bonos_monto, costo, resultado, costo_pct}, ranking:[{paciente_id, nombre, codigo, exitosos, ventas, credito_ganado, disponible}], ranking_total}`
  - `public.panel_referidos_detalle(p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_sucursal uuid default null) returns jsonb` con la forma: `{referidor:{paciente_id, nombre, codigo}, resumen:{exitosos, en_espera, ventas, credito_ganado, credito_usado, credito_vencido, disponible}, referidos:[{nombre, estado, creado_en, aplicado_en, venta_total, folio, sucursal, descuento, credito}], movimientos:[{tipo, monto, vence_en, motivo, creado_en, referido}]}`

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_07_panel.sql` (se manda como `[migración] + [preludio] + [este archivo]`):

```sql
create or replace function pg_temp.panel(p_auth uuid, p_empresa uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.panel_referidos(p_empresa, p_desde, p_hasta, p_suc);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

create or replace function pg_temp.detalle(p_auth uuid, p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns jsonb language plpgsql as $f$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.panel_referidos_detalle(p_empresa, p_referidor, p_desde, p_hasta, p_suc);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

-- Ejecuta el panel esperando un error cuyo mensaje contenga el fragmento.
create or replace function pg_temp.panel_falla(p_caso text, p_fragmento text, p_auth uuid, p_empresa uuid, p_desde date, p_hasta date, p_suc uuid default null)
returns void language plpgsql as $f$
begin
  begin
    perform pg_temp.panel(p_auth, p_empresa, p_desde, p_hasta, p_suc);
  exception when others then
    if position(lower(p_fragmento) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO %: se esperaba un error con "%" y salió "%"', p_caso, p_fragmento, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO %: se esperaba un error con "%" pero el panel respondió', p_caso, p_fragmento;
end $f$;

do $$
declare
  v_shu uuid := current_setting('t.shu')::uuid;
  v_focus uuid := current_setting('t.focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  vend uuid := current_setting('t.vend_shu')::uuid;
  adm_focus uuid := current_setting('t.vend_focus')::uuid;
  s_mat uuid := current_setting('t.suc_shu')::uuid;
  s_foc uuid := current_setting('t.suc_focus')::uuid;
  s_sac uuid; adm_sac uuid; v_prog uuid;
  hoy date := (now() at time zone 'America/Guayaquil')::date;
  a uuid; a2 uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; ca text; ca2 text; sf uuid; se uuid;
  r jsonb; i jsonb; det jsonb; v_nombre text;
begin
  select id into s_sac from public.sucursales where empresa_id = v_shu and nombre = 'Shuvision Sacha';
  select u.auth_user_id into adm_sac from public.usuarios u join public.roles ro on ro.id = u.rol_id
   where ro.nombre = 'admin_sucursal' and u.activo and u.sucursal_id = s_sac limit 1;
  if s_sac is null or adm_sac is null or s_mat = s_sac then raise exception 'PRELUDIO7: falta Sacha, su administrador o la sucursal Shuvision'; end if;
  if (select u.sucursal_id from public.usuarios u where u.auth_user_id = vend) is distinct from s_mat then
    raise exception 'PRELUDIO7: el vendedor de Shuvisión no está en la sucursal Shuvision';
  end if;
  select id into v_prog from public.programas_referidos where empresa_id = v_shu;

  -- Datos: A (referidor) con B, C, D, E, F; A2 con G; A usa $8 de crédito. Precios: descuento SHU = $10.
  a := pg_temp.paciente('Ana', '0995000001', v_shu, s_mat);
  a2 := pg_temp.paciente('Ana2', '0995000002', v_shu, s_mat);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;
  select codigo into ca2 from public.codigos_referido where programa_id = v_prog and paciente_id = a2;
  b := pg_temp.paciente('Beto', '0995000003', v_shu, s_mat);
  c := pg_temp.paciente('Carla', '0995000004', v_shu, s_sac);
  d := pg_temp.paciente('Dani', '0995000005', v_shu, s_mat);
  e := pg_temp.paciente('Eva', '0995000006', v_shu, s_mat);
  f := pg_temp.paciente('Fer', '0995000007', v_shu, s_mat);
  g := pg_temp.paciente('Gabo', '0995000008', v_shu, s_mat);

  perform pg_temp.vender(v_shu, s_mat, vend, b, ca, 150, 140);          -- B: matriz, total 140, pagada
  perform pg_temp.vender(v_shu, s_sac, vend, c, ca, 200, 190);          -- C: Sacha, total 190, pagada
  perform set_config('request.jwt.claims', json_build_object('sub', vend, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_referido_ficha(d, v_shu, ca);                -- D: registrado en la ficha, sin venta
  reset role;
  se := pg_temp.vender(v_shu, s_mat, vend, e, ca, 120, 50);             -- E: matriz, total 110, a medias
  sf := pg_temp.vender(v_shu, s_mat, vend, f, ca, 130, 50);             -- F: matriz, total 120, a medias...
  perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.anular_venta_con_modo(sf, 'Prueba de anulación del panel', 'credito');  -- ...y anulada
  reset role;
  perform pg_temp.vender(v_shu, s_mat, vend, g, ca2, 200, 190);         -- G (de A2): matriz, total 190, pagada
  perform pg_temp.vender(v_shu, s_mat, vend, a, null, 100, 92, 8);      -- A gasta $8 de crédito en una compra de $100
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, a, 'ajuste', 5, now() - interval '1 day', 'lote vencido del panel');
  perform public.vencer_creditos_referidos();                            -- el ajuste de $5 vence (sin venta: solo en "Todas")

  -- P1: "Todas" (superadmin)
  r := pg_temp.panel(su, v_shu, hoy, hoy, null);
  i := r->'indicadores';
  if not (r->>'programa_activo')::boolean then raise exception 'FALLO P1a: programa_activo'; end if;
  if (i->>'codigos')::int <> 8 then raise exception 'FALLO P1b: códigos %', i->>'codigos'; end if;
  if (i->>'registrados')::int <> 6 or (i->>'compraron')::int <> 4 or (i->>'conversion')::numeric <> 66.7 then raise exception 'FALLO P1c: registrados/compraron/conversión %', i; end if;
  if (i->>'ventas_n')::int <> 4 or (i->>'ventas_total')::numeric <> 630 or (i->>'ticket')::numeric <> 157.5 then raise exception 'FALLO P1d: ventas %', i; end if;
  if (i->>'descuentos')::numeric <> 40 or (i->>'pendientes')::numeric <> 10 then raise exception 'FALLO P1e: descuentos/pendientes %', i; end if;
  if (i->>'creditos_generados')::numeric <> 35 or (i->>'creditos_usados')::numeric <> 8 or (i->>'creditos_vencidos')::numeric <> 5 then raise exception 'FALLO P1f: créditos %', i; end if;
  if (i->>'bonos_n')::int <> 0 or (i->>'bonos_monto')::numeric <> 0 then raise exception 'FALLO P1g: bonos %', i; end if;
  -- P2/P3: costo = descuentos + créditos USADOS (no lo generado, no lo vencido); F anulada no cuenta
  if (i->>'costo')::numeric <> 48 or (i->>'resultado')::numeric <> 582 or (i->>'costo_pct')::numeric <> 7.6 then raise exception 'FALLO P3: costo/resultado %', i; end if;

  -- P4: ranking de "Todas": A primero (2 exitosos, $440 en ventas), luego A2
  if (r->>'ranking_total')::int <> 2 then raise exception 'FALLO P4a: ranking_total %', r->>'ranking_total'; end if;
  if (r->'ranking'->0->>'paciente_id')::uuid <> a or (r->'ranking'->0->>'exitosos')::int <> 2 or (r->'ranking'->0->>'ventas')::numeric <> 440
     or (r->'ranking'->0->>'credito_ganado')::numeric <> 20 or (r->'ranking'->0->>'disponible')::numeric <> 12
     or r->'ranking'->0->>'codigo' <> ca then
    raise exception 'FALLO P4b: fila de A %', r->'ranking'->0;
  end if;
  if (r->'ranking'->1->>'paciente_id')::uuid <> a2 or (r->'ranking'->1->>'exitosos')::int <> 1 or (r->'ranking'->1->>'ventas')::numeric <> 190 then
    raise exception 'FALLO P4c: fila de A2 %', r->'ranking'->1;
  end if;

  -- P5/P6: sucursal Matriz (el referido D sin venta cuenta por quien lo registró; C de Sacha no cuenta)
  i := pg_temp.panel(su, v_shu, hoy, hoy, s_mat)->'indicadores';
  if (i->>'registrados')::int <> 5 or (i->>'compraron')::int <> 3 or (i->>'ventas_n')::int <> 3 or (i->>'ventas_total')::numeric <> 440 then raise exception 'FALLO P5a: matriz %', i; end if;
  if (i->>'descuentos')::numeric <> 30 or (i->>'pendientes')::numeric <> 10 or (i->>'creditos_generados')::numeric <> 20 then raise exception 'FALLO P5b: matriz %', i; end if;
  if (i->>'creditos_usados')::numeric <> 8 or (i->>'creditos_vencidos')::numeric <> 0 or (i->>'costo')::numeric <> 38 or (i->>'resultado')::numeric <> 402 then raise exception 'FALLO P5c: matriz %', i; end if;
  -- Sacha
  i := pg_temp.panel(su, v_shu, hoy, hoy, s_sac)->'indicadores';
  if (i->>'registrados')::int <> 1 or (i->>'compraron')::int <> 1 or (i->>'ventas_total')::numeric <> 190 or (i->>'descuentos')::numeric <> 10
     or (i->>'pendientes')::numeric <> 0 or (i->>'creditos_generados')::numeric <> 10 or (i->>'creditos_usados')::numeric <> 0 or (i->>'costo')::numeric <> 10 or (i->>'resultado')::numeric <> 180 then
    raise exception 'FALLO P6: Sacha %', i;
  end if;

  -- P7: el administrador de Sacha queda forzado a su sucursal aunque pida otra o "todas"
  r := pg_temp.panel(adm_sac, v_shu, hoy, hoy, s_mat);
  if (r->>'sucursal')::uuid <> s_sac or (r->'indicadores'->>'registrados')::int <> 1 or jsonb_array_length(r->'sucursales') <> 1 then raise exception 'FALLO P7a: forzado a Sacha %', r; end if;
  r := pg_temp.panel(adm_sac, v_shu, hoy, hoy, null);
  if (r->>'sucursal')::uuid <> s_sac or (r->'indicadores'->>'ventas_total')::numeric <> 190 then raise exception 'FALLO P7b: "todas" forzado a Sacha %', r; end if;
  -- la superadmin ve las dos sucursales en la lista
  if jsonb_array_length(pg_temp.panel(su, v_shu, hoy, hoy, null)->'sucursales') <> 2 then raise exception 'FALLO P7c: sucursales de la superadmin'; end if;

  -- P8: accesos
  perform pg_temp.panel_falla('P8a', 'No autorizado', vend, v_shu, hoy, hoy);            -- vendedor
  perform pg_temp.panel_falla('P8b', 'No autorizado', adm_focus, v_shu, hoy, hoy);       -- administrador de OTRA óptica
  perform pg_temp.panel_falla('P8c', 'no pertenece', su, v_shu, hoy, hoy, s_foc);        -- sucursal de otra óptica
  perform pg_temp.panel_falla('P8d', 'fecha inicial', su, v_shu, hoy, hoy - 1);          -- desde > hasta
  perform pg_temp.panel_falla('P8e', '366 días', su, v_shu, hoy - 400, hoy);             -- más de 366 días

  -- P9: frontera del día en Ecuador: aplicado el 10-oct a las 23:30 (-05) pertenece al 10, no al 11
  update public.referidos set aplicado_en = timestamptz '2026-10-10 23:30:00-05' where venta_id = se;
  i := pg_temp.panel(su, v_shu, date '2026-10-10', date '2026-10-10', null)->'indicadores';
  if (i->>'ventas_n')::int <> 1 or (i->>'ventas_total')::numeric <> 110 then raise exception 'FALLO P9a: el 10-oct %', i; end if;
  i := pg_temp.panel(su, v_shu, date '2026-10-11', date '2026-10-11', null)->'indicadores';
  if (i->>'ventas_n')::int <> 0 then raise exception 'FALLO P9b: el 11-oct %', i; end if;

  -- P10: detalle de A (superadmin) y de Sacha (administrador de Sacha)
  det := pg_temp.detalle(su, v_shu, a, hoy, hoy, null);
  if det->'referidor'->>'codigo' <> ca or jsonb_array_length(det->'referidos') <> 5 then raise exception 'FALLO P10a: referidos de A %', det->'referidos'; end if;
  if (det->'resumen'->>'exitosos')::int <> 2 or (det->'resumen'->>'en_espera')::int <> 1 or (det->'resumen'->>'disponible')::numeric <> 12 then raise exception 'FALLO P10b: resumen %', det->'resumen'; end if;
  if not exists (select 1 from jsonb_array_elements(det->'movimientos') m where m->>'tipo' = 'uso' and (m->>'monto')::numeric = -8) then raise exception 'FALLO P10c: falta el uso de $8'; end if;
  if not exists (select 1 from jsonb_array_elements(det->'referidos') x where x->>'estado' = 'revertido') then raise exception 'FALLO P10d: falta el referido revertido en el detalle'; end if;
  det := pg_temp.detalle(adm_sac, v_shu, a, hoy, hoy, null);
  if jsonb_array_length(det->'referidos') <> 1 then raise exception 'FALLO P10e: el administrador de Sacha vio % referidos', jsonb_array_length(det->'referidos'); end if;
  begin
    perform pg_temp.detalle(vend, v_shu, a, hoy, hoy, null);
    raise exception 'FALLO P10f: un vendedor abrió el detalle';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- P11: óptica sin datos: ceros y sin errores (administrador de Focus); luego programa apagado
  r := pg_temp.panel(adm_focus, v_focus, hoy, hoy, null);
  i := r->'indicadores';
  if (i->>'registrados')::int <> 0 or (i->>'ventas_total')::numeric <> 0 or (i->>'costo')::numeric <> 0 or i->'conversion' <> 'null'::jsonb or i->'ticket' <> 'null'::jsonb or i->'costo_pct' <> 'null'::jsonb
     or r->'ranking' <> '[]'::jsonb or (r->>'ranking_total')::int <> 0 then
    raise exception 'FALLO P11a: Focus sin datos %', r;
  end if;
  update public.programas_referidos set activo = false where empresa_id = v_focus;
  r := pg_temp.panel(adm_focus, v_focus, hoy, hoy, null);
  if (r->>'programa_activo')::boolean then raise exception 'FALLO P11b: el programa apagado figura activo'; end if;

  raise exception 'PRUEBAS_OK: panel de referidos (P1-P11)';
end $$;
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Mandar `[preludio] + [este archivo]` sin migración.
Expected: error `function public.panel_referidos(uuid, date, date, uuid) does not exist` (o `PRELUDIO7` si falta un dato de prueba; en ese caso corregir solo el dato, no el caso).

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/20261015160000_referidos_panel.sql`:

```sql
-- Referidos y recompensas, fase 2: funciones de solo lectura del panel del CRM.
-- Diseño: docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md

-- Valida rol, período y sucursal. Devuelve el programa, la sucursal efectiva y el intervalo [ini, fin) en hora de Ecuador.
create or replace function app_private.contexto_panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid)
returns table (o_programa uuid, o_sucursal uuid, o_ini timestamptz, o_fin timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_rol text; v_prog uuid; v_suc uuid;
begin
  v_rol := public.rol_referidos(p_empresa);
  if v_rol is null or v_rol not in ('superadmin', 'admin_sucursal') then raise exception 'No autorizado'; end if;
  if p_desde is null or p_hasta is null then raise exception 'Indica el período (desde y hasta).'; end if;
  if p_desde > p_hasta then raise exception 'La fecha inicial no puede ser posterior a la fecha final.'; end if;
  if p_hasta - p_desde > 365 then raise exception 'El período no puede superar 366 días.'; end if;
  select id into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if v_rol = 'admin_sucursal' then
    select u.sucursal_id into v_suc from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;
    if v_suc is null then raise exception 'Tu usuario no tiene sucursal asignada.'; end if;
  else
    v_suc := p_sucursal;
  end if;
  if v_suc is not null and not exists (select 1 from public.sucursales s where s.id = v_suc and s.empresa_id = p_empresa) then
    raise exception 'La sucursal no pertenece a esta óptica.';
  end if;
  return query select v_prog, v_suc, (p_desde::timestamp at time zone 'America/Guayaquil'), ((p_hasta + 1)::timestamp at time zone 'America/Guayaquil');
end $$;
revoke all on function app_private.contexto_panel_referidos(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public.panel_referidos(p_empresa uuid, p_desde date, p_hasta date, p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record; v_prog public.programas_referidos; v_rol text;
  v_ind jsonb; v_rank jsonb; v_total integer; v_sucs jsonb;
  v_reg numeric; v_comp numeric; v_vn numeric; v_vt numeric; v_desc numeric; v_usados numeric; v_costo numeric;
begin
  select * into c from app_private.contexto_panel_referidos(p_empresa, p_desde, p_hasta, p_sucursal);
  select * into v_prog from public.programas_referidos where id = c.o_programa;
  v_rol := public.rol_referidos(p_empresa);

  with refs as (
    select rf.id, rf.estado, rf.creado_en, rf.aplicado_en, rf.pagado_en, rf.venta_id, rf.descuento_aplicado, rf.credito_a_otorgar,
           rf.referidor_paciente_id, v.total as venta_total, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa
  ), r as (
    select * from refs where c.o_sucursal is null or suc = c.o_sucursal
  ), mov as (
    select m.tipo, m.monto, m.paciente_id, coalesce(vm.sucursal_id, vl.sucursal_id) as suc, vm.estado as venta_estado
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.creado_en >= c.o_ini and m.creado_en < c.o_fin
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  ), act as (
    select r.referidor_paciente_id as pid,
           count(*) filter (where r.estado = 'recompensado' and r.pagado_en >= c.o_ini and r.pagado_en < c.o_fin) as exitosos,
           coalesce(sum(r.venta_total) filter (where r.aplicado_en >= c.o_ini and r.aplicado_en < c.o_fin and r.estado <> 'revertido'), 0) as ventas
    from r
    where (r.creado_en >= c.o_ini and r.creado_en < c.o_fin) or (r.aplicado_en >= c.o_ini and r.aplicado_en < c.o_fin) or (r.pagado_en >= c.o_ini and r.pagado_en < c.o_fin)
    group by r.referidor_paciente_id
  ), gan as (
    select paciente_id as pid, sum(monto) as ganado from mv where tipo in ('credito', 'bono_hito') group by paciente_id
  )
  select
    jsonb_build_object(
      'codigos', (select count(*) from public.codigos_referido where programa_id = c.o_programa),
      'registrados', (select count(*) from r where creado_en >= c.o_ini and creado_en < c.o_fin),
      'compraron', (select count(*) from r where creado_en >= c.o_ini and creado_en < c.o_fin and venta_id is not null and estado <> 'revertido'),
      'ventas_n', (select count(*) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'ventas_total', (select coalesce(sum(venta_total), 0) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'descuentos', (select coalesce(sum(descuento_aplicado), 0) from r where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
      'pendientes', (select coalesce(sum(credito_a_otorgar), 0) from r where estado = 'en_pago'),
      'creditos_generados', (select coalesce(sum(monto), 0) from mv where tipo in ('credito', 'ajuste') and monto > 0),
      'creditos_usados', (select coalesce(-sum(monto), 0) from mv where tipo = 'uso' and venta_estado is distinct from 'anulada'),
      'creditos_vencidos', (select coalesce(-sum(monto), 0) from mv where tipo = 'vencimiento'),
      'bonos_n', (select count(*) from mv where tipo = 'bono_hito'),
      'bonos_monto', (select coalesce(sum(monto), 0) from mv where tipo = 'bono_hito')
    ),
    coalesce((select jsonb_agg(to_jsonb(q) order by q.exitosos desc, q.ventas desc, q.nombre) from (
      select a.pid as paciente_id, btrim(pc.nombres || ' ' || pc.apellidos) as nombre, cr.codigo, a.exitosos, a.ventas,
             coalesce(g.ganado, 0) as credito_ganado, app_private.saldo_disponible_monedero(c.o_programa, a.pid) as disponible
      from act a
      join public.pacientes_clinicos pc on pc.id = a.pid
      left join public.codigos_referido cr on cr.programa_id = c.o_programa and cr.paciente_id = a.pid
      left join gan g on g.pid = a.pid
      order by a.exitosos desc, a.ventas desc, btrim(pc.nombres || ' ' || pc.apellidos)
      limit 20) q), '[]'::jsonb),
    (select count(*) from act)
  into v_ind, v_rank, v_total;

  v_reg := (v_ind->>'registrados')::numeric; v_comp := (v_ind->>'compraron')::numeric;
  v_vn := (v_ind->>'ventas_n')::numeric; v_vt := (v_ind->>'ventas_total')::numeric;
  v_desc := (v_ind->>'descuentos')::numeric; v_usados := (v_ind->>'creditos_usados')::numeric;
  v_costo := v_desc + v_usados;
  v_ind := v_ind || jsonb_build_object(
    'conversion', case when v_reg > 0 then round(100.0 * v_comp / v_reg, 1) end,
    'ticket', case when v_vn > 0 then round(v_vt / v_vn, 2) end,
    'costo', v_costo,
    'resultado', v_vt - v_costo,
    'costo_pct', case when v_vt > 0 then round(100.0 * v_costo / v_vt, 1) end);

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre), '[]'::jsonb) into v_sucs
  from public.sucursales s where s.empresa_id = p_empresa and (v_rol = 'superadmin' or s.id = c.o_sucursal);

  return jsonb_build_object('programa_activo', coalesce(v_prog.activo, false), 'nombre', v_prog.nombre,
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta), 'sucursal', c.o_sucursal, 'sucursales', v_sucs,
    'indicadores', v_ind, 'ranking', v_rank, 'ranking_total', v_total);
end $$;
revoke all on function public.panel_referidos(uuid, date, date, uuid) from public, anon;
grant execute on function public.panel_referidos(uuid, date, date, uuid) to authenticated;

create or replace function public.panel_referidos_detalle(p_empresa uuid, p_referidor uuid, p_desde date, p_hasta date, p_sucursal uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; v_nombre text; v_codigo text; v_res jsonb; v_refs jsonb; v_movs jsonb;
begin
  select * into c from app_private.contexto_panel_referidos(p_empresa, p_desde, p_hasta, p_sucursal);
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_referidor and empresa_id = p_empresa) then
    raise exception 'Esa persona no pertenece a esta óptica.';
  end if;
  select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = p_referidor;
  select codigo into v_codigo from public.codigos_referido where programa_id = c.o_programa and paciente_id = p_referidor;

  with refs as (
    select rf.id, rf.estado, rf.creado_en, rf.aplicado_en, rf.pagado_en, rf.descuento_aplicado, rf.credito_a_otorgar, rf.referido_paciente_id,
           v.total as venta_total, v.folio, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa and rf.referidor_paciente_id = p_referidor
  ), rs as (
    select * from refs where (c.o_sucursal is null or suc = c.o_sucursal)
      and ((creado_en >= c.o_ini and creado_en < c.o_fin) or (aplicado_en >= c.o_ini and aplicado_en < c.o_fin) or (pagado_en >= c.o_ini and pagado_en < c.o_fin))
  )
  select coalesce(jsonb_agg(jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'estado', rs.estado, 'creado_en', rs.creado_en,
           'aplicado_en', rs.aplicado_en, 'venta_total', rs.venta_total, 'folio', rs.folio, 'sucursal', s.nombre,
           'descuento', rs.descuento_aplicado, 'credito', rs.credito_a_otorgar) order by rs.creado_en desc, rs.id), '[]'::jsonb)
  into v_refs
  from rs join public.pacientes_clinicos pc on pc.id = rs.referido_paciente_id left join public.sucursales s on s.id = rs.suc;

  with mov as (
    select m.id, m.tipo, m.monto, m.vence_en, m.motivo, m.creado_en, m.referido_id, vm.estado as venta_estado, coalesce(vm.sucursal_id, vl.sucursal_id) as suc
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.paciente_id = p_referidor
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc, x.id desc), '[]'::jsonb)
  into v_movs
  from (select mv.id, mv.tipo, mv.monto, mv.vence_en, mv.motivo, mv.creado_en,
               (select btrim(pc.nombres || ' ' || pc.apellidos) from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id where rf.id = mv.referido_id) as referido
        from mv order by mv.creado_en desc, mv.id desc limit 50) x;

  v_movs := (select coalesce(jsonb_agg(e - 'id' order by ord), '[]'::jsonb) from jsonb_array_elements(v_movs) with ordinality as t(e, ord));

  with mov as (
    select m.tipo, m.monto, m.creado_en, vm.estado as venta_estado, coalesce(vm.sucursal_id, vl.sucursal_id) as suc
    from public.monedero_movimientos m
    left join public.ventas vm on vm.id = m.venta_id
    left join public.monedero_movimientos lt on lt.id = m.lote_id
    left join public.ventas vl on vl.id = lt.venta_id
    where m.programa_id = c.o_programa and m.paciente_id = p_referidor
      and m.creado_en >= c.o_ini and m.creado_en < c.o_fin
  ), mv as (
    select * from mov where c.o_sucursal is null or suc = c.o_sucursal
  ), refs as (
    select rf.estado, rf.aplicado_en, rf.pagado_en, rf.credito_a_otorgar, v.total as venta_total, coalesce(v.sucursal_id, ur.sucursal_id) as suc
    from public.referidos rf
    left join public.ventas v on v.id = rf.venta_id
    left join public.usuarios ur on ur.id = rf.registrado_por
    where rf.programa_id = c.o_programa and rf.referidor_paciente_id = p_referidor
  ), rs as (
    select * from refs where c.o_sucursal is null or suc = c.o_sucursal
  )
  select jsonb_build_object(
    'exitosos', (select count(*) from rs where estado = 'recompensado' and pagado_en >= c.o_ini and pagado_en < c.o_fin),
    'en_espera', (select count(*) from rs where estado = 'en_pago'),
    'ventas', (select coalesce(sum(venta_total), 0) from rs where aplicado_en >= c.o_ini and aplicado_en < c.o_fin and estado <> 'revertido'),
    'credito_ganado', (select coalesce(sum(monto), 0) from mv where tipo in ('credito', 'bono_hito', 'ajuste') and monto > 0),
    'credito_usado', (select coalesce(-sum(monto), 0) from mv where tipo = 'uso' and venta_estado is distinct from 'anulada'),
    'credito_vencido', (select coalesce(-sum(monto), 0) from mv where tipo = 'vencimiento'),
    'disponible', app_private.saldo_disponible_monedero(c.o_programa, p_referidor))
  into v_res;

  return jsonb_build_object('referidor', jsonb_build_object('paciente_id', p_referidor, 'nombre', v_nombre, 'codigo', v_codigo),
    'resumen', v_res, 'referidos', v_refs, 'movimientos', v_movs);
end $$;
revoke all on function public.panel_referidos_detalle(uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.panel_referidos_detalle(uuid, uuid, date, date, uuid) to authenticated;
```

Notas para quien implemente: en los `with` de `panel_referidos_detalle` el nombre `mov`/`mv`/`refs`/`rs` se reutiliza en sentencias distintas (no hay conflicto). La línea que reordena `v_movs` con `jsonb_array_elements ... with ordinality` quita la clave `id` auxiliar sin perder el orden; si prefieres, puedes dejar `id` en el JSON (la pantalla lo ignora) y borrar esa línea y el `- 'id'`.

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Mandar `[migración] + [preludio] + [prueba]`.
Expected: error `PRUEBAS_OK: panel de referidos (P1-P11)`. Si un caso falla, decidir si el defecto está en la migración o en el caso; corregir lo mínimo conservando la intención; documentar cualquier cambio y su motivo en el informe. **No** llamar a `apply_migration` ni ejecutar nada fuera del arnés.

- [ ] **Step 5: Commit (el controlador aplica después la migración y corre `get_advisors`)**

```bash
git add supabase/migrations/20261015160000_referidos_panel.sql supabase/tests/referidos_07_panel.sql
git commit -m "feat(referidos): funciones de solo lectura del panel del CRM (fase 2)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos y funciones puras del panel

**Files:**
- Create: `lib/referidos-panel.ts`
- Test: `tests/referidos-panel.test.cjs`

**Interfaces:**
- Produces (todo exportado desde `lib/referidos-panel.ts`, sin importar nada del servidor):
  - tipos `IndicadoresPanel`, `FilaRanking`, `PanelReferidos`, `DetalleReferidor` (claves idénticas a los JSON de la Task 1);
  - `hoyEcuador(ahora?: Date): string` → `AAAA-MM-DD`;
  - `type AtajoPeriodo = "este_mes" | "mes_pasado" | "ultimos_30"`;
  - `atajoPeriodo(clave: AtajoPeriodo, ahora?: Date): { desde: string; hasta: string }`;
  - `periodoPorDefecto(ahora?: Date): { desde: string; hasta: string }` (= `este_mes`);
  - `periodoValido(desde?: string | null, hasta?: string | null): { desde: string; hasta: string } | null` (formato `AAAA-MM-DD`, fecha real, `desde <= hasta`, máximo 366 días);
  - `porcentaje(n: number | null | undefined): string` (`"66,7 %"` o `"—"`);
  - `dineroPanel(n: number | null | undefined): string` (`"$1.234,50"`? **no**: usa `$` + 2 decimales con punto, como el resto de LumOS: `"$630.00"`; `"—"` si es nulo).

- [ ] **Step 1: Escribir la prueba que falla**

Create `tests/referidos-panel.test.cjs`:

```js
// Run with: node --test tests/referidos-panel.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const filename = path.resolve(__dirname, '../lib', file + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => load(name.replace('./', '').replace('@/lib/', '')), module, module.exports);
  return module.exports;
}

const { hoyEcuador, atajoPeriodo, periodoPorDefecto, periodoValido, porcentaje, dineroPanel } = load('referidos-panel');

test('hoyEcuador usa la fecha de Ecuador y no la de UTC', () => {
  // 03:00 UTC del 15-oct = 22:00 del 14-oct en Ecuador
  assert.equal(hoyEcuador(new Date('2026-10-15T03:00:00Z')), '2026-10-14');
  assert.equal(hoyEcuador(new Date('2026-10-15T05:00:00Z')), '2026-10-15');
});

test('periodo por defecto = del 1 del mes hasta hoy (Ecuador)', () => {
  assert.deepEqual(periodoPorDefecto(new Date('2026-10-15T03:00:00Z')), { desde: '2026-10-01', hasta: '2026-10-14' });
});

test('atajos: este mes, mes pasado (incluye enero) y últimos 30 días', () => {
  const ahora = new Date('2026-10-15T03:00:00Z');
  assert.deepEqual(atajoPeriodo('este_mes', ahora), { desde: '2026-10-01', hasta: '2026-10-14' });
  assert.deepEqual(atajoPeriodo('mes_pasado', ahora), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(atajoPeriodo('ultimos_30', ahora), { desde: '2026-09-15', hasta: '2026-10-14' });
  assert.deepEqual(atajoPeriodo('mes_pasado', new Date('2026-01-05T15:00:00Z')), { desde: '2025-12-01', hasta: '2025-12-31' });
  assert.deepEqual(atajoPeriodo('mes_pasado', new Date('2026-03-10T15:00:00Z')), { desde: '2026-02-01', hasta: '2026-02-28' });
});

test('periodoValido acepta fechas reales y rechaza lo demás', () => {
  assert.deepEqual(periodoValido('2026-10-01', '2026-10-31'), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.equal(periodoValido('2026-10-05', '2026-10-01'), null);
  assert.equal(periodoValido('2026-13-01', '2026-13-02'), null);
  assert.equal(periodoValido('2026-02-30', '2026-03-01'), null);
  assert.equal(periodoValido('hola', '2026-10-01'), null);
  assert.equal(periodoValido(undefined, '2026-10-01'), null);
  assert.equal(periodoValido('2025-01-01', '2026-10-01'), null);
  assert.deepEqual(periodoValido('2026-01-01', '2026-12-31'), { desde: '2026-01-01', hasta: '2026-12-31' });
});

test('formato de porcentaje y dinero', () => {
  assert.equal(porcentaje(66.7), '66,7 %');
  assert.equal(porcentaje(null), '—');
  assert.equal(porcentaje(undefined), '—');
  assert.equal(dineroPanel(630), '$630.00');
  assert.equal(dineroPanel(157.5), '$157.50');
  assert.equal(dineroPanel(null), '—');
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `node --test tests/referidos-panel.test.cjs`
Expected: FAIL (`ENOENT … lib/referidos-panel.ts`).

- [ ] **Step 3: Implementar**

Create `lib/referidos-panel.ts`:

```ts
// Tipos y funciones puras del panel de referidos (sin dependencias del servidor: se importan también desde pantallas de cliente).

export type IndicadoresPanel = {
  codigos: number; registrados: number; compraron: number; conversion: number | null;
  ventas_n: number; ventas_total: number; ticket: number | null; descuentos: number; pendientes: number;
  creditos_generados: number; creditos_usados: number; creditos_vencidos: number; bonos_n: number; bonos_monto: number;
  costo: number; resultado: number; costo_pct: number | null;
};
export type FilaRanking = { paciente_id: string; nombre: string; codigo: string | null; exitosos: number; ventas: number; credito_ganado: number; disponible: number };
export type PanelReferidos = {
  programa_activo: boolean; nombre: string | null; periodo: { desde: string; hasta: string }; sucursal: string | null;
  sucursales: { id: string; nombre: string }[]; indicadores: IndicadoresPanel; ranking: FilaRanking[]; ranking_total: number;
};
export type DetalleReferidor = {
  referidor: { paciente_id: string; nombre: string; codigo: string | null };
  resumen: { exitosos: number; en_espera: number; ventas: number; credito_ganado: number; credito_usado: number; credito_vencido: number; disponible: number };
  referidos: { nombre: string; estado: string; creado_en: string; aplicado_en: string | null; venta_total: number | null; folio: number | null; sucursal: string | null; descuento: number; credito: number }[];
  movimientos: { tipo: string; monto: number; vence_en: string | null; motivo: string | null; creado_en: string; referido: string | null }[];
};

export type Periodo = { desde: string; hasta: string };
export type AtajoPeriodo = "este_mes" | "mes_pasado" | "ultimos_30";

const MS_DIA = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const aTexto = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const aFecha = (texto: string) => new Date(`${texto}T00:00:00Z`);

// Fecha de hoy en Ecuador (UTC-5), no la de UTC.
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function atajoPeriodo(clave: AtajoPeriodo, ahora: Date = new Date()): Periodo {
  const hoy = aFecha(hoyEcuador(ahora));
  const primero = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 1));
  if (clave === "este_mes") return { desde: aTexto(primero(hoy.getUTCFullYear(), hoy.getUTCMonth())), hasta: aTexto(hoy) };
  if (clave === "mes_pasado") {
    const inicio = primero(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1);
    const fin = new Date(primero(hoy.getUTCFullYear(), hoy.getUTCMonth()).getTime() - MS_DIA);
    return { desde: aTexto(inicio), hasta: aTexto(fin) };
  }
  return { desde: aTexto(new Date(hoy.getTime() - 29 * MS_DIA)), hasta: aTexto(hoy) };
}

export const periodoPorDefecto = (ahora: Date = new Date()): Periodo => atajoPeriodo("este_mes", ahora);

// Acepta solo fechas reales AAAA-MM-DD, con desde <= hasta y un máximo de 366 días.
export function periodoValido(desde?: string | null, hasta?: string | null): Periodo | null {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!desde || !hasta || !formato.test(desde) || !formato.test(hasta)) return null;
  const a = aFecha(desde); const b = aFecha(hasta);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || aTexto(a) !== desde || aTexto(b) !== hasta) return null;
  const dias = (b.getTime() - a.getTime()) / MS_DIA;
  if (dias < 0 || dias > 365) return null;
  return { desde, hasta };
}

export const porcentaje = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1).replace(".", ",")} %`;

export const dineroPanel = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `$${Number(n).toFixed(2)}`;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `node --test tests/referidos-panel.test.cjs && npx tsc --noEmit`
Expected: 5 pruebas PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add lib/referidos-panel.ts tests/referidos-panel.test.cjs
git commit -m "feat(referidos): tipos y funciones puras del panel (períodos de Ecuador, formato)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cargador, acción del servidor y página

**Files:**
- Create: `lib/referidos-panel-data.ts`
- Create: `app/crm/referidos/actions.ts`
- Create: `app/crm/referidos/page.tsx`

**Interfaces:**
- Consumes: Task 1 (`panel_referidos`, `panel_referidos_detalle`), Task 2 (tipos y `periodoValido`/`periodoPorDefecto`), `getOperationalContext()` de `lib/operational-context.ts` (devuelve `{ profile: { rol, sucursalPrincipalId }, activeCompany: { id, nombre }, accessibleBranches }`).
- Produces:
  - `getPanelReferidos(params: { desde?: string; hasta?: string; sucursal?: string }): Promise<PanelData>` donde `PanelData = { status: "ready" | "needs_login" | "forbidden" | "error"; message?: string; empresaId?: string; empresaNombre?: string; periodo?: Periodo; sucursalId?: string; panel?: PanelReferidos }` (`sucursalId` = `"todas"` o un id).
  - `obtenerDetalleReferidor(args: { empresaId: string; referidorId: string; desde: string; hasta: string; sucursalId: string | null }): Promise<DetalleReferidor>`.

- [ ] **Step 1: Escribir el cargador**

Create `lib/referidos-panel-data.ts`:

```ts
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import { periodoPorDefecto, periodoValido, type PanelReferidos, type Periodo } from "@/lib/referidos-panel";

export type PanelData = {
  status: "ready" | "needs_login" | "forbidden" | "error"; message?: string;
  empresaId?: string; empresaNombre?: string; periodo?: Periodo; sucursalId?: string; panel?: PanelReferidos;
};

const rolesPanel = new Set(["superadmin", "admin_sucursal"]);

export async function getPanelReferidos(params: { desde?: string; hasta?: string; sucursal?: string }): Promise<PanelData> {
  if (!hasSupabaseConfiguration()) return { status: "error", message: "Falta configurar la conexión segura." };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver el panel de referidos." };
    if (!rolesPanel.has(context.profile.rol)) return { status: "forbidden", message: "Tu perfil no tiene acceso al panel de referidos." };
    const empresaId = context.activeCompany.id;
    const periodo = periodoValido(params.desde, params.hasta) ?? periodoPorDefecto();
    const sucursalPedida = params.sucursal && params.sucursal !== "todas" ? params.sucursal : null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("panel_referidos", { p_empresa: empresaId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: sucursalPedida });
    if (error) return { status: "error", message: error.message || "No se pudo cargar el panel de referidos." };
    const panel = data as PanelReferidos;
    return { status: "ready", empresaId, empresaNombre: context.activeCompany.nombre, periodo, sucursalId: panel.sucursal ?? "todas", panel };
  } catch {
    return { status: "error", message: "No se pudo cargar el panel de referidos." };
  }
}
```

- [ ] **Step 2: Escribir la acción del detalle**

Create `app/crm/referidos/actions.ts`:

```ts
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { periodoValido, type DetalleReferidor } from "@/lib/referidos-panel";

export async function obtenerDetalleReferidor(args: { empresaId: string; referidorId: string; desde: string; hasta: string; sucursalId: string | null }): Promise<DetalleReferidor> {
  const periodo = periodoValido(args.desde, args.hasta);
  if (!periodo) throw new Error("El período no es válido.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("panel_referidos_detalle", {
    p_empresa: args.empresaId, p_referidor: args.referidorId, p_desde: periodo.desde, p_hasta: periodo.hasta, p_sucursal: args.sucursalId,
  });
  if (error) throw new Error(error.message && !error.message.startsWith("permission denied") ? error.message : "No se pudo cargar el detalle.");
  return data as DetalleReferidor;
}
```

- [ ] **Step 3: Escribir la página**

Create `app/crm/referidos/page.tsx`:

```tsx
import { getPanelReferidos } from "@/lib/referidos-panel-data";
import PanelBoard from "./panel-board";

export const dynamic = "force-dynamic";

export default async function PanelReferidosPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const query = await searchParams;
  return <PanelBoard {...await getPanelReferidos(query)} />;
}
```

(La página importa `./panel-board` que se crea en la Task 4; hasta entonces `tsc` fallará por ese import: hacer el commit de esta tarea **junto con la Task 4**, o crear primero un `panel-board.tsx` mínimo `export default function PanelBoard(_props: PanelData) { return null; }` y reemplazarlo en la Task 4.)

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores (con el `panel-board.tsx` mínimo del paso anterior).

- [ ] **Step 5: Commit**

```bash
git add lib/referidos-panel-data.ts app/crm/referidos/actions.ts app/crm/referidos/page.tsx app/crm/referidos/panel-board.tsx
git commit -m "feat(referidos): cargador, acción del detalle y página del panel de referidos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tablero (filtros, tarjetas, ranking y detalle)

**Files:**
- Modify (reemplazar el mínimo de la Task 3): `app/crm/referidos/panel-board.tsx`

**Interfaces:**
- Consumes: `PanelData` (Task 3), tipos, `atajoPeriodo`, `porcentaje`, `dineroPanel` (Task 2), `obtenerDetalleReferidor` (Task 3), `estadoReferidoLabel` y `tipoMovimientoLabel` de `lib/referidos-textos.ts`.
- Produces: `export default function PanelBoard(props: PanelData)`.

- [ ] **Step 1: Escribir el tablero**

Replace `app/crm/referidos/panel-board.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { FolderOpen, Gift, Users, X } from "lucide-react";
import type { PanelData } from "@/lib/referidos-panel-data";
import { atajoPeriodo, dineroPanel, porcentaje, type AtajoPeriodo, type DetalleReferidor, type FilaRanking } from "@/lib/referidos-panel";
import { estadoReferidoLabel, tipoMovimientoLabel } from "@/lib/referidos-textos";
import { obtenerDetalleReferidor } from "./actions";

const fecha = (iso: string | null) => iso ? new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)) : "—";
const atajos: { clave: AtajoPeriodo; etiqueta: string }[] = [{ clave: "este_mes", etiqueta: "Este mes" }, { clave: "mes_pasado", etiqueta: "Mes pasado" }, { clave: "ultimos_30", etiqueta: "Últimos 30 días" }];
const enlace = (desde: string, hasta: string, sucursal: string) => `/crm/referidos?desde=${desde}&hasta=${hasta}&sucursal=${sucursal}`;
type Orden = "exitosos" | "ventas" | "credito_ganado" | "disponible";

export default function PanelBoard(props: PanelData) {
  const [orden, setOrden] = useState<Orden>("exitosos");
  const [detalle, setDetalle] = useState<DetalleReferidor | null>(null);
  const [error, setError] = useState("");
  const [cargando, startCargando] = useTransition();
  const filas = useMemo(() => [...(props.panel?.ranking ?? [])].sort((a, b) => Number(b[orden]) - Number(a[orden]) || a.nombre.localeCompare(b.nombre, "es")), [props.panel, orden]);

  if (props.status !== "ready" || !props.panel || !props.periodo) {
    return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/crm">← CRM</Link><p className="eyebrow">REFERIDOS</p><h1>Panel de referidos</h1><p className="subtitle">{props.message ?? "No se pudo cargar."}</p></div></header></div></main>;
  }
  const { panel, periodo } = props;
  const ind = panel.indicadores;
  const sucursal = props.sucursalId ?? "todas";
  const abrir = (fila: FilaRanking) => startCargando(async () => {
    setError("");
    try { setDetalle(await obtenerDetalleReferidor({ empresaId: props.empresaId ?? "", referidorId: fila.paciente_id, desde: periodo.desde, hasta: periodo.hasta, sucursalId: sucursal === "todas" ? null : sucursal })); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el detalle."); }
  });
  const sinDatos = ind.registrados === 0 && ind.ventas_n === 0 && ind.creditos_generados === 0 && ind.creditos_usados === 0;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/crm">← CRM</Link><p className="eyebrow">REFERIDOS · {props.empresaNombre}</p><h1>{panel.nombre ?? "Panel de referidos"}</h1><p className="subtitle">Del {fecha(`${periodo.desde}T12:00:00-05:00`)} al {fecha(`${periodo.hasta}T12:00:00-05:00`)}</p></div></header>

    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs">{atajos.map((a) => { const p = atajoPeriodo(a.clave); return <Link key={a.clave} className={p.desde === periodo.desde && p.hasta === periodo.hasta ? "active" : ""} href={enlace(p.desde, p.hasta, sucursal)}>{a.etiqueta}</Link>; })}</div>
        {panel.sucursales.length > 1 && <div className="tabs">{[{ id: "todas", nombre: "Todas" }, ...panel.sucursales].map((s) => <Link key={s.id} className={sucursal === s.id ? "active" : ""} href={enlace(periodo.desde, periodo.hasta, s.id)}>{s.nombre}</Link>)}</div>}
        <form method="get" action="/crm/referidos" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="sucursal" value={sucursal} />
          <label>Desde <input type="date" name="desde" defaultValue={periodo.desde} required /></label>
          <label>Hasta <input type="date" name="hasta" defaultValue={periodo.hasta} required /></label>
          <button className="outline-action" type="submit">Aplicar</button>
        </form>
      </div>

      {!panel.programa_activo && <p className="notice" role="status">El programa de referidos está apagado en esta óptica. Cuando se encienda, aquí verás los resultados.</p>}
      {panel.programa_activo && sinDatos && <p className="notice" role="status">Todavía no hay referidos en este período.</p>}

      <p className="section-label">RESULTADOS DEL PERÍODO</p>
      <section className="agenda-summary">
        <article><Users size={21} /><strong>{ind.registrados}</strong><span>referidos registrados</span></article>
        <article><Users size={21} /><strong>{ind.compraron}</strong><span>compraron · conversión {porcentaje(ind.conversion)}</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.ventas_total)}</strong><span>ventas atribuidas ({ind.ventas_n}) · ticket {dineroPanel(ind.ticket)}</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.costo)}</strong><span>costo del programa · {porcentaje(ind.costo_pct)} de las ventas</span></article>
        <article><Gift size={21} /><strong>{dineroPanel(ind.resultado)}</strong><span>ventas atribuidas menos costo</span></article>
      </section>
      <section className="agenda-summary">
        <article><strong>{dineroPanel(ind.descuentos)}</strong><span>descuentos de bienvenida</span></article>
        <article><strong>{dineroPanel(ind.creditos_generados)}</strong><span>créditos generados</span></article>
        <article><strong>{dineroPanel(ind.creditos_usados)}</strong><span>créditos y bonos usados</span></article>
        <article><strong>{dineroPanel(ind.pendientes)}</strong><span>créditos pendientes (hoy)</span></article>
        <article><strong>{dineroPanel(ind.creditos_vencidos)}</strong><span>créditos vencidos</span></article>
        <article><strong>{ind.bonos_n} · {dineroPanel(ind.bonos_monto)}</strong><span>bonos entregados</span></article>
        <article><strong>{ind.codigos}</strong><span>pacientes con código (hoy, toda la óptica)</span></article>
      </section>
      <p className="field-hint">Las ventas atribuidas son las de pacientes que llegaron con un código; no se sabe si habrían comprado sin él, por eso no se llaman “nuevas”. El costo suma los descuentos de bienvenida y los créditos y bonos que se usaron en ventas no anuladas; lo generado y aún no usado es una deuda pendiente, no un costo. Registrados y ventas se miden por fechas distintas (registro y venta). El margen exacto llegará cuando LumOS guarde el costo de cada producto.</p>

      <div className="cob-heading"><div><p><strong>Quienes más recomiendan</strong> · {panel.ranking_total} {panel.ranking_total === 1 ? "persona" : "personas"} con actividad{panel.ranking_total > panel.ranking.length ? ` (se muestran ${panel.ranking.length})` : ""}</p></div>
        <label>Ordenar por <select value={orden} onChange={(event) => setOrden(event.target.value as Orden)}><option value="exitosos">Referidos exitosos</option><option value="ventas">Ventas que trajo</option><option value="credito_ganado">Crédito ganado</option><option value="disponible">Crédito disponible</option></select></label></div>
      {error && <p className="notice" role="alert">{error}</p>}
      {filas.length ? <div className="task-list">{filas.map((f) => <article className="task-card" key={f.paciente_id}>
        <div className="task-status"><span className="status-dot" /></div>
        <div className="task-main"><div className="task-meta"><span>{f.codigo ?? "sin código"}</span><span>{f.exitosos} exitosos</span><span>Ventas {dineroPanel(f.ventas)}</span><span>Ganado {dineroPanel(f.credito_ganado)}</span><span>Disponible {dineroPanel(f.disponible)}</span></div><h2>{f.nombre}</h2></div>
        <div className="task-actions"><button className="outline-action" type="button" disabled={cargando} onClick={() => abrir(f)}>Ver detalle</button></div>
      </article>)}</div> : <section className="empty-state"><Users size={27} /><h3>Sin referidores en este período</h3><p>Cuando alguien recomiende y su referido compre, aparecerá aquí.</p></section>}
    </section>

    {detalle && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-label="Detalle del referidor">
      <button className="modal-close" onClick={() => setDetalle(null)} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">REFERIDOR · {detalle.referidor.codigo ?? "sin código"}</p><h2>{detalle.referidor.nombre}</h2>
      <Link className="text-action" href={`/pacientes?buscar=${encodeURIComponent(detalle.referidor.nombre.trim())}`}><FolderOpen size={14} /> Abrir carpeta</Link>
      <div className="task-meta" style={{ gap: 12, margin: "10px 0" }}>
        <span>Exitosos <strong>{detalle.resumen.exitosos}</strong></span><span>En espera <strong>{detalle.resumen.en_espera}</strong></span><span>Ventas <strong>{dineroPanel(detalle.resumen.ventas)}</strong></span>
        <span>Ganado <strong>{dineroPanel(detalle.resumen.credito_ganado)}</strong></span><span>Usado <strong>{dineroPanel(detalle.resumen.credito_usado)}</strong></span><span>Vencido <strong>{dineroPanel(detalle.resumen.credito_vencido)}</strong></span><span>Disponible hoy <strong>{dineroPanel(detalle.resumen.disponible)}</strong></span>
      </div>
      <h3>Sus referidos del período ({detalle.referidos.length})</h3>
      {detalle.referidos.length ? <div className="task-list">{detalle.referidos.map((r, i) => <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{r.nombre}</h2><div className="task-meta"><span>{estadoReferidoLabel(r.estado)}</span><span>{fecha(r.creado_en)}</span>{r.sucursal && <span>{r.sucursal}</span>}{r.venta_total !== null && <span>Venta {dineroPanel(r.venta_total)}{r.folio ? ` · folio ${r.folio}` : ""}</span>}<span>Descuento {dineroPanel(r.descuento)}</span><span>Crédito {dineroPanel(r.credito)}</span></div></div></article>)}</div> : <p className="field-hint">Sin referidos en este período.</p>}
      <h3>Movimientos de su monedero</h3>
      {detalle.movimientos.length ? <div className="task-list">{detalle.movimientos.map((m, i) => <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{tipoMovimientoLabel(m.tipo)}: {Number(m.monto) > 0 ? "+" : "−"}{dineroPanel(Math.abs(Number(m.monto)))}</h2><div className="task-meta"><span>{fecha(m.creado_en)}</span>{m.vence_en && <span>Vence {fecha(m.vence_en)}</span>}{m.referido && <span>Por {m.referido}</span>}{m.motivo && <span>{m.motivo}</span>}</div></div></article>)}</div> : <p className="field-hint">Sin movimientos.</p>}
    </section></div>}
  </div></main>;
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores. (`npm run lint` no funciona en el proyecto.) Opcional: iniciar el servidor con la entrada `ssff-app` de `.claude/launch.json` (preview) solo para confirmar que `/crm/referidos` redirige al inicio de sesión sin errores en los registros; no se puede iniciar sesión: **no afirmar una comprobación visual que no se hizo**.

- [ ] **Step 3: Commit**

```bash
git add app/crm/referidos/panel-board.tsx
git commit -m "feat(referidos): tablero del panel con filtros, indicadores, ranking y detalle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Botón en el CRM, documentación y publicación

**Files:**
- Modify: `lib/crm-labels.ts`, `lib/crm.ts`, `app/crm/crm-board.tsx`
- Modify: `docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md`, `docs/BLUEPRINT.md`

**Interfaces:**
- Consumes: `CrmData` actual (`lib/crm-labels.ts`).
- Produces: `CrmData.puedeVerReferidos?: boolean`.

- [ ] **Step 1: Dato y tipo**

En `lib/crm-labels.ts`, dentro del tipo `CrmData`, justo después de `puedeRestaurar?: boolean;` agregar ` puedeVerReferidos?: boolean;`.

En `lib/crm.ts`, en el `return { status: "ready", … }` reemplazar el final `puedeRestaurar: context.profile.rol === "superadmin" || context.profile.rol === "admin_sucursal" };` por:

```ts
puedeRestaurar: context.profile.rol === "superadmin" || context.profile.rol === "admin_sucursal", puedeVerReferidos: context.profile.rol === "superadmin" || context.profile.rol === "admin_sucursal" };
```

- [ ] **Step 2: Botón en el encabezado**

En `app/crm/crm-board.tsx` (verificar antes con `grep -c 'Nada se envía solo' app/crm/crm-board.tsx` que devuelve `1`), reemplazar:

```tsx
<p className="subtitle">Nada se envía solo.</p></div></header>
```

por:

```tsx
<p className="subtitle">Nada se envía solo.</p></div>{props.puedeVerReferidos && <Link className="outline-action" href="/crm/referidos">Referidos</Link>}</header>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && node --test tests/*.test.cjs`
Expected: sin errores; todas las pruebas Node pasan (incluye `referidos-panel` y `referidos-textos`).

- [ ] **Step 4: Documentación**

En `docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md` §3.1, cambiar la fila "Créditos usados" a: "Créditos y bonos gastados en ventas **no anuladas** en el período." Agregar al final un apartado `## 9. Desviaciones de la fase 2` con lo que realmente se haya cambiado respecto del diseño (si nada cambió, escribir "Ninguna.").

En `docs/BLUEPRINT.md`: (a) en la fila "Tarjeta de lealtad y referidos" de la tabla de la sección 3, reemplazar "Pendiente: fase 2 (panel en el CRM) y fase 3 (avisos por WhatsApp, QR)" por "Fase 2 (panel en `/crm/referidos`, solo superadmin y administradores de sucursal) construida; pendiente fase 3 (avisos por WhatsApp, QR)"; (b) agregar una fila al registro de entregas (sección 9) con fecha, migración `20261015160000_referidos_panel`, archivos y verificación realizada, diciendo con claridad qué NO se pudo probar (pantalla con sesión real); (c) en la sección 6 solo si hubo un error nuevo real durante la construcción.

- [ ] **Step 5: Commit, publicar y verificar**

```bash
git add lib/crm-labels.ts lib/crm.ts app/crm/crm-board.tsx docs/superpowers/specs/2026-10-15-referidos-panel-crm-design.md docs/BLUEPRINT.md
git commit -m "feat(referidos): botón Referidos en el CRM y documentación de la fase 2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
npx vercel --prod --yes
```

Verificar en el sitio: `curl -s -o /dev/null -w "%{http_code}\n" https://ssff-app.vercel.app/crm/referidos` → `307` (redirige al inicio de sesión) y `…/login` → `200`. El controlador aplica la migración `20261015160000_referidos_panel` (y corre `get_advisors`) **antes** de publicar, para que la pantalla no llame a funciones que aún no existen.

---

## Self-Review (hecha al escribir el plan)

**Cobertura del diseño:** §1 decisiones → Global Constraints; §2 ruta/filtros → Tasks 3–5; §3.1 indicadores → Task 1 (SQL, casos P1–P6) y Task 4 (tarjetas y notas); §3.2 ranking → Task 1 (P4) y Task 4; §3.3 detalle → Task 1 (P10) y Task 4; §4 reglas de acceso, rango y sucursal → Task 1 (P7–P9) ; §5 archivos → File Structure; §6 pruebas SQL/Node/tsc → Tasks 1, 2; §7 entrega → método subagent-driven; §8 fuera de alcance → no hay tareas para esos puntos.
**Placeholders:** ninguno; el único vínculo entre tareas (el import de `panel-board` en la Task 3) está resuelto con el archivo mínimo explícito.
**Consistencia de nombres:** las claves JSON de `indicadores`, `ranking`, `resumen`, `referidos`, `movimientos` coinciden entre la migración (Task 1), los tipos (Task 2), el cargador/acción (Task 3) y el tablero (Task 4). Parámetros de las RPC (`p_empresa`, `p_desde`, `p_hasta`, `p_sucursal`, `p_referidor`) coinciden con las llamadas.
**Riesgos a vigilar al ejecutar:** (1) las pruebas SQL dependen de los usuarios reales descritos arriba (Focus: 1 administrador; Shuvisión: vendedor en la sucursal "Shuvision" y 3 administradores en "Shuvision Sacha"); si cambian, ajustar solo el arnés; (2) los números esperados (P1–P6) suponen los valores iniciales de SHU (descuento $10, mínimo $100, tope 20 %, crédito $10) que el preludio no modifica; (3) la pantalla no se puede probar con sesión real desde esta herramienta.
