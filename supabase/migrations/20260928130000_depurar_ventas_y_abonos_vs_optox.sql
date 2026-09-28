-- Depuración de ventas y abonos contra el respaldo de Optox (autorizado por Shuyana el 2026-09-28):
--   "LAS 24 ventas que estaban canceladas en Optox; ESAS SI DEJALAS, EL RESTO QUE ME RECOMENDASTE LO PUEDES BORRAR…
--    LAS VENTAS CANCELADAS EN OPTOX, DEJALAS COMO LAS CORREGIMOS EN LUMOS… SI CORRIGE LOS ABONOS, PARA QUE QUEDEN IGUAL,
--    Y AGREGA LOS ABONOS QUE FALTABAN."
-- Fuente: "Mi Optox - Backup - Ventas (23-09-2026 05 11 34).csv" y "Optox backup - Monturas (23-09-2026 08 15 15).xlsx"
-- (este último trae los abonos, no monturas). Solo se comparan abonos hasta el 23-09-2026; los registrados después en LumOS no se tocan.
--
-- 1) Se BORRAN 343 ventas anuladas por duplicado (308 "Duplicado de importación", 34 "Duplicado de migración Optox",
--    1 "Prueba QA"), con copia completa (venta, ítems, abonos, historial) en public.ventas_borradas_respaldo.
--    Se conservan las 24 anuladas "Venta cancelada en Optox" y la anulada por crédito incobrable.
-- 2) Abonos: se quitan 25 que en Optox fueron devueltos (con copia en public.correcciones_pagos_venta) y se agregan
--    28 que faltaban (ej. Sandra Rojas 2×$30, Elvis Zambrano $150, consumidores finales).

create table if not exists public.ventas_borradas_respaldo (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null,
  folio integer,
  motivo text not null,
  snapshot jsonb not null,
  borrado_en timestamptz not null default now()
);
alter table public.ventas_borradas_respaldo enable row level security;
revoke all on public.ventas_borradas_respaldo from public, anon, authenticated;

create table if not exists public.correcciones_pagos_venta (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null,
  accion text not null,
  motivo text not null,
  snapshot jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.correcciones_pagos_venta enable row level security;
revoke all on public.correcciones_pagos_venta from public, anon, authenticated;

-- La tabla de la depuración anterior queda como archivo histórico (sin amarre a ventas que ya no existen).
alter table public.depuracion_ventas_duplicadas drop constraint if exists depuracion_ventas_duplicadas_venta_id_fkey;

create temporary table borrar_ventas on commit drop as
select id from public.ventas
where estado = 'anulada'
  and (motivo_anulacion like 'Duplicado de importación%' or motivo_anulacion like 'Duplicado de migración Optox%' or motivo_anulacion like 'Prueba QA%')
  and not exists (select 1 from public.ordenes_laboratorio o where o.venta_id = ventas.id)
  and not exists (select 1 from public.acuerdos_pago a where a.venta_id = ventas.id)
  and not exists (select 1 from public.garantias g where g.venta_id = ventas.id)
  and not exists (select 1 from public.canjes_venta c where c.venta_id = ventas.id)
  and not exists (select 1 from public.creditos_paciente c where ventas.id in (c.venta_origen_id, c.venta_uso_id))
  and not exists (select 1 from public.movimientos_inventario m where m.venta_id = ventas.id);

insert into public.ventas_borradas_respaldo (venta_id, folio, motivo, snapshot)
select v.id, v.folio, v.motivo_anulacion, jsonb_build_object(
  'venta', to_jsonb(v),
  'items', (select jsonb_agg(to_jsonb(i)) from public.venta_items i where i.venta_id = v.id),
  'pagos', (select jsonb_agg(to_jsonb(p)) from public.pagos_venta p where p.venta_id = v.id),
  'historial', (select jsonb_agg(to_jsonb(h)) from public.historial_ventas_eventos h where h.venta_id = v.id))
from public.ventas v where v.id in (select id from borrar_ventas);

alter table public.pagos_venta disable trigger trg_bloquear_pagos_venta_anulada;
alter table public.venta_items disable trigger trg_bloquear_items_venta_anulada;
delete from public.historial_ventas_eventos where venta_id in (select id from borrar_ventas);
delete from public.pagos_venta where venta_id in (select id from borrar_ventas);
delete from public.venta_items where venta_id in (select id from borrar_ventas);
delete from public.ventas where id in (select id from borrar_ventas);
alter table public.pagos_venta enable trigger trg_bloquear_pagos_venta_anulada;
alter table public.venta_items enable trigger trg_bloquear_items_venta_anulada;

-- 2a) Abonos devueltos en Optox que seguían sumando en LumOS: (prefijo del abono, prefijo de la venta, folio LumOS)
create temporary table quitar_pagos (pago text, venta text, folio integer) on commit drop;
insert into quitar_pagos values
  ('48440292', 'bbf14884', 76),
  ('e221f322', 'fc92768e', 263),
  ('a9c6fee0', '233f1f63', 287),
  ('4c5b161d', 'e5f7e128', 529),
  ('7180405d', '8baa5100', 731),
  ('179f5a1a', 'd5a4f0bd', 860),
  ('a66fb652', '244d0f1d', 906),
  ('4c4b968d', '25a12059', 1044),
  ('81d924d7', 'a362e807', 1174),
  ('1fdd63ae', '57accd37', 1208),
  ('1750df4f', 'eb103399', 1627),
  ('a8cbe465', '13e6decd', 1926),
  ('0695f7d9', 'c97aec26', 2277),
  ('31cb446d', '78c3f8cd', 2592),
  ('c547a717', '78c3f8cd', 2592),
  ('7e23208b', '78c3f8cd', 2592),
  ('30af94a9', '07fb2b14', 3426),
  ('4efd0646', 'e53f64e3', 3667),
  ('fe0e8208', '4122d98b', 3765),
  ('e1254405', '655f96f9', 4013),
  ('65892612', 'fe846214', 4102),
  ('1624cd5b', '169786e9', 4223),
  ('6c80aeec', 'db02be7f', 4634),
  ('9b75f1cd', 'e498b6e9', 5278),
  ('bca0518d', '82ca5b2d', 5552);

