-- Pedidos de Shuyana 2026-10-01:
-- 1) Clasificación de Cuentas por cobrar SIN repetir la frecuencia de cobro. Quedan: Sistema de apartado, Lentes
--    rezagados, Crédito óptica, Crédito Kamina, Convenios, Cobro urgente. La frecuencia (diaria/semanal/quincenal/
--    mensual) se elige aparte. Los pacientes clasificados como "mensuales"/"quincenales"/"semanales"/"diarios"/
--    "recientes" pasan a clasificación automática y, si no tenían frecuencia, se les guarda la de su clasificación
--    (así siguen saliendo igual en "Cobros de hoy").
-- 2) Agenda de actividades: tipos "permiso" y "vacaciones", con fecha final opcional (varios días).

update public.pacientes_clinicos set frecuencia_cobro = case categoria_cobro
    when 'mensuales' then 'mensual' when 'quincenales' then 'quincenal' when 'semanales' then 'semanal' when 'diarios' then 'diaria' end,
  actualizado_en = now()
where frecuencia_cobro is null and categoria_cobro in ('mensuales', 'quincenales', 'semanales', 'diarios');
update public.pacientes_clinicos set categoria_cobro = null, actualizado_en = now()
where categoria_cobro in ('mensuales', 'quincenales', 'semanales', 'diarios', 'recientes');

alter table public.pacientes_clinicos drop constraint if exists pacientes_clinicos_categoria_cobro_check;
alter table public.pacientes_clinicos add constraint pacientes_clinicos_categoria_cobro_check
  check (categoria_cobro is null or categoria_cobro in ('urgentes', 'credito_optica', 'credito_kamina', 'convenio', 'rezagados'));

create or replace function public.clasificar_deuda_paciente(p_paciente uuid, p_categoria text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid; v_role text;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_categoria is not null and p_categoria not in ('urgentes', 'credito_optica', 'credito_kamina', 'convenio', 'rezagados') then
    raise exception 'Clasificación inválida';
  end if;
  update public.pacientes_clinicos set categoria_cobro = p_categoria, actualizado_en = now() where id = p_paciente;
end;
$function$;

alter table public.actividades_agenda drop constraint if exists actividades_agenda_tipo_check;
alter table public.actividades_agenda add constraint actividades_agenda_tipo_check
  check (tipo in ('reunion', 'campana', 'convenio', 'pago', 'capacitacion', 'entrega', 'permiso', 'vacaciones', 'otro'));
alter table public.actividades_agenda add column if not exists fecha_fin date;
alter table public.actividades_agenda drop constraint if exists actividades_agenda_fecha_fin_check;
alter table public.actividades_agenda add constraint actividades_agenda_fecha_fin_check check (fecha_fin is null or fecha_fin >= fecha);
