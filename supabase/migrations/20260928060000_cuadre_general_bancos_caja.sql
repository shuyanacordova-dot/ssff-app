-- Cuadre general por sucursal (Shuyana 2026-09-28, por los descuadres tras migrar de Optox):
-- bancos (saldo real de los cuadres del día) + efectivo en caja + tarjetas aún no acreditadas  vs  lo que LumOS espera.
-- Efectivo en caja: si hay cuadre de caja ese día se usa (contado vs esperado); si no, se calcula lo que DEBERÍA haber
-- desde el último cuadre o apertura: + efectivo cobrado − egresos en efectivo de cada día (los depósitos solo se conocen en el cuadre).

create table if not exists public.cuadres_generales (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id),
  fecha date not null,
  cuentas_total int not null default 0,
  cuentas_cuadradas int not null default 0,
  bancos_real numeric not null default 0,
  bancos_esperado numeric not null default 0,
  caja_contada boolean not null default false,
  caja_fecha date,
  caja_real numeric,
  caja_esperada numeric not null default 0,
  tarjetas_por_acreditar numeric not null default 0 check (tarjetas_por_acreditar >= 0),
  total_real numeric not null,
  total_esperado numeric not null,
  diferencia numeric not null,
  notas text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (sucursal_id, fecha)
);
alter table public.cuadres_generales enable row level security;
revoke all on public.cuadres_generales from public, anon, authenticated;
grant select on public.cuadres_generales to authenticated;
create policy cuadres_generales_superadmin on public.cuadres_generales for select to authenticated using (public.es_superadmin());

