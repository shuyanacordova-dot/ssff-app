# Referidos y Recompensas — Fase 1 (Núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar funcionando, con los programas **apagados**, la configuración, los códigos, el registro del referido en la ficha, la validación y el descuento en la venta, las recompensas, el monedero con bonos y vencimientos, y la pestaña "Referidos" en la carpeta del paciente.

**Architecture:** Todas las reglas viven en funciones de Postgres (Supabase) con restricciones únicas contra duplicados y un libro de movimientos que no se edita. La venta aplica el descuento y el crédito dentro de la misma transacción de `registrar_venta`. Las pantallas (Next.js 15) solo llaman a esas funciones por acciones del servidor.

**Tech Stack:** Next.js 15 + React 19, Supabase Postgres (proyecto `rbmmhcwvzmjafjauwvsr`), Vercel (cron y publicación con `npx vercel --prod`), pruebas SQL dentro de transacciones que se deshacen y pruebas Node (`node --test`) para los textos.

**Spec:** `docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md` (leerlo antes de empezar). Leer también `docs/BLUEPRINT.md` completo (regla del proyecto).

## Global Constraints

- Los programas nacen **apagados** (`activo = false`) y nadie los enciende en esta fase.
- Valores iniciales **SHUVISION / Círculo Shu (`SHU`)**: compra mínima $100, descuento de bienvenida $10, crédito por referido $10, bono 3 referidos $10, bono 5 referidos $20, vigencia 90 días, uso máximo 20 %.
- Valores iniciales **Focus / Focus Friends (`FOC`)**: compra mínima $120, descuento de bienvenida $15, crédito por referido $10, bono 3 referidos $15, bono 5 referidos $25, vigencia 60 días, uso máximo 20 %.
- Programa = empresa. IDs reales: Shuvisión `51820b6b-9fc1-495c-b2ea-ab50547e2ce3`, Focus `be1dc246-219a-40a2-9e92-707e5845d295`. SHUVISION y Focus no se ven entre sí (RLS + validación en las funciones).
- Recompensa **solo con la venta 100 % pagada** (saldo = 0). Ventas de **convenio (descuento a rol) no participan**. La compra mínima se mide **antes** del descuento. "Cliente nuevo" = sin ventas `completada` en esa empresa.
- El crédito es un **descuento de la óptica**: baja `ventas.total`; nunca entra a caja, ni a "A cuenta del mes". **No** se usa `creditos_paciente` ni el método de pago `saldo_favor`.
- El libro `monedero_movimientos` y `referidos_auditoria` **nunca se editan ni se borran** (trigger lo impide). Ajustes = movimientos nuevos con usuario y motivo (mínimo 5 caracteres).
- Migraciones: archivo nuevo en `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`; nunca editar migraciones viejas; solo agregar columnas/tablas. Al cambiar la firma de una función: `drop function` de la versión vieja y repetir `revoke`/`grant` (L3). Funciones nuevas: `revoke all ... from public, anon` y `grant execute ... to authenticated` (L9). Correr `get_advisors` tras cada migración aplicada.
- Fechas en hora de Ecuador (`America/Guayaquil`, UTC-5), nunca UTC (L4).
- Interfaz en español, estilo glass existente de `app/globals.css` (clases `task-card`, `notice`, `new-patient-form`, `outline-action`, `new-consultation`, `field-hint`). No usar `:has()` en CSS de impresión.
- Permisos en dos capas que coinciden (L6/L12): base de datos y pantalla. Configurar y ajustar = solo superadmin.
- Terminar cada tarea con `npx tsc --noEmit` cuando haya cambios de TypeScript. Publicar al final: commit + push + `npx vercel --prod` (autorización permanente de Shuyana, 2026-09-29).

## Review Focus

Entradas que el diseño implica y ninguna prueba obvia cubriría; cada una tiene su prueba en la tarea indicada:

1. **Teléfonos vacíos:** dos pacientes sin teléfono (ambos `null`) NO deben tratarse como "misma cuenta" (Task 3, caso C9).
2. **Venta pagada completa en el mismo registro:** la recompensa debe dispararse dentro de `registrar_venta`, sin abonos posteriores (Task 4, caso D4).
3. **Anulación con el crédito ya gastado:** se revierte solo lo no gastado, nunca queda saldo negativo y queda marcado en auditoría (Task 4, caso D9).
4. **Venta normal sin código:** el total, el descuento y el saldo deben quedar exactamente como antes del cambio (regresión de `registrar_venta`) (Task 3, caso C1).
5. **Crédito vencido que el cron aún no procesó:** no se puede usar aunque todavía figure en el libro (Task 5, caso E2).

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261015100000_referidos_base.sql` | Tablas, historial inmutable, RLS, programas sembrados apagados |
| `supabase/migrations/20261015110000_referidos_config_codigos.sql` | Códigos, trigger de código nuevo, guardar configuración |
| `supabase/migrations/20261015120000_referidos_venta.sql` | Validaciones, monedero (leer/consumir), referido en ficha, vista previa, `registrar_venta` nueva |
| `supabase/migrations/20261015130000_referidos_recompensas.sql` | Recompensa al 100 % pagado, bonos por hito, reversas por anulación |
| `supabase/migrations/20261015140000_referidos_vencimientos_ajustes.sql` | Vencimiento de créditos, ajuste manual |
| `supabase/tests/referidos_00_preludio.sql` … `referidos_05_*.sql` | Pruebas SQL (se deshacen solas) |
| `lib/referidos-textos.ts` | Tipos y funciones puras (mensaje de WhatsApp, etiquetas, dinero) — importable desde cliente |
| `lib/referidos.ts` | Cargadores del servidor (configuración de programas) |
| `lib/whatsapp.ts` | + `enlaceCompartirWhatsapp` |
| `app/referidos/actions.ts` | Acciones del servidor que llaman a las funciones SQL |
| `app/api/cron/referidos-vencimientos/route.ts`, `vercel.json` | Cron diario de vencimientos |
| `app/configuracion/referidos/page.tsx`, `referidos-board.tsx` | Pantalla de configuración (solo superadmin) |
| `app/pacientes/referidos-panel.tsx`, `campo-referido.tsx` | Pestaña Referidos y campo "¿Quién te refirió?" |
| `app/ventas/referido-venta.tsx` | Bloque de código y crédito dentro del carrito |
| `tests/referidos-textos.test.cjs` | Prueba Node de los textos |

## Cómo se ejecuta una prueba SQL (convención de todo el plan)

La base de datos real es la única que hay (no hay entorno de pruebas). Para no tocar datos reales, cada prueba se manda a `mcp__4d0b09ce-0efa-434f-8f0b-fd65b491ada1__execute_sql` (proyecto `rbmmhcwvzmjafjauwvsr`) como **una sola cadena** = `[migración a probar] + [preludio si el archivo lo indica] + [archivo de prueba]`. La prueba termina **siempre con un error a propósito**:

- `PRUEBAS_OK: …` = todo pasó.
- `FALLO <caso>: …` = ese caso falló.

En ambos casos la transacción se deshace por completo (se verifica en la Task 0). Para aplicar de verdad una migración ya probada se usa `apply_migration` con el contenido exacto del archivo. Si un caso falla por un dato de prueba (usuario o producto que no existe), se corrige el preludio, no el caso.

---

### Task 0: Condiciones previas y verificación del método de pruebas

**Files:**
- Create: `supabase/tests/referidos_00_preludio.sql`
- No modifica código de la aplicación.

**Interfaces:**
- Produces: preludio con funciones temporales `pg_temp.paciente(...)`, `pg_temp.vender(...)`, `pg_temp.vender_falla(...)` y variables de sesión `t.*` que usan todas las pruebas.

- [ ] **Step 1: Revisar el árbol de trabajo**

Run: `git status --short | grep -v DS_Store`
Expected: puede aparecer ` D app/ventas/cart.tsx` y ` D lib/mis-deudas-calc.ts` (se vieron borrados sin guardar el 2026-10-14, ajenos a este trabajo). Si siguen borrados, **detenerse y preguntar a Shuyana** si fue a propósito antes de la Task 10 (el carrito se edita ahí). Para recuperarlos sin perder nada: `git restore app/ventas/cart.tsx lib/mis-deudas-calc.ts` (solo con su visto bueno). No usar `git checkout .` ni `git reset --hard`.

- [ ] **Step 2: Línea base de TypeScript**

Run: `npx tsc --noEmit`
Expected: sin errores (si fallan por los archivos borrados, es el motivo del paso 1). Anotar cualquier error previo para no confundirlo con los propios.

- [ ] **Step 3: Verificar que una llamada de `execute_sql` es una sola transacción**

Enviar exactamente esta cadena:

```sql
create table public.zz_sonda_tx(a int);
do $$ begin raise exception 'sonda_ok'; end $$;
```

Expected: error `sonda_ok`. Después enviar `select to_regclass('public.zz_sonda_tx') as existe;`
Expected: `existe = null`. **Si devuelve la tabla**, ejecutar `drop table public.zz_sonda_tx;` y **parar**: este método de pruebas no sirve; avisar a Shuyana para crear una rama de Supabase (`create_branch`, tiene costo y requiere su confirmación) y correr allí las pruebas.

- [ ] **Step 4: Confirmar que nada llama a `registrar_venta` con otra firma**

Run: `grep -rn "registrar_venta" app lib supabase/migrations --include=*.ts --include=*.tsx --include=*.sql | grep -v "create or replace function\|drop function\|revoke\|grant"`
Expected: solo `app/ventas/actions.ts` (llamada con 6 parámetros nombrados) y migraciones antiguas. Si hay otra llamada de código vivo, anotarla: seguirá funcionando porque los parámetros nuevos tienen valor por defecto.

- [ ] **Step 5: Escribir el preludio de pruebas**

Create `supabase/tests/referidos_00_preludio.sql`:

```sql
-- Preludio común de las pruebas de referidos. Se concatena DESPUÉS de la migración y ANTES del archivo de prueba.
-- Todo corre dentro de una transacción que termina en error a propósito (se deshace sola).

create or replace function pg_temp.paciente(p_nombre text, p_telefono text, p_empresa uuid, p_sucursal uuid)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into public.pacientes_clinicos(nombres, apellidos, cedula, telefono, empresa_origen_id)
  values ('ZZ ' || p_nombre, 'Prueba', lpad((random() * 9999999999)::bigint::text, 10, '0'), p_telefono, p_empresa)
  returning id into v;
  insert into public.paciente_empresas(paciente_id, empresa_id, primera_sucursal_id) values (v, p_empresa, p_sucursal);
  return v;
end $f$;

create or replace function pg_temp.vender(p_empresa uuid, p_sucursal uuid, p_auth uuid, p_paciente uuid, p_codigo text, p_precio numeric, p_pago numeric,
  p_credito numeric default 0, p_convenio boolean default false, p_desc_linea numeric default 0)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    v := public.registrar_venta(p_empresa, p_sucursal, null,
      jsonb_build_array(jsonb_build_object('producto_id', coalesce(nullif(current_setting('t.producto_' || (case when p_empresa = current_setting('t.shu')::uuid then 'shu' else 'focus' end)), ''), current_setting('t.producto_focus')), 'cantidad', 1, 'precio_unitario', p_precio, 'descuento', p_desc_linea)),
      case when p_pago > 0 then jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', p_pago)) else '[]'::jsonb end,
      p_paciente, p_codigo, p_credito, p_convenio);
  exception when others then
    reset role;
    raise;
  end;
  reset role;
  return v;
end $f$;

-- Ejecuta una venta que DEBE fallar y comprueba que el mensaje contenga el fragmento esperado.
create or replace function pg_temp.vender_falla(p_caso text, p_fragmento text, p_empresa uuid, p_sucursal uuid, p_auth uuid, p_paciente uuid, p_codigo text,
  p_precio numeric, p_pago numeric, p_credito numeric default 0, p_convenio boolean default false, p_desc_linea numeric default 0)
returns void language plpgsql as $f$
begin
  begin
    perform pg_temp.vender(p_empresa, p_sucursal, p_auth, p_paciente, p_codigo, p_precio, p_pago, p_credito, p_convenio, p_desc_linea);
  exception when others then
    if position(lower(p_fragmento) in lower(sqlerrm)) = 0 then
      raise exception 'FALLO %: se esperaba un error con "%" y salió "%"', p_caso, p_fragmento, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALLO %: se esperaba un error con "%" pero la venta fue aceptada', p_caso, p_fragmento;
end $f$;

do $$
declare
  v_focus uuid := 'be1dc246-219a-40a2-9e92-707e5845d295';
  v_shu uuid := '51820b6b-9fc1-495c-b2ea-ab50547e2ce3';
begin
  perform set_config('t.focus', v_focus::text, true);
  perform set_config('t.shu', v_shu::text, true);
  perform set_config('t.su', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre = 'superadmin' and u.activo limit 1), ''), true);
  perform set_config('t.vend_focus', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre in ('vendedor', 'optometra') and u.empresa_id = v_focus and u.activo limit 1), ''), true);
  perform set_config('t.vend_shu', coalesce((select u.auth_user_id::text from public.usuarios u join public.roles r on r.id = u.rol_id where r.nombre in ('vendedor', 'optometra') and u.empresa_id = v_shu and u.activo limit 1), ''), true);
  perform set_config('t.suc_focus', coalesce((select id::text from public.sucursales where empresa_id = v_focus order by nombre limit 1), ''), true);
  perform set_config('t.suc_shu', coalesce((select id::text from public.sucursales where empresa_id = v_shu order by nombre limit 1), ''), true);
  perform set_config('t.producto_focus', coalesce((select id::text from public.productos_catalogo where empresa_id = v_focus and activo and categoria in ('accesorio', 'servicio') and not controla_inventario limit 1), ''), true);
  perform set_config('t.producto_shu', coalesce((select id::text from public.productos_catalogo where empresa_id = v_shu and activo and categoria in ('accesorio', 'servicio') and not controla_inventario limit 1), ''), true);
  if '' in (current_setting('t.su'), current_setting('t.vend_focus'), current_setting('t.vend_shu'), current_setting('t.suc_focus'), current_setting('t.suc_shu'), current_setting('t.producto_focus'), current_setting('t.producto_shu')) then
    raise exception 'PRELUDIO: falta un dato de prueba (superadmin %, vendedor Focus %, vendedor Shuvisión %, sucursal Focus %, sucursal Shuvisión %, producto Focus %, producto Shuvisión %).',
      current_setting('t.su'), current_setting('t.vend_focus'), current_setting('t.vend_shu'), current_setting('t.suc_focus'), current_setting('t.suc_shu'), current_setting('t.producto_focus'), current_setting('t.producto_shu');
  end if;
  -- Dentro de la prueba los dos programas se encienden (esto se deshace al final).
  update public.programas_referidos set activo = true where empresa_id in (v_focus, v_shu);
end $$;
```

Nota: el preludio usa `public.programas_referidos`, que aún no existe en la Task 0; por eso el preludio se usa a partir de la Task 1. En esta tarea solo se crea el archivo (sin ejecutarlo).

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/referidos_00_preludio.sql
git commit -m "test(referidos): preludio común de pruebas SQL con rollback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Migración 1 — tablas, historial inmutable, RLS y programas apagados

**Files:**
- Create: `supabase/migrations/20261015100000_referidos_base.sql`
- Create: `supabase/tests/referidos_01_base.sql`

**Interfaces:**
- Produces (tablas): `programas_referidos`, `codigos_referido`, `referidos`, `monedero_movimientos`, `referidos_auditoria`; función `public.rol_referidos(p_empresa uuid) returns text` (rol del usuario actual si puede usar referidos en esa empresa, si no `null`).

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_01_base.sql`. Se ejecuta como `[migración] + [apagados] + [preludio] + [resto]`; el archivo trae las dos partes separadas por el comentario `-- ===== PRELUDIO AQUÍ =====`:

```sql
-- PARTE 1 (antes del preludio): los programas nacen apagados y con los valores acordados.
do $$
begin
  if (select count(*) from public.programas_referidos where nombre in ('Círculo Shu', 'Focus Friends')) <> 2 then
    raise exception 'FALLO A1: faltan los dos programas sembrados';
  end if;
  if exists (select 1 from public.programas_referidos where activo) then
    raise exception 'FALLO A2: un programa nació encendido';
  end if;
  if not exists (select 1 from public.programas_referidos where prefijo = 'FOC' and compra_minima = 120 and descuento_bienvenida = 15 and credito_por_referido = 10
                 and bono_3_referidos = 15 and bono_5_referidos = 25 and vigencia_credito_dias = 60 and tope_uso_porcentaje = 20) then
    raise exception 'FALLO A3: valores de Focus Friends incorrectos';
  end if;
  if not exists (select 1 from public.programas_referidos where prefijo = 'SHU' and compra_minima = 100 and descuento_bienvenida = 10 and credito_por_referido = 10
                 and bono_3_referidos = 10 and bono_5_referidos = 20 and vigencia_credito_dias = 90 and tope_uso_porcentaje = 20) then
    raise exception 'FALLO A4: valores de Círculo Shu incorrectos';
  end if;
end $$;

-- ===== PRELUDIO AQUÍ =====

-- PARTE 2 (después del preludio)
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_prog uuid;
  v_pac uuid;
  v_mov uuid;
  v_visto int;
  v_bloqueado boolean := false;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  v_pac := pg_temp.paciente('Base', '0990000001', v_focus, current_setting('t.suc_focus')::uuid);

  -- A5: el historial del monedero no se puede modificar ni borrar
  insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto, vence_en)
  values (v_prog, v_pac, 'credito', 5, now() + interval '1 day') returning id into v_mov;
  begin update public.monedero_movimientos set monto = 1 where id = v_mov; exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A5a: se pudo modificar un movimiento del monedero'; end if;
  v_bloqueado := false;
  begin delete from public.monedero_movimientos where id = v_mov; exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A5b: se pudo borrar un movimiento del monedero'; end if;

  -- A6: un movimiento negativo exige lote; un ajuste exige motivo de 5+ caracteres
  v_bloqueado := false;
  begin insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto) values (v_prog, v_pac, 'uso', -1); exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A6a: se aceptó un uso sin lote'; end if;
  v_bloqueado := false;
  begin insert into public.monedero_movimientos(programa_id, paciente_id, tipo, monto, vence_en, motivo) values (v_prog, v_pac, 'ajuste', 5, now() + interval '1 day', 'ok'); exception when others then v_bloqueado := true; end;
  if not v_bloqueado then raise exception 'FALLO A6b: se aceptó un ajuste sin motivo suficiente'; end if;

  -- A7: un usuario de Shuvisión no ve el programa de Focus (RLS)
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_shu'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visto from public.programas_referidos where empresa_id = v_focus;
  if v_visto <> 0 then reset role; raise exception 'FALLO A7a: Shuvisión ve el programa de Focus'; end if;
  select count(*) into v_visto from public.programas_referidos where empresa_id = v_shu;
  if v_visto <> 1 then reset role; raise exception 'FALLO A7b: Shuvisión no ve su propio programa'; end if;
  reset role;

  -- A8: el historial de auditoría solo lo lee la superadmin
  insert into public.referidos_auditoria(programa_id, evento) values (v_prog, 'prueba');
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visto from public.referidos_auditoria;
  reset role;
  if v_visto <> 0 then raise exception 'FALLO A8: un vendedor lee la auditoría'; end if;

  raise exception 'PRUEBAS_OK: base (A1-A8)';
end $$;
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Enviar `[contenido de referidos_01_base.sql]` sin la migración (la parte 1 y 2 con el preludio en medio).
Expected: error `relation "public.programas_referidos" does not exist` (la migración aún no existe).

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/20261015100000_referidos_base.sql`:

