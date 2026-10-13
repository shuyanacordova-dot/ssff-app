-- Acceso puntual de Erick al cuadre bancario de Focus.
create table app_private.cuadre_bancos_acceso (
  usuario_id uuid not null references public.usuarios(id),
  sucursal_id uuid not null references public.sucursales(id),
  creado_en timestamptz not null default now(),
  primary key (usuario_id, sucursal_id)
);
alter table app_private.cuadre_bancos_acceso enable row level security;
revoke all on app_private.cuadre_bancos_acceso from public, anon, authenticated;

do $$
declare v_total integer;
begin
  select count(*) into v_total
  from public.usuarios u
  join public.sucursales s on s.empresa_id = u.empresa_id
  where trim(u.nombre) = 'Erick Balseca' and u.activo
    and s.nombre = 'Focus' and s.activo;
  if v_total <> 1 then
    raise exception 'No se encontró un único usuario Erick Balseca activo en Focus.';
  end if;
  insert into app_private.cuadre_bancos_acceso (usuario_id, sucursal_id)
  select u.id, s.id
  from public.usuarios u
  join public.sucursales s on s.empresa_id = u.empresa_id
  where trim(u.nombre) = 'Erick Balseca' and u.activo
    and s.nombre = 'Focus' and s.activo;
end;
$$;

create or replace function public.sucursales_cuadre_bancos_usuario()
returns uuid[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(s.id), '{}'::uuid[])
  from public.sucursales s
  where s.activo and (select auth.uid()) is not null
    and (
      public.es_superadmin()
      or exists (
        select 1 from app_private.cuadre_bancos_acceso a
        join public.usuarios u on u.id = a.usuario_id
        where a.sucursal_id = s.id and u.auth_user_id = (select auth.uid())
          and u.activo and u.empresa_id = s.empresa_id
      )
    );
$$;

create or replace function public.puede_cuadrar_cuenta(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cuentas_bancarias c
    where c.id = p_cuenta and c.activo
      and c.sucursal_id = any(public.sucursales_cuadre_bancos_usuario())
  );
$$;

revoke all on function public.sucursales_cuadre_bancos_usuario(), public.puede_cuadrar_cuenta(uuid) from public, anon;
grant execute on function public.sucursales_cuadre_bancos_usuario(), public.puede_cuadrar_cuenta(uuid) to authenticated;

drop policy if exists cuadres_banco_superadmin on public.cuadres_banco;
create policy cuadres_banco_acceso_sucursal on public.cuadres_banco
for select to authenticated using (public.puede_cuadrar_cuenta(cuenta_id));

-- Las dos operaciones comprueban la cuenta autorizada antes de leer o guardar movimientos.
create or replace function public.previsualizar_cuadre_banco(p_cuenta uuid, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  v_prev record; v_desde date; v_tot record; v_detalle jsonb; v_sin_banco numeric;
  v_cuenta record;
begin
  if not public.puede_cuadrar_cuenta(p_cuenta) then raise exception 'No tienes acceso al cuadre de esta cuenta.'; end if;
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

create or replace function public.registrar_cuadre_banco(p_cuenta uuid, p_fecha date, p_saldo_real numeric, p_comisiones numeric default 0, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_user uuid; v jsonb; v_esperado numeric; v_dif numeric; v_id uuid; v_despues numeric;
begin
  if not public.puede_cuadrar_cuenta(p_cuenta) then raise exception 'No tienes acceso al cuadre de esta cuenta.'; end if;
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

revoke all on function public.previsualizar_cuadre_banco(uuid, date), public.registrar_cuadre_banco(uuid, date, numeric, numeric, text) from public, anon;
grant execute on function public.previsualizar_cuadre_banco(uuid, date), public.registrar_cuadre_banco(uuid, date, numeric, numeric, text) to authenticated;
