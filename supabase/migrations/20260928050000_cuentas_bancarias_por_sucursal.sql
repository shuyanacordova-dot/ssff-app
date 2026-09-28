-- Cuentas bancarias por SUCURSAL (Shuyana 2026-09-28: "las cuentas de Shuvision Sacha son diferentes a las de Shushufindi").
-- Las 3 cuentas que tenía Shuvisión pasan a Shushufindi (sus 4 egresos por banco son de Shushufindi); las de Focus a Focus;
-- Sacha recibe sus propias Pichincha, Guayaquil e Internacional (saldo 0; el primer cuadre fija el saldo real).
alter table public.cuentas_bancarias add column if not exists sucursal_id uuid references public.sucursales(id);

update public.cuentas_bancarias set sucursal_id = '3bd2a17c-b4e0-4137-a5f3-66475dbcb836' -- Shuvision (Shushufindi)
where empresa_id = '51820b6b-9fc1-495c-b2ea-ab50547e2ce3' and sucursal_id is null;
update public.cuentas_bancarias set sucursal_id = 'e2775b83-2105-46a7-8c40-d8de6b3a63dd' -- Focus
where empresa_id = 'be1dc246-219a-40a2-9e92-707e5845d295' and sucursal_id is null;

-- Antes solo podía haber una cuenta por banco en cada empresa; ahora es una por banco en cada sucursal.
alter table public.cuentas_bancarias drop constraint if exists cuentas_bancarias_empresa_id_banco_key;
create unique index if not exists cuentas_bancarias_sucursal_banco_key on public.cuentas_bancarias (sucursal_id, banco);

insert into public.cuentas_bancarias (empresa_id, sucursal_id, banco, saldo_actual, activo)
select '51820b6b-9fc1-495c-b2ea-ab50547e2ce3', '1db17433-cc24-409f-92d2-794a01ce79d4', b, 0, true
from unnest(array['pichincha', 'guayaquil', 'internacional']) as b
on conflict (sucursal_id, banco) do nothing;

-- Movimientos de una cuenta: ahora se toman los de SU sucursal (transferencias, tarjetas y depósitos de esa caja).
create or replace function app_private.movimientos_cuenta(p_cuenta uuid, p_desde date, p_hasta date)
returns table (fecha date, grupo text, descripcion text, monto numeric)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  with c as (select * from public.cuentas_bancarias where id = p_cuenta)
  select (p.creado_en at time zone 'America/Guayaquil')::date, 'transferencias',
         'Transferencia · ' || coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente') || ' · folio ' || coalesce(v.folio::text, '—'),
         p.monto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id join c on c.empresa_id = v.empresa_id and c.sucursal_id = v.sucursal_id
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id
  where p.metodo = 'transferencia' and p.banco = c.banco and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > p_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= p_hasta
  union all
  select (p.creado_en at time zone 'America/Guayaquil')::date, 'tarjetas',
         'Tarjeta · ' || coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente') || ' · folio ' || coalesce(v.folio::text, '—'),
         p.monto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id join c on c.empresa_id = v.empresa_id and c.sucursal_id = v.sucursal_id and c.banco = 'pichincha'
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id
  where p.metodo = 'tarjeta' and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > p_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= p_hasta
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
$$;
revoke all on function app_private.movimientos_cuenta(uuid, date, date) from public, anon, authenticated;

