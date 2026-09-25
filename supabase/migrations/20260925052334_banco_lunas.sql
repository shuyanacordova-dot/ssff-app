-- Banco de lunas: lunas en bodega y lunas nuevas quedadas por garantías, para reutilizar en órdenes de laboratorio.
create table if not exists public.lunas_stock (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  sucursal_id uuid not null references public.sucursales(id),
  origen text not null default 'bodega' check (origen in ('bodega', 'garantia')),
  tipo text not null default 'monofocal' check (tipo in ('monofocal', 'bifocal', 'progresivo', 'otro')),
  material text,
  indice numeric(4,2),
  tratamiento text,
  esfera numeric(5,2) not null,
  cilindro numeric(5,2) not null default 0 check (cilindro <= 0),
  eje integer check (eje between 0 and 180),
  adicion numeric(4,2) check (adicion is null or adicion between 0 and 4),
  diametro integer,
  tallada boolean not null default false,
  cantidad integer not null default 1 check (cantidad >= 0),
  notas text,
  orden_origen_id uuid references public.ordenes_laboratorio(id),
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists lunas_stock_busqueda_idx on public.lunas_stock (empresa_id, esfera, cilindro) where cantidad > 0;

create table if not exists public.lunas_stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  luna_id uuid not null references public.lunas_stock(id),
  tipo text not null check (tipo in ('ingreso', 'uso', 'ajuste')),
  cantidad integer not null,
  orden_laboratorio_id uuid references public.ordenes_laboratorio(id),
  nota text,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

alter table public.lunas_stock enable row level security;
alter table public.lunas_stock_movimientos enable row level security;
revoke all on public.lunas_stock, public.lunas_stock_movimientos from public, anon, authenticated;
grant select on public.lunas_stock, public.lunas_stock_movimientos to authenticated;

create or replace function app_private.puede_ver_lunas(p_empresa uuid) returns boolean
language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.auth_user_id = (select auth.uid()) and u.activo
      and r.nombre in ('superadmin', 'admin_sucursal', 'optometra', 'vendedor')
      and (r.nombre = 'superadmin' or u.empresa_id = p_empresa));
$function$;
revoke all on function app_private.puede_ver_lunas(uuid) from public, anon;
grant execute on function app_private.puede_ver_lunas(uuid) to authenticated;

create policy lunas_stock_lectura on public.lunas_stock for select to authenticated using (app_private.puede_ver_lunas(empresa_id));
create policy lunas_mov_lectura on public.lunas_stock_movimientos for select to authenticated
  using (exists (select 1 from public.lunas_stock l where l.id = luna_id and app_private.puede_ver_lunas(l.empresa_id)));

-- Alta / edición (superadmin, admin_sucursal, optometra).
create or replace function public.guardar_luna_stock(
  p_id uuid, p_empresa uuid, p_sucursal uuid, p_origen text, p_tipo text, p_material text, p_indice numeric, p_tratamiento text,
  p_esfera numeric, p_cilindro numeric, p_eje integer, p_adicion numeric, p_diametro integer, p_tallada boolean, p_cantidad integer, p_notas text
) returns uuid language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_rol text; v_empresa uuid; v_id uuid; v_anterior integer;
begin
  select u.id, r.nombre, u.empresa_id into v_user, v_rol, v_empresa from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_user_id = (select auth.uid()) and u.activo and r.nombre in ('superadmin', 'admin_sucursal', 'optometra');
  if v_user is null or (v_rol <> 'superadmin' and p_empresa is distinct from v_empresa) then raise exception 'No tienes permiso para editar el banco de lunas.'; end if;
  if not exists (select 1 from public.sucursales where id = p_sucursal and empresa_id = p_empresa) then raise exception 'La sucursal no pertenece a la empresa.'; end if;
  if p_esfera is null then raise exception 'Ingresa la esfera.'; end if;
  if coalesce(p_cantidad, 0) < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if p_id is null then
    insert into public.lunas_stock (empresa_id, sucursal_id, origen, tipo, material, indice, tratamiento, esfera, cilindro, eje, adicion, diametro, tallada, cantidad, notas, created_by)
    values (p_empresa, p_sucursal, coalesce(p_origen, 'bodega'), coalesce(p_tipo, 'monofocal'), nullif(trim(p_material), ''), p_indice, nullif(trim(p_tratamiento), ''),
            p_esfera, -abs(coalesce(p_cilindro, 0)), p_eje, p_adicion, p_diametro, coalesce(p_tallada, false), coalesce(p_cantidad, 1), nullif(trim(p_notas), ''), v_user)
    returning id into v_id;
    insert into public.lunas_stock_movimientos (luna_id, tipo, cantidad, nota, created_by) values (v_id, 'ingreso', coalesce(p_cantidad, 1), 'Alta en banco de lunas', v_user);
  else
    select cantidad into v_anterior from public.lunas_stock where id = p_id and empresa_id = p_empresa for update;
    if v_anterior is null then raise exception 'La luna no existe.'; end if;
    update public.lunas_stock set sucursal_id = p_sucursal, origen = coalesce(p_origen, origen), tipo = coalesce(p_tipo, tipo), material = nullif(trim(p_material), ''),
      indice = p_indice, tratamiento = nullif(trim(p_tratamiento), ''), esfera = p_esfera, cilindro = -abs(coalesce(p_cilindro, 0)), eje = p_eje, adicion = p_adicion,
      diametro = p_diametro, tallada = coalesce(p_tallada, false), cantidad = coalesce(p_cantidad, cantidad), notas = nullif(trim(p_notas), ''), actualizado_en = now()
    where id = p_id returning id into v_id;
    if coalesce(p_cantidad, v_anterior) <> v_anterior then
      insert into public.lunas_stock_movimientos (luna_id, tipo, cantidad, nota, created_by) values (v_id, 'ajuste', coalesce(p_cantidad, v_anterior) - v_anterior, 'Ajuste manual', v_user);
    end if;
  end if;
  return v_id;
