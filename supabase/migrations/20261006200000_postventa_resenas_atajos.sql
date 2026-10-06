-- 2026-10-06 (Shuyana):
-- 1) Mensajes del día: seguimiento de lentes entregados ("¿cómo te sientes con tus lentes?") y, después, link de reseña
--    de Google Maps por sucursal.
-- 2) Atajo de iPhone para registrar egresos: clave personal (se guarda solo su huella SHA-256) y función que la valida.

create extension if not exists pgcrypto with schema extensions;

-- 1. Reseñas
alter table public.mensajes_numeros_sucursal add column if not exists resena_url text;
alter table public.crm_contactos drop constraint if exists crm_contactos_motivo_check;
alter table public.crm_contactos add constraint crm_contactos_motivo_check
  check (motivo = any (array['control','examen_sin_compra','lentes_listos','postventa','cumpleanos','inactivo','otro','resena']));

create or replace function public.guardar_resena_url(p_sucursal uuid, p_url text)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
begin
  if not exists (select 1 from public.usuarios u join public.roles r on r.id=u.rol_id where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre='superadmin') then
    raise exception 'Solo la superadministradora puede cambiar el link de reseñas.';
  end if;
  if p_url is not null and p_url !~* '^https://' then raise exception 'El link debe empezar con https://'; end if;
  insert into public.mensajes_numeros_sucursal (sucursal_id, resena_url) values (p_sucursal, nullif(trim(p_url), ''))
  on conflict (sucursal_id) do update set resena_url = excluded.resena_url, actualizado_en = now();
end;
$$;
revoke all on function public.guardar_resena_url(uuid, text) from public, anon;
grant execute on function public.guardar_resena_url(uuid, text) to authenticated;

-- Lentes entregados hace 3 a 30 días en la sucursal: primero "¿cómo te sientes?" (postventa) y luego el link de reseña.
create or replace function public.seguimiento_entregas(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private' set "TimeZone" to 'America/Guayaquil'
as $$
declare v_rol text; v_empresa uuid; v_suc_empresa uuid; v_hoy date := (now() at time zone 'America/Guayaquil')::date; v_res jsonb;
begin
  select r.nombre, u.empresa_id into v_rol, v_empresa from public.usuarios u join public.roles r on r.id=u.rol_id
  where u.auth_user_id=(select auth.uid()) and u.activo and r.nombre in ('superadmin','admin_sucursal','optometra','vendedor','caja');
  select empresa_id into v_suc_empresa from public.sucursales where id=p_sucursal;
  if v_rol is null or v_suc_empresa is null or (v_rol <> 'superadmin' and v_suc_empresa is distinct from v_empresa) then
    raise exception 'No tienes permiso para ver esta sucursal.';
  end if;
  with entregas as (
    select distinct on (v.paciente_id) o.id orden_id, v.paciente_id, (o.actualizado_en at time zone 'America/Guayaquil')::date entregado
    from public.ordenes_laboratorio o join public.ventas v on v.id=o.venta_id
    where o.estado='entregado' and v.sucursal_id=p_sucursal and v.paciente_id is not null
      and (o.actualizado_en at time zone 'America/Guayaquil')::date between v_hoy - 30 and v_hoy - 3
    order by v.paciente_id, o.actualizado_en desc
  ), estado as (
    select e.*, concat_ws(' ', p.nombres, p.apellidos) nombre, p.nombres, p.telefono,
      (select max(cc.creado_en) from public.crm_contactos cc where cc.paciente_id=e.paciente_id and cc.empresa_id=v_suc_empresa and cc.motivo='postventa' and cc.creado_en >= e.entregado) postventa_en,
      (select max(cc.creado_en) from public.crm_contactos cc where cc.paciente_id=e.paciente_id and cc.empresa_id=v_suc_empresa and cc.motivo='resena') resena_en
    from entregas e join public.pacientes_clinicos p on p.id=e.paciente_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('orden_id', orden_id, 'paciente_id', paciente_id, 'nombre', nombre, 'nombres', nombres, 'telefono', telefono,
      'entregado', entregado, 'postventa_en', postventa_en, 'resena_en', resena_en) order by entregado), '[]'::jsonb)
  into v_res
  from estado
  where resena_en is null or resena_en >= v_hoy;  -- sale de la lista cuando ya se envió la reseña (se ve hasta el final del día)
  return jsonb_build_object('items', v_res, 'resena_url', (select resena_url from public.mensajes_numeros_sucursal where sucursal_id=p_sucursal));
end;
$$;
revoke all on function public.seguimiento_entregas(uuid) from public, anon;
grant execute on function public.seguimiento_entregas(uuid) to authenticated;

-- 2. Atajo de iPhone
create table if not exists public.atajos_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id),
  token_hash text not null unique,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz,
  revocado boolean not null default false
);
alter table public.atajos_tokens enable row level security;
drop policy if exists atajos_tokens_propios on public.atajos_tokens;
create policy atajos_tokens_propios on public.atajos_tokens for select to authenticated
  using (usuario_id = (select u.id from public.usuarios u where u.auth_user_id=(select auth.uid())));

-- Crea una clave nueva (se muestra una sola vez) y anula las anteriores del mismo usuario.
create or replace function public.crear_token_atajo()
returns text language plpgsql security definer set search_path to 'public', 'app_private', 'extensions'
as $$
declare v_user uuid; v_token text;
begin
  select u.id into v_user from public.usuarios u where u.auth_user_id=(select auth.uid()) and u.activo;
  if v_user is null then raise exception 'Inicia sesión para crear la clave del atajo.'; end if;
  update public.atajos_tokens set revocado = true where usuario_id = v_user and not revocado;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.atajos_tokens (usuario_id, token_hash) values (v_user, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;
revoke all on function public.crear_token_atajo() from public, anon;
grant execute on function public.crear_token_atajo() to authenticated;

-- Registra un egreso desde el atajo. p_sucursal: "shuvision", "sacha" o "focus". p_metodo: efectivo, pichincha, guayaquil o internacional.
create or replace function public.registrar_gasto_atajo(p_token text, p_sucursal text, p_monto numeric, p_concepto text, p_metodo text, p_clasificacion text default 'gastos_operacion')
returns text language plpgsql security definer set search_path to 'public', 'app_private', 'extensions'
as $$
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
  values (v_emp, v_suc, (now() at time zone 'America/Guayaquil')::date, v_clasif, trim(p_concepto), round(p_monto, 2), v_origen, v_cuenta, 'Registrado desde el atajo del iPhone', v_user);
  update public.atajos_tokens set ultimo_uso = now() where id = v_tok;
  return format('Egreso registrado: $%s · %s · %s', to_char(round(p_monto, 2), 'FM999990.00'), v_suc_nombre, case when v_origen = 'caja' then 'efectivo' else initcap(v_metodo) end);
end;
$$;
revoke all on function public.registrar_gasto_atajo(text, text, numeric, text, text, text) from public, authenticated;
grant execute on function public.registrar_gasto_atajo(text, text, numeric, text, text, text) to anon, service_role;
