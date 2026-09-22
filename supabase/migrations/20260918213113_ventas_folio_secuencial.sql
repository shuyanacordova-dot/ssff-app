create sequence if not exists public.ventas_folio_seq;
alter table public.ventas add column if not exists folio integer;
alter table public.ventas disable trigger trg_validar_transicion_venta;
with ordered as (select id, row_number() over (order by creado_en) as rn from public.ventas where folio is null)
update public.ventas v set folio = ordered.rn from ordered where v.id = ordered.id;
alter table public.ventas enable trigger trg_validar_transicion_venta;
select setval('public.ventas_folio_seq', (select coalesce(max(folio),0) from public.ventas));
alter table public.ventas alter column folio set default nextval('public.ventas_folio_seq');
alter table public.ventas add constraint ventas_folio_unique unique (folio);;
