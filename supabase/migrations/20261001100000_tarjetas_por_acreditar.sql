-- Tarjetas por acreditar (Shuyana 2026-10-01): un cobro con tarjeta queda "por acreditar" hasta que se registra que el
-- banco lo depositó (con el monto que realmente llegó: la diferencia es la comisión).
--  * pagos_venta.tarjeta_acreditada_en / acreditacion_id
--  * acreditaciones_tarjeta: depósito del banco (puede juntar varios cobros), cuenta, fecha, bruto, neto, comisión
--  * Los cobros con tarjeta hasta el 28-09-2026 (fecha del cuadre de partida) se consideran ya acreditados.
--  * movimientos_cuenta: el grupo "tarjetas" ahora son las ACREDITACIONES (monto neto, en su fecha), no los cobros.
--  * dinero_disponible: bancos incluye lo acreditado; tarjetas_por_acreditar = cobros con tarjeta aún no acreditados.
--  * Cuadre general: las tarjetas por acreditar se toman solas (ya no se escriben a mano).

alter table public.pagos_venta add column if not exists tarjeta_acreditada_en date;
alter table public.pagos_venta add column if not exists acreditacion_id uuid;

create table if not exists public.acreditaciones_tarjeta (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_bancarias(id),
  fecha date not null,
  monto_bruto numeric(12,2) not null check (monto_bruto > 0),
  monto_neto numeric(12,2) not null check (monto_neto > 0),
  comision numeric(12,2) generated always as (monto_bruto - monto_neto) stored,
  notas text,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  check (monto_neto <= monto_bruto)
);
alter table public.pagos_venta drop constraint if exists pagos_venta_acreditacion_fk;
alter table public.pagos_venta add constraint pagos_venta_acreditacion_fk foreign key (acreditacion_id) references public.acreditaciones_tarjeta(id);
alter table public.acreditaciones_tarjeta enable row level security;
revoke all on public.acreditaciones_tarjeta from public, anon, authenticated;
grant select on public.acreditaciones_tarjeta to authenticated;
drop policy if exists acreditaciones_tarjeta_leer on public.acreditaciones_tarjeta;
create policy acreditaciones_tarjeta_leer on public.acreditaciones_tarjeta for select to authenticated using ((select public.es_superadmin()));

-- Cobros con tarjeta anteriores al cuadre de partida: ya están en el banco.
update public.pagos_venta set tarjeta_acreditada_en = (creado_en at time zone 'America/Guayaquil')::date
where metodo = 'tarjeta' and tarjeta_acreditada_en is null and (creado_en at time zone 'America/Guayaquil')::date <= '2026-09-28';

-- Cobros con tarjeta pendientes de acreditar (de una sucursal o de todas).
create or replace function public.tarjetas_por_acreditar(p_sucursal uuid default null)
returns table(pago_id uuid, fecha date, monto numeric, sucursal_id uuid, sucursal_nombre text, empresa_id uuid, folio integer, cliente text)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, (p.creado_en at time zone 'America/Guayaquil')::date, p.monto, v.sucursal_id, s.nombre, v.empresa_id, v.folio,
         coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente')
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  join public.sucursales s on s.id = v.sucursal_id
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id
  where public.es_superadmin() and p.metodo = 'tarjeta' and p.tarjeta_acreditada_en is null
    and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p_sucursal is null or v.sucursal_id = p_sucursal)
  order by 2, 7;
$$;
revoke all on function public.tarjetas_por_acreditar(uuid) from public, anon;
grant execute on function public.tarjetas_por_acreditar(uuid) to authenticated;

