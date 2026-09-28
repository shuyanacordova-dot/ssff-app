-- Cuadre semanal de bancos (pedido de Shuyana; lo hace ella los sábados desde Mis deudas).
-- Por cada cuenta: saldo del último cuadre + transferencias de pacientes + tarjetas (llegan a Pichincha)
-- + depósitos desde caja + otros ingresos − egresos por banco − comisiones = saldo esperado; se compara con el saldo real.
-- Decisiones (2026-09-28): se cuadran las 6 cuentas existentes; tarjetas → Pichincha de cada empresa;
-- al pagar una deuda por transferencia se elige la cuenta y el pago sale de esa cuenta (antes quedaba como egreso de caja).

create table if not exists public.cuadres_banco (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_bancarias(id),
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  desde date,
  saldo_anterior numeric,
  transferencias numeric not null default 0,
  tarjetas numeric not null default 0,
  depositos_caja numeric not null default 0,
  otros_ingresos numeric not null default 0,
  egresos numeric not null default 0,
  comisiones numeric not null default 0 check (comisiones >= 0),
  saldo_esperado numeric,
  saldo_real numeric not null,
  diferencia numeric,
  notas text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (cuenta_id, fecha)
);
alter table public.cuadres_banco enable row level security;
revoke all on public.cuadres_banco from public, anon, authenticated;
grant select on public.cuadres_banco to authenticated;
create policy cuadres_banco_superadmin on public.cuadres_banco for select to authenticated using (public.es_superadmin());

-- Movimientos que tocan una cuenta en el periodo (desde, hasta]. Si no hay cuadre anterior se miran los últimos 7 días.
create or replace function app_private.movimientos_cuenta(p_cuenta uuid, p_desde date, p_hasta date)
returns table (fecha date, grupo text, descripcion text, monto numeric)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  with c as (select * from public.cuentas_bancarias where id = p_cuenta)
  -- Transferencias de pacientes a este banco
  select (p.creado_en at time zone 'America/Guayaquil')::date, 'transferencias',
         'Transferencia · ' || coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente') || ' · folio ' || coalesce(v.folio::text, '—') || ' · ' || s.nombre,
         p.monto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id join c on c.empresa_id = v.empresa_id
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id left join public.sucursales s on s.id = v.sucursal_id
  where p.metodo = 'transferencia' and p.banco = c.banco and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > p_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= p_hasta
  union all
  -- Pagos con tarjeta: el dinero llega a Pichincha (con comisión y unos días después)
  select (p.creado_en at time zone 'America/Guayaquil')::date, 'tarjetas',
         'Tarjeta · ' || coalesce(nullif(trim(pc.nombres || ' ' || coalesce(pc.apellidos, '')), ''), v.cliente_nombre, 'Cliente') || ' · folio ' || coalesce(v.folio::text, '—') || ' · ' || s.nombre,
         p.monto
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id join c on c.empresa_id = v.empresa_id and c.banco = 'pichincha'
  left join public.pacientes_clinicos pc on pc.id = v.paciente_id left join public.sucursales s on s.id = v.sucursal_id
  where p.metodo = 'tarjeta' and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > p_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= p_hasta
  union all
  -- Depósitos anotados en el cuadre de caja diario
  select cc.fecha, 'depositos_caja', 'Depósito desde la caja de ' || s.nombre,
         case c.banco when 'pichincha' then cc.deposito_pichincha when 'guayaquil' then cc.deposito_guayaquil else cc.deposito_internacional end
  from public.cierres_caja cc join c on c.empresa_id = cc.empresa_id join public.sucursales s on s.id = cc.sucursal_id
  where cc.fecha > p_desde and cc.fecha <= p_hasta
    and coalesce(case c.banco when 'pichincha' then cc.deposito_pichincha when 'guayaquil' then cc.deposito_guayaquil else cc.deposito_internacional end, 0) > 0
  union all
  -- Movimientos registrados en la cuenta: egresos (gastos por banco, pagos de deudas) y entradas manuales
  select m.fecha, case when m.tipo = 'egreso' then 'egresos' else 'otros_ingresos' end,
         case when m.tipo = 'egreso' then coalesce(g.concepto, 'Egreso') || coalesce(' · ' || nullif(m.observaciones, ''), '')
              when m.tipo = 'deposito_caja' then 'Depósito registrado en Bancos' || coalesce(' · ' || nullif(m.observaciones, ''), '')
              else initcap(replace(m.tipo, '_', ' ')) || coalesce(' · ' || nullif(m.observaciones, ''), '') end,
         case when m.tipo = 'egreso' then -m.monto else m.monto end
  from public.movimientos_bancarios m left join public.gastos g on g.id = m.gasto_id
  where m.cuenta_id = p_cuenta and m.fecha > p_desde and m.fecha <= p_hasta;
$$;