create or replace function public.cuadre_general(p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  s record; v_out jsonb := '[]'::jsonb;
  v_cuentas int; v_cuadradas int; v_bancos_real numeric; v_bancos_esp numeric;
  v_cierre record; v_base record; v_desde date; v_efectivo numeric; v_egresos numeric;
  v_caja_contada boolean; v_caja_fecha date; v_caja_real numeric; v_caja_esp numeric; v_base_origen text; v_base_monto numeric;
begin
  if not public.es_superadmin() then raise exception 'El cuadre general es solo para la Superadministradora.'; end if;
  for s in select su.id, su.empresa_id, su.nombre from public.sucursales su where exists (select 1 from public.cuentas_bancarias c where c.sucursal_id = su.id) order by su.nombre loop
    -- Bancos: cuentas cuadradas en la fecha (el primer cuadre cuenta como esperado = real).
    select count(*), count(cb.id), coalesce(sum(cb.saldo_real), 0), coalesce(sum(coalesce(cb.saldo_esperado, cb.saldo_real)), 0)
      into v_cuentas, v_cuadradas, v_bancos_real, v_bancos_esp
    from public.cuentas_bancarias c left join public.cuadres_banco cb on cb.cuenta_id = c.id and cb.fecha = v_fecha
    where c.sucursal_id = s.id and c.activo;

    -- Efectivo en caja
    select * into v_cierre from public.cierres_caja where sucursal_id = s.id and fecha = v_fecha;
    v_base_origen := null; v_base_monto := null;
    if v_cierre.id is not null then
      v_caja_contada := true; v_caja_fecha := v_fecha; v_caja_real := v_cierre.caja_fisica; v_caja_esp := v_cierre.caja_esperada;
    else
      select * into v_base from app_private.caja_de_partida(s.empresa_id, s.id, v_fecha); -- no hay cierre ese día: toma el último cierre anterior o la apertura
      v_caja_contada := false; v_caja_real := null; v_caja_fecha := v_base.fecha_ref;
      v_base_origen := v_base.origen; v_base_monto := coalesce(v_base.monto, 0);
      -- Desde el día siguiente al último cierre (o desde el mismo día de la apertura) hasta la fecha.
      v_desde := case when v_base.origen = 'apertura' then v_base.fecha_ref else coalesce(v_base.fecha_ref + 1, date '2000-01-01') end;
      select coalesce(sum(p.monto), 0) into v_efectivo from public.pagos_venta p join public.ventas v on v.id = p.venta_id
      where v.sucursal_id = s.id and p.metodo = 'efectivo' and (v.estado <> 'anulada' or v.anulacion_modo is not null)
        and (p.creado_en at time zone 'America/Guayaquil')::date between v_desde and v_fecha;
      select coalesce(sum(g.monto), 0) into v_egresos from public.gastos g
      where g.sucursal_id = s.id and g.origen = 'caja' and g.fecha between v_desde and v_fecha;
      v_caja_esp := v_base_monto + v_efectivo - v_egresos;
    end if;

    v_out := v_out || jsonb_build_object(
      'sucursal_id', s.id, 'sucursal_nombre', s.nombre, 'fecha', v_fecha,
      'cuentas_total', v_cuentas, 'cuentas_cuadradas', v_cuadradas, 'bancos_real', v_bancos_real, 'bancos_esperado', v_bancos_esp,
      'caja_contada', v_caja_contada, 'caja_fecha', v_caja_fecha, 'caja_real', v_caja_real, 'caja_esperada', round(v_caja_esp, 2),
      'caja_base_origen', v_base_origen, 'caja_base_monto', v_base_monto,
      'guardado', (select to_jsonb(g) - 'creado_por' from public.cuadres_generales g where g.sucursal_id = s.id and g.fecha = v_fecha));
  end loop;
  return v_out;
end;
$$;

-- Guarda la foto del cuadre general del día (una fila por sucursal). p_tarjetas: {"<sucursal_id>": monto por acreditar}.
create or replace function public.guardar_cuadre_general(p_fecha date, p_tarjetas jsonb default '{}'::jsonb, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; r jsonb; v_tarj numeric; v_real numeric; v_esp numeric; v_total_dif numeric := 0; v_n int := 0;
begin
  if not public.es_superadmin() then raise exception 'El cuadre general es solo para la Superadministradora.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  for r in select * from jsonb_array_elements(public.cuadre_general(p_fecha)) loop
    v_tarj := coalesce(nullif(p_tarjetas->>(r->>'sucursal_id'), '')::numeric, 0);
    if v_tarj < 0 then raise exception 'Las tarjetas por acreditar no pueden ser negativas.'; end if;
    v_real := (r->>'bancos_real')::numeric + coalesce((r->>'caja_real')::numeric, (r->>'caja_esperada')::numeric) + v_tarj;
    v_esp := (r->>'bancos_esperado')::numeric + (r->>'caja_esperada')::numeric;
    insert into public.cuadres_generales (sucursal_id, fecha, cuentas_total, cuentas_cuadradas, bancos_real, bancos_esperado, caja_contada, caja_fecha, caja_real, caja_esperada,
      tarjetas_por_acreditar, total_real, total_esperado, diferencia, notas, creado_por)
    values ((r->>'sucursal_id')::uuid, (r->>'fecha')::date, (r->>'cuentas_total')::int, (r->>'cuentas_cuadradas')::int, (r->>'bancos_real')::numeric, (r->>'bancos_esperado')::numeric,
      (r->>'caja_contada')::boolean, (r->>'caja_fecha')::date, (r->>'caja_real')::numeric, (r->>'caja_esperada')::numeric,
      v_tarj, v_real, v_esp, round(v_real - v_esp, 2), nullif(trim(p_notas), ''), v_user)
    on conflict (sucursal_id, fecha) do update set cuentas_total = excluded.cuentas_total, cuentas_cuadradas = excluded.cuentas_cuadradas,
      bancos_real = excluded.bancos_real, bancos_esperado = excluded.bancos_esperado, caja_contada = excluded.caja_contada, caja_fecha = excluded.caja_fecha,
      caja_real = excluded.caja_real, caja_esperada = excluded.caja_esperada, tarjetas_por_acreditar = excluded.tarjetas_por_acreditar,
      total_real = excluded.total_real, total_esperado = excluded.total_esperado, diferencia = excluded.diferencia, notas = excluded.notas,
      creado_por = excluded.creado_por, creado_en = now();
    v_total_dif := v_total_dif + round(v_real - v_esp, 2); v_n := v_n + 1;
  end loop;
  return jsonb_build_object('sucursales', v_n, 'diferencia_total', v_total_dif);
end;
$$;

revoke all on function public.cuadre_general(date), public.guardar_cuadre_general(date, jsonb, text) from public, anon;
grant execute on function public.cuadre_general(date), public.guardar_cuadre_general(date, jsonb, text) to authenticated;
