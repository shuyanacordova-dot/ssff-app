-- Apertura de caja de Sacha para el primer cuadre real (13-oct-2026).
-- Shuyana confirmó que Sacha tiene $5,00 en efectivo después de los gastos de caja ya registrados hoy.
-- La apertura = $5,00 + gastos de caja del 13-oct, para que esos gastos sigan visibles como gastos
-- del día y no se resten otra vez de los $5,00 que hay físicamente. Sin cobros en efectivo ese día.
do $$
declare
  v_sucursal uuid;
  v_empresa uuid;
  v_usuario uuid;
  v_gastos numeric;
  v_cobros_efectivo numeric;
begin
  select id, empresa_id into v_sucursal, v_empresa
  from public.sucursales where nombre = 'Shuvision Sacha' and activo;
  select id into v_usuario from public.usuarios
  where nombre = 'Shuyana Córdova' and activo and empresa_id = v_empresa;
  if v_sucursal is null or v_usuario is null then
    raise exception 'No se pudo verificar la sucursal Sacha ni la usuaria.';
  end if;
  if exists (select 1 from public.cierres_caja where sucursal_id = v_sucursal and fecha = date '2026-10-13') then
    raise exception 'Sacha ya tiene cuadre del 13-oct; no se cambia la apertura.';
  end if;

  select coalesce(sum(monto), 0) into v_gastos from public.gastos
  where sucursal_id = v_sucursal and fecha = date '2026-10-13' and origen = 'caja';
  select coalesce(sum(p.monto), 0) into v_cobros_efectivo
  from public.pagos_venta p join public.ventas v on v.id = p.venta_id
  where v.sucursal_id = v_sucursal and v.estado <> 'anulada' and p.metodo = 'efectivo'
    and (p.creado_en at time zone 'America/Guayaquil')::date = date '2026-10-13';
  if v_cobros_efectivo <> 0 then
    raise exception 'Hay cobros en efectivo el 13-oct en Sacha; revisar la apertura.';
  end if;

  insert into public.aperturas_caja (empresa_id, sucursal_id, fecha, monto, observaciones, created_by)
  values (v_empresa, v_sucursal, date '2026-10-13', 5 + v_gastos,
          'Primer cuadre real de Sacha. Efectivo físico $5,00 + gastos de caja del día ya registrados ($' || to_char(v_gastos, 'FM999990.00') || ').',
          v_usuario)
  on conflict (sucursal_id, fecha) do update
    set monto = excluded.monto, observaciones = excluded.observaciones, created_by = excluded.created_by, creado_en = now();
end;
$$;
