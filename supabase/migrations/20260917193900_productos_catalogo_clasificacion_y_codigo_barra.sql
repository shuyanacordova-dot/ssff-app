
alter table public.productos_catalogo
  add column if not exists clasificacion text,
  add column if not exists codigo_barra text;

comment on column public.productos_catalogo.clasificacion is 'Línea/tier interno del negocio (Fino, Fino con estuche, Exclusivo, Económico, etc.), distinto de categoria.';
comment on column public.productos_catalogo.codigo_barra is 'Código físico impreso en la varilla/etiqueta del armazón, usado para identificar reposiciones del mismo modelo. No es único (varios armazones del mismo modelo comparten código).';
;
