-- Agenda tipo calendario (pedido de Shuyana 2026-09-29): además de las citas, ACTIVIDADES de las 3 ópticas
-- (reuniones, campañas, visitas a convenios, pagos, capacitaciones, entregas…).
-- sucursal_id null = actividad para las 3 ópticas.
create table if not exists public.actividades_agenda (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(trim(titulo)) between 1 and 160),
  descripcion text,
  tipo text not null default 'otro' check (tipo in ('reunion', 'campana', 'convenio', 'pago', 'capacitacion', 'entrega', 'otro')),
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  sucursal_id uuid references public.sucursales(id),
  responsable_id uuid references public.usuarios(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'cancelada')),
  created_by uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (hora_fin is null or hora_inicio is null or hora_fin >= hora_inicio)
);
create index if not exists actividades_agenda_fecha_idx on public.actividades_agenda (fecha);
alter table public.actividades_agenda enable row level security;

-- Sucursales que la persona puede ver: superadmin todas; el resto, las de su empresa. Se calcula una vez (L31).
create or replace function app_private.sucursales_usuario()
returns uuid[] language sql stable security definer set search_path to 'public'
as $$
  select case when public.es_superadmin() then (select coalesce(array_agg(id), '{}') from public.sucursales)
    else (select coalesce(array_agg(s.id), '{}') from public.sucursales s join public.usuarios u on u.empresa_id = s.empresa_id
          where u.auth_user_id = (select auth.uid()) and u.activo) end;
$$;
revoke all on function app_private.sucursales_usuario() from public, anon;
grant execute on function app_private.sucursales_usuario() to authenticated;

drop policy if exists actividades_leer on public.actividades_agenda;
create policy actividades_leer on public.actividades_agenda for select to authenticated
using (sucursal_id is null or (select app_private.sucursales_usuario()) @> array[sucursal_id]);

-- Crear/editar: superadmin cualquier sucursal o "las 3 ópticas"; el resto solo sucursales de su empresa.
drop policy if exists actividades_crear on public.actividades_agenda;
create policy actividades_crear on public.actividades_agenda for insert to authenticated
with check (
  created_by = (select id from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1)
  and ((select public.es_superadmin()) or (sucursal_id is not null and (select app_private.sucursales_usuario()) @> array[sucursal_id])));

drop policy if exists actividades_editar on public.actividades_agenda;
create policy actividades_editar on public.actividades_agenda for update to authenticated
using ((select public.es_superadmin()) or (sucursal_id is not null and (select app_private.sucursales_usuario()) @> array[sucursal_id]))
with check ((select public.es_superadmin()) or (sucursal_id is not null and (select app_private.sucursales_usuario()) @> array[sucursal_id]));

grant select, insert, update on public.actividades_agenda to authenticated;