```sql
-- Referidos y recompensas, fase 1 (1/5): tablas, historial inmutable, RLS y programas apagados.
-- Diseño: docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md

create table if not exists public.programas_referidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id),
  nombre text not null,
  prefijo text not null check (prefijo ~ '^[A-Z]{3}$'),
  activo boolean not null default false,
  recompensas_suspendidas boolean not null default false,
  compra_minima numeric(12,2) not null check (compra_minima >= 0),
  descuento_bienvenida numeric(12,2) not null check (descuento_bienvenida >= 0),
  credito_por_referido numeric(12,2) not null check (credito_por_referido >= 0),
  bono_3_referidos numeric(12,2) not null default 0 check (bono_3_referidos >= 0),
  bono_5_referidos numeric(12,2) not null default 0 check (bono_5_referidos >= 0),
  vigencia_credito_dias integer not null check (vigencia_credito_dias > 0),
  tope_uso_porcentaje numeric(5,2) not null check (tope_uso_porcentaje between 0 and 100),
  presupuesto_mensual numeric(12,2) check (presupuesto_mensual is null or presupuesto_mensual >= 0),
  campana_desde date,
  campana_hasta date,
  categorias_excluidas text[] not null default '{}',
  siguiente_numero integer not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.usuarios(id),
  check (campana_hasta is null or campana_desde is null or campana_hasta >= campana_desde)
);

create table if not exists public.codigos_referido (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  codigo text not null,
  creado_en timestamptz not null default now(),
  unique (programa_id, paciente_id),
  unique (programa_id, codigo)
);

create table if not exists public.referidos (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  codigo_id uuid not null references public.codigos_referido(id),
  referidor_paciente_id uuid not null references public.pacientes_clinicos(id),
  referido_paciente_id uuid not null references public.pacientes_clinicos(id),
  estado text not null default 'registrado' check (estado in ('registrado', 'en_pago', 'recompensado', 'rechazado', 'revertido')),
  venta_id uuid references public.ventas(id),
  descuento_aplicado numeric(12,2) not null default 0,
  credito_a_otorgar numeric(12,2) not null default 0,
  vigencia_dias integer,
  reglas jsonb,
  motivo_rechazo text,
  registrado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  aplicado_en timestamptz,
  pagado_en timestamptz,
  unique (programa_id, referido_paciente_id),
  check (referidor_paciente_id <> referido_paciente_id)
);
create index if not exists referidos_referidor_idx on public.referidos (programa_id, referidor_paciente_id, estado);
create index if not exists referidos_venta_idx on public.referidos (venta_id) where venta_id is not null;

create table if not exists public.monedero_movimientos (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas_referidos(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  tipo text not null check (tipo in ('credito', 'bono_hito', 'ajuste', 'devolucion', 'uso', 'vencimiento', 'reversa')),
  monto numeric(12,2) not null check (monto <> 0),
  lote_id uuid references public.monedero_movimientos(id),
  vence_en timestamptz,
  referido_id uuid references public.referidos(id),
  hito integer check (hito in (3, 5)),
  venta_id uuid references public.ventas(id),
  motivo text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check (
    (monto > 0 and lote_id is null and vence_en is not null and tipo in ('credito', 'bono_hito', 'ajuste', 'devolucion'))
    or (monto < 0 and lote_id is not null and vence_en is null and tipo in ('uso', 'vencimiento', 'reversa', 'ajuste'))
  ),
  check (tipo <> 'ajuste' or char_length(btrim(coalesce(motivo, ''))) >= 5)
);
create unique index if not exists monedero_un_credito_por_referido on public.monedero_movimientos (referido_id) where tipo = 'credito';
create unique index if not exists monedero_un_bono_por_hito on public.monedero_movimientos (programa_id, paciente_id, hito) where tipo = 'bono_hito';
create unique index if not exists monedero_un_vencimiento_por_lote on public.monedero_movimientos (lote_id) where tipo = 'vencimiento';
create unique index if not exists monedero_una_reversa_por_lote on public.monedero_movimientos (lote_id) where tipo = 'reversa';
create unique index if not exists monedero_una_devolucion_por_venta on public.monedero_movimientos (venta_id) where tipo = 'devolucion';
create index if not exists monedero_paciente_idx on public.monedero_movimientos (programa_id, paciente_id);
create index if not exists monedero_lote_idx on public.monedero_movimientos (lote_id) where lote_id is not null;

create table if not exists public.referidos_auditoria (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid references public.programas_referidos(id),
  evento text not null,
  paciente_id uuid references public.pacientes_clinicos(id),
  referido_id uuid references public.referidos(id),
  venta_id uuid references public.ventas(id),
  detalle jsonb not null default '{}'::jsonb,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

-- Los libros no se editan ni se borran: las correcciones son movimientos nuevos.
create or replace function app_private.bloquear_modificacion_historial()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Este registro es un historial y no se puede modificar ni borrar.';
end $$;
revoke all on function app_private.bloquear_modificacion_historial() from public, anon, authenticated;

drop trigger if exists trg_monedero_inmutable on public.monedero_movimientos;
create trigger trg_monedero_inmutable before update or delete on public.monedero_movimientos
  for each row execute function app_private.bloquear_modificacion_historial();
drop trigger if exists trg_referidos_auditoria_inmutable on public.referidos_auditoria;
create trigger trg_referidos_auditoria_inmutable before update or delete on public.referidos_auditoria
  for each row execute function app_private.bloquear_modificacion_historial();

-- Rol del usuario actual si puede usar referidos en esa empresa (superadmin en cualquiera).
create or replace function public.rol_referidos(p_empresa uuid)
returns text language sql stable security definer set search_path = '' as $$
  select ro.nombre
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo
    and ro.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja')
    and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa)
  limit 1;
$$;
revoke all on function public.rol_referidos(uuid) from public, anon;
grant execute on function public.rol_referidos(uuid) to authenticated;

alter table public.programas_referidos enable row level security;
alter table public.codigos_referido enable row level security;
alter table public.referidos enable row level security;
alter table public.monedero_movimientos enable row level security;
alter table public.referidos_auditoria enable row level security;
revoke all on public.programas_referidos, public.codigos_referido, public.referidos, public.monedero_movimientos, public.referidos_auditoria from public, anon, authenticated;
grant select on public.programas_referidos, public.codigos_referido, public.referidos, public.monedero_movimientos, public.referidos_auditoria to authenticated;

drop policy if exists programas_referidos_leer on public.programas_referidos;
create policy programas_referidos_leer on public.programas_referidos for select to authenticated
  using (public.rol_referidos(empresa_id) is not null);
drop policy if exists codigos_referido_leer on public.codigos_referido;
create policy codigos_referido_leer on public.codigos_referido for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists referidos_leer on public.referidos;
create policy referidos_leer on public.referidos for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists monedero_movimientos_leer on public.monedero_movimientos;
create policy monedero_movimientos_leer on public.monedero_movimientos for select to authenticated
  using (exists (select 1 from public.programas_referidos p where p.id = programa_id and public.rol_referidos(p.empresa_id) is not null));
drop policy if exists referidos_auditoria_leer on public.referidos_auditoria;
create policy referidos_auditoria_leer on public.referidos_auditoria for select to authenticated
  using (public.es_superadmin());

-- Programas sembrados APAGADOS con los valores iniciales acordados.
insert into public.programas_referidos (empresa_id, nombre, prefijo, compra_minima, descuento_bienvenida, credito_por_referido, bono_3_referidos, bono_5_referidos, vigencia_credito_dias, tope_uso_porcentaje)
select e.id, v.nombre, v.prefijo, v.minimo, v.descuento, 10, v.b3, v.b5, v.dias, 20
from public.empresas e
join (values ('Shuvisión', 'Círculo Shu', 'SHU', 100, 10, 10, 20, 90), ('Focus', 'Focus Friends', 'FOC', 120, 15, 15, 25, 60))
  as v(empresa, nombre, prefijo, minimo, descuento, b3, b5, dias) on e.nombre = v.empresa
on conflict (empresa_id) do nothing;
```

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Enviar `[migración] + [PARTE 1] + [preludio] + [PARTE 2]`.
Expected: error `PRUEBAS_OK: base (A1-A8)`.

- [ ] **Step 5: Aplicar la migración de verdad y revisar seguridad**

Aplicar con `apply_migration` (name `referidos_base`, contenido exacto del archivo). Luego `get_advisors` (tipos `security` y `performance`) y confirmar que no aparecen avisos nuevos de estas tablas/funciones. Verificar: `select nombre, activo from public.programas_referidos;` → dos filas, ambas `activo = false`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261015100000_referidos_base.sql supabase/tests/referidos_01_base.sql
git commit -m "feat(referidos): tablas base, historial inmutable, RLS y programas apagados

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migración 2 — códigos y guardar configuración

**Files:**
- Create: `supabase/migrations/20261015110000_referidos_config_codigos.sql`
- Create: `supabase/tests/referidos_02_config_codigos.sql`

**Interfaces:**
- Consumes: Task 1 (tablas, `rol_referidos`).
- Produces: `app_private.asegurar_codigo_referido(p_programa uuid, p_paciente uuid) returns text`; `public.obtener_codigo_referido(p_paciente uuid, p_empresa uuid) returns text`; `public.guardar_programa_referidos(p_programa uuid, p_cambios jsonb) returns jsonb` (solo superadmin; claves aceptadas: `nombre, activo, recompensas_suspendidas, compra_minima, descuento_bienvenida, credito_por_referido, bono_3_referidos, bono_5_referidos, vigencia_credito_dias, tope_uso_porcentaje, presupuesto_mensual, campana_desde, campana_hasta, categorias_excluidas`); trigger `trg_codigo_nuevo_paciente` en `paciente_empresas`.
- Pendiente de la Task 4: `guardar_programa_referidos` llama a `app_private.procesar_recompensas_pendientes(uuid)` al reanudar recompensas; en esta tarea se crea una versión vacía que la Task 4 reemplaza.

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_02_config_codigos.sql` (se ejecuta como `[migración] + [preludio] + [este archivo]`):

```sql
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  v_ss uuid := current_setting('t.suc_shu')::uuid;
  v_prog uuid; v_prog_shu uuid;
  p1 uuid; p2 uuid; p3 uuid; ps uuid;
  c1 text; c2 text; c3 text; cs text;
  v_msg text; v_antes numeric; v_n int;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  select id into v_prog_shu from public.programas_referidos where empresa_id = v_shu;

  -- B1: un paciente nuevo recibe su código con el formato PREFIJO-000000 (trigger), el de Shuvisión con SHU
  p1 := pg_temp.paciente('Uno', '0991000001', v_focus, v_sf);
  p2 := pg_temp.paciente('Dos', '0991000002', v_focus, v_sf);
  ps := pg_temp.paciente('Shu', '0991000003', v_shu, v_ss);
  select codigo into c1 from public.codigos_referido where programa_id = v_prog and paciente_id = p1;
  select codigo into c2 from public.codigos_referido where programa_id = v_prog and paciente_id = p2;
  select codigo into cs from public.codigos_referido where programa_id = v_prog_shu and paciente_id = ps;
  if c1 !~ '^FOC-[0-9]{6}$' or c2 !~ '^FOC-[0-9]{6}$' then raise exception 'FALLO B1a: formato de código Focus % / %', c1, c2; end if;
  if cs !~ '^SHU-[0-9]{6}$' then raise exception 'FALLO B1b: formato de código Shuvisión %', cs; end if;
  if c1 = c2 then raise exception 'FALLO B1c: códigos repetidos'; end if;
  if substr(c2, 5)::int <> substr(c1, 5)::int + 1 then raise exception 'FALLO B1d: los códigos no son consecutivos (% y %)', c1, c2; end if;

  -- B2: obtener_codigo_referido es idempotente y respeta la empresa
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.obtener_codigo_referido(p1, v_focus) <> c1 then reset role; raise exception 'FALLO B2a: el código cambió'; end if;
  begin
    perform public.obtener_codigo_referido(ps, v_shu);
    reset role; raise exception 'FALLO B2b: un vendedor de Focus pidió un código de Shuvisión';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- B3: solo la superadmin configura
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.vend_focus'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.guardar_programa_referidos(v_prog, '{"compra_minima": 130}'::jsonb);
    reset role; raise exception 'FALLO B3a: un vendedor pudo configurar';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    if position('Superadministradora' in sqlerrm) = 0 then reset role; raise exception 'FALLO B3a: mensaje inesperado %', sqlerrm; end if;
  end;
  reset role;

  -- B4: la superadmin cambia valores y queda historial antes/después; los códigos existentes no cambian
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.guardar_programa_referidos(v_prog, '{"compra_minima": 130, "presupuesto_mensual": 500, "categorias_excluidas": ["servicio"]}'::jsonb);
  reset role;
  select compra_minima into v_antes from public.programas_referidos where id = v_prog;
  if v_antes <> 130 then raise exception 'FALLO B4a: no se guardó la compra mínima'; end if;
  if (select categorias_excluidas from public.programas_referidos where id = v_prog) <> array['servicio'] then raise exception 'FALLO B4b: categorías excluidas'; end if;
  select count(*) into v_n from public.referidos_auditoria where programa_id = v_prog and evento = 'config'
    and (detalle->'antes'->>'compra_minima')::numeric = 120 and (detalle->'despues'->>'compra_minima')::numeric = 130;
  if v_n <> 1 then raise exception 'FALLO B4c: falta el historial de cambio (%)', v_n; end if;
  if (select codigo from public.codigos_referido where programa_id = v_prog and paciente_id = p1) <> c1 then raise exception 'FALLO B4d: cambió un código'; end if;

  -- B5: valores inválidos se rechazan
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.guardar_programa_referidos(v_prog, '{"tope_uso_porcentaje": 150}'::jsonb);
    reset role; raise exception 'FALLO B5: se aceptó un tope de 150 %%';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;

  -- B6: al encender un programa se generan códigos para los pacientes que no tenían (sin Consumidor Final)
  update public.programas_referidos set activo = false where id = v_prog;
  p3 := pg_temp.paciente('Tres', '0991000004', v_focus, v_sf);
  if exists (select 1 from public.codigos_referido where programa_id = v_prog and paciente_id = p3) then raise exception 'FALLO B6a: con el programa apagado se creó un código'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.su'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.guardar_programa_referidos(v_prog, '{"activo": true}'::jsonb);
  reset role;
  select codigo into c3 from public.codigos_referido where programa_id = v_prog and paciente_id = p3;
  if c3 !~ '^FOC-[0-9]{6}$' then raise exception 'FALLO B6b: no se generó el código al encender (%)', c3; end if;
  if exists (select 1 from public.codigos_referido c join public.pacientes_clinicos pc on pc.id = c.paciente_id where c.programa_id = v_prog and pc.cedula = '9999999999999') then
    raise exception 'FALLO B6c: Consumidor Final recibió código';
  end if;
  if (select siguiente_numero from public.programas_referidos where id = v_prog) <= substr(c3, 5)::int then raise exception 'FALLO B6d: el contador no avanzó'; end if;

  raise exception 'PRUEBAS_OK: códigos y configuración (B1-B6)';
end $$;
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Enviar `[preludio] + [prueba]` (la migración 2 aún no existe).
Expected: error `function public.obtener_codigo_referido(uuid, uuid) does not exist` (o similar).

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/20261015110000_referidos_config_codigos.sql`:

```sql
-- Referidos y recompensas, fase 1 (2/5): códigos únicos y guardado de configuración.

