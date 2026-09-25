-- Cuentas por cobrar: clasificación manual de la deuda de un paciente.
-- null = automática (convenio → mensuales → más de 3 meses = urgentes → recientes).
alter table public.pacientes_clinicos
  add column if not exists categoria_cobro text
  check (categoria_cobro is null or categoria_cobro in ('urgentes','recientes','mensuales','convenio'));

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
  if p_categoria is not null and p_categoria not in ('urgentes','recientes','mensuales','convenio') then
    raise exception 'Clasificación inválida';
  end if;
  update public.pacientes_clinicos set categoria_cobro = p_categoria, actualizado_en = now() where id = p_paciente;
end;
$$;

revoke all on function public.clasificar_deuda_paciente(uuid, text) from public, anon;
grant execute on function public.clasificar_deuda_paciente(uuid, text) to authenticated;
