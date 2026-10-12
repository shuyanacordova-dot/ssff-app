-- Lentes de lectura y bifocales terminados van en Accesorios, no en armazones (Shuyana, 2026-10-12).
-- Además: 3 armazones con sección "Oftalmico"/"OFTALMICO"/"ECONÓMICO" pasan a "Económico" (son económicos por su nombre).

create table if not exists public.productos_categoria_respaldo_20261012 as
select id, empresa_id, nombre, categoria, clasificacion, modelo, now() as respaldado_en
from public.productos_catalogo
where categoria in ('montura', 'gafas_sol')
  and (clasificacion ilike 'lectura%' or clasificacion = 'Bifocal' or clasificacion in ('Oftalmico', 'OFTALMICO', 'ECONÓMICO'));

alter table public.productos_categoria_respaldo_20261012 enable row level security;
revoke all on public.productos_categoria_respaldo_20261012 from public, anon, authenticated;

-- 1) Lectura y bifocales terminados → accesorio. El modelo vacío toma el de su sección.
update public.productos_catalogo
set categoria = 'accesorio',
    modelo = coalesce(modelo, case clasificacion
      when 'Lectura económico' then 'LENTE DE LECTURA ECONOMICO'
      when 'Lectura imán' then 'LENTE DE LECTURA IMAN'
      when 'Lectura básico' then 'LENTE DE LECTURA BASICO' else modelo end)
where categoria in ('montura', 'gafas_sol') and (clasificacion ilike 'lectura%' or clasificacion = 'Bifocal');

-- Mismo texto para "LENTE DE LECTURA IMÁN" e "IMAN".
update public.productos_catalogo set modelo = 'LENTE DE LECTURA IMAN' where modelo = 'LENTE DE LECTURA IMÁN';

-- 2) Secciones sueltas de armazones económicos.
update public.productos_catalogo
set clasificacion = 'Económico', modelo = coalesce(modelo, 'ECONOMICO')
where categoria = 'montura' and clasificacion in ('Oftalmico', 'OFTALMICO', 'ECONÓMICO');
