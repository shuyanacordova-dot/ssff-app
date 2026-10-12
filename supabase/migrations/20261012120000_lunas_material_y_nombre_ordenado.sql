-- Lista de precios de lunas: material con nombres simples y nombre ordenado (Shuyana, 2026-10-12).
-- Regla: lunas de resina con índice menor a 1.61 = "CR39"; desde 1.61 = "Reducción".
-- Policarbonato, GX7 y Policarbonato/CR39 no cambian. "Alto Índice (Resina)", "Reducción (Hi/Mid Index)" y "CR38" desaparecen.
-- Nombre: "Diseño Línea · Material Índice · Tecnología (Opción n)". Los precios NO cambian.

-- Respaldo de lo anterior (no se borra nada).
create table if not exists public.productos_catalogo_respaldo_20261012 as
select id, empresa_id, codigo, nombre, material, indice, now() as respaldado_en
from public.productos_catalogo
where categoria = 'lente' and activo and codigo like 'LP-%';

alter table public.productos_catalogo_respaldo_20261012 enable row level security;
revoke all on public.productos_catalogo_respaldo_20261012 from public, anon, authenticated;

-- 1) Material.
update public.productos_catalogo
set material = case when indice::numeric >= 1.61 then 'Reducción' else 'CR39' end
where categoria = 'lente' and activo and codigo like 'LP-%'
  and indice is not null
  and material in ('CR39', 'CR38', 'Alto Índice (Resina)', 'Reducción', 'Reducción (Hi Index)', 'Reducción (Mid Index)');

-- 2) Nombre ordenado (solo lunas con diseño, línea, material, índice y tecnología).
update public.productos_catalogo p
set nombre = concat_ws(' · ',
    trim(concat(initcap(lower(p.diseno)), ' ', upper(left(lower(p.linea), 1)) || substr(lower(p.linea), 2))),
    p.material || ' ' || p.indice,
    p.tecnologia)
  || coalesce(' (Opción ' || substring(r.nombre from '\(OPCIÓN (\d+)\)\s*$') || ')', '')
from public.productos_catalogo_respaldo_20261012 r
where r.id = p.id
  and p.diseno is not null and p.linea is not null and p.material is not null and p.indice is not null and p.tecnologia is not null;
