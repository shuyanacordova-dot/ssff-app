-- Acumulado (dinero disponible), corrección 2026-10-01: los cobros con TARJETA no están en el banco el mismo día
-- (se acreditan días después, menos la comisión). Antes se sumaban al saldo de Pichincha y Shuvision mostraba $1.720,93
-- cuando en la cuenta había $1.460,93 (diferencia = tarjeta de $260 del 30-09). Ahora:
--   bancos = último cuadre + transferencias + depósitos de caja + otros ingresos − egresos (sin tarjetas)
--   tarjetas_por_acreditar = cobros con tarjeta posteriores al último cuadre (se muestran aparte)
--   total = bancos + tarjetas por acreditar + efectivo

create or replace function public.dinero_disponible(p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guayaquil')::date);
  s record; c record; v_out jsonb := '[]'::jsonb;
  v_bancos numeric; v_tarjetas numeric; v_sin_cuadre int; v_cuentas jsonb; v_saldo numeric; v_tarj numeric; v_cuadre record;
  v_base record; v_efectivo numeric; v_desde date;
begin
  if not public.es_superadmin() then raise exception 'El dinero disponible es solo para la Superadministradora.'; end if;

  for s in select su.id, su.empresa_id, su.nombre from public.sucursales su
           where su.activo and exists (select 1 from public.cuentas_bancarias cb where cb.sucursal_id = su.id and cb.activo)
           order by su.nombre loop
    v_bancos := 0; v_tarjetas := 0; v_sin_cuadre := 0; v_cuentas := '[]'::jsonb;
    for c in select id, banco from public.cuentas_bancarias where sucursal_id = s.id and activo order by banco loop
      select fecha, saldo_real into v_cuadre from public.cuadres_banco where cuenta_id = c.id and fecha <= v_fecha order by fecha desc limit 1;
      if v_cuadre.fecha is null then
        v_sin_cuadre := v_sin_cuadre + 1;
        v_cuentas := v_cuentas || jsonb_build_object('banco', c.banco, 'saldo', null, 'cuadre', null, 'tarjetas', null);
      else
        select v_cuadre.saldo_real + coalesce(sum(m.monto) filter (where m.grupo <> 'tarjetas'), 0),
               coalesce(sum(m.monto) filter (where m.grupo = 'tarjetas'), 0)
          into v_saldo, v_tarj
        from app_private.movimientos_cuenta(c.id, v_cuadre.fecha, v_fecha) m;
        v_bancos := v_bancos + v_saldo;
        v_tarjetas := v_tarjetas + v_tarj;
        v_cuentas := v_cuentas || jsonb_build_object('banco', c.banco, 'saldo', v_saldo, 'cuadre', v_cuadre.fecha, 'tarjetas', v_tarj);
      end if;
    end loop;

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