create or replace function public.previsualizar_cuadre_banco(p_cuenta uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_prev record; v_desde date; v_tot record; v_detalle jsonb; v_sin_banco numeric;
  v_cuenta record;
begin
  if not public.es_superadmin() then raise exception 'El cuadre de bancos es solo para la Superadministradora.'; end if;
  select c.*, e.nombre empresa_nombre into v_cuenta from public.cuentas_bancarias c join public.empresas e on e.id = c.empresa_id where c.id = p_cuenta;
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
  -- Transferencias de la empresa sin banco elegido: no se sabe a qué cuenta llegaron.
  select coalesce(sum(p.monto), 0) into v_sin_banco from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.empresa_id = v_cuenta.empresa_id and p.metodo = 'transferencia' and (p.banco is null or p.banco not in ('pichincha', 'guayaquil', 'internacional'))
    and (v.estado <> 'anulada' or v.anulacion_modo is not null)
    and (p.creado_en at time zone 'America/Guayaquil')::date > v_desde and (p.creado_en at time zone 'America/Guayaquil')::date <= v_fecha;

  return jsonb_build_object(
    'cuenta_id', v_cuenta.id, 'banco', v_cuenta.banco, 'empresa_nombre', v_cuenta.empresa_nombre, 'fecha', v_fecha,
    'primer_cuadre', v_prev.id is null, 'desde', v_desde, 'saldo_anterior', v_prev.saldo_real,
    'transferencias', v_tot.transferencias, 'tarjetas', v_tot.tarjetas, 'depositos_caja', v_tot.depositos_caja,
    'otros_ingresos', v_tot.otros_ingresos, 'egresos', v_tot.egresos,
    'ya_existe', exists (select 1 from public.cuadres_banco where cuenta_id = p_cuenta and fecha = v_fecha),
    'hay_posterior', exists (select 1 from public.cuadres_banco where cuenta_id = p_cuenta and fecha > v_fecha),
    'transferencias_sin_banco', v_sin_banco, 'detalle', v_detalle);
end;
$$;

create or replace function public.registrar_cuadre_banco(p_cuenta uuid, p_fecha date, p_saldo_real numeric, p_comisiones numeric default 0, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v jsonb; v_esperado numeric; v_dif numeric; v_id uuid; v_despues numeric;
begin
  if not public.es_superadmin() then raise exception 'El cuadre de bancos es solo para la Superadministradora.'; end if;
  if p_saldo_real is null then raise exception 'Escribe el saldo real que muestra el banco.'; end if;
  if coalesce(p_comisiones, 0) < 0 then raise exception 'Las comisiones no pueden ser negativas.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  v := public.previsualizar_cuadre_banco(p_cuenta, p_fecha);
  if (v->>'hay_posterior')::boolean then raise exception 'Ya hay un cuadre posterior de esta cuenta; no se puede cambiar uno anterior.'; end if;

  if (v->>'primer_cuadre')::boolean then
    v_esperado := null; v_dif := null; -- el primer cuadre es el punto de partida
  else
    v_esperado := (v->>'saldo_anterior')::numeric + (v->>'transferencias')::numeric + (v->>'tarjetas')::numeric + (v->>'depositos_caja')::numeric
                  + (v->>'otros_ingresos')::numeric - (v->>'egresos')::numeric - coalesce(p_comisiones, 0);
    v_dif := round(p_saldo_real - v_esperado, 2);
  end if;

  insert into public.cuadres_banco (cuenta_id, empresa_id, fecha, desde, saldo_anterior, transferencias, tarjetas, depositos_caja, otros_ingresos, egresos, comisiones, saldo_esperado, saldo_real, diferencia, notas, creado_por)
  values (p_cuenta, (select empresa_id from public.cuentas_bancarias where id = p_cuenta), (v->>'fecha')::date,
          case when (v->>'primer_cuadre')::boolean then null else (v->>'desde')::date end, (v->>'saldo_anterior')::numeric,
          (v->>'transferencias')::numeric, (v->>'tarjetas')::numeric, (v->>'depositos_caja')::numeric, (v->>'otros_ingresos')::numeric, (v->>'egresos')::numeric,
          coalesce(p_comisiones, 0), v_esperado, p_saldo_real, v_dif, nullif(trim(p_notas), ''), v_user)
  on conflict (cuenta_id, fecha) do update set
    desde = excluded.desde, saldo_anterior = excluded.saldo_anterior, transferencias = excluded.transferencias, tarjetas = excluded.tarjetas,
    depositos_caja = excluded.depositos_caja, otros_ingresos = excluded.otros_ingresos, egresos = excluded.egresos, comisiones = excluded.comisiones,
    saldo_esperado = excluded.saldo_esperado, saldo_real = excluded.saldo_real, diferencia = excluded.diferencia, notas = excluded.notas,
    creado_por = excluded.creado_por, creado_en = now()
  returning id into v_id;

  -- El saldo mostrado en Bancos parte del saldo real confirmado (más lo registrado después de esa fecha).
  select coalesce(sum(case when tipo = 'egreso' then -monto else monto end), 0) into v_despues
  from public.movimientos_bancarios where cuenta_id = p_cuenta and fecha > (v->>'fecha')::date;
  update public.cuentas_bancarias set saldo_actual = p_saldo_real + v_despues, actualizado_en = now() where id = p_cuenta;

  return jsonb_build_object('id', v_id, 'primer_cuadre', (v->>'primer_cuadre')::boolean, 'saldo_esperado', v_esperado, 'saldo_real', p_saldo_real, 'diferencia', v_dif);
end;
$$;

-- Pago de deuda que sale de una cuenta bancaria (transferencia): el egreso va a esa cuenta, no a la caja.
create or replace function public.registrar_pago_deuda_v3(p_deuda uuid, p_monto numeric, p_fecha date, p_metodo text, p_referencia text default null,
  p_notas text default null, p_periodo date default null, p_egreso_sucursal uuid default null, p_cuenta uuid default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_usuario uuid; v_deuda record; v_pago uuid; v_gasto uuid; v_empresa uuid; v_cuenta record; v_sucursal uuid;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_clasif text;
begin
  if not public.es_superadmin() then raise exception 'Acceso restringido a la administración general'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta', 'otro') then raise exception 'Método de pago inválido'; end if;
  if p_cuenta is not null and p_metodo = 'efectivo' then raise exception 'Un pago en efectivo no sale de una cuenta bancaria.'; end if;
  select id into v_usuario from public.usuarios where auth_user_id = auth.uid() and activo = true limit 1;

  select * into v_deuda from public.deudas_negocio where id = p_deuda and estado = 'pendiente' for update;
  if v_deuda.id is null then raise exception 'La deuda no está disponible'; end if;
  if v_deuda.modalidad in ('cuotas', 'libre') and p_monto > v_deuda.saldo + 0.001 then
    raise exception 'El pago supera el saldo pendiente (%).', v_deuda.saldo;
  end if;
  v_clasif := case v_deuda.tipo when 'proveedor' then 'pago_proveedor' when 'gasto_fijo' then 'gastos_mensuales' else 'ajuste' end;

  if p_cuenta is not null then
    select * into v_cuenta from public.cuentas_bancarias where id = p_cuenta and activo;
    if v_cuenta.id is null then raise exception 'Cuenta bancaria no encontrada.'; end if;
    select id into v_sucursal from public.sucursales where id = p_egreso_sucursal and empresa_id = v_cuenta.empresa_id;
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
    values (v_cuenta.empresa_id, v_sucursal, v_fecha, v_clasif, v_deuda.proveedor, p_monto, 'banco', p_cuenta,
            nullif(trim(concat_ws(' · ', v_deuda.concepto, p_notas)), ''), v_usuario)
    returning id into v_gasto; -- el trigger crea el egreso en movimientos_bancarios
  elsif p_egreso_sucursal is not null then
    select empresa_id into v_empresa from public.sucursales where id = p_egreso_sucursal;
    if v_empresa is null then raise exception 'Sucursal no encontrada para el egreso.'; end if;
    insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, observaciones, created_by)
    values (v_empresa, p_egreso_sucursal, v_fecha, v_clasif, v_deuda.proveedor, p_monto, 'caja',
            nullif(trim(concat_ws(' · ', v_deuda.concepto, p_notas)), ''), v_usuario)
    returning id into v_gasto;
  end if;

  insert into public.pagos_deuda_negocio (deuda_id, monto, fecha_pago, metodo, referencia, notas, created_by, periodo, gasto_id)
  values (p_deuda, p_monto, v_fecha, p_metodo, nullif(trim(p_referencia), ''), nullif(trim(p_notas), ''), v_usuario,
          date_trunc('month', coalesce(p_periodo, v_fecha))::date, v_gasto)
  returning id into v_pago;

  if v_deuda.modalidad in ('cuotas', 'libre') then
    update public.deudas_negocio
       set saldo = greatest(saldo - p_monto, 0),
           estado = case when saldo - p_monto <= 0.001 then 'pagada' else 'pendiente' end,
           actualizado_en = now()
     where id = p_deuda;
  else
    update public.deudas_negocio set actualizado_en = now() where id = p_deuda;
  end if;
  return v_pago;
end;
$$;

revoke all on function app_private.movimientos_cuenta(uuid, date, date) from public, anon, authenticated;
revoke all on function public.previsualizar_cuadre_banco(uuid, date), public.registrar_cuadre_banco(uuid, date, numeric, numeric, text),
  public.registrar_pago_deuda_v3(uuid, numeric, date, text, text, text, date, uuid, uuid) from public, anon;
grant execute on function public.previsualizar_cuadre_banco(uuid, date), public.registrar_cuadre_banco(uuid, date, numeric, numeric, text),
  public.registrar_pago_deuda_v3(uuid, numeric, date, text, text, text, date, uuid, uuid) to authenticated;
