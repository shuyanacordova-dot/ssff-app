-- Pedido y autorizado por Shuyana el 2026-09-25 ("vuelve a revisar las ventas duplicadas ... corrige"; confirmación: "si"),
-- ejemplo: Miguel Villaprado Moreira (folios 3883 y 5725).
-- 1) Anula (NO borra) las ventas "Migración OPTOX - folio N" que repiten una venta original vigente del
--    mismo paciente, sucursal, día y total. La copia de migración no tiene pagos ni órdenes de laboratorio;
--    la original conserva productos y abonos. Respaldo en depuracion_ventas_duplicadas.
-- 2) Cinco ventas de migración (ago–sep 2026) quedaron vivas pero su abono estaba solo en las copias
--    anuladas: se registra el abono en la venta vigente (a las 12:00 de su fecha).
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

with mig as (
  select v.* from public.ventas v
  where v.estado <> 'anulada'
    and exists (select 1 from public.venta_items i where i.venta_id = v.id and i.descripcion like 'Migración OPTOX%')
    and not exists (select 1 from public.pagos_venta p where p.venta_id = v.id)
    and not exists (select 1 from public.ordenes_laboratorio o where o.venta_id = v.id)
    and not exists (select 1 from public.garantias g where g.venta_id = v.id)
    and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
), par as (
  select distinct on (m.id) m.id, m.folio, m.sucursal_id, (m.creado_en at time zone 'America/Guayaquil')::date fecha, r.folio folio_conservado
  from mig m
  join public.ventas r on r.id <> m.id and r.estado <> 'anulada'
    and r.sucursal_id = m.sucursal_id and r.total = m.total and r.paciente_id = m.paciente_id
    and (r.creado_en at time zone 'America/Guayaquil')::date = (m.creado_en at time zone 'America/Guayaquil')::date
    and not exists (select 1 from public.venta_items i where i.venta_id = r.id and i.descripcion like 'Migración OPTOX%')
  order by m.id, r.folio
)
insert into public.depuracion_ventas_duplicadas (venta_id, folio, sucursal_id, fecha, accion, folio_conservado, folio_optox, snapshot)
select par.id, par.folio, par.sucursal_id, par.fecha, 'anular_migracion_duplicada', par.folio_conservado,
  (select substring(i.descripcion from 'folio (\d+)')::int from public.venta_items i where i.venta_id = v.id and i.descripcion like 'Migración OPTOX%' limit 1),
  jsonb_build_object('venta', to_jsonb(v), 'items', (select jsonb_agg(to_jsonb(i)) from public.venta_items i where i.venta_id = v.id), 'pagos', '[]'::jsonb)
from par join public.ventas v on v.id = par.id
where not exists (select 1 from public.depuracion_ventas_duplicadas d where d.venta_id = par.id);

update public.ventas v set estado = 'anulada',
  motivo_anulacion = 'Duplicado de migración Optox. Se conserva el folio ' || d.folio_conservado || '.'
from public.depuracion_ventas_duplicadas d
where d.venta_id = v.id and d.accion = 'anular_migracion_duplicada' and v.estado <> 'anulada';

insert into public.pagos_venta (venta_id, metodo, monto, banco, referencia, recibido_por, creado_en)
select v.id, x.metodo, x.monto, x.banco, 'Abono recuperado de la copia anulada folio ' || x.folio_anulado, null,
       ((x.fecha::timestamp + time '12:00') at time zone 'America/Guayaquil')
from (values
  (5754, 'transferencia', 100.00, 'pichincha', date '2026-08-14', 5061),
  (5758, 'transferencia', 130.00, 'pichincha', date '2026-09-01', 5126),
  (5761, 'transferencia', 150.00, 'pichincha', date '2026-09-11', 5195),
  (5763, 'transferencia',  60.00, 'pichincha', date '2026-09-12', 5203),
  (5765, 'efectivo',      100.00, null,        date '2026-09-14', 5209)
) x(folio, metodo, monto, banco, fecha, folio_anulado)
join public.ventas v on v.folio = x.folio and v.estado <> 'anulada'
where not exists (select 1 from public.pagos_venta p where p.venta_id = v.id);
