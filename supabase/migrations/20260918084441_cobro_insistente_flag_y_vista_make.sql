alter table public.pacientes_clinicos add column if not exists cobro_insistente boolean not null default false;
comment on column public.pacientes_clinicos.cobro_insistente is 'Activado por el equipo cuando un paciente con deuda no responde a los recordatorios normales; Make.com lo usa para enviar mensajes automáticos diarios.';

create or replace function public.activar_cobro_insistente(p_paciente uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid; v_role text;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  update public.pacientes_clinicos set cobro_insistente = p_activo, actualizado_en = now() where id = p_paciente;
end;
$$;

create or replace view public.deudores_cobro_insistente as
select
  p.id as paciente_id,
  p.nombres,
  p.apellidos,
  p.telefono,
  e.nombre as empresa_nombre,
  sum(v.saldo) as saldo_total,
  count(v.id) as ventas_pendientes,
  min(v.creado_en) as deuda_desde
from public.pacientes_clinicos p
join public.ventas v on v.paciente_id = p.id and v.estado = 'completada' and v.saldo > 0
join public.empresas e on e.id = v.empresa_id
where p.cobro_insistente = true
group by p.id, p.nombres, p.apellidos, p.telefono, e.nombre;

comment on view public.deudores_cobro_insistente is 'Vista de solo lectura para Make.com: pacientes marcados de cobro insistente con su deuda actual, para el escenario de mensajes diarios automáticos.';;
