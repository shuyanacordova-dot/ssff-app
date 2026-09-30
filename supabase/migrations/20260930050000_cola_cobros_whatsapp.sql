-- "Cobros de hoy" (Shuyana 2026-09-30): lista diaria de pacientes a quienes toca escribir por WhatsApp para cobrar,
-- SIN pagar servicios: el mensaje sale listo y se envía con un toque desde el WhatsApp de cada sucursal
-- (Shuvision y Focus usan números distintos). El sistema recuerda a quién ya se escribió.
-- Frecuencia: cobro insistente = todos los días; frecuencia/categoría semanal = 7 días, quincenal = 15, mensual = 30;
-- el resto de deudas con más de 8 días = cada 15 días. Convenios (descuento por rol) no entran: se cobran por rol.

create table if not exists public.cobros_mensajes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  saldo numeric(12,2) not null,
  enviado_por uuid references public.usuarios(id),
  enviado_en timestamptz not null default now()
);
create index if not exists cobros_mensajes_paciente_idx on public.cobros_mensajes (paciente_id, sucursal_id, enviado_en desc);
alter table public.cobros_mensajes enable row level security;
revoke all on public.cobros_mensajes from public, anon, authenticated;
grant select on public.cobros_mensajes to authenticated;
drop policy if exists cobros_mensajes_leer on public.cobros_mensajes;
create policy cobros_mensajes_leer on public.cobros_mensajes for select to authenticated
using ((select app_private.sucursales_usuario()) @> array[sucursal_id]);

-- Lista de hoy para una sucursal.
create or replace function public.cola_cobros_hoy(p_sucursal uuid)
returns table (paciente_id uuid, nombres text, apellidos text, telefono text, empresa_id uuid, empresa_nombre text,
               saldo numeric, ventas int, dias_deuda int, motivo text, cada_dias int, ultimo_mensaje timestamptz)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  with permiso as (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and r.nombre in ('superadmin', 'admin_sucursal', 'vendedor', 'caja', 'optometra')
      and (select app_private.sucursales_usuario()) @> array[p_sucursal]
  ), hoy as (select (now() at time zone 'America/Guayaquil')::date d),
  deudas as (
    select v.paciente_id, v.empresa_id, sum(v.saldo) saldo, count(*)::int ventas,
           ((select d from hoy) - min((v.creado_en at time zone 'America/Guayaquil')::date))::int dias
    from public.ventas v
    where v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004 and v.paciente_id is not null
      and not exists (select 1 from public.acuerdos_pago a where a.venta_id = v.id)
    group by v.paciente_id, v.empresa_id
  ), reglas as (
    select d.*, p.nombres, p.apellidos, p.telefono,
      case when p.cobro_insistente then 1
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 7
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 15
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 30
           when p.categoria_cobro in ('convenio', 'rezagados') then null
           when d.dias > 8 then 15 end cada_dias,
      case when p.cobro_insistente then 'Cobro insistente (todos los días)'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('semanal', 'semanales') then 'Cobro semanal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('quincenal', 'quincenales') then 'Cobro quincenal'
           when coalesce(p.frecuencia_cobro, p.categoria_cobro) in ('mensual', 'mensuales') then 'Cobro mensual'
           else 'Saldo pendiente (cada 15 días)' end motivo,
      (select max(m.enviado_en) from public.cobros_mensajes m where m.paciente_id = d.paciente_id and m.sucursal_id = p_sucursal) ultimo
    from deudas d join public.pacientes_clinicos p on p.id = d.paciente_id
    where exists (select 1 from permiso)
  )
  select r.paciente_id, r.nombres, r.apellidos, r.telefono, r.empresa_id, e.nombre, r.saldo, r.ventas, r.dias, r.motivo, r.cada_dias, r.ultimo
  from reglas r join public.empresas e on e.id = r.empresa_id
  where r.cada_dias is not null
    and (r.ultimo is null or (r.ultimo at time zone 'America/Guayaquil')::date <= (select d from hoy) - r.cada_dias)
  order by (r.cada_dias = 1) desc, r.saldo desc;
$$;
revoke all on function public.cola_cobros_hoy(uuid) from public, anon;
grant execute on function public.cola_cobros_hoy(uuid) to authenticated;

-- Marca que ya se envió el mensaje de cobro de hoy.
create or replace function public.registrar_mensaje_cobro(p_paciente uuid, p_sucursal uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_saldo numeric;
begin
  select u.id into v_user from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo
    and r.nombre in ('superadmin', 'admin_sucursal', 'vendedor', 'caja', 'optometra')
    and (select app_private.sucursales_usuario()) @> array[p_sucursal];
  if v_user is null then raise exception 'No tienes permiso para registrar cobros de esta sucursal.'; end if;
  select s.empresa_id into v_empresa from public.sucursales s where s.id = p_sucursal;
  select coalesce(sum(v.saldo), 0) into v_saldo from public.ventas v
  where v.paciente_id = p_paciente and v.sucursal_id = p_sucursal and v.estado = 'completada' and v.saldo > 0.004;
  insert into public.cobros_mensajes (paciente_id, empresa_id, sucursal_id, saldo, enviado_por)
  values (p_paciente, v_empresa, p_sucursal, v_saldo, v_user);
end;
$$;
revoke all on function public.registrar_mensaje_cobro(uuid, uuid) from public, anon;
grant execute on function public.registrar_mensaje_cobro(uuid, uuid) to authenticated;
