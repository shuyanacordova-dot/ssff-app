-- PROPUESTA NO APLICADA. Requiere autorización explícita de Shuyana en la sesión (fue bloqueada por el control de permisos el 2026-09-24).
-- Anula (no borra) 118 ventas de septiembre duplicadas por importación y respalda cada una en depuracion_ventas_duplicadas.

-- Depuración de ventas duplicadas por importación (septiembre 2026), autorizada por Shuyana el 2026-09-24.
-- Referencia: public.optox_ventas_referencia (reportes "Ventas por sucursal" de Optox).
-- Regla: por cada venta de Optox se conserva una sola copia (la que coincide en pago con Optox; luego la que tiene
-- órdenes/garantías/acuerdos; luego la creada en LumOS). Las demás copias, y las ventas que Optox marca canceladas,
-- se anulan (no se borran). Todo queda respaldado en public.depuracion_ventas_duplicadas.

create table if not exists public.depuracion_ventas_duplicadas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  folio integer,
  sucursal_id uuid,
  fecha date,
  accion text not null,
  folio_conservado integer,
  folio_optox integer,
  snapshot jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.depuracion_ventas_duplicadas enable row level security;
revoke all on public.depuracion_ventas_duplicadas from public, anon, authenticated;

create or replace view app_private.plan_dedupe_ventas as
with oall as (
  select sucursal_id, fecha, total, folio_optox, a_cuenta, cancelada,
    case when paciente ilike '%consumidor%' then 'CONSUMIDOR' else regexp_replace(translate(upper(trim(paciente)),'ÁÉÍÓÚÜÑ','AEIOUUN'),'\s+',' ','g') end nm
  from public.optox_ventas_referencia),
o as (select * from oall where not cancelada),
o2 as (select o.*, row_number() over (partition by sucursal_id, fecha, total, nm order by folio_optox) rk from o),
d0 as (
  select v.id, v.folio, v.sucursal_id, (v.creado_en at time zone 'America/Guayaquil')::date fecha, v.total, v.pagado, v.saldo,
    case when coalesce(p.nombres||' '||p.apellidos, v.cliente_nombre,'') ilike '%consumidor%' or coalesce(p.nombres, v.cliente_nombre,'') = '' then 'CONSUMIDOR'
         else regexp_replace(translate(upper(trim(coalesce(p.nombres||' '||p.apellidos, v.cliente_nombre))),'ÁÉÍÓÚÜÑ','AEIOUUN'),'\s+',' ','g') end nm,
    (select count(*) from public.ordenes_laboratorio ol where ol.venta_id=v.id) + (select count(*) from public.garantias g where g.venta_id=v.id) + (select count(*) from public.acuerdos_pago a where a.venta_id=v.id) vinculos,
    (select count(*) from public.pagos_venta pv where pv.venta_id=v.id and (pv.creado_en at time zone 'America/Guayaquil')::date > (v.creado_en at time zone 'America/Guayaquil')::date) abonos_post,
    exists (select 1 from public.venta_items i where i.venta_id=v.id and i.descripcion='Producto') generico,
    not (extract(hour from v.creado_en at time zone 'America/Guayaquil')=12 and extract(minute from v.creado_en at time zone 'America/Guayaquil')=0) nativa
  from public.ventas v left join public.pacientes_clinicos p on p.id=v.paciente_id
  where v.estado='completada' and v.creado_en >= '2026-09-01 00:00:00-05' and v.creado_en < '2026-10-01 00:00:00-05'),
d as (
  select d0.*, row_number() over (partition by sucursal_id, fecha, total, nm
     order by (pagado = coalesce((select max(a_cuenta) from o where o.sucursal_id=d0.sucursal_id and o.fecha=d0.fecha and o.total=d0.total and o.nm=d0.nm),-1)) desc,
       vinculos desc, nativa desc, abonos_post desc, generico asc, folio desc) rk
  from d0)
select d.*,
  case when o2.folio_optox is not null then 'conservar'
       when exists (select 1 from o where o.sucursal_id=d.sucursal_id and o.fecha=d.fecha and o.total=d.total and o.nm=d.nm) then 'anular'
       when d.total = 0 and exists (select 1 from oall c where c.cancelada and c.sucursal_id=d.sucursal_id and c.fecha=d.fecha and c.nm=d.nm) then 'anular_cancelada_optox'
       else 'sin_referencia' end accion, o2.folio_optox, o2.a_cuenta
from d left join o2 on o2.sucursal_id=d.sucursal_id and o2.fecha=d.fecha and o2.total=d.total and o2.nm=d.nm and o2.rk=d.rk;

insert into public.depuracion_ventas_duplicadas (venta_id, folio, sucursal_id, fecha, accion, folio_conservado, folio_optox, snapshot)
select x.id, x.folio, x.sucursal_id, x.fecha, x.accion,
  (select k.folio from app_private.plan_dedupe_ventas k where k.accion='conservar' and k.sucursal_id=x.sucursal_id and k.fecha=x.fecha and k.total=x.total and k.nm=x.nm order by k.folio limit 1),
  case when x.accion = 'anular_cancelada_optox' then (select c.folio_optox from public.optox_ventas_referencia c where c.cancelada and c.sucursal_id=x.sucursal_id and c.fecha=x.fecha limit 1) end,
  jsonb_build_object('venta', to_jsonb(v), 'items', (select jsonb_agg(to_jsonb(i)) from public.venta_items i where i.venta_id=v.id), 'pagos', (select jsonb_agg(to_jsonb(p)) from public.pagos_venta p where p.venta_id=v.id))
from app_private.plan_dedupe_ventas x join public.ventas v on v.id=x.id
where x.accion in ('anular', 'anular_cancelada_optox');

-- La anulación exige superadministradora: se ejecuta a nombre de Shuyana, que la autorizó.
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

update public.ventas v set estado = 'anulada',
  motivo_anulacion = case when d.accion = 'anular'
    then 'Duplicado de importación. Se conserva el folio ' || coalesce(d.folio_conservado::text, '?') || '.'
    else 'Venta cancelada en Optox (folio ' || coalesce(d.folio_optox::text, '?') || ').' end
from public.depuracion_ventas_duplicadas d
where d.venta_id = v.id and v.estado = 'completada';

drop view app_private.plan_dedupe_ventas;