-- Registrar que el banco acreditó uno o varios cobros con tarjeta.
create or replace function public.registrar_acreditacion_tarjeta(p_pagos uuid[], p_cuenta uuid, p_fecha date, p_monto_neto numeric, p_notas text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid; v_cuenta record; v_bruto numeric; v_n int; v_id uuid;
begin
  if not public.es_superadmin() then raise exception 'Solo la Superadministradora registra acreditaciones de tarjeta.'; end if;
  if p_pagos is null or cardinality(p_pagos) = 0 then raise exception 'Elige los cobros con tarjeta que llegaron al banco.'; end if;
  if p_fecha is null then raise exception 'Indica la fecha en que llegó el dinero.'; end if;
  select * into v_cuenta from public.cuentas_bancarias where id = p_cuenta and activo;
  if v_cuenta.id is null then raise exception 'Cuenta bancaria no encontrada.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;

  perform 1 from public.pagos_venta where id = any(p_pagos) for update;
  select count(*), coalesce(sum(p.monto), 0) into v_n, v_bruto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where p.id = any(p_pagos) and p.metodo = 'tarjeta' and p.tarjeta_acreditada_en is null and v.empresa_id = v_cuenta.empresa_id;
  if v_n <> cardinality(p_pagos) then raise exception 'Algún cobro ya fue acreditado, no es con tarjeta o es de otra empresa.'; end if;
  if p_monto_neto is null or p_monto_neto <= 0 or p_monto_neto > v_bruto then
    raise exception 'El monto recibido debe ser mayor que cero y no mayor a % (lo cobrado con tarjeta).', v_bruto;
  end if;

  insert into public.acreditaciones_tarjeta (cuenta_id, fecha, monto_bruto, monto_neto, notas, created_by)
  values (p_cuenta, p_fecha, v_bruto, round(p_monto_neto, 2), nullif(trim(p_notas), ''), v_user) returning id into v_id;
  update public.pagos_venta set tarjeta_acreditada_en = p_fecha, acreditacion_id = v_id where id = any(p_pagos);
  perform app_private.recalcular_saldo_cuenta(p_cuenta);
  return v_id;
end;
$$;
revoke all on function public.registrar_acreditacion_tarjeta(uuid[], uuid, date, numeric, text) from public, anon;
grant execute on function public.registrar_acreditacion_tarjeta(uuid[], uuid, date, numeric, text) to authenticated;

-- Movimientos de una cuenta: las tarjetas entran cuando se ACREDITAN (monto neto), no el día del cobro.
create or replace function app_private.movimientos_cuenta(p_cuenta uuid, p_desde date, p_hasta date)
returns table(fecha date, grupo text, descripcion text, monto numeric)
language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  with c as (select * from public.cuentas_bancarias where id = p_cuenta)
  select (p.creado_en at time zone 'America/Guayaquil')::date, 'transferencias',
         'Transferencia · ' || coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente') || ' · folio ' || coalesce(v.folio::text, '—'),
         p.monto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id join c on c.empresa_id = v.empresa_id and c.sucursal_id = v.sucursal_id
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id
  where p.metodo = 'transferencia' and p.banco = c.banco and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > p_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= p_hasta
  union all
  select a.fecha, 'tarjetas',
         'Acreditación de tarjetas (' || (select count(*) from public.pagos_venta px where px.acreditacion_id = a.id) || ' cobro/s, comisión $' || to_char(a.comision, 'FM9999990.00') || ')',
         a.monto_neto
  from public.acreditaciones_tarjeta a
  where a.cuenta_id = p_cuenta and a.fecha > p_desde and a.fecha <= p_hasta
  union all
  select cc.fecha, 'depositos_caja', 'Depósito desde la caja',
         case c.banco when 'pichincha' then cc.deposito_pichincha when 'guayaquil' then cc.deposito_guayaquil else cc.deposito_internacional end
  from public.cierres_caja cc join c on c.sucursal_id = cc.sucursal_id
  where cc.fecha > p_desde and cc.fecha <= p_hasta
    and coalesce(case c.banco when 'pichincha' then cc.deposito_pichincha when 'guayaquil' then cc.deposito_guayaquil else cc.deposito_internacional end, 0) > 0
  union all
  select m.fecha, case when m.tipo = 'egreso' then 'egresos' else 'otros_ingresos' end,
         case when m.tipo = 'egreso' then coalesce(g.concepto, 'Egreso') || coalesce(' · ' || nullif(m.observaciones, ''), '')
              when m.tipo = 'deposito_caja' then 'Depósito registrado en Bancos' || coalesce(' · ' || nullif(m.observaciones, ''), '')
              else initcap(replace(m.tipo, '_', ' ')) || coalesce(' · ' || nullif(m.observaciones, ''), '') end,
         case when m.tipo = 'egreso' then -m.monto else m.monto end
  from public.movimientos_bancarios m left join public.gastos g on g.id = m.gasto_id
  where m.cuenta_id = p_cuenta and m.fecha > p_desde and m.fecha <= p_hasta;
$function$;

-- Dinero disponible: bancos (incluye lo acreditado) + tarjetas por acreditar + efectivo.
create or replace function public.dinero_disponible(p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  s record; c record; v_out jsonb := '[]'::jsonb;
  v_bancos numeric; v_tarjetas numeric; v_sin_cuadre int; v_cuentas jsonb; v_saldo numeric; v_cuadre record;
  v_base record; v_efectivo numeric; v_desde date;
begin
  if not public.es_superadmin() then raise exception 'El dinero disponible es solo para la Superadministradora.'; end if;

  for s in select su.id, su.empresa_id, su.nombre from public.sucursales su
           where su.activo and exists (select 1 from public.cuentas_bancarias cb where cb.sucursal_id = su.id and cb.activo)
           order by su.nombre loop
    v_bancos := 0; v_sin_cuadre := 0; v_cuentas := '[]'::jsonb;
    for c in select id, banco from public.cuentas_bancarias where sucursal_id = s.id and activo order by banco loop
      select fecha, saldo_real into v_cuadre from public.cuadres_banco where cuenta_id = c.id and fecha <= v_fecha order by fecha desc limit 1;
      if v_cuadre.fecha is null then
        v_sin_cuadre := v_sin_cuadre + 1;
        v_cuentas := v_cuentas || jsonb_build_object('banco', c.banco, 'saldo', null, 'cuadre', null);
      else
        select v_cuadre.saldo_real + coalesce(sum(m.monto), 0) into v_saldo
        from app_private.movimientos_cuenta(c.id, v_cuadre.fecha, v_fecha) m;
        v_bancos := v_bancos + v_saldo;
        v_cuentas := v_cuentas || jsonb_build_object('banco', c.banco, 'saldo', v_saldo, 'cuadre', v_cuadre.fecha);
      end if;
    end loop;

    select coalesce(sum(p.monto), 0) into v_tarjetas
    from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.sucursal_id = s.id and p.metodo = 'tarjeta' and p.tarjeta_acreditada_en is null
      and (v.estado <> 'anulada' or v.anulacion_modo is not null)
      and (p.creado_en at time zone 'America/Guayaquil')::date <= v_fecha;

    select * into v_base from app_private.caja_de_partida(s.empresa_id, s.id, v_fecha + 1);
    if v_base.fecha_ref is null then
      v_efectivo := null;
    else
      v_desde := case when v_base.origen = 'cierre' then v_base.fecha_ref + 1 else v_base.fecha_ref end;
      select v_base.monto
        + coalesce((select sum(p.monto) from public.pagos_venta p join public.ventas v on v.id = p.venta_id
                     where v.sucursal_id = s.id and p.metodo = 'efectivo' and (v.estado <> 'anulada' or v.anulacion_modo is not null)
                       and (p.creado_en at time zone 'America/Guayaquil')::date between v_desde and v_fecha), 0)
        - coalesce((select sum(g.monto) from public.gastos g
                     where g.sucursal_id = s.id and g.origen = 'caja' and g.fecha between v_desde and v_fecha), 0)
        into v_efectivo;
    end if;

    v_out := v_out || jsonb_build_object(
      'sucursal_id', s.id, 'sucursal_nombre', s.nombre, 'fecha', v_fecha,
      'estado', case when v_sin_cuadre = 0 and v_efectivo is not null then 'listo' else 'pendiente' end,
      'cuentas_sin_cuadre', v_sin_cuadre, 'bancos', v_bancos, 'tarjetas_por_acreditar', v_tarjetas, 'cuentas', v_cuentas,
      'efectivo', v_efectivo, 'caja_desde', v_base.fecha_ref, 'caja_origen', v_base.origen,
      'total', case when v_sin_cuadre = 0 and v_efectivo is not null then v_bancos + v_tarjetas + v_efectivo end);
  end loop;
  return v_out;
end;
$function$;

-- Cuadre general por sucursal: las tarjetas por acreditar se calculan solas (se ignora el valor escrito a mano).
create or replace function public.guardar_cuadre_sucursal(p_sucursal uuid, p_fecha date, p_tarjetas numeric default 0, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; r jsonb; v_tarj numeric; v_real numeric; v_esp numeric;
begin
  if not public.es_superadmin() then raise exception 'El cuadre es solo para la Superadministradora.'; end if;
  select e.value into r from jsonb_array_elements(public.cuadre_general(p_fecha)) e where e.value->>'sucursal_id' = p_sucursal::text;
  if r is null then raise exception 'Sucursal sin cuentas bancarias.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  -- Tarjetas cobradas hasta esa fecha que el banco aún no acredita: cuentan igual en lo real y en lo esperado.
  select coalesce(sum(p.monto), 0) into v_tarj
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.sucursal_id = p_sucursal and p.metodo = 'tarjeta' and p.tarjeta_acreditada_en is null
    and (v.estado <> 'anulada' or v.anulacion_modo is not null) and (p.creado_en at time zone 'America/Guayaquil')::date <= (r->>'fecha')::date;
  v_real := (r->>'bancos_real')::numeric + coalesce((r->>'caja_real')::numeric, 0) + v_tarj;
  v_esp := (r->>'bancos_esperado')::numeric + (r->>'caja_esperada')::numeric + v_tarj;
  insert into public.cuadres_generales (sucursal_id, fecha, cuentas_total, cuentas_cuadradas, bancos_real, bancos_esperado, caja_contada, caja_fecha, caja_real, caja_esperada,
    tarjetas_por_acreditar, total_real, total_esperado, diferencia, notas, creado_por)
  values (p_sucursal, (r->>'fecha')::date, (r->>'cuentas_total')::int, (r->>'cuentas_cuadradas')::int, (r->>'bancos_real')::numeric, (r->>'bancos_esperado')::numeric,
    (r->>'caja_contada')::boolean, (r->>'caja_fecha')::date, (r->>'caja_real')::numeric, (r->>'caja_esperada')::numeric,
    v_tarj, v_real, v_esp, round(v_real - v_esp, 2), nullif(trim(p_notas), ''), v_user)
  on conflict (sucursal_id, fecha) do update set cuentas_total = excluded.cuentas_total, cuentas_cuadradas = excluded.cuentas_cuadradas,
    bancos_real = excluded.bancos_real, bancos_esperado = excluded.bancos_esperado, caja_contada = excluded.caja_contada, caja_fecha = excluded.caja_fecha,
    caja_real = excluded.caja_real, caja_esperada = excluded.caja_esperada, tarjetas_por_acreditar = excluded.tarjetas_por_acreditar,
    total_real = excluded.total_real, total_esperado = excluded.total_esperado, diferencia = excluded.diferencia, notas = excluded.notas,
    creado_por = excluded.creado_por, creado_en = now();
  return jsonb_build_object('total_real', v_real, 'total_esperado', v_esp, 'diferencia', round(v_real - v_esp, 2), 'tarjetas_por_acreditar', v_tarj);
end;
$function$;

-- Cuadre general (todas las sucursales): mismas tarjetas por acreditar automáticas, en lo real y en lo esperado.
do $cg$
declare v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef('public.guardar_cuadre_general(date,jsonb,text)'::regprocedure);
  v_nuevo := replace(v_def,
$a$    v_tarj := coalesce(nullif(p_tarjetas->>(r->>'sucursal_id'), '')::numeric, 0);$a$,
$b$    select coalesce(sum(p.monto), 0) into v_tarj
    from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.sucursal_id = (r->>'sucursal_id')::uuid and p.metodo = 'tarjeta' and p.tarjeta_acreditada_en is null
      and (v.estado <> 'anulada' or v.anulacion_modo is not null) and (p.creado_en at time zone 'America/Guayaquil')::date <= (r->>'fecha')::date;$b$);
  v_nuevo := replace(v_nuevo,
$c$    v_esp := (r->>'bancos_esperado')::numeric + (r->>'caja_esperada')::numeric;$c$,
$d$    v_esp := (r->>'bancos_esperado')::numeric + (r->>'caja_esperada')::numeric + v_tarj;$d$);
  if v_nuevo = v_def or position('tarjeta_acreditada_en' in v_nuevo) = 0 or position('caja_esperada'')::numeric + v_tarj' in v_nuevo) = 0 then
    raise exception 'No se pudo actualizar guardar_cuadre_general (texto inesperado).';
  end if;
  execute v_nuevo;
end
$cg$;
