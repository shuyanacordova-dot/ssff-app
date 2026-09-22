
alter table public.productos_catalogo
  add column if not exists diseno text,
  add column if not exists material text,
  add column if not exists indice numeric,
  add column if not exists tecnologia text,
  add column if not exists linea text,
  add column if not exists rango_esf_pos numeric,
  add column if not exists rango_esf_neg numeric,
  add column if not exists rango_cil_pos numeric,
  add column if not exists rango_cil_neg numeric,
  add column if not exists rango_add_pos numeric,
  add column if not exists rango_add_neg numeric;

comment on column public.productos_catalogo.diseno is 'Diseño de la luna: Monofocal, Bifocal, Progresivo, Lentes de contacto. Solo aplica a categoria=lente.';
comment on column public.productos_catalogo.material is 'Material/línea del proveedor (CR39, Policarbonato, GX7, etc).';
comment on column public.productos_catalogo.indice is 'Índice de refracción (1.49, 1.56, 1.59, 1.67, etc).';
comment on column public.productos_catalogo.tecnologia is 'Tratamiento/tecnología: AR, AR + FLA, Fotocromático + AR, etc.';
comment on column public.productos_catalogo.linea is 'Proceso de fabricación del laboratorio: Terminado, Tallado, Digital, Tórico.';
comment on column public.productos_catalogo.rango_esf_pos is 'Límite del rango de esfera (extremo positivo tal como lo reporta el proveedor).';
comment on column public.productos_catalogo.rango_esf_neg is 'Límite del rango de esfera (extremo negativo tal como lo reporta el proveedor).';
comment on column public.productos_catalogo.rango_cil_pos is 'Límite del rango de cilindro (extremo positivo).';
comment on column public.productos_catalogo.rango_cil_neg is 'Límite del rango de cilindro (extremo negativo).';
comment on column public.productos_catalogo.rango_add_pos is 'Límite del rango de adición para bifocales/progresivos (extremo positivo).';
comment on column public.productos_catalogo.rango_add_neg is 'Límite del rango de adición para bifocales/progresivos (extremo negativo).';
;
