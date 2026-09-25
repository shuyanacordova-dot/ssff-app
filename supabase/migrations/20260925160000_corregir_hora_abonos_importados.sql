-- Autorizado por Shuyana el 2026-09-25 ("SI CORRIGE").
-- La importación de Optox guardó la hora de los abonos en formato 12 h y con el mes en los minutos;
-- los cobrados entre 1 y 4 pm quedaban en el día anterior (hora Ecuador). Se ponen a las 12:00 de su fecha.
-- Los abonos de ventas anuladas (duplicados) no se tocan. Respaldo en correccion_hora_abonos.
create table if not exists public.correccion_hora_abonos (
  pago_id uuid primary key references public.pagos_venta(id),
  creado_en_anterior timestamptz not null,
  creado_en_nuevo timestamptz not null,
  corregido_en timestamptz not null default now()
);
alter table public.correccion_hora_abonos enable row level security;
revoke all on public.correccion_hora_abonos from anon, authenticated;

insert into public.correccion_hora_abonos (pago_id, creado_en_anterior, creado_en_nuevo)
select p.id, p.creado_en,
       (((p.creado_en at time zone 'UTC')::date + time '12:00') at time zone 'America/Guayaquil')
from public.pagos_venta p
join public.ventas v on v.id = p.venta_id
where v.estado <> 'anulada'
  and p.creado_en < '2026-09-24'
  and extract(minute from p.creado_en) = extract(month from p.creado_en)
  and extract(hour from p.creado_en at time zone 'UTC') < 5
on conflict (pago_id) do nothing;

update public.pagos_venta p
set creado_en = c.creado_en_nuevo
from public.correccion_hora_abonos c
where c.pago_id = p.id and p.creado_en = c.creado_en_anterior;
