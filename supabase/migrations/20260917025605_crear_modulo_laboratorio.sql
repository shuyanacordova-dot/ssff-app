create table public.ordenes_laboratorio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  paciente_id uuid not null references public.pacientes_clinicos(id),
  venta_id uuid not null references public.ventas(id),
  venta_item_id uuid references public.venta_items(id),
  consulta_id uuid references public.consultas_optometricas(id),
  laboratorio text not null check (laboratorio in ('provision','optec','indulentes','importlens','otro')),
  uso_calculado text not null check (uso_calculado in ('lejos','cerca','lejos_y_cerca')),
  tipo_lente text not null check (tipo_lente in ('monofocal_lejos','monofocal_cerca','bifocal','progresivo')),
  rx jsonb not null default '{}'::jsonb,
  medidas jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','en_proceso','recibido','control_calidad','listo_entrega','notificado','entregado','rechazado')),
  motivo_rechazo text,
  es_garantia boolean not null default false,
  orden_original_id uuid references public.ordenes_laboratorio(id),
  notas text,
  created_by uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index ordenes_laboratorio_venta_idx on public.ordenes_laboratorio(venta_id);
create index ordenes_laboratorio_paciente_idx on public.ordenes_laboratorio(paciente_id);

alter table public.ordenes_laboratorio enable row level security;

create or replace function app_private.puede_laboratorio_empresa(p_empresa uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'app_private'
as $function$
  select exists (
    select 1
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid())
      and u.activo
      and (r.nombre = 'superadmin' or u.empresa_id = p_empresa)
      and (r.nombre = 'superadmin' or public.tiene_permiso('laboratorio', 'leer'))
  );
$function$;

create policy ordenes_laboratorio_rls on public.ordenes_laboratorio
for all using (app_private.puede_laboratorio_empresa(empresa_id));

insert into public.permisos_rol (rol_id, recurso, accion)
select r.id, 'laboratorio', a.accion
from public.roles r
cross join (values ('crear'), ('leer'), ('editar')) as a(accion)
where (r.nombre in ('admin_sucursal', 'optometra', 'vendedor') and a.accion in ('crear','leer','editar'))
   or (r.nombre = 'caja' and a.accion = 'leer')
on conflict do nothing;

create or replace function public.crear_orden_laboratorio(
  p_venta uuid, p_venta_item uuid, p_consulta uuid, p_laboratorio text,
  p_uso_calculado text, p_tipo_lente text, p_rx jsonb, p_medidas jsonb, p_notas text default null
) returns uuid
language plpgsql security definer
set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_role text; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_orden uuid;
begin
  select v.empresa_id, v.sucursal_id, v.paciente_id into v_empresa, v_sucursal, v_paciente
  from public.ventas v where v.id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;
  if v_paciente is null then raise exception 'Esta venta no tiene un paciente vinculado.'; end if;

  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);

  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('laboratorio', 'crear')) then
    raise exception 'No autorizado';
  end if;

  if p_laboratorio not in ('provision','optec','indulentes','importlens','otro') then raise exception 'Laboratorio inválido'; end if;
  if p_uso_calculado not in ('lejos','cerca','lejos_y_cerca') then raise exception 'Uso inválido'; end if;
  if p_tipo_lente not in ('monofocal_lejos','monofocal_cerca','bifocal','progresivo') then raise exception 'Tipo de lente inválido'; end if;

  if p_venta_item is not null and not exists (select 1 from public.venta_items where id = p_venta_item and venta_id = p_venta) then
    raise exception 'La línea de venta no corresponde a esta venta.';
  end if;
  if p_consulta is not null and not exists (select 1 from public.consultas_optometricas where id = p_consulta and paciente_id = v_paciente) then
    raise exception 'La consulta no corresponde a este paciente.';
  end if;

  insert into public.ordenes_laboratorio (empresa_id, sucursal_id, paciente_id, venta_id, venta_item_id, consulta_id, laboratorio, uso_calculado, tipo_lente, rx, medidas, notas, created_by)
  values (v_empresa, v_sucursal, v_paciente, p_venta, p_venta_item, p_consulta, p_laboratorio, p_uso_calculado, p_tipo_lente, coalesce(p_rx, '{}'::jsonb), coalesce(p_medidas, '{}'::jsonb), nullif(p_notas, ''), v_user)
  returning id into v_orden;

  return v_orden;
end;
$function$;

revoke all on function public.crear_orden_laboratorio(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.crear_orden_laboratorio(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) to authenticated;;
