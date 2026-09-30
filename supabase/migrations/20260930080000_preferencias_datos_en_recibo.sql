-- Autorización de datos y promociones desde el recibo virtual (Shuyana 2026-09-30).
-- El paciente abre su recibo (enlace con token) y puede marcar: autorizo el uso de mis datos / acepto promociones.
-- Las promociones son una autorización aparte y opcional; se guarda un historial (nunca se edita ni borra).

-- Aceptación en línea no tiene usuario del sistema.
alter table public.consentimientos_paciente alter column registrado_por drop not null;
alter table public.consentimientos_paciente drop constraint if exists consentimientos_paciente_metodo_check;
alter table public.consentimientos_paciente add constraint consentimientos_paciente_metodo_check
  check (metodo in ('verbal', 'aceptado_en_linea', 'firma_papel', 'aceptado_en_pantalla', 'verbal_con_testigo'));

create table if not exists public.preferencias_promociones (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  acepta boolean not null,
  origen text not null check (origen in ('recibo_virtual', 'optica')),
  venta_id uuid references public.ventas(id),
  registrado_por uuid references public.usuarios(id),
  registrado_en timestamptz not null default now()
);
create index if not exists preferencias_promociones_idx on public.preferencias_promociones (paciente_id, registrado_en desc);
alter table public.preferencias_promociones enable row level security;
revoke all on public.preferencias_promociones from public, anon, authenticated;
grant select on public.preferencias_promociones to authenticated;
drop policy if exists preferencias_promociones_leer on public.preferencias_promociones;
create policy preferencias_promociones_leer on public.preferencias_promociones for select to authenticated
using ((select public.es_superadmin()) or exists (
  select 1 from public.paciente_empresas pe join public.usuarios u on u.empresa_id = pe.empresa_id
  where pe.paciente_id = preferencias_promociones.paciente_id and u.auth_user_id = (select auth.uid()) and u.activo));

-- Estado actual para el recibo público (solo dos valores, nada más del paciente).
create or replace function public.preferencias_datos_recibo(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_paciente uuid; v_datos text; v_metodo text; v_promo boolean;
begin
  select paciente_id into v_paciente from public.ventas where recibo_token = p_token;
  if v_paciente is null then return null; end if;
  select estado, metodo into v_datos, v_metodo from public.consentimientos_paciente where paciente_id = v_paciente order by registrado_en desc limit 1;
  select acepta into v_promo from public.preferencias_promociones where paciente_id = v_paciente order by registrado_en desc limit 1;
  return jsonb_build_object('datos_confirmado_en_linea', v_datos = 'otorgado' and v_metodo = 'aceptado_en_linea', 'promociones', v_promo);
end;
$$;
revoke all on function public.preferencias_datos_recibo(uuid) from public;
grant execute on function public.preferencias_datos_recibo(uuid) to anon, authenticated;

-- Respuesta del paciente desde su recibo. p_datos = true registra la autorización en línea (false no revoca: para
-- revocar debe pedirlo en la óptica, así un clic accidental no borra su autorización). p_promociones: true/false.
create or replace function public.responder_preferencias_recibo(p_token uuid, p_datos boolean, p_promociones boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_venta record; v_ult record; v_promo boolean; v_nombre text;
begin
  select id, paciente_id, empresa_id into v_venta from public.ventas where recibo_token = p_token;
  if v_venta.paciente_id is null then raise exception 'Recibo no encontrado'; end if;

  if coalesce(p_datos, false) then
    select estado, metodo into v_ult from public.consentimientos_paciente where paciente_id = v_venta.paciente_id order by registrado_en desc limit 1;
    if v_ult.estado is distinct from 'otorgado' or v_ult.metodo is distinct from 'aceptado_en_linea' then
      select trim(coalesce(nombres, '') || ' ' || coalesce(apellidos, '')) into v_nombre from public.pacientes_clinicos where id = v_venta.paciente_id;
      insert into public.consentimientos_paciente (paciente_id, empresa_id, version, estado, metodo, firmado_por, es_representante, notas, registrado_por)
      values (v_venta.paciente_id, v_venta.empresa_id, 'v1-2026-09', 'otorgado', 'aceptado_en_linea', v_nombre, false, 'Aceptado por el paciente en su recibo virtual.', null);
    end if;
  end if;

  if p_promociones is not null then
    select acepta into v_promo from public.preferencias_promociones where paciente_id = v_venta.paciente_id order by registrado_en desc limit 1;
    if v_promo is distinct from p_promociones then
      insert into public.preferencias_promociones (paciente_id, acepta, origen, venta_id) values (v_venta.paciente_id, p_promociones, 'recibo_virtual', v_venta.id);
    end if;
  end if;
end;
$$;
revoke all on function public.responder_preferencias_recibo(uuid, boolean, boolean) from public;
grant execute on function public.responder_preferencias_recibo(uuid, boolean, boolean) to anon, authenticated;

-- Registro desde la óptica (el paciente lo dice en persona).
create or replace function public.registrar_preferencia_promociones(p_paciente uuid, p_acepta boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_user uuid; v_empresa uuid; v_rol text;
begin
  select u.id, u.empresa_id, r.nombre into v_user, v_empresa, v_rol from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja');
  if v_user is null then raise exception 'No tienes permiso para registrar esta preferencia.'; end if;
  if v_rol <> 'superadmin' and not exists (select 1 from public.paciente_empresas where paciente_id = p_paciente and empresa_id = v_empresa) then
    raise exception 'El paciente no está vinculado a tu empresa.';
  end if;
  insert into public.preferencias_promociones (paciente_id, acepta, origen, registrado_por) values (p_paciente, coalesce(p_acepta, false), 'optica', v_user);
end;
$$;
revoke all on function public.registrar_preferencia_promociones(uuid, boolean) from public, anon;
grant execute on function public.registrar_preferencia_promociones(uuid, boolean) to authenticated;