insert into public.correcciones_pagos_venta (pago_id, accion, motivo, snapshot)
select p.id, 'eliminado', 'Abono devuelto en Optox (folio LumOS ' || q.folio || '); se deja igual que Optox.', to_jsonb(p)
from quitar_pagos q
join public.ventas v on left(v.id::text, 8) = q.venta and v.folio = q.folio and v.estado = 'completada'
join public.pagos_venta p on left(p.id::text, 8) = q.pago and p.venta_id = v.id;

delete from public.pagos_venta p using quitar_pagos q, public.ventas v
where left(v.id::text, 8) = q.venta and v.folio = q.folio and v.estado = 'completada'
  and left(p.id::text, 8) = q.pago and p.venta_id = v.id;

-- 2b) Abonos que están en Optox y faltaban en LumOS: (prefijo de la venta, folio LumOS, método, monto, referencia, banco, fecha)
create temporary table agregar_pagos (venta text, folio integer, metodo text, monto numeric, referencia text, banco text, creado_en timestamptz) on commit drop;
insert into agregar_pagos values
  ('e7a782f2', 5231, 'efectivo', 3.0, 'Optox folio 6956', null, '2026-07-01 15:07:35-05'::timestamptz),
  ('af2af538', 5230, 'efectivo', 3.0, 'Optox folio 6957', null, '2026-07-01 15:07:28-05'::timestamptz),
  ('6f1f0d38', 5229, 'efectivo', 142.5, 'Optox folio 7284', null, '2026-09-21 11:09:21-05'::timestamptz),
  ('6f1f0d38', 5229, 'credito', 7.5, 'Optox folio 7285', null, '2026-09-21 11:09:40-05'::timestamptz),
  ('db33ced6', 5610, 'efectivo', 60.0, 'Optox folio 6998', null, '2026-07-14 15:07:37-05'::timestamptz),
  ('6145c68b', 5656, 'efectivo', 60.0, 'Optox folio 158', null, '2026-07-16 11:07:59-05'::timestamptz),
  ('367b8569', 5657, 'efectivo', 60.0, 'Optox folio 159', null, '2026-07-16 11:07:49-05'::timestamptz),
  ('e20a234b', 5612, 'transferencia', 100.0, 'Optox folio 721', null, '2026-07-17 10:07:42-05'::timestamptz),
  ('0cd9c835', 5357, 'efectivo', 5.0, 'Optox folio 7028', null, '2026-07-23 13:07:14-05'::timestamptz),
  ('721b0e3e', 5354, 'efectivo', 5.0, 'Optox folio 7032', null, '2026-07-23 16:07:50-05'::timestamptz),
  ('d026abc0', 5624, 'efectivo', 55.0, 'Optox folio 735', null, '2026-07-29 11:07:47-05'::timestamptz),
  ('60102297', 5622, 'transferencia', 80.0, 'Optox folio 733', null, '2026-07-28 15:07:25-05'::timestamptz),
  ('5e20e7e7', 5372, 'transferencia', 5.0, 'Optox folio 7051', 'pichincha', '2026-07-30 09:07:53-05'::timestamptz),
  ('df55eb4e', 5374, 'efectivo', 5.0, 'Optox folio 7053', null, '2026-07-30 14:07:03-05'::timestamptz),
  ('e3403225', 5377, 'efectivo', 5.0, 'Optox folio 7056', null, '2026-07-31 14:07:11-05'::timestamptz),
  ('92b4d710', 5379, 'efectivo', 5.0, 'Optox folio 7058', null, '2026-07-31 15:07:47-05'::timestamptz),
  ('0317d760', 5462, 'efectivo', 1.0, 'Optox folio 7154', null, '2026-08-25 16:08:45-05'::timestamptz),
  ('ddc48f73', 5461, 'efectivo', 1.0, 'Optox folio 7155', null, '2026-08-25 16:08:24-05'::timestamptz),
  ('c81e8316', 5533, 'efectivo', 1.0, 'Optox folio 7229', null, '2026-09-08 09:09:30-05'::timestamptz),
  ('3d1eed29', 5532, 'efectivo', 1.0, 'Optox folio 7230', null, '2026-09-08 09:09:37-05'::timestamptz),
  ('eec1c216', 5696, 'transferencia', 30.0, 'Optox folio 213', 'pichincha', '2026-09-09 15:09:15-05'::timestamptz),
  ('b731eb82', 5699, 'transferencia', 30.0, 'Optox folio 216', 'pichincha', '2026-09-09 17:09:18-05'::timestamptz),
  ('a39a7877', 5562, 'efectivo', 5.0, 'Optox folio 7261', null, '2026-09-14 14:09:16-05'::timestamptz),
  ('386f229e', 5561, 'efectivo', 5.0, 'Optox folio 7262', null, '2026-09-14 15:09:53-05'::timestamptz),
  ('faf2668a', 5566, 'efectivo', 5.0, 'Optox folio 7264', null, '2026-09-14 16:09:58-05'::timestamptz),
  ('01069ac2', 5708, 'efectivo', 10.0, 'Optox folio 226', null, '2026-09-17 12:09:35-05'::timestamptz),
  ('ebd6d6b0', 5707, 'efectivo', 10.0, 'Optox folio 227', null, '2026-09-17 12:09:18-05'::timestamptz),
  ('99538903', 5706, 'efectivo', 10.0, 'Optox folio 230', null, '2026-09-17 15:09:18-05'::timestamptz);

select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

with nuevos as (
  insert into public.pagos_venta (venta_id, metodo, monto, referencia, banco, creado_en)
  select v.id, a.metodo, a.monto, a.referencia, a.banco, a.creado_en
  from agregar_pagos a
  join public.ventas v on left(v.id::text, 8) = a.venta and v.folio = a.folio and v.estado = 'completada'
  where not exists (select 1 from public.pagos_venta q where q.venta_id = v.id and q.referencia = a.referencia)
  returning *)
insert into public.correcciones_pagos_venta (pago_id, accion, motivo, snapshot)
select n.id, 'agregado', 'Abono de Optox que faltaba en LumOS (' || n.referencia || ').', to_jsonb(n) from nuevos n;
