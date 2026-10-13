-- Lista oficial de lunas del 13-oct-2026 (ya cargada en 20261013140000) con la regla de nombres de Shuyana (12-oct):
-- resina con índice < 1.61 = "CR39"; desde 1.61 = "Reducción". Nunca "Alto Índice", "Mid/Hi Index" ni "CR38".
-- Policarbonato, GX7 y Policarbonato/CR39 se quedan igual. Precios y costos no cambian.
-- Nombres: "Diseño Línea · Material Índice · Tecnología", y "(Opción n)" cuando dos lunas quedan con el mismo nombre.

create table if not exists public.productos_catalogo_respaldo_20261013 as
  select id, nombre, material, now() as respaldado_en from public.productos_catalogo
  where categoria = 'lente' and codigo like 'LP-20261013-%';
alter table public.productos_catalogo_respaldo_20261013 enable row level security;

update public.productos_catalogo
set material = case when indice < 1.61 then 'CR39' else 'Reducción' end, actualizado_en = now()
where categoria = 'lente' and codigo like 'LP-20261013-%'
  and indice is not null
  and material not in ('Policarbonato', 'GX7', 'Policarbonato/CR39')
  and material is distinct from case when indice < 1.61 then 'CR39' else 'Reducción' end;

with base as (
  select id, empresa_id,
         concat_ws(' · ', initcap(diseno) || ' ' || linea, nullif(trim(coalesce(material, '') || ' ' || coalesce(to_char(indice, 'FM0.00'), '')), ''), tecnologia) as nombre_base,
         codigo
  from public.productos_catalogo where categoria = 'lente' and codigo like 'LP-20261013-%'
), numerado as (
  select id, nombre_base,
         count(*) over (partition by empresa_id, nombre_base) as repetidos,
         row_number() over (partition by empresa_id, nombre_base order by codigo) as n
  from base
)
update public.productos_catalogo p
set nombre = numerado.nombre_base || case when numerado.repetidos > 1 then ' (Opción ' || numerado.n || ')' else '' end, actualizado_en = now()
from numerado where numerado.id = p.id;

-- La tecnología repetía el material ("Schneider Premium + High Index + AR"): se quitan "Mid/Hi/High Index" y "Alto Índice".
update public.productos_catalogo
set tecnologia = trim(regexp_replace(regexp_replace(regexp_replace(tecnologia, '\m(Mid|Hi|High) Index\M|Alto Índice', '', 'gi'), '\+\s*\+', '+', 'g'), '\s{2,}', ' ', 'g'), ' +'),
    actualizado_en = now()
where categoria = 'lente' and codigo like 'LP-20261013-%' and tecnologia ~* '\m(Mid|Hi|High) Index\M|Alto Índice';

-- Volver a armar los nombres (y "(Opción n)" si alguno quedó repetido).
with base as (
  select id, empresa_id, codigo,
         concat_ws(' · ', initcap(diseno) || ' ' || linea, nullif(trim(coalesce(material, '') || ' ' || coalesce(to_char(indice, 'FM0.00'), '')), ''), tecnologia) as nombre_base
  from public.productos_catalogo where categoria = 'lente' and codigo like 'LP-20261013-%'
), numerado as (
  select id, nombre_base, count(*) over (partition by empresa_id, nombre_base) as repetidos,
         row_number() over (partition by empresa_id, nombre_base order by codigo) as n
  from base
)
update public.productos_catalogo p
set nombre = numerado.nombre_base || case when numerado.repetidos > 1 then ' (Opción ' || numerado.n || ')' else '' end
from numerado where numerado.id = p.id and p.nombre is distinct from numerado.nombre_base || case when numerado.repetidos > 1 then ' (Opción ' || numerado.n || ')' else '' end;
