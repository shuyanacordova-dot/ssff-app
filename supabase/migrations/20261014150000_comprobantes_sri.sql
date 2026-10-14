-- Facturación electrónica, paso 4 (2026-10-14): comprobantes emitidos al SRI y reserva atómica del secuencial.
-- Solo la llave de servicio escribe aquí (la emisión corre en el servidor); la superadmin puede leer.

create table if not exists public.comprobantes_sri (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id),
  emisor_id uuid not null references public.emisores_sri(id),
  empresa_id uuid references public.empresas(id),
  sucursal_id uuid references public.sucursales(id),
  tipo text not null default 'factura' check (tipo in ('factura')),
  ambiente text not null check (ambiente in ('pruebas', 'produccion')),
  establecimiento text not null check (establecimiento ~ '^\d{3}$'),
  punto_emision text not null check (punto_emision ~ '^\d{3}$'),
  secuencial integer not null check (secuencial between 1 and 999999999),
  clave_acceso text unique check (clave_acceso is null or clave_acceso ~ '^\d{49}$'),
  estado text not null default 'reservado' check (estado in ('reservado', 'firmada', 'recibida', 'devuelta', 'autorizada', 'no_autorizada', 'error')),
  comprador_tipo_id text,
  comprador_identificacion text,
  comprador_nombre text,
  comprador_email text,
  comprador_direccion text,
  tarifa_iva numeric(5,2),
  subtotal numeric(12,2),
  iva numeric(12,2),
  total numeric(12,2),
  xml_firmado text,
  numero_autorizacion text,
  fecha_autorizacion text,
  mensajes jsonb not null default '[]'::jsonb,
  created_by uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (emisor_id, ambiente, establecimiento, punto_emision, secuencial)
);

-- Una venta solo puede tener un comprobante vivo por ambiente (los devueltos/no autorizados/error permiten reintentar).
create unique index if not exists comprobantes_sri_venta_viva
  on public.comprobantes_sri (venta_id, ambiente)
  where estado in ('reservado', 'firmada', 'recibida', 'autorizada');
create index if not exists comprobantes_sri_venta on public.comprobantes_sri (venta_id);

alter table public.comprobantes_sri enable row level security;
revoke all on public.comprobantes_sri from public, anon, authenticated;
grant select on public.comprobantes_sri to authenticated;
create policy comprobantes_sri_superadmin_lectura on public.comprobantes_sri for select to authenticated using (public.es_superadmin());

-- Reserva el siguiente secuencial del emisor en el ambiente indicado, bloqueando al emisor para que dos
-- emisiones simultáneas no reciban el mismo número. En producción el primer número respeta
-- emisores_sri.siguiente_secuencial (el último que dejó el facturador gratuito del SRI + 1).
create or replace function public.sri_reservar_comprobante(p_venta uuid, p_emisor uuid, p_ambiente text, p_usuario uuid)
returns table (id uuid, secuencial integer, establecimiento text, punto_emision text)
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_em public.emisores_sri%rowtype;
  v_vta public.ventas%rowtype;
  v_sig integer;
  v_id uuid;
begin
  if p_ambiente not in ('pruebas', 'produccion') then raise exception 'Ambiente inválido.'; end if;
  select * into v_em from public.emisores_sri where emisores_sri.id = p_emisor for update;
  if not found then raise exception 'Emisor no encontrado.'; end if;
  select * into v_vta from public.ventas where ventas.id = p_venta;
  if not found then raise exception 'Venta no encontrada.'; end if;
  if v_vta.sucursal_id is distinct from v_em.sucursal_id then raise exception 'La venta no pertenece a la sucursal del emisor.'; end if;
  select coalesce(max(c.secuencial), 0) + 1 into v_sig from public.comprobantes_sri c
   where c.emisor_id = p_emisor and c.ambiente = p_ambiente and c.establecimiento = v_em.codigo_establecimiento and c.punto_emision = v_em.punto_emision;
  if p_ambiente = 'produccion' then v_sig := greatest(v_sig, v_em.siguiente_secuencial); end if;
  insert into public.comprobantes_sri (venta_id, emisor_id, empresa_id, sucursal_id, ambiente, establecimiento, punto_emision, secuencial, created_by)
  values (p_venta, p_emisor, v_vta.empresa_id, v_vta.sucursal_id, p_ambiente, v_em.codigo_establecimiento, v_em.punto_emision, v_sig, p_usuario)
  returning comprobantes_sri.id into v_id;
  return query select v_id, v_sig, v_em.codigo_establecimiento, v_em.punto_emision;
end;
$$;

revoke all on function public.sri_reservar_comprobante(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.sri_reservar_comprobante(uuid, uuid, text, uuid) to service_role;
