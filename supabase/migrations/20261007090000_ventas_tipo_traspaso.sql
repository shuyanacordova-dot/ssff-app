-- Traspaso (Shuyana 2026-10-07): venta de un armazón para montar las lunas que trae el paciente.
-- Precio normal, cuenta en metas y descuenta inventario como cualquier venta. Se marca el tipo para poder filtrarlo.
alter table public.ventas add column if not exists tipo_venta text check (tipo_venta in ('rapida', 'lentes', 'traspaso'));
