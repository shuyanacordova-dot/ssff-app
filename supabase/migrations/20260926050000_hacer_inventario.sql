-- "Hacer inventario" (pedido por Shuyana 2026-09-26): cualquiera del equipo cuenta; los ajustes de existencia
-- solo se aplican al aprobarlos. Aprueban: la Superadministradora en todas las sucursales, Joao en Sacha y Erick en Focus.
-- Conteo rápido por clasificación y, si no cuadra, detalle producto por producto.

create table if not exists public.conteos_inventario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid not null references public.sucursales(id),
  categoria text not null default 'montura',
  estado text not null default 'en_curso' check (estado in ('en_curso', 'enviado', 'aprobado', 'rechazado')),
  notas text,
  creado_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  revisado_por uuid references public.usuarios(id),
  revisado_en timestamptz,
  motivo_rechazo text
);
create index if not exists conteos_inventario_sucursal_idx on public.conteos_inventario (sucursal_id, estado);

create table if not exists public.conteo_inventario_clasificaciones (
  conteo_id uuid not null references public.conteos_inventario(id) on delete cascade,
  clasificacion text not null,
  esperado numeric not null default 0,
  contado numeric check (contado is null or contado >= 0),
  primary key (conteo_id, clasificacion)
);

create table if not exists public.conteo_inventario_items (
  conteo_id uuid not null references public.conteos_inventario(id) on delete cascade,
  producto_id uuid not null references public.productos_catalogo(id),
  clasificacion text not null,
  esperado numeric not null default 0,
  contado numeric check (contado is null or contado >= 0),
  primary key (conteo_id, producto_id)
);

-- Quién aprueba ajustes además de la Superadministradora (sucursal_id null = todas).
create table if not exists public.aprobadores_inventario (
  usuario_id uuid primary key references public.usuarios(id),
  sucursal_id uuid references public.sucursales(id)
);
insert into public.aprobadores_inventario (usuario_id, sucursal_id) values
  ('d0b9d02f-b42c-497f-a64a-5ecb573be1f8', '1db17433-cc24-409f-92d2-794a01ce79d4'), -- Joao Córdova · Shuvision Sacha
  ('40d6c60f-662d-4535-b8f7-91010dead3b8', 'e2775b83-2105-46a7-8c40-d8de6b3a63dd')  -- Erick Balseca · Focus
on conflict (usuario_id) do nothing;

alter table public.conteos_inventario enable row level security;
alter table public.conteo_inventario_clasificaciones enable row level security;
alter table public.conteo_inventario_items enable row level security;
alter table public.aprobadores_inventario enable row level security;
revoke all on public.conteos_inventario, public.conteo_inventario_clasificaciones, public.conteo_inventario_items, public.aprobadores_inventario from public, anon, authenticated;
grant select on public.conteos_inventario, public.conteo_inventario_clasificaciones, public.conteo_inventario_items, public.aprobadores_inventario to authenticated;

-- ¿La persona actual puede ver/contar en esta sucursal?
create or replace function app_private.puede_contar_sucursal(p_sucursal uuid)
returns boolean language sql stable security definer set search_path to 'public', 'app_private'
as $$
  select exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    join public.sucursales s on s.id = p_sucursal
    where u.auth_user_id = (select auth.uid()) and u.activo
      and (r.nombre = 'superadmin' or u.sucursal_id = p_sucursal or (r.nombre = 'admin_sucursal' and u.empresa_id = s.empresa_id))
      and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor', 'caja')
  );
$$;

-- ¿La persona actual puede aprobar ajustes en esta sucursal?
create or replace function public.puede_aprobar_inventario(p_sucursal uuid)
returns boolean language sql stable security definer set search_path to 'public', 'app_private'
as $$
  select public.es_superadmin() or exists (
    select 1 from public.aprobadores_inventario a join public.usuarios u on u.id = a.usuario_id
    where u.auth_user_id = (select auth.uid()) and u.activo and (a.sucursal_id is null or a.sucursal_id = p_sucursal)
  );
$$;
revoke all on function public.puede_aprobar_inventario(uuid) from public, anon;
grant execute on function public.puede_aprobar_inventario(uuid) to authenticated;

create policy conteos_ver on public.conteos_inventario for select to authenticated using (app_private.puede_contar_sucursal(sucursal_id));
create policy conteo_clasif_ver on public.conteo_inventario_clasificaciones for select to authenticated
  using (exists (select 1 from public.conteos_inventario c where c.id = conteo_id and app_private.puede_contar_sucursal(c.sucursal_id)));
create policy conteo_items_ver on public.conteo_inventario_items for select to authenticated
  using (exists (select 1 from public.conteos_inventario c where c.id = conteo_id and app_private.puede_contar_sucursal(c.sucursal_id)));
create policy aprobadores_ver on public.aprobadores_inventario for select to authenticated using (true);

