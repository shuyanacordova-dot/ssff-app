alter table public.productos_catalogo
  add column if not exists marca text,
  add column if not exists modelo text,
  add column if not exists color text,
  add column if not exists consignacion boolean not null default false,
  add column if not exists precio_venta_2 numeric,
  add column if not exists precio_venta_3 numeric,
  add column if not exists medida_puente numeric,
  add column if not exists fecha_compra date;;