create or replace function public.previsualizar_cuadre_banco(p_cuenta uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_prev record; v_desde date; v_tot record; v_detalle jsonb; v_sin_banco numeric;
  v_cuenta record;
begin
  if not public.es_superadmin() then raise exception 'El cuadre de bancos es solo para la Superadministradora.'; end if;
  select c.*, e.nombre empresa_nombre, s.nombre sucursal_nombre into v_cuenta
  from public.cuentas_bancarias c join public.empresas e on e.id = c.empresa_id left join public.sucursales s on s.id = c.sucursal_id where c.id = p_cuenta;
  if v_cuenta.id is null then raise exception 'Cuenta no encontrada.'; end if;
  select * into v_prev from public.cuadres_banco where cuenta_id = p_cuenta and fecha < v_fecha order by fecha desc limit 1;
  v_desde := coalesce(v_prev.fecha, v_fecha - 7);

  select coalesce(sum(monto) filter (where grupo = 'transferencias'), 0) transferencias,
         coalesce(sum(monto) filter (where grupo = 'tarjetas'), 0) tarjetas,
         coalesce(sum(monto) filter (where grupo = 'depositos_caja'), 0) depositos_caja,
         coalesce(sum(monto) filter (where grupo = 'otros_ingresos'), 0) otros_ingresos,
         coalesce(-sum(monto) filter (where grupo = 'egresos'), 0) egresos
    into v_tot from app_private.movimientos_cuenta(p_cuenta, v_desde, v_fecha);
  select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'grupo', grupo, 'descripcion', descripcion, 'monto', monto) order by fecha, grupo), '[]'::jsonb)
    into v_detalle from app_private.movimientos_cuenta(p_cuenta, v_desde, v_fecha);
  -- Transferencias de esta sucursal sin banco elegido: no se sabe a qué cuenta llegaron.
  select coalesce(sum(p.monto), 0) into v_sin_banco from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.sucursal_id = v_cuenta.sucursal_id and p.metodo = 'transferencia' and (p.banco is null or p.banco not in ('pichincha', 'guayaquil', 'internacional'))
    and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > v_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= v_fecha;

  return jsonb_build_object(
    'cuenta_id', v_cuenta.id, 'banco', v_cuenta.banco, 'empresa_nombre', v_cuenta.empresa_nombre, 'sucursal_nombre', v_cuenta.sucursal_nombre, 'fecha', v_fecha,
    'primer_cuadre', v_prev.id is null, 'desde', v_desde, 'saldo_anterior', v_prev.saldo_real,
    'transferencias', v_tot.transferencias, 'tarjetas', v_tot.tarjetas, 'depositos_caja', v_tot.depositos_caja,
    'otros_ingresos', v_tot.otros_ingresos, 'egresos', v_tot.egresos,
    'ya_existe', exists (select 1 from public.cuadres_banco where cuenta_id = p_cuenta and fecha = v_fecha),
    'hay_posterior', exists (select 1 from public.cuadres_banco where cuenta_id = p_cuenta and fecha > v_fecha),
    'transferencias_sin_banco', v_sin_banco, 'detalle', v_detalle);
end;
$$;

-- Devolución por banco al anular una venta: sale de la cuenta de la sucursal de la venta.
create or replace function public.anular_venta_con_modo(p_venta uuid, p_motivo text, p_modo text, p_devolucion_origen text DEFAULT 'caja'::text, p_devolucion_banco text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_estado text; v_pagado numeric; v_folio int;
  v_cuenta uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; r record;
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).';
  end if;
  if not public.es_superadmin() then
    raise exception 'Solo la Superadministradora puede anular una venta.';
  end if;
  if p_modo not in ('devolver', 'credito') then
    raise exception 'Elige si el dinero se devuelve o queda como saldo a favor.';
  end if;
  select u.id into v_user from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;

  select v.empresa_id, v.sucursal_id, v.paciente_id, v.estado, v.pagado, v.folio
    into v_empresa, v_sucursal, v_paciente, v_estado, v_pagado, v_folio
  from public.ventas v where v.id = p_venta for update;
  if not found then raise exception 'No se encontró la venta.'; end if;
  if v_estado <> 'completada' then raise exception 'Solo se pueden anular ventas completadas.'; end if;
  if p_modo = 'credito' and v_pagado > 0 and v_paciente is null then
    raise exception 'La venta no tiene paciente: el saldo a favor solo se puede guardar a nombre de un paciente.';
  end if;
  if p_modo = 'devolver' and v_pagado > 0 then
    if p_devolucion_origen not in ('caja', 'banco') then raise exception 'Indica cómo se devuelve el dinero.'; end if;
    if p_devolucion_origen = 'banco' then
      select c.id into v_cuenta from public.cuentas_bancarias c
      where c.empresa_id = v_empresa and c.banco = p_devolucion_banco and c.activo
      order by (c.sucursal_id = v_sucursal) desc nulls last limit 1;
      if v_cuenta is null then raise exception 'Elige el banco desde el que se devuelve el dinero.'; end if;
    end if;
  end if;

  update public.ventas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo), anulacion_modo = p_modo
   where id = p_venta;

  for r in select producto_id, sucursal_id, cantidad from public.movimientos_inventario where venta_id = p_venta and tipo = 'salida' loop
    insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, venta_id, created_by)
    values (r.producto_id, r.sucursal_id, 'entrada', r.cantidad, 'Reversión por anulación de venta', p_venta, v_user);
  end loop;

  if v_pagado > 0 and p_modo = 'credito' then
    insert into public.creditos_paciente (paciente_id, empresa_id, monto, tipo, venta_origen_id, motivo, creado_por)
    values (v_paciente, v_empresa, v_pagado, 'anulacion', p_venta, btrim(p_motivo), v_user);
  elsif v_pagado > 0 and p_modo = 'devolver' then
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
    values (v_empresa, v_sucursal, v_hoy, 'ajuste', 'Devolución venta folio ' || coalesce(v_folio::text, '?'), v_pagado,
            p_devolucion_origen, v_cuenta, btrim(p_motivo), v_user);
  end if;

  return jsonb_build_object('pagado', v_pagado, 'modo', p_modo);
end;
$function$;
