-- Cuentas por cobrar: pestañas "Cobros semanales" y "Cobros quincenales" (además de mensuales).
alter table public.pacientes_clinicos drop constraint if exists pacientes_clinicos_categoria_cobro_check;
alter table public.pacientes_clinicos add constraint pacientes_clinicos_categoria_cobro_check
  check (categoria_cobro is null or categoria_cobro in ('urgentes','recientes','semanales','quincenales','mensuales','convenio','rezagados'));

create or replace function public.clasificar_deuda_paciente(p_paciente uuid, p_categoria text)
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
  if p_categoria is not null and p_categoria not in ('urgentes','recientes','semanales','quincenales','mensuales','convenio','rezagados') then
    raise exception 'Clasificación inválida';
  end if;
  update public.pacientes_clinicos set categoria_cobro = p_categoria, actualizado_en = now() where id = p_paciente;
end;
$$;
revoke all on function public.clasificar_deuda_paciente(uuid, text) from public, anon;
grant execute on function public.clasificar_deuda_paciente(uuid, text) to authenticated;
