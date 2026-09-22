create table public.empresas_convenio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_by uuid,
  creado_en timestamptz not null default now()
);

create table public.acuerdos_pago (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null unique references public.ventas(id),
  empresa_convenio_id uuid not null references public.empresas_convenio(id),
  cuotas integer not null check (cuotas > 0),
  monto_cuota numeric not null,
  fecha_primera_cuota date not null,
  texto text not null,
  firmado_en timestamptz not null default now(),
  firmado_por uuid
);

alter table public.empresas_convenio enable row level security;
alter table public.acuerdos_pago enable row level security;

create policy empresas_convenio_rls on public.empresas_convenio for all using (
  exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and (r.nombre = 'superadmin' or public.tiene_permiso('ventas', 'leer'))
  )
);

create policy acuerdos_pago_rls on public.acuerdos_pago for all using (
  exists (
    select 1 from public.ventas v
    join public.usuarios u on u.auth_user_id = (select auth.uid())
    join public.roles r on r.id = u.rol_id
    where v.id = acuerdos_pago.venta_id and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = v.empresa_id)
      and (r.nombre = 'superadmin' or public.tiene_permiso('ventas', 'leer'))
  )
);

create or replace function public.crear_empresa_convenio(p_nombre text)
returns uuid
language plpgsql security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_id uuid;
begin
  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo;
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then raise exception 'Ingresa el nombre de la empresa.'; end if;
  insert into public.empresas_convenio (nombre, created_by) values (trim(p_nombre), v_user) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.crear_empresa_convenio(text) from public, anon;
grant execute on function public.crear_empresa_convenio(text) to authenticated;

create or replace function public.crear_acuerdo_pago(p_venta uuid, p_empresa_convenio uuid, p_cuotas integer)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_paciente uuid; v_saldo numeric; v_total numeric;
        v_paciente_nombre text; v_empresa_convenio_nombre text; v_fecha date; v_monto_cuota numeric; v_texto text; v_id uuid;
begin
  select v.empresa_id, v.paciente_id, v.saldo, v.total into v_empresa, v_paciente, v_saldo, v_total from public.ventas v where v.id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;
  if v_saldo is null or v_saldo <= 0 then raise exception 'Esta venta no tiene saldo pendiente para un acuerdo de pago.'; end if;
  if p_cuotas is null or p_cuotas < 1 then raise exception 'Indica un número de cuotas válido.'; end if;

  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;

  select trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'')) into v_paciente_nombre from public.pacientes_clinicos where id = v_paciente;
  if v_paciente_nombre is null or v_paciente_nombre = '' then raise exception 'La venta no tiene un paciente vinculado.'; end if;
  select nombre into v_empresa_convenio_nombre from public.empresas_convenio where id = p_empresa_convenio;
  if v_empresa_convenio_nombre is null then raise exception 'Empresa de convenio no encontrada.'; end if;

  v_fecha := (date_trunc('month', current_date) + interval '1 month')::date;
  v_monto_cuota := round(v_saldo / p_cuotas, 2);
  v_texto := format(
    E'ACUERDO DE PAGO POR DESCUENTO A ROL DE PAGOS\n\nPaciente: %s\nEmpresa convenio: %s\nTotal de la venta: $%s \xe2\x80\x94 Saldo pendiente: $%s\n\nEl paciente acepta la deuda señalada y autoriza el descuento correspondiente a través del rol de pagos de %s, en %s cuota(s) de $%s cada una, iniciando el %s.',
    v_paciente_nombre, v_empresa_convenio_nombre, to_char(v_total, 'FM999999990.00'), to_char(v_saldo, 'FM999999990.00'),
    v_empresa_convenio_nombre, p_cuotas, to_char(v_monto_cuota, 'FM999999990.00'), to_char(v_fecha, 'DD/MM/YYYY')
  );

  insert into public.acuerdos_pago (venta_id, empresa_convenio_id, cuotas, monto_cuota, fecha_primera_cuota, texto, firmado_por)
  values (p_venta, p_empresa_convenio, p_cuotas, v_monto_cuota, v_fecha, v_texto, v_user)
  on conflict (venta_id) do update set empresa_convenio_id = excluded.empresa_convenio_id, cuotas = excluded.cuotas, monto_cuota = excluded.monto_cuota, fecha_primera_cuota = excluded.fecha_primera_cuota, texto = excluded.texto, firmado_en = now(), firmado_por = excluded.firmado_por
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'texto', v_texto, 'monto_cuota', v_monto_cuota, 'fecha_primera_cuota', v_fecha, 'cuotas', p_cuotas, 'paciente_nombre', v_paciente_nombre, 'empresa_convenio_nombre', v_empresa_convenio_nombre, 'total', v_total, 'saldo', v_saldo);
end;
$function$;

revoke all on function public.crear_acuerdo_pago(uuid, uuid, integer) from public, anon;
grant execute on function public.crear_acuerdo_pago(uuid, uuid, integer) to authenticated;;
