-- Reportes "Ventas por sucursal" exportados de Optox (septiembre 2026: 166 filas cargadas aparte con INSERT),
-- usados como referencia para detectar ventas duplicadas por importación.
create table public.optox_ventas_referencia (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id),
  fecha date not null,
  hora text,
  folio_optox integer not null,
  cancelada boolean not null default false,
  total numeric not null,
  a_cuenta numeric not null,
  saldo numeric not null,
  paciente text,
  observaciones text,
  importado_en timestamptz not null default now(),
  unique (sucursal_id, folio_optox)
);
alter table public.optox_ventas_referencia enable row level security;
revoke all on public.optox_ventas_referencia from public, anon, authenticated;
comment on table public.optox_ventas_referencia is 'Reportes "Ventas por sucursal" exportados de Optox, usados como referencia para detectar ventas duplicadas por importación. Solo lectura interna.';
