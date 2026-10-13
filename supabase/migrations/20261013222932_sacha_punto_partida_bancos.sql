-- Punto de partida bancario de Sacha confirmado por Shuyana el 13-oct-2026.
-- Se fecha al cierre del día anterior para que los movimientos nuevos del 13-oct
-- se sumen al saldo de apertura. No se tocan los pagos con tarjeta pendientes.
do $$
declare
  v_sucursal uuid;
  v_empresa uuid;
  v_usuario uuid;
  v_cuentas integer;
  v_cuenta record;
begin
  select id, empresa_id into v_sucursal, v_empresa
  from public.sucursales where nombre = 'Shuvision Sacha' and activo;
  select id into v_usuario from public.usuarios
  where nombre = 'Shuyana Córdova' and activo and empresa_id = v_empresa;

  select count(*) into v_cuentas from public.cuentas_bancarias
  where sucursal_id = v_sucursal and activo and banco in ('pichincha', 'guayaquil', 'internacional');
  if v_sucursal is null or v_usuario is null or v_cuentas <> 3 then
    raise exception 'No se pudieron verificar la sucursal, la usuaria y las tres cuentas de Sacha.';
  end if;
  if exists (
    select 1 from public.cuadres_banco cb
    join public.cuentas_bancarias c on c.id = cb.cuenta_id
    where c.sucursal_id = v_sucursal
  ) then
    raise exception 'Sacha ya tiene cuadres bancarios; revisar antes de fijar otro punto de partida.';
  end if;
  if exists (
    select 1 from public.movimientos_bancarios m
    join public.cuentas_bancarias c on c.id = m.cuenta_id
    where c.sucursal_id = v_sucursal and m.fecha = date '2026-10-13'
  ) then
    raise exception 'Hay movimientos del 13-oct en cuentas bancarias de Sacha; revisar el saldo de apertura.';
  end if;

  for v_cuenta in
    select id, banco from public.cuentas_bancarias
    where sucursal_id = v_sucursal and activo
    order by banco
  loop
    insert into public.cuadres_banco
      (cuenta_id, empresa_id, fecha, saldo_real, notas, creado_por)
    values
      (v_cuenta.id, v_empresa, date '2026-10-12',
       case when v_cuenta.banco = 'pichincha' then 28.44 else 0 end,
       'Punto de partida confirmado por Shuyana el 13-oct-2026 antes de iniciar cuadres con Tiffany. Saldo de apertura para movimientos posteriores.',
       v_usuario);
    perform app_private.recalcular_saldo_cuenta(v_cuenta.id);
  end loop;
end;
$$;
