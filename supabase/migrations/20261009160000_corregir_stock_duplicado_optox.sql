-- La importación de Optox escribió la existencia directamente en inventario_stock Y además registró
-- el movimiento "Carga inicial", que el disparador volvió a sumar: todo el stock quedó al doble.
-- Por eso un armazón vendido bajaba de 2 a 1 en vez de quedar en 0.
-- Corrección autorizada por Shuyana (2026-10-09): la existencia = suma de movimientos (entradas − salidas).
-- Se guarda una copia de respaldo antes de corregir.

create table if not exists public.inventario_stock_respaldo_20261009 as
  select s.*, now() as respaldado_en from public.inventario_stock s;
alter table public.inventario_stock_respaldo_20261009 enable row level security;
comment on table public.inventario_stock_respaldo_20261009 is 'Copia de inventario_stock antes de corregir el stock duplicado por la importación de Optox (2026-10-09).';

with mov as (
  select producto_id, sucursal_id,
         sum(case when tipo in ('salida', 'transferencia_salida') then -cantidad else cantidad end) as neto
  from public.movimientos_inventario group by producto_id, sucursal_id
)
update public.inventario_stock s
set cantidad = coalesce(m.neto, 0), actualizado_en = now()
from mov m
where m.producto_id = s.producto_id and m.sucursal_id = s.sucursal_id and s.cantidad <> m.neto;
