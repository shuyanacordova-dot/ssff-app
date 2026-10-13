-- Primer cuadre real de Sacha (13-oct-2026), pedido de Shuyana: la caja de partida es $5,00 y todo lo demás en cero.
-- Los 9 egresos ya registrados el 13-oct (8 de caja por $1.007,01 y la renta de $150 por banco) son anteriores al
-- arranque: se fechan el 12-oct (antes del arranque) para que no cuenten en el cuadre. No se borra nada ni cambian los montos.
-- El cuadre que ya guardó el equipo (cobro en efectivo $20, caja contada $25) queda: $5 + $20 = $25.
do $$
declare
  v_sucursal uuid;
  v_egresos int;
begin
  select id into v_sucursal from public.sucursales where nombre = 'Shuvision Sacha' and activo;
  if v_sucursal is null then raise exception 'No se encontró Sacha.'; end if;

  update public.aperturas_caja
  set monto = 5,
      observaciones = 'Primer cuadre real de Sacha. Caja de partida: $5,00 en efectivo.'
  where sucursal_id = v_sucursal and fecha = date '2026-10-13';
  if not found then raise exception 'No existe la apertura del 13-oct de Sacha.'; end if;

  update public.gastos
  set fecha = date '2026-10-12'
  where sucursal_id = v_sucursal and fecha = date '2026-10-13'
    and creado_en < timestamptz '2026-10-13 17:00:00-05';
  get diagnostics v_egresos = row_count;
  if v_egresos <> 9 then raise exception 'Se esperaban 9 egresos previos al cuadre y hay %.', v_egresos; end if;

  update public.cierres_caja
  set caja_anterior = 5, egresos_efectivo = 0, egresos_banco = 0, caja_esperada = caja_fisica, diferencia = 0
  where sucursal_id = v_sucursal and fecha = date '2026-10-13'
    and caja_fisica = 5 + cobro_efectivo;
  if not found then raise exception 'El cuadre del 13-oct de Sacha no coincide con $5 + cobros en efectivo.'; end if;
end;
$$;
