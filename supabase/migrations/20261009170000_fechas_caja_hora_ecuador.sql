-- Egresos, movimientos de banco, cierres y pagos de deudas anotados después de las 19:00 (hora de Ecuador)
-- quedaban con la fecha del día siguiente: la base de datos usa UTC y "current_date" ya es mañana (lección L4/L20).
-- Ahora la fecha por defecto es el día en America/Guayaquil.

alter table public.gastos alter column fecha set default ((now() at time zone 'America/Guayaquil')::date);
alter table public.movimientos_bancarios alter column fecha set default ((now() at time zone 'America/Guayaquil')::date);
alter table public.cierres_caja alter column fecha set default ((now() at time zone 'America/Guayaquil')::date);
alter table public.deudas_negocio alter column fecha_deuda set default ((now() at time zone 'America/Guayaquil')::date);
alter table public.pagos_deuda_negocio alter column fecha_pago set default ((now() at time zone 'America/Guayaquil')::date);

-- Mismas funciones, misma firma (se conservan permisos): solo cambia current_date por el día de Ecuador.
do $$
declare f record;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('registrar_gasto', 'registrar_movimiento_bancario', 'registrar_pago_deuda_negocio', 'crear_acuerdo_pago')
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), '\mcurrent_date\M', '((now() at time zone ''America/Guayaquil'')::date)', 'gi');
  end loop;
end $$;

-- Datos: los registros que quedaron con el día siguiente vuelven al día en que se anotaron (6 egresos y 4 movimientos de banco, 7 y 9-oct-2026).
update public.gastos set fecha = (creado_en at time zone 'America/Guayaquil')::date
where fecha = (creado_en at time zone 'America/Guayaquil')::date + 1;
update public.movimientos_bancarios set fecha = (creado_en at time zone 'America/Guayaquil')::date
where fecha = (creado_en at time zone 'America/Guayaquil')::date + 1;
