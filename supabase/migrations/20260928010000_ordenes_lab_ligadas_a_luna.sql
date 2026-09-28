-- Órdenes de laboratorio que quedaron ligadas al armazón en lugar de la luna (pedido de Shuyana 2026-09-28:
-- en Sacha la orden imprimía 2 armazones y no el material). Se re-ligan a la única luna de su venta.
-- Afectadas: folios 5784 (Shuvision), 5785 y 5786 (Shuvision Sacha). Respaldo del valor anterior en correccion_orden_item.
create table if not exists public.correccion_orden_item (
  orden_id uuid primary key references public.ordenes_laboratorio(id),
  venta_item_anterior uuid not null,
  venta_item_nuevo uuid not null,
  corregido_en timestamptz not null default now()
);
alter table public.correccion_orden_item enable row level security;
revoke all on public.correccion_orden_item from public, anon, authenticated;

with malas as (
  select o.id orden_id, o.venta_item_id anterior,
    (select x.id from public.venta_items x join public.productos_catalogo px on px.id = x.producto_id where x.venta_id = o.venta_id and px.categoria = 'lente') nuevo
  from public.ordenes_laboratorio o
  join public.venta_items vi on vi.id = o.venta_item_id
  join public.productos_catalogo pc on pc.id = vi.producto_id
  where pc.categoria = 'montura'
    and (select count(*) from public.venta_items x join public.productos_catalogo px on px.id = x.producto_id where x.venta_id = o.venta_id and px.categoria = 'lente') = 1
), respaldo as (
  insert into public.correccion_orden_item (orden_id, venta_item_anterior, venta_item_nuevo)
  select orden_id, anterior, nuevo from malas on conflict (orden_id) do nothing returning orden_id, venta_item_nuevo
)
update public.ordenes_laboratorio o set venta_item_id = r.venta_item_nuevo from respaldo r where o.id = r.orden_id;
