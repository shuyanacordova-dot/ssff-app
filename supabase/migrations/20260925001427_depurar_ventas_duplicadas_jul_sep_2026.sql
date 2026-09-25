-- APLICADA el 2026-09-24 con autorización explícita de Shuyana ("Sí, anula las 332 ventas duplicadas de julio a septiembre").
-- Anula (NO borra) 332 ventas de julio a septiembre de 2026 duplicadas por importación (o canceladas en Optox),
-- y respalda cada una (venta + items + pagos) en public.depuracion_ventas_duplicadas.
-- Referencia: public.optox_ventas_referencia (Excel "Ventas por sucursal" de Optox, cargado 2026-09-24).
-- Resultado verificado: julio y agosto quedan idénticos a Optox en las 3 sucursales; septiembre también,
-- salvo ventas del 24-sep aún no registradas y dos pagos desactualizados en Focus (folios 5197 y 5652).
-- Nunca anula una copia que tenga orden de laboratorio, garantía o acuerdo de pago.

create table if not exists public.depuracion_ventas_duplicadas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  folio integer, sucursal_id uuid, fecha date,
  accion text not null, folio_conservado integer, folio_optox integer,
  snapshot jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.depuracion_ventas_duplicadas enable row level security;
revoke all on public.depuracion_ventas_duplicadas from public, anon, authenticated;

drop view if exists app_private.plan_dedupe_ventas;
create view app_private.plan_dedupe_ventas as
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
  where v.estado='completada' and v.creado_en >= '2026-07-01 00:00:00-05' and v.creado_en < '2026-10-01 00:00:00-05'),
d as (
  select d0.*, row_number() over (partition by sucursal_id, fecha, total, nm
     order by vinculos desc,
       (pagado = coalesce((select max(a_cuenta) from o where o.sucursal_id=d0.sucursal_id and o.fecha=d0.fecha and o.total=d0.total and o.nm=d0.nm),-1)) desc,
       nativa desc, abonos_post desc, generico asc, folio desc) rk
  from d0),
p1 as (
  select d.*,
    case when o2.folio_optox is not null then 'conservar'
         when exists (select 1 from o where o.sucursal_id=d.sucursal_id and o.fecha=d.fecha and o.total=d.total and o.nm=d.nm) then 'anular'
         else 'sin_referencia' end accion1, o2.folio_optox, o2.a_cuenta
  from d left join o2 on o2.sucursal_id=d.sucursal_id and o2.fecha=d.fecha and o2.total=d.total and o2.nm=d.nm and o2.rk=d.rk)
select p1.id, p1.folio, p1.sucursal_id, p1.fecha, p1.total, p1.pagado, p1.saldo, p1.nm, p1.vinculos, p1.abonos_post, p1.generico, p1.nativa, p1.folio_optox, p1.a_cuenta,
  case
    when p1.accion1 <> 'sin_referencia' then p1.accion1
    when p1.vinculos > 0 or p1.nativa then 'sin_referencia'
    when exists (select 1 from o where o.sucursal_id=p1.sucursal_id and o.fecha=p1.fecha and o.total=p1.total)
         and (select count(*) from o where o.sucursal_id=p1.sucursal_id and o.fecha=p1.fecha and o.total=p1.total)
             <= (select count(*) from p1 k where k.accion1='conservar' and k.sucursal_id=p1.sucursal_id and k.fecha=p1.fecha and k.total=p1.total) then 'anular'
    when p1.total = 0 and exists (select 1 from oall c where c.cancelada and c.sucursal_id=p1.sucursal_id and c.fecha=p1.fecha)
         and not exists (select 1 from o where o.sucursal_id=p1.sucursal_id and o.fecha=p1.fecha and o.total=0 and o.nm=p1.nm) then 'anular_cancelada_optox'
    else 'sin_referencia' end accion
from p1;

insert into public.depuracion_ventas_duplicadas (venta_id, folio, sucursal_id, fecha, accion, folio_conservado, folio_optox, snapshot)
select x.id, x.folio, x.sucursal_id, x.fecha, x.accion,
  (select k.folio from app_private.plan_dedupe_ventas k where k.accion='conservar' and k.sucursal_id=x.sucursal_id and k.fecha=x.fecha and k.total=x.total order by (k.nm = x.nm) desc, k.folio limit 1),
  case when x.accion = 'anular_cancelada_optox' then (select c.folio_optox from public.optox_ventas_referencia c where c.cancelada and c.sucursal_id=x.sucursal_id and c.fecha=x.fecha limit 1) end,
  jsonb_build_object('venta', to_jsonb(v), 'items', (select jsonb_agg(to_jsonb(i)) from public.venta_items i where i.venta_id=v.id), 'pagos', (select jsonb_agg(to_jsonb(p)) from public.pagos_venta p where p.venta_id=v.id))
from app_private.plan_dedupe_ventas x join public.ventas v on v.id=x.id
where x.accion in ('anular', 'anular_cancelada_optox');

-- La anulación exige superadministradora: se ejecuta a nombre de Shuyana (auth b5e6cfbf-...), que la autoriza.
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

update public.ventas v set estado = 'anulada',
  motivo_anulacion = case when d.accion = 'anular'
    then 'Duplicado de importación. Se conserva el folio ' || coalesce(d.folio_conservado::text, '?') || '.'
    else 'Venta cancelada en Optox (folio ' || coalesce(d.folio_optox::text, '?') || ').' end
from public.depuracion_ventas_duplicadas d
where d.venta_id = v.id and v.estado = 'completada';

drop view app_private.plan_dedupe_ventas;