create or replace function public.iniciar_conteo_inventario(p_sucursal uuid, p_categoria text default 'montura')
returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_empresa uuid; v_id uuid;
begin
  if not app_private.puede_contar_sucursal(p_sucursal) then raise exception 'No tienes acceso a esta sucursal.'; end if;
  if p_categoria not in ('montura', 'gafas_sol', 'accesorio', 'lente') then raise exception 'Categoría no válida.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  select empresa_id into v_empresa from public.sucursales where id = p_sucursal;
  select id into v_id from public.conteos_inventario where sucursal_id = p_sucursal and categoria = p_categoria and estado = 'en_curso' order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if; -- se retoma el conteo que estaba en curso

  insert into public.conteos_inventario (empresa_id, sucursal_id, categoria, creado_por) values (v_empresa, p_sucursal, p_categoria, v_user) returning id into v_id;
  insert into public.conteo_inventario_items (conteo_id, producto_id, clasificacion, esperado)
  select v_id, p.id, coalesce(nullif(trim(p.clasificacion), ''), 'Sin clasificar'), st.cantidad
  from public.productos_catalogo p join public.inventario_stock st on st.producto_id = p.id and st.sucursal_id = p_sucursal
  where p.empresa_id = v_empresa and p.categoria = p_categoria and p.activo and st.cantidad > 0;
  insert into public.conteo_inventario_clasificaciones (conteo_id, clasificacion, esperado)
  select v_id, clasificacion, sum(esperado) from public.conteo_inventario_items where conteo_id = v_id group by clasificacion;
  return v_id;
end;
$$;

create or replace function public.guardar_conteo_inventario(p_conteo uuid, p_clasificacion text, p_producto uuid, p_contado numeric)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_sucursal uuid; v_estado text;
begin
  select sucursal_id, estado into v_sucursal, v_estado from public.conteos_inventario where id = p_conteo;
  if v_sucursal is null or not app_private.puede_contar_sucursal(v_sucursal) then raise exception 'No tienes acceso a este conteo.'; end if;
  if v_estado <> 'en_curso' then raise exception 'Este conteo ya fue enviado.'; end if;
  if p_contado is not null and p_contado < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if p_producto is not null then
    update public.conteo_inventario_items set contado = p_contado where conteo_id = p_conteo and producto_id = p_producto;
  else
    update public.conteo_inventario_clasificaciones set contado = p_contado where conteo_id = p_conteo and clasificacion = p_clasificacion;
  end if;
end;
$$;

create or replace function public.enviar_conteo_inventario(p_conteo uuid, p_notas text default null)
returns void language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_sucursal uuid; v_estado text; r record; v_detalle numeric;
begin
  select sucursal_id, estado into v_sucursal, v_estado from public.conteos_inventario where id = p_conteo;
  if v_sucursal is null or not app_private.puede_contar_sucursal(v_sucursal) then raise exception 'No tienes acceso a este conteo.'; end if;
  if v_estado <> 'en_curso' then raise exception 'Este conteo ya fue enviado.'; end if;
  for r in select * from public.conteo_inventario_clasificaciones where conteo_id = p_conteo loop
    if r.contado is null then raise exception 'Falta contar la clasificación "%".', r.clasificacion; end if;
    select coalesce(sum(coalesce(contado, esperado)), 0) into v_detalle from public.conteo_inventario_items where conteo_id = p_conteo and clasificacion = r.clasificacion;
    if r.contado <> r.esperado and v_detalle <> r.contado then
      raise exception 'La clasificación "%" no cuadra: contaste %, pero el detalle suma %. Revisa uno por uno.', r.clasificacion, r.contado, v_detalle;
    end if;
  end loop;
  update public.conteos_inventario set estado = 'enviado', enviado_en = now(), notas = nullif(trim(p_notas), '') where id = p_conteo;
end;
$$;

create or replace function public.revisar_conteo_inventario(p_conteo uuid, p_aprobar boolean, p_motivo text default null)
returns integer language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare v_user uuid; v_conteo record; r record; v_ajustes integer := 0;
begin
  select * into v_conteo from public.conteos_inventario where id = p_conteo for update;
  if v_conteo.id is null then raise exception 'Conteo no encontrado.'; end if;
  if not public.puede_aprobar_inventario(v_conteo.sucursal_id) then raise exception 'No puedes aprobar ajustes de esta sucursal.'; end if;
  if v_conteo.estado <> 'enviado' then raise exception 'Este conteo no está pendiente de aprobación.'; end if;
  select id into v_user from public.usuarios where auth_user_id = (select auth.uid()) and activo limit 1;
  if p_aprobar then
    for r in select * from public.conteo_inventario_items where conteo_id = p_conteo and contado is not null and contado <> esperado loop
      insert into public.movimientos_inventario (producto_id, sucursal_id, tipo, cantidad, motivo, created_by)
      values (r.producto_id, v_conteo.sucursal_id, 'ajuste', r.contado - r.esperado, 'Ajuste por inventario aprobado', v_user);
      v_ajustes := v_ajustes + 1;
    end loop;
    update public.conteos_inventario set estado = 'aprobado', revisado_por = v_user, revisado_en = now() where id = p_conteo;
  else
    if p_motivo is null or char_length(trim(p_motivo)) < 3 then raise exception 'Escribe el motivo del rechazo.'; end if;
    update public.conteos_inventario set estado = 'rechazado', revisado_por = v_user, revisado_en = now(), motivo_rechazo = trim(p_motivo) where id = p_conteo;
  end if;
  return v_ajustes;
end;
$$;

revoke all on function public.iniciar_conteo_inventario(uuid, text), public.guardar_conteo_inventario(uuid, text, uuid, numeric),
  public.enviar_conteo_inventario(uuid, text), public.revisar_conteo_inventario(uuid, boolean, text) from public, anon;
grant execute on function public.iniciar_conteo_inventario(uuid, text), public.guardar_conteo_inventario(uuid, text, uuid, numeric),
  public.enviar_conteo_inventario(uuid, text), public.revisar_conteo_inventario(uuid, boolean, text) to authenticated;
