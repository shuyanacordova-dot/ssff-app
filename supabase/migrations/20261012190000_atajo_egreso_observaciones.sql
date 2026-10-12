-- Atajo de iPhone "Registrar egreso": acepta observaciones (qué se compró o a qué se destinó el dinero).
-- Se reemplaza la versión de 6 parámetros para no dejar dos funciones con el mismo nombre.
drop function if exists public.registrar_gasto_atajo(text, text, numeric, text, text, text);

create or replace function public.registrar_gasto_atajo(p_token text, p_sucursal text, p_monto numeric, p_concepto text, p_metodo text, p_clasificacion text default 'gastos_operacion', p_observaciones text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'app_private', 'extensions'
as $function$
declare v_tok uuid; v_user uuid; v_rol text; v_empresa_user uuid; v_suc uuid; v_emp uuid; v_suc_nombre text; v_cuenta uuid; v_origen text; v_metodo text := lower(trim(coalesce(p_metodo, 'efectivo'))); v_clasif text := coalesce(nullif(trim(p_clasificacion), ''), 'gastos_operacion');
begin
  select t.id, u.id, r.nombre, u.empresa_id into v_tok, v_user, v_rol, v_empresa_user
  from public.atajos_tokens t join public.usuarios u on u.id=t.usuario_id join public.roles r on r.id=u.rol_id
  where t.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and not t.revocado and u.activo;
  if v_user is null then raise exception 'Clave del atajo no válida. Crea una nueva en LumOS.'; end if;

  select s.id, s.empresa_id, s.nombre into v_suc, v_emp, v_suc_nombre from public.sucursales s
  where case lower(trim(coalesce(p_sucursal, '')))
          when 'sacha' then s.nombre ilike '%sacha%'
          when 'focus' then s.nombre ilike '%focus%'
          else s.nombre ilike 'shuvision' end
  limit 1;
  if v_suc is null then raise exception 'Sucursal no reconocida (usa shuvision, sacha o focus).'; end if;
  if v_rol <> 'superadmin' and v_emp is distinct from v_empresa_user then raise exception 'No puedes registrar egresos de esa sucursal.'; end if;
  if v_rol not in ('superadmin', 'admin_sucursal', 'caja') then raise exception 'Tu perfil no puede registrar egresos.'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if coalesce(trim(p_concepto), '') = '' then raise exception 'Escribe el concepto del egreso.'; end if;
  if v_clasif not in ('salarios','pago_proveedor','gastos_mensuales','gastos_operacion') then v_clasif := 'gastos_operacion'; end if;

  if v_metodo in ('efectivo', 'caja') then
    v_origen := 'caja';
  else
    v_origen := 'banco';
    if v_rol not in ('superadmin', 'admin_sucursal') then raise exception 'Tu perfil solo puede registrar egresos en efectivo.'; end if;
    select c.id into v_cuenta from public.cuentas_bancarias c where c.sucursal_id = v_suc and lower(c.banco) = v_metodo limit 1;
    if v_cuenta is null then raise exception 'Banco no reconocido (usa pichincha, guayaquil o internacional).'; end if;
  end if;

  insert into public.gastos (empresa_id, sucursal_id, fecha, clasificacion, concepto, monto, origen, cuenta_bancaria_id, observaciones, created_by)
  values (v_emp, v_suc, (now() at time zone 'America/Guayaquil')::date, v_clasif, trim(p_concepto), round(p_monto, 2), v_origen, v_cuenta,
          coalesce(nullif(trim(p_observaciones), ''), 'Registrado desde el atajo del iPhone'), v_user);
  update public.atajos_tokens set ultimo_uso = now() where id = v_tok;
  return format('Egreso registrado: $%s · %s · %s', to_char(round(p_monto, 2), 'FM999990.00'), v_suc_nombre, case when v_origen = 'caja' then 'efectivo' else initcap(v_metodo) end);
end;
$function$;

revoke all on function public.registrar_gasto_atajo(text, text, numeric, text, text, text, text) from public, authenticated;
grant execute on function public.registrar_gasto_atajo(text, text, numeric, text, text, text, text) to anon, service_role;
