-- Saldo actual de cada cuenta = saldo real del último cuadre + movimientos con fecha POSTERIOR a ese cuadre.
-- Antes, cada egreso de banco restaba del saldo aunque su fecha fuera del mismo día (o anterior) del cuadre, que ya lo
-- incluía: el 28-09 el sueldo de Shu ($83,31, fecha 28-09) dejó el Pichincha de Shushufindi en $1.770,62 en vez de $1.853,93.
-- Sin cuadre todavía, se mantiene el comportamiento anterior (sumar/restar cada movimiento).

create or replace function app_private.recalcular_saldo_cuenta(p_cuenta uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_cuadre record; v_mov numeric;
begin
  select fecha, saldo_real into v_cuadre from public.cuadres_banco where cuenta_id = p_cuenta order by fecha desc limit 1;
  if v_cuadre.fecha is null then return; end if;
  select coalesce(sum(case when tipo = 'egreso' then -monto else monto end), 0) into v_mov
  from public.movimientos_bancarios where cuenta_id = p_cuenta and fecha > v_cuadre.fecha;
  update public.cuentas_bancarias set saldo_actual = v_cuadre.saldo_real + v_mov, actualizado_en = now() where id = p_cuenta;
end;
$$;
revoke all on function app_private.recalcular_saldo_cuenta(uuid) from public, anon, authenticated;

create or replace function app_private.aplicar_movimiento_bancario()
returns trigger language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_row public.movimientos_bancarios; v_delta numeric;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if exists (select 1 from public.cuadres_banco where cuenta_id = v_row.cuenta_id) then
    perform app_private.recalcular_saldo_cuenta(v_row.cuenta_id);
  else
    v_delta := case when v_row.tipo = 'egreso' then -v_row.monto else v_row.monto end;
    if tg_op = 'DELETE' then v_delta := -v_delta; end if;
    update public.cuentas_bancarias set saldo_actual = saldo_actual + v_delta, actualizado_en = now() where id = v_row.cuenta_id;
  end if;
  return v_row;
end;
$$;

drop trigger if exists trg_aplicar_movimiento_bancario on public.movimientos_bancarios;
create trigger trg_aplicar_movimiento_bancario after insert or delete on public.movimientos_bancarios
for each row execute function app_private.aplicar_movimiento_bancario();

-- Revertir el movimiento de un egreso (editar/eliminar egreso): el saldo lo ajusta el trigger al borrar.
create or replace function app_private.revertir_movimiento_de_gasto(p_gasto uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
begin
  delete from public.movimientos_bancarios where gasto_id = p_gasto;
end;
$$;

-- Dejar al día todas las cuentas que ya tienen cuadre.
select app_private.recalcular_saldo_cuenta(id) from public.cuentas_bancarias
where exists (select 1 from public.cuadres_banco b where b.cuenta_id = cuentas_bancarias.id);