end;
$function$;

-- Coincidencias para una graduación (misma esfera y cilindro; adición si aplica; eje ±5° si la luna está tallada).
create or replace function public.buscar_lunas_stock(p_empresa uuid, p_esfera numeric, p_cilindro numeric, p_eje integer default null, p_adicion numeric default null)
returns jsonb language sql stable security definer set search_path to 'public', 'app_private'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'origen', l.origen, 'tipo', l.tipo, 'material', l.material, 'indice', l.indice, 'tratamiento', l.tratamiento,
    'esfera', l.esfera, 'cilindro', l.cilindro, 'eje', l.eje, 'adicion', l.adicion, 'tallada', l.tallada, 'cantidad', l.cantidad, 'sucursal', s.nombre, 'notas', l.notas)
    order by (l.origen = 'garantia') desc, l.creado_en), '[]'::jsonb)
  from public.lunas_stock l join public.sucursales s on s.id = l.sucursal_id
  where app_private.puede_ver_lunas(p_empresa) and l.empresa_id = p_empresa and l.cantidad > 0
    and l.esfera = p_esfera and l.cilindro = -abs(coalesce(p_cilindro, 0))
    and (p_adicion is null or p_adicion = 0 or l.adicion = p_adicion)
    and (not l.tallada or l.cilindro = 0 or p_eje is null or least(abs(l.eje - p_eje), 180 - abs(l.eje - p_eje)) <= 5);
$function$;

-- Usar una luna del banco: descuenta 1 y deja registro.
create or replace function public.usar_luna_stock(p_luna uuid, p_orden uuid default null, p_nota text default null)
returns integer language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare v_user uuid; v_empresa uuid; v_restante integer;
begin
  select l.empresa_id into v_empresa from public.lunas_stock l where l.id = p_luna for update;
  if v_empresa is null or not app_private.puede_ver_lunas(v_empresa) then raise exception 'No tienes acceso a esta luna.'; end if;
  select u.id into v_user from public.usuarios u where u.auth_user_id = (select auth.uid()) and u.activo;
  update public.lunas_stock set cantidad = cantidad - 1, actualizado_en = now() where id = p_luna and cantidad > 0 returning cantidad into v_restante;
  if v_restante is null then raise exception 'Esta luna ya no tiene unidades disponibles.'; end if;
  insert into public.lunas_stock_movimientos (luna_id, tipo, cantidad, orden_laboratorio_id, nota, created_by) values (p_luna, 'uso', -1, p_orden, nullif(trim(p_nota), ''), v_user);
  return v_restante;
end;
$function$;

revoke all on function public.guardar_luna_stock(uuid, uuid, uuid, text, text, text, numeric, text, numeric, numeric, integer, numeric, integer, boolean, integer, text) from public, anon;
grant execute on function public.guardar_luna_stock(uuid, uuid, uuid, text, text, text, numeric, text, numeric, numeric, integer, numeric, integer, boolean, integer, text) to authenticated;
revoke all on function public.buscar_lunas_stock(uuid, numeric, numeric, integer, numeric) from public, anon;
grant execute on function public.buscar_lunas_stock(uuid, numeric, numeric, integer, numeric) to authenticated;
revoke all on function public.usar_luna_stock(uuid, uuid, text) from public, anon;
grant execute on function public.usar_luna_stock(uuid, uuid, text) to authenticated;
