create table public.garantias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  paciente_id uuid references public.pacientes_clinicos(id),
  venta_id uuid not null references public.ventas(id),
  venta_item_id uuid references public.venta_items(id),
  tipo text not null check (tipo in ('armazon','luna')),
  motivo text not null,
  estado text not null default 'abierta' check (estado in ('abierta','resuelta','rechazada')),
  orden_laboratorio_id uuid references public.ordenes_laboratorio(id),
  notas text,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table public.garantias is 'Reclamos de garantía de armazón o luna sobre una venta ya realizada. Si es de luna, puede enlazar una nueva orden de laboratorio (ordenes_laboratorio.es_garantia).';

alter table public.garantias enable row level security;
create policy garantias_ventas on public.garantias for all using (app_private.puede_ventas_empresa(empresa_id));

create or replace function public.crear_garantia(p_venta uuid, p_venta_item uuid, p_tipo text, p_motivo text, p_notas text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid; v_role text; v_empresa uuid; v_sucursal uuid; v_paciente uuid; v_garantia uuid;
begin
  select v.empresa_id, v.sucursal_id, v.paciente_id into v_empresa, v_sucursal, v_paciente
  from public.ventas v where v.id = p_venta;
  if v_empresa is null then raise exception 'Venta no encontrada'; end if;

  select u.id, ro.nombre into v_user, v_role
  from public.usuarios u join public.roles ro on ro.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and (ro.nombre = 'superadmin' or u.empresa_id = v_empresa);
  if v_user is null or not (v_role = 'superadmin' or public.tiene_permiso('ventas', 'crear')) then
    raise exception 'No autorizado';
  end if;

  if p_tipo not in ('armazon','luna') then raise exception 'Tipo de garantía inválido'; end if;
  if p_venta_item is not null and not exists (select 1 from public.venta_items where id = p_venta_item and venta_id = p_venta) then
    raise exception 'La línea de venta no corresponde a esta venta.';
  end if;

  insert into public.garantias (empresa_id, sucursal_id, paciente_id, venta_id, venta_item_id, tipo, motivo, notas, created_by)
  values (v_empresa, v_sucursal, v_paciente, p_venta, p_venta_item, p_tipo, p_motivo, nullif(p_notas, ''), v_user)
  returning id into v_garantia;

  return v_garantia;
end;
$$;

create or replace function public.vincular_orden_garantia(p_garantia uuid, p_orden_laboratorio uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from public.garantias where id = p_garantia;
  if v_empresa is null or not app_private.puede_ventas_empresa(v_empresa) then raise exception 'No autorizado'; end if;
  update public.garantias set orden_laboratorio_id = p_orden_laboratorio, actualizado_en = now() where id = p_garantia;
end;
$$;

create or replace function public.actualizar_estado_garantia(p_garantia uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_empresa uuid;
begin
  if p_estado not in ('abierta','resuelta','rechazada') then raise exception 'Estado inválido'; end if;
  select empresa_id into v_empresa from public.garantias where id = p_garantia;
  if v_empresa is null or not app_private.puede_ventas_empresa(v_empresa) then raise exception 'No autorizado'; end if;
  update public.garantias set estado = p_estado, actualizado_en = now() where id = p_garantia;
end;
$$;

create or replace function public.crear_orden_laboratorio(p_venta uuid, p_venta_item uuid, p_consulta uuid, p_laboratorio text, p_uso_calculado text, p_tipo_lente text, p_rx jsonb, p_medidas jsonb, p_notas text default null, p_es_garantia boolean default false, p_orden_original_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
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
  if p_orden_original_id is not null and not exists (select 1 from public.ordenes_laboratorio where id = p_orden_original_id and venta_id = p_venta) then
    raise exception 'La orden original no corresponde a esta venta.';
  end if;

  insert into public.ordenes_laboratorio (empresa_id, sucursal_id, paciente_id, venta_id, venta_item_id, consulta_id, laboratorio, uso_calculado, tipo_lente, rx, medidas, notas, created_by, es_garantia, orden_original_id)
  values (v_empresa, v_sucursal, v_paciente, p_venta, p_venta_item, p_consulta, p_laboratorio, p_uso_calculado, p_tipo_lente, coalesce(p_rx, '{}'::jsonb), coalesce(p_medidas, '{}'::jsonb), nullif(p_notas, ''), v_user, coalesce(p_es_garantia, false), p_orden_original_id)
  returning id into v_orden;

  return v_orden;
end;
$$;;