-- Crea (o devuelve) el código del paciente. Bloquea la fila del programa para numerar sin huecos ni repetidos.
create or replace function app_private.asegurar_codigo_referido(p_programa uuid, p_paciente uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_codigo text;
begin
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  select * into v_prog from public.programas_referidos where id = p_programa for update;
  select codigo into v_codigo from public.codigos_referido where programa_id = p_programa and paciente_id = p_paciente;
  if v_codigo is not null then return v_codigo; end if;
  v_codigo := v_prog.prefijo || '-' || lpad(v_prog.siguiente_numero::text, 6, '0');
  insert into public.codigos_referido (programa_id, paciente_id, codigo) values (p_programa, p_paciente, v_codigo);
  update public.programas_referidos set siguiente_numero = siguiente_numero + 1 where id = p_programa;
  return v_codigo;
end $$;
revoke all on function app_private.asegurar_codigo_referido(uuid, uuid) from public, anon, authenticated;

-- Paciente nuevo en una empresa con programa encendido: recibe su código. Nunca debe romper el alta del paciente.
create or replace function app_private.trg_codigo_nuevo_paciente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prog uuid;
begin
  begin
    select id into v_prog from public.programas_referidos where empresa_id = new.empresa_id and activo;
    if v_prog is not null then perform app_private.asegurar_codigo_referido(v_prog, new.paciente_id); end if;
  exception when others then
    raise warning 'No se pudo crear el código de referido: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function app_private.trg_codigo_nuevo_paciente() from public, anon, authenticated;
drop trigger if exists trg_codigo_nuevo_paciente on public.paciente_empresas;
create trigger trg_codigo_nuevo_paciente after insert on public.paciente_empresas
  for each row execute function app_private.trg_codigo_nuevo_paciente();

create or replace function public.obtener_codigo_referido(p_paciente uuid, p_empresa uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then return null; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  return app_private.asegurar_codigo_referido(v_prog.id, p_paciente);
end $$;
revoke all on function public.obtener_codigo_referido(uuid, uuid) from public, anon;
grant execute on function public.obtener_codigo_referido(uuid, uuid) to authenticated;

-- Marcador: la Task 4 lo reemplaza por la versión real (otorga recompensas que quedaron en espera).
create or replace function app_private.procesar_recompensas_pendientes(p_programa uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  return 0;
end $$;
revoke all on function app_private.procesar_recompensas_pendientes(uuid) from public, anon, authenticated;

create or replace function public.guardar_programa_referidos(p_programa uuid, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_antes public.programas_referidos; v_despues public.programas_referidos; v_user uuid; v_creados integer := 0; v_otorgadas integer := 0;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede configurar los programas de referidos.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  select * into v_antes from public.programas_referidos where id = p_programa for update;
  if not found then raise exception 'Programa no encontrado.'; end if;

  update public.programas_referidos set
    nombre = coalesce(nullif(btrim(p_cambios->>'nombre'), ''), nombre),
    activo = coalesce((p_cambios->>'activo')::boolean, activo),
    recompensas_suspendidas = coalesce((p_cambios->>'recompensas_suspendidas')::boolean, recompensas_suspendidas),
    compra_minima = coalesce((p_cambios->>'compra_minima')::numeric, compra_minima),
    descuento_bienvenida = coalesce((p_cambios->>'descuento_bienvenida')::numeric, descuento_bienvenida),
    credito_por_referido = coalesce((p_cambios->>'credito_por_referido')::numeric, credito_por_referido),
    bono_3_referidos = coalesce((p_cambios->>'bono_3_referidos')::numeric, bono_3_referidos),
    bono_5_referidos = coalesce((p_cambios->>'bono_5_referidos')::numeric, bono_5_referidos),
    vigencia_credito_dias = coalesce((p_cambios->>'vigencia_credito_dias')::integer, vigencia_credito_dias),
    tope_uso_porcentaje = coalesce((p_cambios->>'tope_uso_porcentaje')::numeric, tope_uso_porcentaje),
    presupuesto_mensual = case when p_cambios ? 'presupuesto_mensual' then nullif(p_cambios->>'presupuesto_mensual', '')::numeric else presupuesto_mensual end,
    campana_desde = case when p_cambios ? 'campana_desde' then nullif(p_cambios->>'campana_desde', '')::date else campana_desde end,
    campana_hasta = case when p_cambios ? 'campana_hasta' then nullif(p_cambios->>'campana_hasta', '')::date else campana_hasta end,
    categorias_excluidas = case when p_cambios ? 'categorias_excluidas' then coalesce(array(select jsonb_array_elements_text(p_cambios->'categorias_excluidas')), '{}') else categorias_excluidas end,
    actualizado_en = now(), actualizado_por = v_user
  where id = p_programa
  returning * into v_despues;

  insert into public.referidos_auditoria (programa_id, evento, detalle, usuario_id)
  values (p_programa, 'config', jsonb_build_object('antes', to_jsonb(v_antes), 'despues', to_jsonb(v_despues)), v_user);

  -- Al encender: códigos para todos los pacientes de la empresa que aún no tienen (sin Consumidor Final).
  if v_despues.activo and not v_antes.activo then
    with nuevos as (
      select pe.paciente_id, row_number() over (order by pe.paciente_id) as rn
      from public.paciente_empresas pe
      join public.pacientes_clinicos pc on pc.id = pe.paciente_id
      where pe.empresa_id = v_despues.empresa_id
        and pc.cedula is distinct from '9999999999999'
        and not exists (select 1 from public.codigos_referido c where c.programa_id = v_despues.id and c.paciente_id = pe.paciente_id)
    ), ins as (
      insert into public.codigos_referido (programa_id, paciente_id, codigo)
      select v_despues.id, n.paciente_id, v_despues.prefijo || '-' || lpad((v_despues.siguiente_numero + n.rn - 1)::text, 6, '0')
      from nuevos n
      returning 1
    )
    select count(*) into v_creados from ins;
    update public.programas_referidos set siguiente_numero = siguiente_numero + v_creados where id = p_programa;
  end if;

  -- Al reanudar recompensas: otorga las que quedaron en espera.
  if v_antes.recompensas_suspendidas and not v_despues.recompensas_suspendidas then
    v_otorgadas := app_private.procesar_recompensas_pendientes(p_programa);
  end if;

  return jsonb_build_object('ok', true, 'codigos_creados', v_creados, 'recompensas_otorgadas', v_otorgadas);
end $$;
revoke all on function public.guardar_programa_referidos(uuid, jsonb) from public, anon;
grant execute on function public.guardar_programa_referidos(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Enviar `[migración 2] + [preludio] + [prueba]`.
Expected: error `PRUEBAS_OK: códigos y configuración (B1-B6)`.

- [ ] **Step 5: Aplicar y revisar**

`apply_migration` (name `referidos_config_codigos`) → `get_advisors`. Verificar que ningún programa quedó encendido: `select nombre, activo from public.programas_referidos;`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261015110000_referidos_config_codigos.sql supabase/tests/referidos_02_config_codigos.sql
git commit -m "feat(referidos): códigos únicos y guardado de configuración con historial

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migración 3 — validación, monedero, referido en ficha, vista previa y `registrar_venta`

**Files:**
- Create: `supabase/migrations/20261015120000_referidos_venta.sql`
- Create: `supabase/tests/referidos_03_venta.sql`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `app_private.es_paciente_convenio(p_paciente uuid) returns boolean`
  - `app_private.costo_mes_programa(p_programa uuid) returns numeric`
  - `app_private.validar_pareja_referido(p_programa uuid, p_codigo text, p_paciente uuid) returns jsonb` → `{ok, motivo?, codigo_id?, referidor_id?, referido_existente?}`
  - `app_private.evaluar_referido_venta(p_programa uuid, p_codigo text, p_paciente uuid, p_base numeric, p_es_convenio boolean, p_bloquea_por_descuentos boolean) returns jsonb` → añade `descuento`, `credito`
  - `app_private.saldo_disponible_monedero(p_programa uuid, p_paciente uuid) returns numeric`
  - `app_private.consumir_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_tipo text, p_venta uuid, p_motivo text, p_user uuid) returns numeric` (consume lotes que vencen primero; devuelve lo consumido)
  - `public.buscar_codigo_referido(p_empresa uuid, p_codigo text) returns jsonb` → `{encontrado, paciente_id?, nombre?}`
  - `public.registrar_referido_ficha(p_paciente uuid, p_empresa uuid, p_codigo text) returns jsonb` → `{ok, referidor_nombre}`
  - `public.previsualizar_referido(p_empresa uuid, p_paciente uuid, p_codigo text, p_base numeric, p_es_convenio boolean default false, p_bloquea boolean default false) returns jsonb` → `{programa_activo, nombre?, codigo?: {ok, motivo?, descuento?, credito?, referidor_nombre?}, credito_disponible?, credito_maximo?}`
  - `public.estado_monedero(p_paciente uuid, p_empresa uuid) returns jsonb` → claves: `programa_activo, programa_id, nombre, prefijo, descuento_bienvenida, compra_minima, vigencia_dias, codigo, disponible, pendiente, vencido, generado, usado, exitosos, referido_por, referidos[], movimientos[]`
  - `public.registrar_venta(p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]', p_paciente uuid default null, p_codigo_referido text default null, p_usar_credito numeric default 0, p_es_convenio boolean default false, p_autoriza_combinar boolean default false) returns uuid`

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_03_venta.sql` (se ejecuta como `[migración 3] + [preludio] + [este archivo]`):

```sql
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_shu uuid := current_setting('t.shu')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  v_ss uuid := current_setting('t.suc_shu')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  vs uuid := current_setting('t.vend_shu')::uuid;
  v_prog uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; h uuid; x uuid; j uuid;
  ca text; cf text;
  s uuid; r record; prev jsonb; n int;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  a := pg_temp.paciente('Ana', '0992000001', v_focus, v_sf);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;

  -- C1 (regresión): venta normal sin código = igual que antes (descuento 0, total = subtotal)
  x := pg_temp.paciente('Normal', '0992000099', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, x, null, 150, 150);
  select * into r from public.ventas where id = s;
  if r.descuento <> 0 or r.total <> 150 or r.subtotal <> 150 or r.saldo <> 0 or r.estado <> 'completada' then
    raise exception 'FALLO C1: la venta normal cambió (desc %, total %, saldo %)', r.descuento, r.total, r.saldo;
  end if;

  -- C2: vista previa para un cliente nuevo con el código de Ana (base 150)
  b := pg_temp.paciente('Beto', '0992000002', v_focus, v_sf);
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  prev := public.previsualizar_referido(v_focus, b, ca, 150);
  reset role;
  if not (prev->'codigo'->>'ok')::boolean or (prev->'codigo'->>'descuento')::numeric <> 15 then raise exception 'FALLO C2: vista previa %', prev; end if;

  -- C3: venta con código: -$15, total $135, referido "en_pago" con el crédito congelado y SIN crédito aún
  s := pg_temp.vender(v_focus, v_sf, vf, b, ca, 150, 0);
  select * into r from public.ventas where id = s;
  if r.descuento <> 15 or r.total <> 135 or r.saldo <> 135 or r.subtotal <> 150 then raise exception 'FALLO C3a: totales % / % / %', r.descuento, r.total, r.saldo; end if;
  select count(*) into n from public.referidos where venta_id = s and estado = 'en_pago' and descuento_aplicado = 15 and credito_a_otorgar = 10 and referidor_paciente_id = a and referido_paciente_id = b;
  if n <> 1 then raise exception 'FALLO C3b: no se registró el referido en pago'; end if;
  if exists (select 1 from public.monedero_movimientos where programa_id = v_prog and paciente_id = a) then raise exception 'FALLO C3c: ya hay crédito sin estar pagada la venta'; end if;

  -- C4: el mismo paciente no puede recibir el beneficio dos veces
  perform pg_temp.vender_falla('C4', 'clientes nuevos', v_focus, v_sf, vf, b, ca, 150, 0);
  -- C5: no se puede usar el propio código
  perform pg_temp.vender_falla('C5', 'propio código', v_focus, v_sf, vf, a, ca, 150, 0);
  -- C6: compra mínima (se mide antes del descuento): 100 < 120
  c := pg_temp.paciente('Carla', '0992000003', v_focus, v_sf);
  perform pg_temp.vender_falla('C6', 'compra mínima', v_focus, v_sf, vf, c, ca, 100, 0);
  -- C7: convenio no participa
  perform pg_temp.vender_falla('C7', 'convenio', v_focus, v_sf, vf, c, ca, 150, 0, 0, true);
  -- C8: mismo teléfono que el referidor
  d := pg_temp.paciente('Dani', '0992000001', v_focus, v_sf);
  perform pg_temp.vender_falla('C8', 'misma cuenta', v_focus, v_sf, vf, d, ca, 150, 0);
  -- C9 (Review Focus 1): dos pacientes SIN teléfono no son "misma cuenta"
  e := pg_temp.paciente('Eva', null, v_focus, v_sf);
  f := pg_temp.paciente('Fer', null, v_focus, v_sf);
  select codigo into cf from public.codigos_referido where programa_id = v_prog and paciente_id = e;
  s := pg_temp.vender(v_focus, v_sf, vf, f, cf, 150, 0);
  if (select descuento from public.ventas where id = s) <> 15 then raise exception 'FALLO C9: el código de alguien sin teléfono fue rechazado'; end if;
  -- C10: ya tiene descuentos de línea
  g := pg_temp.paciente('Gabo', '0992000007', v_focus, v_sf);
  perform pg_temp.vender_falla('C10', 'descuentos', v_focus, v_sf, vf, g, ca, 150, 0, 0, false, 5);
  -- C11: categoría excluida no cuenta para la compra mínima
  update public.programas_referidos set categorias_excluidas = array[(select categoria from public.productos_catalogo where id = current_setting('t.producto_focus')::uuid)] where id = v_prog;
  perform pg_temp.vender_falla('C11', 'compra mínima', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set categorias_excluidas = '{}' where id = v_prog;
  -- C12: programa apagado
  update public.programas_referidos set activo = false where id = v_prog;
  perform pg_temp.vender_falla('C12', 'no está activo', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set activo = true where id = v_prog;
  -- C13: presupuesto del mes (ya se dieron $30 de descuento: B y F)
  update public.programas_referidos set presupuesto_mensual = 30 where id = v_prog;
  perform pg_temp.vender_falla('C13', 'presupuesto', v_focus, v_sf, vf, g, ca, 150, 0);
  update public.programas_referidos set presupuesto_mensual = null where id = v_prog;
  -- C14: aislamiento — un vendedor de Shuvisión no puede vender ni consultar en Focus
  perform pg_temp.vender_falla('C14a', 'No autorizado', v_focus, v_sf, vs, g, ca, 150, 0);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vs, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.previsualizar_referido(v_focus, g, ca, 150);
    reset role; raise exception 'FALLO C14b: Shuvisión consultó la vista previa de Focus';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  -- C15: referido registrado desde la ficha y luego vende sin escribir el código otra vez no es obligatorio;
  --      con el código distinto al del referidor registrado se rechaza
  h := pg_temp.paciente('Hugo', '0992000008', v_focus, v_sf);
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_referido_ficha(h, v_focus, ca);
  reset role;
  if (select count(*) from public.referidos where referido_paciente_id = h and estado = 'registrado' and referidor_paciente_id = a) <> 1 then raise exception 'FALLO C15a: no se registró el referido en la ficha'; end if;
  perform pg_temp.vender_falla('C15b', 'otro referidor', v_focus, v_sf, vf, h, cf, 150, 0);
  s := pg_temp.vender(v_focus, v_sf, vf, h, ca, 150, 0);
  if (select estado from public.referidos where referido_paciente_id = h) <> 'en_pago' or (select count(*) from public.referidos where referido_paciente_id = h) <> 1 then
    raise exception 'FALLO C15c: la venta no reutilizó el referido registrado en la ficha';
  end if;
  -- C16: buscar_codigo_referido muestra el nombre para confirmar
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  prev := public.buscar_codigo_referido(v_focus, lower(ca));
  reset role;
  if not (prev->>'encontrado')::boolean or position('Ana' in (prev->>'nombre')) = 0 then raise exception 'FALLO C16: búsqueda de código %', prev; end if;

  raise exception 'PRUEBAS_OK: venta con referido (C1-C16)';
end $$;
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Enviar `[preludio] + [prueba]` sin la migración.
Expected: error sobre `registrar_venta` (firma de 10 parámetros) o `previsualizar_referido` inexistente.

- [ ] **Step 3: Escribir la migración**

Antes de escribir, reconfirmar que la función viva sigue igual a la usada aquí: ejecutar `select md5(pg_get_functiondef('public.registrar_venta(uuid,uuid,text,jsonb,jsonb,uuid)'::regprocedure));` y comparar con lo anotado al planear (el cuerpo vigente es el de `20261001060000_venta_precio_editable_accesorios.sql` más el método `saldo_favor`). Si alguien la cambió después, **partir del cuerpo vivo** y reaplicar solo los cambios marcados `-- REFERIDOS`.

Create `supabase/migrations/20261015120000_referidos_venta.sql`:

```sql
-- Referidos y recompensas, fase 1 (3/5): validaciones, monedero, referido en ficha, vista previa y registrar_venta.

create or replace function app_private.es_paciente_convenio(p_paciente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.convenio_personas where paciente_id = p_paciente)
      or exists (select 1 from public.acuerdos_pago where titular_paciente_id = p_paciente)
      or exists (select 1 from public.acuerdos_pago ap join public.ventas v on v.id = ap.venta_id where v.paciente_id = p_paciente);
$$;
revoke all on function app_private.es_paciente_convenio(uuid) from public, anon, authenticated;

-- Costo promocional del mes (hora de Ecuador): descuentos de bienvenida aplicados + créditos y bonos USADOS.
create or replace function app_private.costo_mes_programa(p_programa uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(descuento_aplicado) from public.referidos
                    where programa_id = p_programa and estado in ('en_pago', 'recompensado')
                      and aplicado_en >= (date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil')), 0)
       + coalesce((select -sum(monto) from public.monedero_movimientos
                    where programa_id = p_programa and tipo = 'uso'
                      and creado_en >= (date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil')), 0);
$$;
revoke all on function app_private.costo_mes_programa(uuid) from public, anon, authenticated;

create or replace function app_private.saldo_disponible_monedero(p_programa uuid, p_paciente uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.restante), 0) from (
    select sum(m.monto) as restante
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.programa_id = p_programa and l.paciente_id = p_paciente and l.monto > 0 and l.vence_en > now()
    group by l.id
    having sum(m.monto) > 0
  ) t;
$$;
revoke all on function app_private.saldo_disponible_monedero(uuid, uuid) from public, anon, authenticated;

-- Consume crédito empezando por el lote que vence antes. Devuelve lo realmente consumido.
create or replace function app_private.consumir_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_tipo text, p_venta uuid, p_motivo text, p_user uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare r record; v_resta numeric := round(p_monto, 2); v_toma numeric;
begin
  for r in
    select l.id, sum(m.monto) as restante
    from public.monedero_movimientos l
    join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
    where l.programa_id = p_programa and l.paciente_id = p_paciente and l.monto > 0 and l.vence_en > now()
    group by l.id, l.vence_en, l.creado_en
    having sum(m.monto) > 0
    order by l.vence_en, l.creado_en
  loop
    exit when v_resta <= 0;
    v_toma := least(r.restante, v_resta);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo, creado_por)
    values (p_programa, p_paciente, p_tipo, -v_toma, r.id, p_venta, p_motivo, p_user);
    v_resta := v_resta - v_toma;
  end loop;
  return round(p_monto, 2) - v_resta;
end $$;
revoke all on function app_private.consumir_monedero(uuid, uuid, numeric, text, uuid, text, uuid) from public, anon, authenticated;

-- Reglas de la pareja referidor/referido (sin reglas de la venta). Devuelve {ok, motivo?, codigo_id?, referidor_id?, referido_existente?}.
create or replace function app_private.validar_pareja_referido(p_programa uuid, p_codigo text, p_paciente uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prog public.programas_referidos; c public.codigos_referido; a public.pacientes_clinicos; b public.pacientes_clinicos; v_ref public.referidos;
  v_hoy date := (now() at time zone 'America/Guayaquil')::date;
  v_tel_a text; v_tel_b text;
begin
  select * into v_prog from public.programas_referidos where id = p_programa;
  if not found or not v_prog.activo then return jsonb_build_object('ok', false, 'motivo', 'El programa de referidos no está activo.'); end if;
  if (v_prog.campana_desde is not null and v_hoy < v_prog.campana_desde) or (v_prog.campana_hasta is not null and v_hoy > v_prog.campana_hasta) then
    return jsonb_build_object('ok', false, 'motivo', 'El programa de referidos está fuera de las fechas de la campaña.');
  end if;
  select * into c from public.codigos_referido where programa_id = p_programa and codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false, 'motivo', 'Código de referido no encontrado.'); end if;
  if c.paciente_id = p_paciente then return jsonb_build_object('ok', false, 'motivo', 'No se puede usar el propio código de referido.'); end if;
  select * into a from public.pacientes_clinicos where id = c.paciente_id;
  select * into b from public.pacientes_clinicos where id = p_paciente;
  v_tel_a := nullif(regexp_replace(coalesce(a.telefono, ''), '\D', '', 'g'), '');
  v_tel_b := nullif(regexp_replace(coalesce(b.telefono, ''), '\D', '', 'g'), '');
  if (v_tel_a is not null and v_tel_a = v_tel_b)
     or b.responsable_id = a.id or a.responsable_id = b.id
     or (a.responsable_id is not null and a.responsable_id = b.responsable_id) then
    return jsonb_build_object('ok', false, 'motivo', 'No se puede usar el código de alguien de la misma cuenta o con el mismo teléfono.');
  end if;
  if app_private.es_paciente_convenio(p_paciente) then
    return jsonb_build_object('ok', false, 'motivo', 'Los pacientes de convenio (descuento a rol) no participan en el programa de referidos.');
  end if;
  if exists (select 1 from public.ventas v where v.paciente_id = p_paciente and v.empresa_id = v_prog.empresa_id and v.estado = 'completada') then
    return jsonb_build_object('ok', false, 'motivo', 'El beneficio solo aplica a clientes nuevos: este paciente ya tiene compras en esta óptica.');
  end if;
  select * into v_ref from public.referidos where programa_id = p_programa and referido_paciente_id = p_paciente;
  if found and (v_ref.venta_id is not null or v_ref.estado <> 'registrado') then
    return jsonb_build_object('ok', false, 'motivo', 'Este paciente ya usó el beneficio de primera compra.');
  end if;
  if found and v_ref.referidor_paciente_id <> c.paciente_id then
    return jsonb_build_object('ok', false, 'motivo', 'Este paciente ya fue registrado con otro referidor.');
  end if;
  return jsonb_build_object('ok', true, 'codigo_id', c.id, 'referidor_id', c.paciente_id, 'referido_existente', case when found then v_ref.id else null end);
end $$;
revoke all on function app_private.validar_pareja_referido(uuid, text, uuid) from public, anon, authenticated;

-- Reglas completas para una venta. p_base = valor de la compra sin categorías excluidas y ANTES del descuento.
create or replace function app_private.evaluar_referido_venta(p_programa uuid, p_codigo text, p_paciente uuid, p_base numeric, p_es_convenio boolean, p_bloquea_por_descuentos boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_par jsonb; v_desc numeric;
begin
  select * into v_prog from public.programas_referidos where id = p_programa;
  if p_paciente is null then return jsonb_build_object('ok', false, 'motivo', 'Elige el paciente para usar un código de referido.'); end if;
  if coalesce(p_es_convenio, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Las ventas de convenio (descuento a rol) no participan en el programa de referidos.');
  end if;
  if coalesce(p_bloquea_por_descuentos, false) then
    return jsonb_build_object('ok', false, 'motivo', 'Esta venta ya tiene descuentos; solo administración puede combinarlos con el código de referido.');
  end if;
  v_par := app_private.validar_pareja_referido(p_programa, p_codigo, p_paciente);
  if not (v_par->>'ok')::boolean then return v_par; end if;
  if coalesce(p_base, 0) < v_prog.compra_minima then
    return jsonb_build_object('ok', false, 'motivo', 'La compra mínima para usar el código es $' || to_char(v_prog.compra_minima, 'FM999990.00') || '.');
  end if;
  v_desc := least(v_prog.descuento_bienvenida, p_base);
  if v_prog.presupuesto_mensual is not null and app_private.costo_mes_programa(p_programa) + v_desc > v_prog.presupuesto_mensual then
    return jsonb_build_object('ok', false, 'motivo', 'Se alcanzó el presupuesto promocional del mes para este programa.');
  end if;
  return v_par || jsonb_build_object('ok', true, 'descuento', v_desc, 'credito', v_prog.credito_por_referido);
end $$;
revoke all on function app_private.evaluar_referido_venta(uuid, text, uuid, numeric, boolean, boolean) from public, anon, authenticated;

create or replace function public.buscar_codigo_referido(p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; c public.codigos_referido; pc public.pacientes_clinicos;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa and activo;
  if not found then return jsonb_build_object('encontrado', false); end if;
  select * into c from public.codigos_referido where programa_id = v_prog.id and codigo = upper(btrim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('encontrado', false); end if;
  select * into pc from public.pacientes_clinicos where id = c.paciente_id;
  return jsonb_build_object('encontrado', true, 'paciente_id', pc.id, 'nombre', btrim(pc.nombres || ' ' || pc.apellidos));
end $$;
revoke all on function public.buscar_codigo_referido(uuid, text) from public, anon;
grant execute on function public.buscar_codigo_referido(uuid, text) to authenticated;

-- Registra "quién lo refirió" en la ficha (antes de comprar). Idempotente para el mismo referidor.
create or replace function public.registrar_referido_ficha(p_paciente uuid, p_empresa uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_par jsonb; v_user uuid; v_nombre text; v_id uuid;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then raise exception 'El programa de referidos no está activo en esta óptica.'; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  v_par := app_private.validar_pareja_referido(v_prog.id, p_codigo, p_paciente);
  if not (v_par->>'ok')::boolean then raise exception '%', v_par->>'motivo'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  if v_par->>'referido_existente' is null then
    insert into public.referidos (programa_id, codigo_id, referidor_paciente_id, referido_paciente_id, registrado_por)
    values (v_prog.id, (v_par->>'codigo_id')::uuid, (v_par->>'referidor_id')::uuid, p_paciente, v_user)
    returning id into v_id;
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, usuario_id)
    values (v_prog.id, 'referido_registrado', (v_par->>'referidor_id')::uuid, v_id, v_user);
  end if;
  select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = (v_par->>'referidor_id')::uuid;
  return jsonb_build_object('ok', true, 'referidor_nombre', v_nombre);
end $$;
revoke all on function public.registrar_referido_ficha(uuid, uuid, text) from public, anon;
grant execute on function public.registrar_referido_ficha(uuid, uuid, text) to authenticated;

create or replace function public.previsualizar_referido(p_empresa uuid, p_paciente uuid, p_codigo text, p_base numeric, p_es_convenio boolean default false, p_bloquea boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_cod jsonb := null; v_disp numeric := 0; v_nombre text;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found or not v_prog.activo then return jsonb_build_object('programa_activo', false); end if;
  if nullif(btrim(coalesce(p_codigo, '')), '') is not null then
    v_cod := app_private.evaluar_referido_venta(v_prog.id, p_codigo, p_paciente, p_base, p_es_convenio, p_bloquea);
    if (v_cod->>'ok')::boolean then
      select btrim(nombres || ' ' || apellidos) into v_nombre from public.pacientes_clinicos where id = (v_cod->>'referidor_id')::uuid;
      v_cod := v_cod || jsonb_build_object('referidor_nombre', v_nombre);
    end if;
  end if;
  if p_paciente is not null then v_disp := app_private.saldo_disponible_monedero(v_prog.id, p_paciente); end if;
  return jsonb_build_object('programa_activo', true, 'nombre', v_prog.nombre, 'codigo', v_cod,
    'credito_disponible', v_disp, 'credito_maximo', least(v_disp, round(coalesce(p_base, 0) * v_prog.tope_uso_porcentaje / 100, 2)));
end $$;
revoke all on function public.previsualizar_referido(uuid, uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.previsualizar_referido(uuid, uuid, text, numeric, boolean, boolean) to authenticated;

create or replace function public.estado_monedero(p_paciente uuid, p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_codigo text;
begin
  if public.rol_referidos(p_empresa) is null then raise exception 'No autorizado'; end if;
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if not found then return jsonb_build_object('programa_activo', false); end if;
  if v_prog.activo and exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = p_empresa) then
    v_codigo := app_private.asegurar_codigo_referido(v_prog.id, p_paciente);
  else
    select codigo into v_codigo from public.codigos_referido where programa_id = v_prog.id and paciente_id = p_paciente;
  end if;
  return jsonb_build_object(
    'programa_activo', v_prog.activo, 'programa_id', v_prog.id, 'nombre', v_prog.nombre, 'prefijo', v_prog.prefijo,
    'descuento_bienvenida', v_prog.descuento_bienvenida, 'compra_minima', v_prog.compra_minima, 'vigencia_dias', v_prog.vigencia_credito_dias,
    'codigo', v_codigo,
    'disponible', app_private.saldo_disponible_monedero(v_prog.id, p_paciente),
    'pendiente', coalesce((select sum(credito_a_otorgar) from public.referidos where programa_id = v_prog.id and referidor_paciente_id = p_paciente and estado = 'en_pago'), 0),
    'vencido', coalesce((select -sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo = 'vencimiento'), 0),
    'generado', coalesce((select sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo in ('credito', 'bono_hito', 'ajuste') and monto > 0), 0),
    'usado', coalesce((select -sum(monto) from public.monedero_movimientos where programa_id = v_prog.id and paciente_id = p_paciente and tipo = 'uso'), 0),
    'exitosos', (select count(*) from public.referidos where programa_id = v_prog.id and referidor_paciente_id = p_paciente and estado = 'recompensado'),
    'referido_por', (select jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'codigo', c.codigo, 'estado', rf.estado)
                       from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referidor_paciente_id join public.codigos_referido c on c.id = rf.codigo_id
                      where rf.programa_id = v_prog.id and rf.referido_paciente_id = p_paciente),
    'referidos', coalesce((select jsonb_agg(jsonb_build_object('nombre', btrim(pc.nombres || ' ' || pc.apellidos), 'estado', rf.estado, 'creado_en', rf.creado_en, 'credito', rf.credito_a_otorgar) order by rf.creado_en desc)
                             from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id
                            where rf.programa_id = v_prog.id and rf.referidor_paciente_id = p_paciente), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
                      select m.tipo, m.monto, m.vence_en, m.motivo, m.creado_en,
                             (select btrim(pc.nombres || ' ' || pc.apellidos) from public.referidos rf join public.pacientes_clinicos pc on pc.id = rf.referido_paciente_id where rf.id = m.referido_id) as referido
                        from public.monedero_movimientos m
                       where m.programa_id = v_prog.id and m.paciente_id = p_paciente
                       order by m.creado_en desc limit 50) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.estado_monedero(uuid, uuid) from public, anon;
grant execute on function public.estado_monedero(uuid, uuid) to authenticated;

-- registrar_venta con código de referido y crédito (REFERIDOS: parámetros y bloques marcados).
drop function if exists public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid);
create or replace function public.registrar_venta(
  p_empresa uuid, p_sucursal uuid, p_cliente text, p_items jsonb, p_pagos jsonb default '[]'::jsonb, p_paciente uuid default null,
  p_codigo_referido text default null, p_usar_credito numeric default 0, p_es_convenio boolean default false, p_autoriza_combinar boolean default false)
returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_user uuid; v_role text; v_sale uuid; v_sub numeric := 0; v_paid numeric := 0; v_favor numeric := 0;
  r record; p record; v_producto record; v_stock_disponible numeric; v_pago uuid; v_precio numeric;
  -- REFERIDOS
  v_prog public.programas_referidos; v_eval jsonb; v_desc numeric := 0; v_cred numeric := 0; v_total numeric; v_base numeric := 0;
  v_hay_desc boolean := false; v_excl text[] := '{}'; v_bloquea boolean; v_ref uuid; v_linea numeric;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = p_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then raise exception 'No autorizado'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto'; end if;

  -- REFERIDOS: programa de la empresa (si existe) y categorías que no cuentan para el beneficio
  select * into v_prog from public.programas_referidos where empresa_id = p_empresa;
  if found then v_excl := coalesce(v_prog.categorias_excluidas, '{}'); end if;

  insert into public.ventas(empresa_id, sucursal_id, paciente_id, cliente_nombre, estado, created_by)
  values (p_empresa, p_sucursal, p_paciente, nullif(p_cliente, ''), 'borrador', v_user) returning id into v_sale;

  for r in select * from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric, descuento numeric, precio_unitario numeric) loop
    select pr.id, pr.nombre, pr.categoria, pr.precio_venta, pr.controla_inventario into v_producto
    from public.productos_catalogo pr where pr.id = r.producto_id and pr.empresa_id = p_empresa and pr.activo;
    if not found then raise exception 'Producto no disponible'; end if;
    v_precio := coalesce(r.precio_unitario, v_producto.precio_venta);
    if v_precio is null or v_precio < 0 then raise exception 'Precio inválido para "%".', v_producto.nombre; end if;
    if v_producto.controla_inventario and v_producto.categoria in ('montura', 'gafas_sol') and p_sucursal is not null then
      select coalesce(cantidad, 0) into v_stock_disponible from public.inventario_stock where producto_id = v_producto.id and sucursal_id = p_sucursal;
      if coalesce(v_stock_disponible, 0) < r.cantidad then raise exception 'No hay stock de "%" en esta sucursal.', v_producto.nombre; end if;
    end if;
    v_linea := greatest(0, r.cantidad * v_precio - coalesce(r.descuento, 0));
    insert into public.venta_items(venta_id, producto_id, descripcion, cantidad, precio_unitario, descuento, total_linea)
    values (v_sale, v_producto.id, v_producto.nombre, r.cantidad, v_precio, coalesce(r.descuento, 0), v_linea);
    -- REFERIDOS: base elegible y detección de otros descuentos
    if not (v_producto.categoria = any (v_excl)) then v_base := v_base + v_linea; end if;
    if coalesce(r.descuento, 0) > 0 then v_hay_desc := true; end if;
    if v_producto.controla_inventario and p_sucursal is not null then
      insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
      values (v_producto.id, p_sucursal, 'salida', r.cantidad, 'Venta', v_sale, v_user);
    end if;
  end loop;

  select coalesce(sum(total_linea), 0) into v_sub from public.venta_items where venta_id = v_sale;

  -- REFERIDOS: descuento de bienvenida y/o crédito (misma transacción, antes de validar los pagos)
  v_bloquea := v_hay_desc and not (coalesce(p_autoriza_combinar, false) and v_role in ('superadmin', 'admin_sucursal'));
  if nullif(btrim(coalesce(p_codigo_referido, '')), '') is not null or coalesce(p_usar_credito, 0) > 0 then
    if v_prog.id is null or not v_prog.activo then raise exception 'El programa de referidos no está activo en esta óptica.'; end if;
  end if;
  if nullif(btrim(coalesce(p_codigo_referido, '')), '') is not null then
    v_eval := app_private.evaluar_referido_venta(v_prog.id, p_codigo_referido, p_paciente, v_base, p_es_convenio, v_bloquea);
    if not (v_eval->>'ok')::boolean then raise exception '%', v_eval->>'motivo'; end if;
    v_desc := (v_eval->>'descuento')::numeric;
  end if;
  if coalesce(p_usar_credito, 0) > 0 then
    if p_paciente is null then raise exception 'Elige el paciente para usar su crédito de referidos.'; end if;
    if coalesce(p_es_convenio, false) then raise exception 'Las ventas de convenio (descuento a rol) no participan en el programa de referidos.'; end if;
    if v_bloquea then raise exception 'Esta venta ya tiene descuentos; solo administración puede combinarlos con el crédito de referidos.'; end if;
    perform 1 from public.pacientes_clinicos where id = p_paciente for update;
    v_cred := round(p_usar_credito, 2);
    if v_cred > round(v_base * v_prog.tope_uso_porcentaje / 100, 2) then
      raise exception 'El crédito no puede superar el % %% de la compra (máximo $%).', v_prog.tope_uso_porcentaje, to_char(round(v_base * v_prog.tope_uso_porcentaje / 100, 2), 'FM999990.00');
    end if;
    if v_cred > app_private.saldo_disponible_monedero(v_prog.id, p_paciente) then raise exception 'El paciente no tiene suficiente crédito de referidos disponible.'; end if;
  end if;
  if v_desc + v_cred > v_sub then raise exception 'El descuento y el crédito no pueden superar el total de la compra.'; end if;
  v_total := v_sub - v_desc - v_cred;

  for p in select * from jsonb_to_recordset(p_pagos) as x(metodo text, monto numeric, referencia text, banco text) loop
    if p.monto <= 0 or p.metodo not in ('efectivo', 'transferencia', 'tarjeta', 'credito', 'otro', 'saldo_favor') then raise exception 'Pago inválido'; end if;
    insert into public.pagos_venta(venta_id, metodo, monto, referencia, banco, recibido_por)
    values (v_sale, p.metodo, p.monto, nullif(p.referencia, ''), case when p.metodo = 'saldo_favor' then null else nullif(p.banco, '') end, v_user)
    returning id into v_pago;
    if p.metodo = 'saldo_favor' then
      if p_paciente is null then raise exception 'Elige el paciente para usar su saldo a favor.'; end if;
      v_favor := v_favor + p.monto;
      insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_uso_id, pago_id, creado_por)
      values (p_paciente, p_empresa, -p.monto, 'uso', v_sale, v_pago, v_user);
    end if;
    v_paid := v_paid + p.monto;
  end loop;
  if v_paid > v_total then raise exception 'Los pagos no pueden superar el total'; end if;
  if v_favor > 0 then
    perform 1 from public.pacientes_clinicos where id = p_paciente for update;
    if (select coalesce(sum(monto), 0) from public.creditos_paciente where paciente_id = p_paciente and empresa_id = p_empresa) < 0 then
      raise exception 'El paciente no tiene suficiente saldo a favor.';
    end if;
  end if;

  -- REFERIDOS: registrar el referido en pago y gastar el crédito ANTES de completar la venta
  if v_desc > 0 then
    if v_eval->>'referido_existente' is not null then
      update public.referidos set estado = 'en_pago', venta_id = v_sale, descuento_aplicado = v_desc, credito_a_otorgar = v_prog.credito_por_referido,
             vigencia_dias = v_prog.vigencia_credito_dias, reglas = to_jsonb(v_prog), aplicado_en = now()
       where id = (v_eval->>'referido_existente')::uuid returning id into v_ref;
    else
      insert into public.referidos (programa_id, codigo_id, referidor_paciente_id, referido_paciente_id, estado, venta_id, descuento_aplicado, credito_a_otorgar, vigencia_dias, reglas, registrado_por, aplicado_en)
      values (v_prog.id, (v_eval->>'codigo_id')::uuid, (v_eval->>'referidor_id')::uuid, p_paciente, 'en_pago', v_sale, v_desc, v_prog.credito_por_referido, v_prog.vigencia_credito_dias, to_jsonb(v_prog), v_user, now())
      returning id into v_ref;
    end if;
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle, usuario_id)
    values (v_prog.id, 'descuento_aplicado', p_paciente, v_ref, v_sale, jsonb_build_object('descuento', v_desc), v_user);
  end if;
  if v_cred > 0 then
    perform app_private.consumir_monedero(v_prog.id, p_paciente, v_cred, 'uso', v_sale, 'Crédito usado en venta', v_user);
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle, usuario_id)
    values (v_prog.id, 'credito_usado', p_paciente, v_sale, jsonb_build_object('monto', v_cred), v_user);
  end if;

  update public.ventas set subtotal = v_sub, descuento = v_desc + v_cred, total = v_total, pagado = v_paid, saldo = v_total - v_paid, estado = 'completada', actualizado_en = now() where id = v_sale;
  return v_sale;
end;
$function$;
revoke all on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.registrar_venta(uuid, uuid, text, jsonb, jsonb, uuid, text, numeric, boolean, boolean) to authenticated;
```

Nota: los mensajes de `raise exception` con `%%` escriben un `%` literal (dentro de `raise` el formato usa `%` como marcador).

- [ ] **Step 4: Ejecutar y verificar que pasa**

Enviar `[migración 3] + [preludio] + [prueba]`.
Expected: error `PRUEBAS_OK: venta con referido (C1-C16)`. Si un caso falla, leer el mensaje `FALLO Cn` y corregir la **migración** (no la prueba) salvo que el fallo sea un dato de prueba.

- [ ] **Step 5: Aplicar y revisar**

`apply_migration` (name `referidos_venta`) → `get_advisors`. Verificar con `select pg_get_function_identity_arguments(oid) from pg_proc where proname='registrar_venta';` que existe **una sola** firma (la de 10 parámetros), sin huérfana (L3).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261015120000_referidos_venta.sql supabase/tests/referidos_03_venta.sql
git commit -m "feat(referidos): validación, monedero y descuento/crédito dentro de registrar_venta

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Migración 4 — recompensa al 100 % pagado, bonos y reversas

**Files:**
- Create: `supabase/migrations/20261015130000_referidos_recompensas.sql`
- Create: `supabase/tests/referidos_04_recompensa.sql`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `app_private.otorgar_recompensa(p_referido uuid) returns void` (idempotente); `app_private.revertir_referido_venta(p_venta uuid) returns void`; `app_private.procesar_recompensas_pendientes(p_programa uuid) returns integer` (reemplaza el marcador de la Task 2); trigger `trg_ventas_referidos` AFTER UPDATE en `public.ventas`.

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_04_recompensa.sql` (se ejecuta como `[migración 4] + [preludio] + [este archivo]`):

```sql
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  v_prog uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; k uuid; ref uuid;
  ca text; s uuid; s2 uuid; n int; v_monto numeric; v_disp numeric; r record; i int;
  lote uuid; v_vence timestamptz;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  a := pg_temp.paciente('Ana', '0993000001', v_focus, v_sf);
  select codigo into ca from public.codigos_referido where programa_id = v_prog and paciente_id = a;

  -- D1: pago parcial no paga nada; el abono final sí, una sola vez, con vencimiento a 60 días
  b := pg_temp.paciente('Beto', '0993000002', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, b, ca, 150, 100);
  if exists (select 1 from public.monedero_movimientos where paciente_id = a) then raise exception 'FALLO D1a: crédito antes de pagar el 100 %%'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.registrar_abono_venta(s, 'efectivo', 35);
  reset role;
  select count(*), max(monto), max(vence_en) into n, v_monto, v_vence from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 1 or v_monto <> 10 then raise exception 'FALLO D1b: crédito %, monto %', n, v_monto; end if;
  if v_vence < now() + interval '59 days' or v_vence > now() + interval '61 days' then raise exception 'FALLO D1c: vencimiento %', v_vence; end if;
  if (select estado from public.referidos where venta_id = s) <> 'recompensado' then raise exception 'FALLO D1d: estado'; end if;

  -- D2: tocar la venta de nuevo no duplica (idempotencia)
  update public.ventas set actualizado_en = now() where id = s;
  select id into ref from public.referidos where venta_id = s;
  perform app_private.otorgar_recompensa(ref);
  select count(*) into n from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 1 then raise exception 'FALLO D2: se duplicó la recompensa (%)', n; end if;

  -- D4 (Review Focus 2): venta pagada completa al registrar dispara la recompensa en el mismo paso
  c := pg_temp.paciente('Carla', '0993000003', v_focus, v_sf);
  s := pg_temp.vender(v_focus, v_sf, vf, c, ca, 150, 135);
  if (select estado from public.referidos where venta_id = s) <> 'recompensado' then raise exception 'FALLO D4a: no se otorgó al pagar todo de una vez'; end if;
  select count(*) into n from public.monedero_movimientos where paciente_id = a and tipo = 'credito';
  if n <> 2 then raise exception 'FALLO D4b: créditos %', n; end if;

  -- D5: bono de 3 referidos ($15) una sola vez; bono de 5 ($25) con el quinto
  d := pg_temp.paciente('Dani', '0993000004', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, d, ca, 150, 135);
  select count(*), max(monto) into n, v_monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito' and hito = 3;
  if n <> 1 or v_monto <> 15 then raise exception 'FALLO D5a: bono de 3 (% / %)', n, v_monto; end if;
  e := pg_temp.paciente('Eva', '0993000005', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, e, ca, 150, 135);
  f := pg_temp.paciente('Fer', '0993000006', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, f, ca, 150, 135);
  select count(*), max(monto) into n, v_monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito';
  if n <> 2 then raise exception 'FALLO D5b: bonos %', n; end if;
  if (select monto from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito' and hito = 5) <> 25 then raise exception 'FALLO D5c: bono de 5'; end if;
  k := pg_temp.paciente('Kiko', '0993000007', v_focus, v_sf);
  perform pg_temp.vender(v_focus, v_sf, vf, k, ca, 150, 135);
  if (select count(*) from public.monedero_movimientos where paciente_id = a and tipo = 'bono_hito') <> 2 then raise exception 'FALLO D5d: el bono se repitió'; end if;

  -- D6: cambiar la configuración no altera lo ya generado (monto congelado en el referido)
  update public.programas_referidos set credito_por_referido = 10 where id = v_prog;
  declare a2 uuid; ca2 text; g uuid; sg uuid;
  begin
    a2 := pg_temp.paciente('Ana2', '0993000010', v_focus, v_sf);
    select codigo into ca2 from public.codigos_referido where programa_id = v_prog and paciente_id = a2;
    g := pg_temp.paciente('Gabo', '0993000011', v_focus, v_sf);
    sg := pg_temp.vender(v_focus, v_sf, vf, g, ca2, 150, 100);
    update public.programas_referidos set credito_por_referido = 99 where id = v_prog;
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.registrar_abono_venta(sg, 'efectivo', 35);
    reset role;
    if (select monto from public.monedero_movimientos where paciente_id = a2 and tipo = 'credito') <> 10 then raise exception 'FALLO D6: el crédito usó la regla nueva'; end if;
    update public.programas_referidos set credito_por_referido = 10 where id = v_prog;
  end;

  -- D7: recompensas suspendidas dejan el referido "en_pago"; al reanudar se otorgan
  declare a3 uuid; ca3 text; h uuid; sh uuid;
  begin
    a3 := pg_temp.paciente('Ana3', '0993000020', v_focus, v_sf);
    select codigo into ca3 from public.codigos_referido where programa_id = v_prog and paciente_id = a3;
    update public.programas_referidos set recompensas_suspendidas = true where id = v_prog;
    h := pg_temp.paciente('Hugo', '0993000021', v_focus, v_sf);
    sh := pg_temp.vender(v_focus, v_sf, vf, h, ca3, 150, 135);
    if (select estado from public.referidos where venta_id = sh) <> 'en_pago' or exists (select 1 from public.monedero_movimientos where paciente_id = a3) then
      raise exception 'FALLO D7a: se otorgó con recompensas suspendidas';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.guardar_programa_referidos(v_prog, '{"recompensas_suspendidas": false}'::jsonb);
    reset role;
    if (select estado from public.referidos where venta_id = sh) <> 'recompensado' or (select count(*) from public.monedero_movimientos where paciente_id = a3 and tipo = 'credito') <> 1 then
      raise exception 'FALLO D7b: no se otorgó al reanudar';
    end if;
  end;

  -- D8: usar crédito: máximo 20 %% de la compra, nunca más que el saldo, y gasta el lote que vence antes
  declare p uuid; l1 uuid; l2 uuid; sv uuid;
  begin
    p := pg_temp.paciente('Pau', '0993000030', v_focus, v_sf);
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '30 days', 'lote largo prueba') returning id into l1;
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
      values (v_prog, p, 'ajuste', 10, now() + interval '5 days', 'lote corto prueba') returning id into l2;
    perform pg_temp.vender_falla('D8a', 'no puede superar', v_focus, v_sf, vf, p, null, 100, 0, 25);
    sv := pg_temp.vender(v_focus, v_sf, vf, p, null, 100, 87, 13);
    select * into r from public.ventas where id = sv;
    if r.descuento <> 13 or r.total <> 87 or r.saldo <> 0 then raise exception 'FALLO D8b: totales % / % / %', r.descuento, r.total, r.saldo; end if;
    if (select -sum(monto) from public.monedero_movimientos where lote_id = l2 and tipo = 'uso') <> 10 or (select -sum(monto) from public.monedero_movimientos where lote_id = l1 and tipo = 'uso') <> 3 then
      raise exception 'FALLO D8c: no gastó primero el lote que vence antes';
    end if;
    if app_private.saldo_disponible_monedero(v_prog, p) <> 7 then raise exception 'FALLO D8d: saldo %', app_private.saldo_disponible_monedero(v_prog, p); end if;
    perform pg_temp.vender_falla('D8e', 'suficiente crédito', v_focus, v_sf, vf, p, null, 200, 0, 8);
    -- D8f: el crédito no entra a caja ni cuenta como cobro: pagado = lo que pagó en efectivo
    if r.pagado <> 87 then raise exception 'FALLO D8f: pagado %', r.pagado; end if;
  end;

  -- D9 (Review Focus 3): anular la venta del referido con el crédito ya gastado
  declare ra uuid; cra text; rb uuid; srb uuid; sgasto uuid; rest numeric;
  begin
    ra := pg_temp.paciente('Rafa', '0993000040', v_focus, v_sf);
    select codigo into cra from public.codigos_referido where programa_id = v_prog and paciente_id = ra;
    rb := pg_temp.paciente('Rita', '0993000041', v_focus, v_sf);
    srb := pg_temp.vender(v_focus, v_sf, vf, rb, cra, 150, 135);          -- Rafa gana $10
    sgasto := pg_temp.vender(v_focus, v_sf, vf, ra, null, 100, 96, 4);   -- Rafa gasta $4
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(srb, 'Prueba de anulación del referido', 'credito');
    reset role;
    if (select estado from public.referidos where venta_id = srb) <> 'revertido' then raise exception 'FALLO D9a: el referido no quedó revertido'; end if;
    if (select -monto from public.monedero_movimientos where paciente_id = ra and tipo = 'reversa') <> 6 then raise exception 'FALLO D9b: debía revertirse solo lo no gastado ($6)'; end if;
    if app_private.saldo_disponible_monedero(v_prog, ra) <> 0 then raise exception 'FALLO D9c: saldo distinto de 0'; end if;
    if (select coalesce(sum(monto), 0) from public.monedero_movimientos where paciente_id = ra) < 0 then raise exception 'FALLO D9d: saldo negativo'; end if;
    if not exists (select 1 from public.referidos_auditoria where evento = 'reversa_incompleta' and referido_id = (select id from public.referidos where venta_id = srb) and (detalle->>'no_recuperado')::numeric = 4) then
      raise exception 'FALLO D9e: falta la marca de reversa incompleta ($4 gastados)';
    end if;
    -- D10: anular la venta donde se usó crédito devuelve ese crédito al monedero
    perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.anular_venta_con_modo(sgasto, 'Prueba de anulación con crédito usado', 'credito');
    reset role;
    if (select monto from public.monedero_movimientos where paciente_id = ra and tipo = 'devolucion') <> 4 then raise exception 'FALLO D10: no se devolvió el crédito usado'; end if;
  end;

  raise exception 'PRUEBAS_OK: recompensas, bonos y reversas (D1-D10)';
end $$;
```

Nota para quien ejecute: el bloque `declare … begin … end;` anidado dentro del `do` es un sub-bloque válido de PL/pgSQL; si el preludio cambia los nombres de variables de sesión, ajustar solo el preludio.

- [ ] **Step 2: Ejecutar y verificar que falla**

Enviar `[preludio] + [prueba]`.
Expected: `FALLO D1a`/`D1b` (aún nada otorga recompensas) o `function app_private.otorgar_recompensa does not exist`.

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/20261015130000_referidos_recompensas.sql`:

```sql
-- Referidos y recompensas, fase 1 (4/5): recompensa al 100 % pagado, bonos por hito y reversas.

create or replace function app_private.otorgar_recompensa(p_referido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; v_prog public.programas_referidos; v_cuenta integer; v_hito integer; v_bono numeric;
begin
  select * into r from public.referidos where id = p_referido and estado = 'en_pago' for update;
  if not found then return; end if;
  select * into v_prog from public.programas_referidos where id = r.programa_id;
  if v_prog.recompensas_suspendidas then
    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'recompensa_en_espera', r.referidor_paciente_id, r.id, r.venta_id, jsonb_build_object('motivo', 'recompensas suspendidas'));
    return;
  end if;
  if r.credito_a_otorgar > 0 then
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, referido_id, venta_id)
    values (r.programa_id, r.referidor_paciente_id, 'credito', r.credito_a_otorgar,
            now() + make_interval(days => coalesce(r.vigencia_dias, v_prog.vigencia_credito_dias)), r.id, r.venta_id)
    on conflict do nothing;
  end if;
  update public.referidos set estado = 'recompensado', pagado_en = now() where id = r.id;
  select count(*) into v_cuenta from public.referidos
   where programa_id = r.programa_id and referidor_paciente_id = r.referidor_paciente_id and estado = 'recompensado';
  foreach v_hito in array array[3, 5] loop
    if v_cuenta >= v_hito then
      v_bono := case v_hito when 3 then v_prog.bono_3_referidos else v_prog.bono_5_referidos end;
      if v_bono > 0 then
        insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, referido_id, hito, venta_id)
        values (r.programa_id, r.referidor_paciente_id, 'bono_hito', v_bono, now() + make_interval(days => v_prog.vigencia_credito_dias), r.id, v_hito, r.venta_id)
        on conflict do nothing;
      end if;
    end if;
  end loop;
  insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
  values (r.programa_id, 'recompensa_otorgada', r.referidor_paciente_id, r.id, r.venta_id, jsonb_build_object('credito', r.credito_a_otorgar, 'exitosos', v_cuenta));
end $$;
revoke all on function app_private.otorgar_recompensa(uuid) from public, anon, authenticated;

-- Reemplaza el marcador de la Task 2: otorga lo que quedó "en_pago" con la venta ya pagada.
create or replace function app_private.procesar_recompensas_pendientes(p_programa uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select rf.id from public.referidos rf join public.ventas v on v.id = rf.venta_id
     where rf.programa_id = p_programa and rf.estado = 'en_pago' and v.estado = 'completada' and v.saldo <= 0
  loop
    perform app_private.otorgar_recompensa(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.procesar_recompensas_pendientes(uuid) from public, anon, authenticated;

-- Anulación: revierte lo no gastado y devuelve el crédito usado en la venta anulada.
create or replace function app_private.revertir_referido_venta(p_venta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.referidos; l record; u record; v_cuenta integer; v_hito integer; v_no_recuperado numeric;
begin
  for r in select * from public.referidos where venta_id = p_venta and estado in ('en_pago', 'recompensado') for update loop
    v_no_recuperado := 0;
    if r.estado = 'recompensado' then
      for l in
        select m.id, m.monto, sum(x.monto) as restante
        from public.monedero_movimientos m join public.monedero_movimientos x on x.id = m.id or x.lote_id = m.id
        where m.referido_id = r.id and m.tipo = 'credito'
        group by m.id, m.monto
      loop
        if l.restante > 0 then
          insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo)
          values (r.programa_id, r.referidor_paciente_id, 'reversa', -l.restante, l.id, p_venta, 'Venta del referido anulada') on conflict do nothing;
        end if;
        v_no_recuperado := v_no_recuperado + (l.monto - l.restante);
      end loop;
    end if;
    update public.referidos set estado = 'revertido' where id = r.id;

    -- Bonos por hito que ya no corresponden con los referidos que siguen vigentes
    select count(*) into v_cuenta from public.referidos
     where programa_id = r.programa_id and referidor_paciente_id = r.referidor_paciente_id and estado = 'recompensado';
    foreach v_hito in array array[3, 5] loop
      if v_cuenta < v_hito then
        for l in
          select m.id, m.monto, sum(x.monto) as restante
          from public.monedero_movimientos m join public.monedero_movimientos x on x.id = m.id or x.lote_id = m.id
          where m.programa_id = r.programa_id and m.paciente_id = r.referidor_paciente_id and m.tipo = 'bono_hito' and m.hito = v_hito
          group by m.id, m.monto
        loop
          if l.restante > 0 then
            insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, venta_id, motivo)
            values (r.programa_id, r.referidor_paciente_id, 'reversa', -l.restante, l.id, p_venta, 'Bono por hito ya no corresponde') on conflict do nothing;
          end if;
          v_no_recuperado := v_no_recuperado + (l.monto - l.restante);
        end loop;
      end if;
    end loop;

    insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
    values (r.programa_id, 'referido_revertido', r.referidor_paciente_id, r.id, p_venta, jsonb_build_object('no_recuperado', v_no_recuperado));
    if v_no_recuperado > 0 then
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, referido_id, venta_id, detalle)
      values (r.programa_id, 'reversa_incompleta', r.referidor_paciente_id, r.id, p_venta, jsonb_build_object('no_recuperado', v_no_recuperado, 'nota', 'El crédito ya se había gastado; revisar con la superadministradora.'));
    end if;
  end loop;

  -- Crédito que quien compró usó en la venta anulada: vuelve al monedero mientras no haya vencido.
  for u in
    select x.programa_id, x.paciente_id, -sum(x.monto) as total, max(l.vence_en) as vence
    from public.monedero_movimientos x join public.monedero_movimientos l on l.id = x.lote_id
    where x.venta_id = p_venta and x.tipo = 'uso'
    group by x.programa_id, x.paciente_id
  loop
    if u.vence > now() then
      insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, venta_id, motivo)
      values (u.programa_id, u.paciente_id, 'devolucion', u.total, u.vence, p_venta, 'Venta anulada: se devuelve el crédito usado') on conflict do nothing;
    else
      insert into public.referidos_auditoria (programa_id, evento, paciente_id, venta_id, detalle)
      values (u.programa_id, 'credito_vencido_no_devuelto', u.paciente_id, p_venta, jsonb_build_object('monto', u.total));
    end if;
  end loop;
end $$;
revoke all on function app_private.revertir_referido_venta(uuid) from public, anon, authenticated;

create or replace function app_private.trg_ventas_referidos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.estado = 'completada' and new.saldo <= 0 and (old.estado is distinct from 'completada' or old.saldo > 0) then
    for r in select id from public.referidos where venta_id = new.id and estado = 'en_pago' loop
      perform app_private.otorgar_recompensa(r.id);
    end loop;
  elsif new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    perform app_private.revertir_referido_venta(new.id);
  end if;
  return new;
end $$;
revoke all on function app_private.trg_ventas_referidos() from public, anon, authenticated;
drop trigger if exists trg_ventas_referidos on public.ventas;
create trigger trg_ventas_referidos after update on public.ventas
  for each row execute function app_private.trg_ventas_referidos();
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Enviar `[migración 4] + [preludio] + [prueba]`.
Expected: error `PRUEBAS_OK: recompensas, bonos y reversas (D1-D10)`.

Si D9/D10 fallan porque `anular_venta_con_modo` exige un dato que el escenario no cumple (por ejemplo inventario), corregir el escenario del preludio, no la lógica de referidos.

- [ ] **Step 5: Aplicar y revisar**

`apply_migration` (name `referidos_recompensas`) → `get_advisors`. Comprobar con una consulta de solo lectura que el trigger existe: `select tgname from pg_trigger where tgrelid='public.ventas'::regclass and not tgisinternal;` → incluye `trg_ventas_referidos`, `trg_validar_transicion_venta` y `trg_auditar_operacion_venta`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261015130000_referidos_recompensas.sql supabase/tests/referidos_04_recompensa.sql
git commit -m "feat(referidos): recompensa al 100% pagado, bonos por hito y reversas por anulación

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migración 5 — vencimientos, ajuste manual y cron

**Files:**
- Create: `supabase/migrations/20261015140000_referidos_vencimientos_ajustes.sql`
- Create: `supabase/tests/referidos_05_vencimientos.sql`
- Create: `app/api/cron/referidos-vencimientos/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces: `public.vencer_creditos_referidos() returns integer` (solo `service_role`); `public.ajustar_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_motivo text) returns jsonb` (solo superadmin).

- [ ] **Step 1: Escribir la prueba que falla**

Create `supabase/tests/referidos_05_vencimientos.sql` (se ejecuta como `[migración 5] + [preludio] + [este archivo]`):

```sql
do $$
declare
  v_focus uuid := current_setting('t.focus')::uuid;
  v_sf uuid := current_setting('t.suc_focus')::uuid;
  vf uuid := current_setting('t.vend_focus')::uuid;
  su uuid := current_setting('t.su')::uuid;
  v_prog uuid; p uuid; l_vencido uuid; l_vigente uuid; n int; estado jsonb;
begin
  select id into v_prog from public.programas_referidos where empresa_id = v_focus;
  p := pg_temp.paciente('Vence', '0994000001', v_focus, v_sf);
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, p, 'ajuste', 7, now() - interval '1 day', 'lote vencido prueba') returning id into l_vencido;
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo)
    values (v_prog, p, 'ajuste', 5, now() + interval '10 days', 'lote vigente prueba') returning id into l_vigente;

  -- E2 (Review Focus 5): el crédito vencido que el cron aún no procesó no se puede usar
  if app_private.saldo_disponible_monedero(v_prog, p) <> 5 then raise exception 'FALLO E2a: el saldo cuenta lo vencido (%)', app_private.saldo_disponible_monedero(v_prog, p); end if;
  perform pg_temp.vender_falla('E2b', 'suficiente crédito', v_focus, v_sf, vf, p, null, 200, 0, 8);

  -- E3: el cron anota el vencimiento una sola vez y no toca el lote vigente
  n := public.vencer_creditos_referidos();
  if n < 1 then raise exception 'FALLO E3a: no procesó vencimientos (%)', n; end if;
  if (select count(*) from public.monedero_movimientos where lote_id = l_vencido and tipo = 'vencimiento' and monto = -7) <> 1 then raise exception 'FALLO E3b: falta el vencimiento'; end if;
  if exists (select 1 from public.monedero_movimientos where lote_id = l_vigente and tipo = 'vencimiento') then raise exception 'FALLO E3c: venció un lote vigente'; end if;
  perform public.vencer_creditos_referidos();
  if (select count(*) from public.monedero_movimientos where lote_id = l_vencido and tipo = 'vencimiento') <> 1 then raise exception 'FALLO E3d: se duplicó el vencimiento'; end if;

  -- E4: un usuario normal no puede ejecutar el cron
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.vencer_creditos_referidos();
    reset role; raise exception 'FALLO E4: un vendedor ejecutó el vencimiento';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;

  -- E5: estado_monedero muestra lo vencido y lo disponible
  perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  estado := public.estado_monedero(p, v_focus);
  reset role;
  if (estado->>'vencido')::numeric <> 7 or (estado->>'disponible')::numeric <> 5 then raise exception 'FALLO E5: estado %', estado; end if;

  -- E6: ajustes manuales — solo superadmin, con motivo, nunca más que el saldo
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', vf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.ajustar_monedero(v_prog, p, 10, 'Intento de vendedor');
    reset role; raise exception 'FALLO E6a: un vendedor ajustó el monedero';
  exception when others then
    reset role;
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', su, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.ajustar_monedero(v_prog, p, 20, 'Cortesía autorizada por Shuyana');
  perform public.ajustar_monedero(v_prog, p, -5, 'Corrección de cortesía');
  begin
    perform public.ajustar_monedero(v_prog, p, -500, 'Intento de dejar saldo negativo');
    reset role; raise exception 'FALLO E6b: se aceptó dejar el saldo negativo';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  begin
    perform public.ajustar_monedero(v_prog, p, 3, 'no');
    reset role; raise exception 'FALLO E6c: se aceptó un motivo corto';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
  end;
  reset role;
  if app_private.saldo_disponible_monedero(v_prog, p) <> 20 then raise exception 'FALLO E6d: saldo tras ajustes %', app_private.saldo_disponible_monedero(v_prog, p); end if;
  if (select count(*) from public.referidos_auditoria where evento = 'ajuste_manual' and paciente_id = p) <> 2 then raise exception 'FALLO E6e: falta auditoría de ajustes'; end if;

  raise exception 'PRUEBAS_OK: vencimientos y ajustes (E2-E6)';
end $$;
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Enviar `[preludio] + [prueba]`.
Expected: error `function public.vencer_creditos_referidos() does not exist`.

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/20261015140000_referidos_vencimientos_ajustes.sql`:

```sql
-- Referidos y recompensas, fase 1 (5/5): vencimientos (cron) y ajustes manuales.

create or replace function public.vencer_creditos_referidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, lote_id, motivo)
  select l.programa_id, l.paciente_id, 'vencimiento', -sum(m.monto), l.id, 'Crédito vencido'
  from public.monedero_movimientos l
  join public.monedero_movimientos m on m.id = l.id or m.lote_id = l.id
  where l.monto > 0 and l.vence_en <= now()
  group by l.id, l.programa_id, l.paciente_id
  having sum(m.monto) > 0
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.vencer_creditos_referidos() from public, anon, authenticated;
grant execute on function public.vencer_creditos_referidos() to service_role;

create or replace function public.ajustar_monedero(p_programa uuid, p_paciente uuid, p_monto numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prog public.programas_referidos; v_user uuid; v_consumido numeric;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora puede ajustar un monedero.'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indica el motivo del ajuste (mínimo 5 caracteres).'; end if;
  if p_monto is null or p_monto = 0 then raise exception 'El monto del ajuste no puede ser cero.'; end if;
  select * into v_prog from public.programas_referidos where id = p_programa;
  if not found then raise exception 'Programa no encontrado.'; end if;
  if not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_prog.empresa_id) then
    raise exception 'El paciente no pertenece a esta óptica.';
  end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo;
  perform 1 from public.pacientes_clinicos where id = p_paciente for update;
  if p_monto > 0 then
    insert into public.monedero_movimientos (programa_id, paciente_id, tipo, monto, vence_en, motivo, creado_por)
    values (p_programa, p_paciente, 'ajuste', round(p_monto, 2), now() + make_interval(days => v_prog.vigencia_credito_dias), btrim(p_motivo), v_user);
  else
    v_consumido := app_private.consumir_monedero(p_programa, p_paciente, -p_monto, 'ajuste', null, btrim(p_motivo), v_user);
    if v_consumido < round(-p_monto, 2) then
      raise exception 'El paciente solo tiene $% disponible.', to_char(v_consumido, 'FM999990.00');
    end if;
  end if;
  insert into public.referidos_auditoria (programa_id, evento, paciente_id, detalle, usuario_id)
  values (p_programa, 'ajuste_manual', p_paciente, jsonb_build_object('monto', round(p_monto, 2), 'motivo', btrim(p_motivo)), v_user);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.ajustar_monedero(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_monedero(uuid, uuid, numeric, text) to authenticated;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Enviar `[migración 5] + [preludio] + [prueba]`.
Expected: error `PRUEBAS_OK: vencimientos y ajustes (E2-E6)`.

- [ ] **Step 5: Aplicar, revisar y escribir el cron**

`apply_migration` (name `referidos_vencimientos_ajustes`) → `get_advisors`.

Create `app/api/cron/referidos-vencimientos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, hasSupabaseAdminConfiguration } from "@/lib/supabase/admin";

// Vence los créditos de referidos cuya fecha ya pasó (Vercel Cron, 07:00 UTC = 02:00 Ecuador).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!hasSupabaseAdminConfiguration()) return NextResponse.json({ ok: true, omitido: "Falta configuración de Supabase." });
  const { data, error } = await createSupabaseAdminClient().rpc("vencer_creditos_referidos");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vencidos: data });
}
```

Modify `vercel.json` (queda así):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["pdx1"],
  "crons": [
    { "path": "/api/cron/mensajes", "schedule": "0 16 * * *" },
    { "path": "/api/cron/referidos-vencimientos", "schedule": "0 7 * * *" }
  ]
}
```

- [ ] **Step 6: Verificar y commit**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

```bash
git add supabase/migrations/20261015140000_referidos_vencimientos_ajustes.sql supabase/tests/referidos_05_vencimientos.sql app/api/cron/referidos-vencimientos/route.ts vercel.json
git commit -m "feat(referidos): vencimiento diario de créditos y ajustes manuales auditados

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Textos de WhatsApp y etiquetas (TypeScript puro)

**Files:**
- Create: `lib/referidos-textos.ts`
- Modify: `lib/whatsapp.ts` (agregar al final)
- Test: `tests/referidos-textos.test.cjs`

**Interfaces:**
- Produces (`lib/referidos-textos.ts`): tipos `EstadoMonedero`, `PreviewReferido`, `ProgramaReferidos`; funciones `dinero(n: number): string`, `mensajeCompartirCodigo(programa: { prefijo: string; descuento_bienvenida: number }, codigo: string): string`, `estadoReferidoLabel(estado: string): string`, `tipoMovimientoLabel(tipo: string): string`.
- Produces (`lib/whatsapp.ts`): `enlaceCompartirWhatsapp(mensaje: string): string`.

- [ ] **Step 1: Escribir la prueba que falla**

Create `tests/referidos-textos.test.cjs`:

```js
// Run with: node --test tests/referidos-textos.test.cjs
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

const { dinero, mensajeCompartirCodigo, estadoReferidoLabel, tipoMovimientoLabel } = load('referidos-textos');
const { enlaceCompartirWhatsapp } = load('whatsapp');

test('dinero omite los decimales enteros y conserva los reales', () => {
  assert.equal(dinero(10), '$10');
  assert.equal(dinero(12.5), '$12.50');
});

test('mensaje de Círculo Shu', () => {
  const t = mensajeCompartirCodigo({ prefijo: 'SHU', descuento_bienvenida: 10 }, 'SHU-000458');
  assert.match(t, /CÍRCULO SHU/);
  assert.match(t, /Compartir una buena visión tiene recompensa\./);
  assert.match(t, /SHU-000458/);
  assert.match(t, /\$10 de descuento en tu primera compra de lentes/);
  assert.match(t, /Aplican condiciones\./);
  assert.doesNotMatch(t, /\*/);
});

test('mensaje de Focus Friends', () => {
  const t = mensajeCompartirCodigo({ prefijo: 'FOC', descuento_bienvenida: 15 }, 'FOC-000235');
  assert.match(t, /FOCUS FRIENDS/);
  assert.match(t, /Ver bien es mejor entre amigos\./);
  assert.match(t, /FOC-000235/);
  assert.match(t, /\$15 de descuento/);
  assert.doesNotMatch(t, /CÍRCULO/);
});

test('etiquetas en español', () => {
  assert.equal(estadoReferidoLabel('en_pago'), 'Esperando el pago completo');
  assert.equal(estadoReferidoLabel('recompensado'), 'Recompensado');
  assert.equal(estadoReferidoLabel('desconocido'), 'desconocido');
  assert.equal(tipoMovimientoLabel('bono_hito'), 'Bono por referidos');
  assert.equal(tipoMovimientoLabel('uso'), 'Crédito usado');
});

test('el enlace de compartir no lleva número y codifica el texto', () => {
  const url = enlaceCompartirWhatsapp('Hola mundo\nSegunda línea');
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.ok(url.includes(encodeURIComponent('Segunda línea')));
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `node --test tests/referidos-textos.test.cjs`
Expected: FAIL (`ENOENT … lib/referidos-textos.ts`).

- [ ] **Step 3: Escribir la implementación**

Create `lib/referidos-textos.ts`:

```ts
// Tipos y textos puros de referidos (sin dependencias del servidor: se importan también desde pantallas de cliente).

export type ProgramaReferidos = {
  id: string; empresa_id: string; nombre: string; prefijo: string; activo: boolean; recompensas_suspendidas: boolean;
  compra_minima: number; descuento_bienvenida: number; credito_por_referido: number; bono_3_referidos: number; bono_5_referidos: number;
  vigencia_credito_dias: number; tope_uso_porcentaje: number; presupuesto_mensual: number | null;
  campana_desde: string | null; campana_hasta: string | null; categorias_excluidas: string[];
};

export type MovimientoMonedero = { tipo: string; monto: number; vence_en: string | null; motivo: string | null; creado_en: string; referido: string | null };
export type ReferidoDeUnPaciente = { nombre: string; estado: string; creado_en: string; credito: number };
export type EstadoMonedero = {
  programa_activo: boolean; programa_id?: string; nombre?: string; prefijo?: string; descuento_bienvenida?: number; compra_minima?: number; vigencia_dias?: number;
  codigo?: string | null; disponible?: number; pendiente?: number; vencido?: number; generado?: number; usado?: number; exitosos?: number;
  referido_por?: { nombre: string; codigo: string; estado: string } | null; referidos?: ReferidoDeUnPaciente[]; movimientos?: MovimientoMonedero[];
};
export type PreviewReferido = {
  programa_activo: boolean; nombre?: string;
  codigo?: { ok: boolean; motivo?: string; descuento?: number; credito?: number; referidor_nombre?: string } | null;
  credito_disponible?: number; credito_maximo?: number;
};

export const dinero = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Mensaje que la persona envía por WhatsApp (sin asteriscos: LumOS los limpia en los mensajes manuales).
export function mensajeCompartirCodigo(programa: { prefijo: string; descuento_bienvenida: number }, codigo: string): string {
  const descuento = dinero(Number(programa.descuento_bienvenida));
  if (programa.prefijo === "FOC") {
    return `FOCUS FRIENDS\nVer bien es mejor entre amigos.\n\nUsa mi código ${codigo} y recibe ${descuento} de descuento en tu primera compra de lentes.\n\nAplican condiciones.`;
  }
  return `CÍRCULO SHU\nCompartir una buena visión tiene recompensa.\n\nUsa mi código ${codigo} y recibe ${descuento} de descuento en tu primera compra de lentes.\n\nAplican condiciones.`;
}

const estados: Record<string, string> = {
  registrado: "Registrado, aún no compra", en_pago: "Esperando el pago completo", recompensado: "Recompensado", rechazado: "Rechazado", revertido: "Revertido",
};
export const estadoReferidoLabel = (estado: string): string => estados[estado] ?? estado;

const tipos: Record<string, string> = {
  credito: "Crédito por referido", bono_hito: "Bono por referidos", ajuste: "Ajuste", devolucion: "Crédito devuelto",
  uso: "Crédito usado", vencimiento: "Crédito vencido", reversa: "Reversa",
};
export const tipoMovimientoLabel = (tipo: string): string => tipos[tipo] ?? tipo;
```

Append to `lib/whatsapp.ts`:

```ts

// Enlace para que una persona elija a quién enviar el mensaje (sin número de destino).
export function enlaceCompartirWhatsapp(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(textoSeguroWhatsapp(mensaje))}`;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `node --test tests/referidos-textos.test.cjs && npx tsc --noEmit`
Expected: 5 pruebas PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add lib/referidos-textos.ts lib/whatsapp.ts tests/referidos-textos.test.cjs
git commit -m "feat(referidos): textos de WhatsApp, etiquetas y tipos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Capa de datos y acciones del servidor

**Files:**
- Create: `lib/referidos.ts`
- Create: `app/referidos/actions.ts`
- Modify: `app/ventas/actions.ts` (función `registrarVenta`)
- Modify: `app/pacientes/actions.ts` (función `crearPacienteClinico`)

**Interfaces:**
- Consumes: Task 3–5 (funciones SQL) y Task 6 (tipos).
- Produces:
  - `getReferidosConfig(): Promise<ReferidosConfigData>` con `{ status: "ready" | "needs_login" | "forbidden" | "error"; message?: string; programas: (ProgramaReferidos & { empresa_nombre: string })[]; historial: { id: string; programa_id: string; evento: string; detalle: Record<string, unknown>; creado_en: string }[] }`
  - `obtenerEstadoMonedero(pacienteId: string, empresaId: string): Promise<EstadoMonedero>`
  - `buscarCodigoReferido(empresaId: string, codigo: string): Promise<{ encontrado: boolean; nombre?: string }>`
  - `registrarReferidoFicha(pacienteId: string, empresaId: string, codigo: string): Promise<{ referidor_nombre: string }>`
  - `previsualizarReferido(args: { empresaId: string; pacienteId: string | null; codigo: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean }): Promise<PreviewReferido>`
  - `ajustarMonedero(data: FormData): Promise<void>` (campos `programa_id`, `paciente_id`, `monto`, `motivo`)
  - `guardarProgramaReferidos(data: FormData): Promise<void>` (campos del programa; ver el código)
  - `registrarVenta` acepta además `codigo_referido`, `usar_credito`, `es_convenio`.
  - `crearPacienteClinico` devuelve además `referido: { ok: boolean; mensaje: string } | null`.

- [ ] **Step 1: Cargador de configuración**

Create `lib/referidos.ts`:

```ts
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { getOperationalContext } from "@/lib/operational-context";
import type { ProgramaReferidos } from "@/lib/referidos-textos";

export type ReferidosConfigData = {
  status: "ready" | "needs_login" | "forbidden" | "error";
  message?: string;
  programas: (ProgramaReferidos & { empresa_nombre: string })[];
  historial: { id: string; programa_id: string; evento: string; detalle: Record<string, unknown>; creado_en: string }[];
};

export async function getReferidosConfig(): Promise<ReferidosConfigData> {
  const empty = { programas: [], historial: [] };
  if (!hasSupabaseConfiguration()) return { status: "error", message: "Falta configurar la conexión segura.", ...empty };
  try {
    const context = await getOperationalContext();
    if (!context) return { status: "needs_login", message: "Inicia sesión para ver los referidos.", ...empty };
    if (context.profile.rol !== "superadmin") return { status: "forbidden", message: "Solo la Superadministradora configura los referidos.", ...empty };
    const supabase = await createSupabaseServerClient();
    const [programas, historial] = await Promise.all([
      supabase.from("programas_referidos").select("*, empresas(nombre)").order("nombre"),
      supabase.from("referidos_auditoria").select("id,programa_id,evento,detalle,creado_en").eq("evento", "config").order("creado_en", { ascending: false }).limit(30),
    ]);
    if (programas.error) return { status: "error", message: "No se pudo cargar la configuración de referidos.", ...empty };
    const filas = (programas.data ?? []).map((row) => {
      const { empresas, ...resto } = row as unknown as ProgramaReferidos & { empresas: { nombre: string } | { nombre: string }[] | null };
      const empresa = Array.isArray(empresas) ? empresas[0] : empresas;
      return { ...resto, empresa_nombre: empresa?.nombre ?? "" };
    });
    return { status: "ready", programas: filas, historial: (historial.data ?? []) as ReferidosConfigData["historial"] };
  } catch {
    return { status: "error", message: "No se pudo cargar la configuración de referidos.", ...empty };
  }
}
```

- [ ] **Step 2: Acciones del servidor**

Create `app/referidos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EstadoMonedero, PreviewReferido } from "@/lib/referidos-textos";

const texto = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const numero = (data: FormData, key: string) => Number(texto(data, key).replace(",", "."));
const mensajeDe = (error: { message?: string } | null, porDefecto: string) => (error?.message && !error.message.startsWith("permission denied") ? error.message : porDefecto);

export async function obtenerEstadoMonedero(pacienteId: string, empresaId: string): Promise<EstadoMonedero> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("estado_monedero", { p_paciente: pacienteId, p_empresa: empresaId });
  if (error) throw new Error(mensajeDe(error, "No se pudo cargar el monedero de referidos."));
  return data as EstadoMonedero;
}

export async function buscarCodigoReferido(empresaId: string, codigo: string): Promise<{ encontrado: boolean; nombre?: string }> {
  if (!codigo.trim()) return { encontrado: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("buscar_codigo_referido", { p_empresa: empresaId, p_codigo: codigo });
  if (error) throw new Error(mensajeDe(error, "No se pudo buscar el código."));
  return data as { encontrado: boolean; nombre?: string };
}

export async function registrarReferidoFicha(pacienteId: string, empresaId: string, codigo: string): Promise<{ referidor_nombre: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_referido_ficha", { p_paciente: pacienteId, p_empresa: empresaId, p_codigo: codigo });
  if (error) throw new Error(mensajeDe(error, "No se pudo registrar el referido."));
  revalidatePath("/pacientes");
  return data as { referidor_nombre: string };
}

export async function previsualizarReferido(args: { empresaId: string; pacienteId: string | null; codigo: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean }): Promise<PreviewReferido> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("previsualizar_referido", {
    p_empresa: args.empresaId, p_paciente: args.pacienteId, p_codigo: args.codigo, p_base: args.base, p_es_convenio: args.esConvenio, p_bloquea: args.hayOtrosDescuentos,
  });
  if (error) throw new Error(mensajeDe(error, "No se pudo revisar el código de referido."));
  return data as PreviewReferido;
}

export async function ajustarMonedero(data: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const monto = numero(data, "monto");
  if (!Number.isFinite(monto) || monto === 0) throw new Error("Escribe un monto distinto de cero (negativo para descontar).");
  const { error } = await supabase.rpc("ajustar_monedero", { p_programa: texto(data, "programa_id"), p_paciente: texto(data, "paciente_id"), p_monto: monto, p_motivo: texto(data, "motivo") });
  if (error) throw new Error(mensajeDe(error, "No se pudo registrar el ajuste."));
  revalidatePath("/pacientes");
}

export async function guardarProgramaReferidos(data: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const programaId = texto(data, "programa_id");
  if (!programaId) throw new Error("Falta identificar el programa.");
  const opcional = (key: string) => (texto(data, key) === "" ? null : texto(data, key));
  const cambios = {
    nombre: texto(data, "nombre"),
    activo: data.get("activo") === "si",
    recompensas_suspendidas: data.get("recompensas_suspendidas") === "si",
    compra_minima: numero(data, "compra_minima"),
    descuento_bienvenida: numero(data, "descuento_bienvenida"),
    credito_por_referido: numero(data, "credito_por_referido"),
    bono_3_referidos: numero(data, "bono_3_referidos"),
    bono_5_referidos: numero(data, "bono_5_referidos"),
    vigencia_credito_dias: Math.trunc(numero(data, "vigencia_credito_dias")),
    tope_uso_porcentaje: numero(data, "tope_uso_porcentaje"),
    presupuesto_mensual: opcional("presupuesto_mensual") === null ? null : numero(data, "presupuesto_mensual"),
    campana_desde: opcional("campana_desde"),
    campana_hasta: opcional("campana_hasta"),
    categorias_excluidas: data.getAll("categorias_excluidas").map(String),
  };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (typeof valor === "number" && !Number.isFinite(valor)) throw new Error(`Revisa el valor de "${clave.replace(/_/g, " ")}".`);
  }
  const { error } = await supabase.rpc("guardar_programa_referidos", { p_programa: programaId, p_cambios: cambios });
  if (error) throw new Error(mensajeDe(error, "No se pudo guardar la configuración."));
  revalidatePath("/configuracion/referidos"); revalidatePath("/pacientes");
}
```

- [ ] **Step 3: Pasar el código y el crédito en `registrarVenta`**

Modify `app/ventas/actions.ts`, dentro de `registrarVenta`, reemplazar la llamada al RPC:

```ts
    const { data, error } = await supabase.rpc("registrar_venta", { p_empresa: empresaId, p_sucursal: sucursalId, p_cliente: cliente, p_items: items, p_pagos: payments, p_paciente: pacienteId });
```

por:

```ts
    const codigoReferido = text(form, "codigo_referido");
    const usarCredito = Number(text(form, "usar_credito").replace(",", ".")) || 0;
    const esConvenio = text(form, "es_convenio") === "si";
    const { data, error } = await supabase.rpc("registrar_venta", {
      p_empresa: empresaId, p_sucursal: sucursalId, p_cliente: cliente, p_items: items, p_pagos: payments, p_paciente: pacienteId,
      p_codigo_referido: codigoReferido || null, p_usar_credito: usarCredito, p_es_convenio: esConvenio,
    });
```

- [ ] **Step 4: Registrar el referido al crear la ficha**

Modify `app/pacientes/actions.ts`, en `crearPacienteClinico`:

1. Cambiar `const { supabase } = await currentClinicalProfile(folderRoles);` (la primera línea de esa función) por `const { supabase, profile } = await currentClinicalProfile(folderRoles);`.
2. Después de la línea `const saved = result as { paciente_id: string; ya_existia: boolean };` agregar:

```ts
  let referido: { ok: boolean; mensaje: string } | null = null;
  const codigoReferido = text(data, "codigo_referido");
  if (codigoReferido && !saved.ya_existia) {
    const { data: ref, error: refError } = await supabase.rpc("registrar_referido_ficha", { p_paciente: saved.paciente_id, p_empresa: profile.empresa_id, p_codigo: codigoReferido });
    referido = refError
      ? { ok: false, mensaje: refError.message || "No se pudo registrar quién lo refirió." }
      : { ok: true, mensaje: `Referido por ${(ref as { referidor_nombre: string }).referidor_nombre}.` };
  }
```
3. Cambiar `return { ...saved, patient };` por `return { ...saved, patient, referido };`.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (el carrito aún no envía los campos nuevos; son opcionales).

```bash
git add lib/referidos.ts app/referidos/actions.ts app/ventas/actions.ts app/pacientes/actions.ts
git commit -m "feat(referidos): acciones del servidor, cargador de configuración y envío del código en la venta

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pantalla de configuración (solo Shuyana)

**Files:**
- Create: `app/configuracion/referidos/page.tsx`
- Create: `app/configuracion/referidos/referidos-board.tsx`
- Modify: `app/app-navigation.tsx` (menú, grupo Administración)

**Interfaces:**
- Consumes: `getReferidosConfig`, `guardarProgramaReferidos` (Task 7), `ProgramaReferidos`/`dinero` (Task 6).

- [ ] **Step 1: Página**

Create `app/configuracion/referidos/page.tsx`:

```tsx
import { getReferidosConfig } from "@/lib/referidos";
import ReferidosBoard from "./referidos-board";

export const dynamic = "force-dynamic";

export default async function ReferidosConfigPage() {
  return <ReferidosBoard {...await getReferidosConfig()} />;
}
```

- [ ] **Step 2: Tablero**

Create `app/configuracion/referidos/referidos-board.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarProgramaReferidos } from "@/app/referidos/actions";
import type { ReferidosConfigData } from "@/lib/referidos";
import { dinero, type ProgramaReferidos } from "@/lib/referidos-textos";

const categorias: { value: string; label: string }[] = [
  { value: "montura", label: "Armazones" }, { value: "lente", label: "Lunas" }, { value: "accesorio", label: "Accesorios" },
  { value: "gafas_sol", label: "Gafas de sol" }, { value: "servicio", label: "Exámenes y servicios" },
];
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function ProgramaCard({ programa, onSaved }: { programa: ProgramaReferidos & { empresa_nombre: string }; onSaved: (mensaje: string) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const costoPorVenta = programa.compra_minima > 0 ? ((programa.descuento_bienvenida + programa.credito_por_referido) / programa.compra_minima) * 100 : 0;
  const guardar = (form: HTMLFormElement) => {
    const data = new FormData(form);
    if (data.get("activo") === "si" && !programa.activo && !window.confirm(`Vas a ENCENDER ${programa.nombre}. Se crean los códigos de todos los pacientes de ${programa.empresa_nombre} y el equipo ya podrá usarlos en las ventas. ¿Continuar?`)) return;
    start(async () => {
      try { setError(""); await guardarProgramaReferidos(data); onSaved(`${programa.nombre}: configuración guardada.`); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); }
    });
  };
  return (
    <form className="glass agenda-board" onSubmit={(event) => { event.preventDefault(); guardar(event.currentTarget); }}>
      <input type="hidden" name="programa_id" value={programa.id} />
      <p className="section-label">{programa.empresa_nombre.toUpperCase()}</p>
      <h2>{programa.nombre} <span className="status-pill">{programa.activo ? "Encendido" : "Apagado"}</span></h2>
      <p className="field-hint">Beneficio por referido ≈ {costoPorVenta.toFixed(0)} % de la compra mínima ({dinero(programa.descuento_bienvenida)} de descuento + {dinero(programa.credito_por_referido)} de crédito), sin contar bonos.</p>
      <div className="new-patient-form">
        <label>Nombre comercial<input name="nombre" defaultValue={programa.nombre} required /></label>
        <label>Compra mínima ($)<input name="compra_minima" type="number" min={0} step="0.01" defaultValue={programa.compra_minima} required /></label>
        <label>Descuento de bienvenida ($)<input name="descuento_bienvenida" type="number" min={0} step="0.01" defaultValue={programa.descuento_bienvenida} required /></label>
        <label>Crédito por referido ($)<input name="credito_por_referido" type="number" min={0} step="0.01" defaultValue={programa.credito_por_referido} required /></label>
        <label>Bono a los 3 referidos ($)<input name="bono_3_referidos" type="number" min={0} step="0.01" defaultValue={programa.bono_3_referidos} required /></label>
        <label>Bono a los 5 referidos ($)<input name="bono_5_referidos" type="number" min={0} step="0.01" defaultValue={programa.bono_5_referidos} required /></label>
        <label>Vigencia del crédito (días)<input name="vigencia_credito_dias" type="number" min={1} step={1} defaultValue={programa.vigencia_credito_dias} required /></label>
        <label>Uso máximo por compra (%)<input name="tope_uso_porcentaje" type="number" min={0} max={100} step="0.01" defaultValue={programa.tope_uso_porcentaje} required /></label>
        <label>Presupuesto mensual ($, vacío = sin tope)<input name="presupuesto_mensual" type="number" min={0} step="0.01" defaultValue={programa.presupuesto_mensual ?? ""} /></label>
        <label>Campaña desde<input name="campana_desde" type="date" defaultValue={programa.campana_desde ?? ""} /></label>
        <label>Campaña hasta<input name="campana_hasta" type="date" defaultValue={programa.campana_hasta ?? ""} /></label>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>Categorías que NO cuentan para la compra mínima ni para el crédito:</p>
      <div className="task-meta" style={{ gap: 12 }}>
        {categorias.map((c) => <label key={c.value} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="categorias_excluidas" value={c.value} defaultChecked={programa.categorias_excluidas.includes(c.value)} /> {c.label}</label>)}
      </div>
      <div className="receta-option" style={{ marginTop: 12 }}>
        <label className="receta-option-header"><input type="checkbox" name="activo" value="si" defaultChecked={programa.activo} /> Programa encendido</label>
        <label className="receta-option-header"><input type="checkbox" name="recompensas_suspendidas" value="si" defaultChecked={programa.recompensas_suspendidas} /> Suspender recompensas temporalmente (los referidos quedan esperando)</label>
      </div>
      {error && <p className="notice" role="alert" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{error}</p>}
      <button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar configuración"}</button>
    </form>
  );
}

const etiquetas: Record<string, string> = { activo: "Encendido", nombre: "Nombre", compra_minima: "Compra mínima", descuento_bienvenida: "Descuento de bienvenida", credito_por_referido: "Crédito por referido", bono_3_referidos: "Bono 3", bono_5_referidos: "Bono 5", vigencia_credito_dias: "Vigencia (días)", tope_uso_porcentaje: "Uso máximo (%)", presupuesto_mensual: "Presupuesto mensual", recompensas_suspendidas: "Recompensas suspendidas", categorias_excluidas: "Categorías excluidas", campana_desde: "Campaña desde", campana_hasta: "Campaña hasta" };

function cambiosDe(detalle: Record<string, unknown>): string {
  const antes = (detalle.antes ?? {}) as Record<string, unknown>; const despues = (detalle.despues ?? {}) as Record<string, unknown>;
  const lista = Object.keys(etiquetas).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k])).map((k) => `${etiquetas[k]}: ${JSON.stringify(antes[k]) ?? "—"} → ${JSON.stringify(despues[k]) ?? "—"}`);
  return lista.length ? lista.join(" · ") : "Sin cambios de valores";
}

export default function ReferidosBoard(props: ReferidosConfigData) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  if (props.status !== "ready") return <section className="glass agenda-board"><p className="section-label">REFERIDOS</p><h2>Referidos y recompensas</h2><p className="notice">{props.message}</p></section>;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="glass agenda-board">
        <p className="section-label">ADMINISTRACIÓN</p>
        <h1>Referidos y recompensas</h1>
        <p className="subtitle">Círculo Shu (SHUVISION) y Focus Friends (Focus) son programas separados: no comparten códigos ni créditos. Los cambios solo afectan a los referidos nuevos.</p>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>
      {props.programas.map((programa) => <ProgramaCard key={programa.id + programa.activo + programa.compra_minima} programa={programa} onSaved={(mensaje) => { setNotice(mensaje); router.refresh(); }} />)}
      <section className="glass agenda-board">
        <p className="section-label">HISTORIAL DE CAMBIOS</p>
        {props.historial.length === 0 ? <p className="field-hint">Todavía no hay cambios guardados.</p> : <div className="task-list">{props.historial.map((h) => (
          <article className="task-card" key={h.id}><div className="task-status" /><div className="task-main"><h2>{props.programas.find((p) => p.id === h.programa_id)?.nombre ?? "Programa"}</h2><div className="task-meta"><span>{fechaHora(h.creado_en)}</span></div><p className="field-hint">{cambiosDe(h.detalle)}</p></div></article>
        ))}</div>}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Menú**

Modify `app/app-navigation.tsx`: agregar `Gift` a la importación de `lucide-react` (la línea que ya importa `Settings`, `Users`, etc.) y, justo después de la entrada de `"/configuracion/sucursales"`, agregar:

```tsx
  { href: "/configuracion/referidos", label: "Referidos y recompensas", detail: "Círculo Shu y Focus Friends", icon: Gift, group: "Administración", soloSuperadmin: true },
```

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

Con el servidor local (`preview_start`) y sesión de superadmin: abrir `/configuracion/referidos`, comprobar que muestra los dos programas **Apagados**, cambiar un valor sin encender y verificar el aviso y el historial. **No encender ningún programa.** Si no hay sesión disponible, decirlo en el informe final.

```bash
git add app/configuracion/referidos app/app-navigation.tsx
git commit -m "feat(referidos): pantalla de configuración de programas para la superadmin

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ficha del paciente — campo "¿Quién te refirió?" y pestaña Referidos

**Files:**
- Create: `app/pacientes/campo-referido.tsx`
- Create: `app/pacientes/referidos-panel.tsx`
- Modify: `app/pacientes/patient-clinical-client.tsx`

**Interfaces:**
- Consumes: `buscarCodigoReferido`, `obtenerEstadoMonedero`, `registrarReferidoFicha`, `ajustarMonedero` (Task 7); `mensajeCompartirCodigo`, `estadoReferidoLabel`, `tipoMovimientoLabel`, `dinero` (Task 6); `enlaceCompartirWhatsapp` (Task 6).
- Produces: `<CampoReferido empresaId={string} />` (input `name="codigo_referido"`), `<ReferidosPanel pacienteId empresaId esSuperadmin />`.

- [ ] **Step 1: Campo al crear la ficha**

Create `app/pacientes/campo-referido.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { buscarCodigoReferido } from "@/app/referidos/actions";

// Campo opcional de la ficha nueva: muestra el nombre de quien tiene el código para confirmarlo.
export default function CampoReferido({ empresaId }: { empresaId: string }) {
  const [codigo, setCodigo] = useState("");
  const [pista, setPista] = useState("");
  useEffect(() => {
    if (codigo.trim().length < 4) { setPista(""); return; }
    let vigente = true;
    const espera = setTimeout(() => {
      buscarCodigoReferido(empresaId, codigo)
        .then((r) => { if (vigente) setPista(r.encontrado ? `Código de ${r.nombre}. ¿Es esa persona?` : "No encontramos ese código (o el programa de referidos está apagado)."); })
        .catch(() => { if (vigente) setPista(""); });
    }, 400);
    return () => { vigente = false; clearTimeout(espera); };
  }, [codigo, empresaId]);
  return (
    <div className="new-patient-form" style={{ marginTop: 12 }}>
      <label className="task-description">¿Quién te refirió? (código, opcional)
        <input name="codigo_referido" value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458 o FOC-000235" autoComplete="off" />
      </label>
      {pista && <p className="field-hint">{pista}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Pestaña Referidos**

Create `app/pacientes/referidos-panel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { ajustarMonedero, obtenerEstadoMonedero, registrarReferidoFicha } from "@/app/referidos/actions";
import { dinero, estadoReferidoLabel, mensajeCompartirCodigo, tipoMovimientoLabel, type EstadoMonedero } from "@/lib/referidos-textos";
import { enlaceCompartirWhatsapp } from "@/lib/whatsapp";

const fecha = (iso: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

export default function ReferidosPanel({ pacienteId, empresaId, esSuperadmin }: { pacienteId: string; empresaId: string; esSuperadmin: boolean }) {
  const [estado, setEstado] = useState<EstadoMonedero | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [codigoReferidor, setCodigoReferidor] = useState("");
  const [pending, start] = useTransition();
  const cargar = useCallback(() => { obtenerEstadoMonedero(pacienteId, empresaId).then(setEstado).catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar.")); }, [pacienteId, empresaId]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <section className="clinical-content"><p className="notice" role="alert">{error}</p></section>;
  if (!estado) return <section className="clinical-content"><p className="field-hint">Cargando referidos…</p></section>;
  if (!estado.programa_activo) return <section className="clinical-content"><p className="notice">El programa de referidos no está activo en esta óptica.</p></section>;

  const mensaje = estado.codigo ? mensajeCompartirCodigo({ prefijo: estado.prefijo ?? "", descuento_bienvenida: Number(estado.descuento_bienvenida ?? 0) }, estado.codigo) : "";
  const copiar = async () => { try { await navigator.clipboard.writeText(estado.codigo ?? ""); setAviso("Código copiado."); } catch { setAviso("No se pudo copiar; selecciónalo y cópialo a mano."); } };
  const registrarReferidor = () => start(async () => {
    try { setError(""); const r = await registrarReferidoFicha(pacienteId, empresaId, codigoReferidor); setAviso(`Referido por ${r.referidor_nombre}.`); setCodigoReferidor(""); cargar(); }
    catch (err) { setAviso(err instanceof Error ? err.message : "No se pudo registrar."); }
  });
  const ajustar = (form: HTMLFormElement) => {
    const data = new FormData(form); data.set("programa_id", estado.programa_id ?? ""); data.set("paciente_id", pacienteId);
    start(async () => { try { await ajustarMonedero(data); setAviso("Ajuste registrado."); form.reset(); cargar(); } catch (err) { setAviso(err instanceof Error ? err.message : "No se pudo ajustar."); } });
  };

  return (
    <section className="clinical-content history-list">
      <p className="section-label">{(estado.nombre ?? "REFERIDOS").toUpperCase()}</p>
      {aviso && <p className="notice" role="status">{aviso}</p>}
      <article className="task-card"><div className="task-status" /><div className="task-main">
        <h2>Mi código: {estado.codigo ?? "—"}</h2>
        <div className="task-meta">
          <button type="button" className="outline-action" onClick={copiar} disabled={!estado.codigo}><Copy size={15} /> Copiar</button>
          {estado.codigo && <a className="outline-action" href={enlaceCompartirWhatsapp(mensaje)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Compartir mi código</a>}
        </div>
        <p className="field-hint">Quien lo use en su primera compra (mínimo {dinero(Number(estado.compra_minima ?? 0))}) recibe {dinero(Number(estado.descuento_bienvenida ?? 0))} de descuento. El crédito vence a los {estado.vigencia_dias} días.</p>
      </div></article>
      <div className="task-meta" style={{ gap: 16 }}>
        <span>Disponible <strong>{dinero(Number(estado.disponible ?? 0))}</strong></span>
        <span>Pendiente <strong>{dinero(Number(estado.pendiente ?? 0))}</strong></span>
        <span>Usado <strong>{dinero(Number(estado.usado ?? 0))}</strong></span>
        <span>Vencido <strong>{dinero(Number(estado.vencido ?? 0))}</strong></span>
        <span>Referidos exitosos <strong>{estado.exitosos ?? 0}</strong></span>
      </div>
      <p className="field-hint">El crédito baja el total de una venta (hasta el máximo permitido por compra); no es dinero en caja.</p>

      <h3>Quién lo refirió</h3>
      {estado.referido_por
        ? <p>{estado.referido_por.nombre} · {estado.referido_por.codigo} · {estadoReferidoLabel(estado.referido_por.estado)}</p>
        : <div className="new-patient-form"><label className="task-description">Registrar el código de quien lo refirió (solo si aún no ha comprado)
            <input value={codigoReferidor} onChange={(event) => setCodigoReferidor(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458" /></label>
            <button type="button" className="outline-action" disabled={pending || codigoReferidor.trim().length < 4} onClick={registrarReferidor}>Registrar</button></div>}

      <h3>Personas que ha referido ({estado.referidos?.length ?? 0})</h3>
      {(estado.referidos?.length ?? 0) === 0 ? <p className="field-hint">Todavía no ha referido a nadie.</p> : <div className="task-list">{estado.referidos?.map((r, i) => (
        <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{r.nombre}</h2><div className="task-meta"><span>{estadoReferidoLabel(r.estado)}</span><span>{fecha(r.creado_en)}</span><span>Crédito {dinero(Number(r.credito))}</span></div></div></article>
      ))}</div>}

      <h3>Movimientos del monedero</h3>
      {(estado.movimientos?.length ?? 0) === 0 ? <p className="field-hint">Sin movimientos todavía.</p> : <div className="task-list">{estado.movimientos?.map((m, i) => (
        <article className="task-card" key={i}><div className="task-status" /><div className="task-main"><h2>{tipoMovimientoLabel(m.tipo)}: {Number(m.monto) > 0 ? "+" : "−"}{dinero(Math.abs(Number(m.monto)))}</h2>
          <div className="task-meta"><span>{fecha(m.creado_en)}</span>{m.vence_en && <span>Vence {fecha(m.vence_en)}</span>}{m.referido && <span>Por {m.referido}</span>}{m.motivo && <span>{m.motivo}</span>}</div></div></article>
      ))}</div>}

      {esSuperadmin && <form onSubmit={(event) => { event.preventDefault(); ajustar(event.currentTarget); }}>
        <h3>Ajuste manual (solo superadmin)</h3>
        <div className="new-patient-form">
          <label>Monto ($, negativo para descontar)<input name="monto" type="number" step="0.01" required /></label>
          <label className="task-description">Motivo (mínimo 5 caracteres)<input name="motivo" required minLength={5} /></label>
        </div>
        <button className="outline-action" type="submit" disabled={pending}>Registrar ajuste</button>
      </form>}
    </section>
  );
}
```

- [ ] **Step 3: Conectar en la carpeta**

Modify `app/pacientes/patient-clinical-client.tsx`:

1. Importaciones: agregar `import ReferidosPanel from "./referidos-panel";` y `import CampoReferido from "./campo-referido";` junto a `import ComunicacionesPanel from "./comunicaciones-panel";` (línea 12), y agregar `Gift` a la importación de `lucide-react` existente en ese archivo.
2. Línea 60: cambiar el tipo `useState<"consultations" | "sales" | "files" | "laboratory" | "comms">` por `useState<"consultations" | "sales" | "files" | "laboratory" | "comms" | "referidos">`.
3. En la barra `<nav className="clinical-tabs">` (línea 327) agregar, después del botón de Comunicaciones y antes de `</nav>`:

```tsx
<button type="button" className={section === "referidos" ? "active" : ""} onClick={() => setSection("referidos")}><Gift size={16} /> Referidos</button>
```
4. Después de la línea que renderiza `{section === "comms" && selected && <ComunicacionesPanel … />}` (línea 330) agregar:

```tsx
    {section === "referidos" && selected && !demoMode && <ReferidosPanel key={selected.id} pacienteId={selected.id} empresaId={props.profile?.empresa_id ?? ""} esSuperadmin={props.profile?.rol === "superadmin"} />}
```
(Si `props.profile` no trae `rol`, usar el mismo origen de rol que usa `canAnular` en ese archivo.)
5. En el formulario de paciente nuevo, justo antes de la etiqueta `<label className="receta-option-header" style={{ marginTop: 12 }}><input type="checkbox" checked={tieneResponsable}` (línea ~350) agregar:

```tsx
    {!editingPatient && <CampoReferido empresaId={props.profile?.empresa_id ?? ""} />}
```
6. En `createPatient` (línea ~278), después de `const result = await crearPacienteClinico(data);` y donde se arma `setNotice(...)`, añadir el resultado del referido al aviso:

```tsx
      const referidoNotice = result.referido ? (result.referido.ok ? ` ${result.referido.mensaje}` : ` La ficha se guardó, pero no se registró quién lo refirió: ${result.referido.mensaje}`) : "";
```
y concatenar `+ referidoNotice` al texto de `setNotice((...) + consentNotice)` → `setNotice((...) + consentNotice + referidoNotice)`.

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

En el navegador con sesión: abrir una carpeta → pestaña **Referidos** → con el programa apagado debe decir "El programa de referidos no está activo en esta óptica". En "Registrar paciente" aparece el campo opcional. (No encender programas. Si no hay sesión, decirlo.)

```bash
git add app/pacientes/campo-referido.tsx app/pacientes/referidos-panel.tsx app/pacientes/patient-clinical-client.tsx
git commit -m "feat(referidos): campo ¿Quién te refirió? y pestaña Referidos en la carpeta del paciente

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Carrito — código de referido y uso de crédito

**Files:**
- Create: `app/ventas/referido-venta.tsx`
- Modify: `app/ventas/cart.tsx` (requiere la Task 0 resuelta: el archivo debe existir)

**Interfaces:**
- Consumes: `previsualizarReferido` (Task 7), tipos `PreviewReferido` y `dinero` (Task 6).
- Produces: `<ReferidoVenta empresaId pacienteId base esConvenio hayOtrosDescuentos onChange />` con `onChange(valor: { codigo: string; usarCredito: number; descuento: number; credito: number })`.

- [ ] **Step 1: Componente del bloque**

Create `app/ventas/referido-venta.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { previsualizarReferido } from "@/app/referidos/actions";
import { dinero, type PreviewReferido } from "@/lib/referidos-textos";

export type ReferidoValor = { codigo: string; usarCredito: number; descuento: number; credito: number };
export const referidoVacio: ReferidoValor = { codigo: "", usarCredito: 0, descuento: 0, credito: 0 };

// Bloque del carrito: código de referido (descuento de bienvenida) y/o uso del crédito del monedero.
export default function ReferidoVenta({ empresaId, pacienteId, base, esConvenio, hayOtrosDescuentos, onChange }: {
  empresaId: string; pacienteId: string; base: number; esConvenio: boolean; hayOtrosDescuentos: boolean; onChange: (valor: ReferidoValor) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [usar, setUsar] = useState(false);
  const [monto, setMonto] = useState("");
  const [preview, setPreview] = useState<PreviewReferido | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!empresaId || !pacienteId || base <= 0) { setPreview(null); return; }
    let vigente = true;
    const espera = setTimeout(() => {
      previsualizarReferido({ empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos })
        .then((r) => { if (vigente) { setPreview(r); setError(""); } })
        .catch((err) => { if (vigente) { setPreview(null); setError(err instanceof Error ? err.message : "No se pudo revisar."); } });
    }, 350);
    return () => { vigente = false; clearTimeout(espera); };
  }, [empresaId, pacienteId, codigo, base, esConvenio, hayOtrosDescuentos]);

  const descuento = preview?.codigo?.ok ? Number(preview.codigo.descuento ?? 0) : 0;
  const maximo = Number(preview?.credito_maximo ?? 0);
  const disponible = Number(preview?.credito_disponible ?? 0);
  const credito = usar ? Math.min(Math.max(Number(monto.replace(",", ".")) || 0, 0), maximo) : 0;

  useEffect(() => { onChange({ codigo: preview?.codigo?.ok ? codigo.trim() : "", usarCredito: credito, descuento, credito }); }, [preview, codigo, credito, descuento]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pacienteId) return null;
  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!preview?.programa_activo) return null;
  const rechazo = preview.codigo && !preview.codigo.ok ? preview.codigo.motivo : "";
  return (
    <div className="receta-option" style={{ marginTop: 12 }}>
      <p className="section-label">{(preview.nombre ?? "REFERIDOS").toUpperCase()}</p>
      <label>¿Tiene un código de referido?
        <input value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} placeholder="Ej.: SHU-000458" autoComplete="off" />
      </label>
      {preview.codigo?.ok && <p className="notice" role="status" style={{ fontWeight: 700 }}>Código de {preview.codigo.referidor_nombre}: descuento de bienvenida −{dinero(descuento)}. Quien lo refirió gana {dinero(Number(preview.codigo.credito ?? 0))} cuando esta venta quede pagada por completo.</p>}
      {rechazo && <p className="notice" role="status" style={{ background: "#ffe5e8", color: "#a24150", fontWeight: 700 }}>{rechazo}</p>}
      {disponible > 0 && <div style={{ marginTop: 8 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={usar} onChange={(event) => { setUsar(event.target.checked); setMonto(event.target.checked ? String(maximo) : ""); }} /> Usar crédito de referidos (disponible {dinero(disponible)}, máximo en esta compra {dinero(maximo)})</label>
        {usar && <label>Monto del crédito $<input type="text" inputMode="decimal" value={monto} onChange={(event) => setMonto(event.target.value)} /></label>}
      </div>}
    </div>
  );
}
```

- [ ] **Step 2: Integrar en `app/ventas/cart.tsx`**

Modify `app/ventas/cart.tsx`:

1. Importación junto a las demás: `import ReferidoVenta, { referidoVacio, type ReferidoValor } from "./referido-venta";`
2. Junto a los otros `useState` del componente `Cart` (cerca de `const [convenioActivo, setConvenioActivo] = useState(false);`): `const [referido, setReferido] = useState<ReferidoValor>(referidoVacio);`
3. Después de `const subtotal = useMemo(...)` (línea 73): 

```tsx
  // Total que paga el cliente: la compra menos el descuento de bienvenida y el crédito de referidos.
  const totalVenta = Math.max(0, subtotal - referido.descuento - referido.credito);
  const esConvenioVenta = !!convenioPaciente || (convenioActivo && tipoAcuerdo === "convenio");
```
4. Reemplazar `const saldo = Math.max(0, subtotal - paidTotal);` por `const saldo = Math.max(0, totalVenta - paidTotal);`
5. En `submit`: reemplazar en el aviso de exceso `paidTotal > subtotal + 0.0001` → `paidTotal > totalVenta + 0.0001` y en el texto `(${money(subtotal)})` → `(${money(totalVenta)})`; y dentro de `start(async () => {` justo después de `data.set("tipo_venta", modo);` agregar:

```tsx
      data.set("codigo_referido", referido.codigo);
      data.set("usar_credito", String(referido.usarCredito));
      data.set("es_convenio", esConvenioVenta ? "si" : "no");
```
También reemplazar `paidTotal + 0.0001 < subtotal ? … ${money(subtotal - paidTotal)}` por `paidTotal + 0.0001 < totalVenta ? … ${money(totalVenta - paidTotal)}`.
6. En `resetAll` agregar `setReferido(referidoVacio);`.
7. Justo debajo de la línea `<p className="subtitle">Total: <strong>{money(subtotal)}</strong></p>` reemplazarla por:

```tsx
      <p className="subtitle">Total: <strong>{money(totalVenta)}</strong>{(referido.descuento > 0 || referido.credito > 0) && <span className="field-hint"> (compra {money(subtotal)}{referido.descuento > 0 ? ` − descuento de bienvenida ${money(referido.descuento)}` : ""}{referido.credito > 0 ? ` − crédito de referidos ${money(referido.credito)}` : ""})</span>}</p>
      <ReferidoVenta empresaId={company} pacienteId={pacienteId} base={subtotal} esConvenio={esConvenioVenta} hayOtrosDescuentos={items.some((item) => item.descuento > 0)} onChange={setReferido} />
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

Con sesión en el navegador y los programas **apagados**: abrir "Nueva venta" desde una carpeta; el bloque de referidos **no debe aparecer**, y el total, el saldo y el cierre de la venta deben comportarse exactamente igual que antes (regresión). Cerrar una venta de prueba pequeña solo si Shuyana lo autoriza (modifica datos reales); si no, decirlo.

- [ ] **Step 4: Commit**

```bash
git add app/ventas/referido-venta.tsx app/ventas/cart.tsx
git commit -m "feat(referidos): código de referido y uso de crédito en el carrito de ventas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificación final, documentación y publicación

**Files:**
- Modify: `docs/BLUEPRINT.md`
- Modify: `docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md` (sección de desviaciones)

- [ ] **Step 1: Verificaciones técnicas**

Run: `npx tsc --noEmit && npm run lint && node --test tests/`
Expected: sin errores; las pruebas Node pasan.

Volver a correr, una por una, las pruebas SQL de las Tasks 1–5 contra la base ya migrada (`[preludio] + [prueba]`, sin las migraciones) → todas deben terminar en `PRUEBAS_OK`. Correr `get_advisors` (security y performance) y revisar que no hay avisos nuevos de las tablas/funciones de referidos.

Comprobación de datos reales intactos (solo lectura): `select count(*) from public.ventas where descuento > 0;` debe seguir siendo el mismo que antes de empezar; `select nombre, activo from public.programas_referidos;` → ambos `false`; `select count(*) from public.monedero_movimientos;` → 0.

- [ ] **Step 2: Anotar las desviaciones en el diseño**

Agregar al final de `docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md`:

```markdown
## 13. Desviaciones de la fase 1 (2026-10-14)

- **Recibo:** el recibo sigue mostrando una sola línea "Descuento" (suma del descuento de bienvenida y el crédito). Las líneas separadas se ven en el resumen del carrito; el desglose en el recibo queda para la fase 2.
- **Combinar con otras promociones:** la base de datos ya acepta `p_autoriza_combinar` (solo superadmin/admin de sucursal), pero la pantalla todavía no lo expone; hoy una venta con descuentos de línea no puede usar el código ni el crédito.
- **Rechazos:** un código no válido se rechaza con un mensaje y no se guarda como fila "rechazado" (el estado existe para el panel de la fase 2).
- **Bonos y reversas:** si se revierte un referido y el conteo baja de 3 o 5, se revierte solo lo no gastado del bono; al volver a llegar a ese hito el bono no se paga otra vez (restricción de un bono por hito).
```

- [ ] **Step 3: Actualizar el BLUEPRINT**

En `docs/BLUEPRINT.md`: (a) en la tabla de la sección 3, reemplazar la fila "Tarjeta de lealtad y referidos" por una fila ✅/🟡 que diga: fase 1 construida (configuración en `/configuracion/referidos`, pestaña Referidos en la carpeta, campo en la ficha y bloque en el carrito, 5 migraciones `20261015100000`…`20261015140000`, cron `referidos-vencimientos`), **programas apagados**, pendientes fase 2 (panel en el CRM) y fase 3 (avisos, QR). (b) En la sección 6, agregar cualquier error nuevo ocurrido durante la construcción (si no hubo, no inventar). (c) En la sección 9, agregar una fila con fecha, resumen y archivos tocados.

- [ ] **Step 4: Publicar**

```bash
git add docs/BLUEPRINT.md docs/superpowers/specs/2026-10-14-referidos-recompensas-design.md
git commit -m "docs: referidos fase 1 — desviaciones, estado en el blueprint y registro de entregas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
npx vercel --prod
```

Verificar en el sitio real: `/configuracion/referidos` carga para la superadmin y muestra los dos programas apagados; `curl -i https://<dominio>/api/cron/referidos-vencimientos` responde `401` sin token.

- [ ] **Step 5: Informe a Shuyana (en lenguaje simple)**

Resumir: qué quedó construido, que **los programas siguen apagados**, qué probó cada prueba, qué NO se pudo probar (por ejemplo la prueba con sesión real y una venta real), y el siguiente paso: revisar montos/rentabilidad antes de encender y luego la fase 2 (panel).

---

## Self-Review (hecha al escribir el plan)

**Cobertura del diseño** (sección → tarea): §2 decisiones → Global Constraints y Task 3; §3 flujo → Tasks 3–4 y 9–10; §4 datos → Task 1 (tablas), 2 (códigos/config), 3 (monedero/lectura), 4 (reglas de pago), 5 (vencimiento); §5.1 venta → Task 3; §5.2 recompensa → Task 4; §5.3 fraude → Task 3 (casos C4–C10); §5.4 anulación → Task 4 (D9–D10); §5.5 presupuesto → Task 3 (C13); §5.6 no retroactivo → Task 4 (D6); §6 permisos → Tasks 1–2, 5 (E4, E6) y pantallas; §7 pantallas → Tasks 8–10 (excepto panel CRM = fase 2; líneas separadas en recibo = desviación documentada); §9 WhatsApp compartir → Tasks 6 y 9 (avisos automáticos, QR y enlace = fase 3); §10 pruebas → pruebas SQL de cada migración + Node; §11 fases → este plan es la fase 1.

**Placeholders:** ninguno; cada paso de código trae el código completo. Donde el plan depende de un dato que debe confirmarse al ejecutar (usuarios y productos de prueba, `props.profile.rol`), el paso lo dice y da la acción concreta.

**Consistencia de tipos y nombres:** `registrar_venta` (10 parámetros) coincide entre Task 3, el helper `pg_temp.vender` del preludio y la acción `registrarVenta`; `estado_monedero`/`EstadoMonedero` comparten claves; `previsualizar_referido` ↔ `previsualizarReferido` ↔ `PreviewReferido`; `app_private.procesar_recompensas_pendientes` nace como marcador en la Task 2 y la Task 4 lo reemplaza.

**Riesgos conocidos a vigilar al ejecutar:** (1) `registrar_venta` es crítica: la Task 3 reconfirma la huella de la función viva antes de reemplazarla; (2) el método de pruebas depende de que `execute_sql` sea una sola transacción (se verifica en la Task 0); (3) `cart.tsx` y `mis-deudas-calc.ts` aparecían borrados sin guardar (Task 0, paso 1).
