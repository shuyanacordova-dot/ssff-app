-- Cuadre por sucursal simplificado (Shuyana 2026-09-28): se quita el "cuadre general" grande; en cada sucursal, junto a
-- sus bancos, van un cuadro de Tarjetas (lo que el banco aún no deposita, lo escribe ella) y uno de Efectivo, que SIEMPRE
-- se toma del ÚLTIMO cuadre de caja diario (contado y esperado de ese cuadre). Resultado por sucursal: cuadra / sobra / falta.
create or replace function public.cuadre_general(p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  s record; v_out jsonb := '[]'::jsonb;
  v_cuentas int; v_cuadradas int; v_bancos_real numeric; v_bancos_esp numeric;
  v_cierre record; v_desde_tarj date; v_tarjetas numeric;
begin
  if not public.es_superadmin() then raise exception 'El cuadre general es solo para la Superadministradora.'; end if;
  for s in select su.id, su.empresa_id, su.nombre from public.sucursales su where exists (select 1 from public.cuentas_bancarias c where c.sucursal_id = su.id) order by su.nombre loop
    select count(*), count(cb.id), coalesce(sum(cb.saldo_real), 0), coalesce(sum(coalesce(cb.saldo_esperado, cb.saldo_real)), 0)
      into v_cuentas, v_cuadradas, v_bancos_real, v_bancos_esp
    from public.cuentas_bancarias c left join public.cuadres_banco cb on cb.cuenta_id = c.id and cb.fecha = v_fecha
    where c.sucursal_id = s.id and c.activo;

    -- Efectivo: último cuadre de caja diario hasta la fecha.
    select * into v_cierre from public.cierres_caja where sucursal_id = s.id and fecha <= v_fecha order by fecha desc limit 1;

    -- Cobrado con tarjeta desde el cuadre anterior de su Pichincha (o últimos 7 días): ayuda para saber cuánto falta que deposite el banco.
    select coalesce(max(cb.fecha), v_fecha - 7) into v_desde_tarj
    from public.cuadres_banco cb join public.cuentas_bancarias c on c.id = cb.cuenta_id
    where c.sucursal_id = s.id and c.banco = 'pichincha' and cb.fecha < v_fecha;
    select coalesce(sum(p.monto), 0) into v_tarjetas from public.pagos_venta p join public.ventas v on v.id = p.venta_id
    where v.sucursal_id = s.id and p.metodo = 'tarjeta' and (v.estado <> 'anulada' or v.anulacion_modo is not null)
      and (p.creado_en at time zone 'America/Guayaquil')::date > v_desde_tarj and (p.creado_en at time zone 'America/Guayaquil')::date <= v_fecha;

    v_out := v_out || jsonb_build_object(
      'sucursal_id', s.id, 'sucursal_nombre', s.nombre, 'fecha', v_fecha,
      'cuentas_total', v_cuentas, 'cuentas_cuadradas', v_cuadradas, 'bancos_real', v_bancos_real, 'bancos_esperado', v_bancos_esp,
      'caja_contada', v_cierre.id is not null, 'caja_fecha', v_cierre.fecha, 'caja_real', v_cierre.caja_fisica, 'caja_esperada', coalesce(v_cierre.caja_esperada, 0),
      'caja_base_origen', null, 'caja_base_monto', null,
      'tarjetas_cobradas', v_tarjetas, 'tarjetas_desde', v_desde_tarj,
      'guardado', (select to_jsonb(g) - 'creado_por' from public.cuadres_generales g where g.sucursal_id = s.id and g.fecha = v_fecha));
  end loop;
  return v_out;
end;
$$;

-- Guarda el resultado de UNA sucursal (bancos del día + efectivo del último cuadre de caja + tarjetas por depositar).
create or replace function public.guardar_cuadre_sucursal(p_sucursal uuid, p_fecha date, p_tarjetas numeric default 0, p_notas text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; r jsonb; v_tarj numeric := coalesce(p_tarjetas, 0); v_real numeric; v_esp numeric;
begin
  if not public.es_superadmin() then raise exception 'El cuadre es solo para la Superadministradora.'; end if;
  if v_tarj < 0 then raise exception 'Las tarjetas por depositar no pueden ser negativas.'; end if;
  select e.value into r from jsonb_array_elements(public.cuadre_general(p_fecha)) e where e.value->>'sucursal_id' = p_sucursal::text;
  if r is null then raise exception 'Sucursal sin cuentas bancarias.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  v_real := (r->>'bancos_real')::numeric + coalesce((r->>'caja_real')::numeric, 0) + v_tarj;
  v_esp := (r->>'bancos_esperado')::numeric + (r->>'caja_esperada')::numeric;
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
  return jsonb_build_object('total_real', v_real, 'total_esperado', v_esp, 'diferencia', round(v_real - v_esp, 2));
end;
$$;
revoke all on function public.guardar_cuadre_sucursal(uuid, date, numeric, text) from public, anon;
grant execute on function public.guardar_cuadre_sucursal(uuid, date, numeric, text) to authenticated;
