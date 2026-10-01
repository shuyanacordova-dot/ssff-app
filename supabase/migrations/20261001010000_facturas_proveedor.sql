-- Facturas de proveedores (Shuyana 2026-10-01): cada factura de un proveedor (p. ej. Provisión) se suma a su deuda
-- en "Mis deudas → Proveedores". Se registra desde el XML del SRI (o a mano) y no se puede registrar dos veces
-- (clave de acceso única; o número único por deuda). Solo la Superadministradora.

create table if not exists public.facturas_proveedor (
  id uuid primary key default gen_random_uuid(),
  deuda_id uuid not null references public.deudas_negocio(id),
  numero text not null,                 -- 001-001-000012345
  fecha_emision date not null,
  ruc_emisor text,
  razon_social text,
  subtotal numeric(12,2),
  iva numeric(12,2),
  total numeric(12,2) not null check (total > 0),
  clave_acceso text,
  origen text not null default 'manual' check (origen in ('xml', 'manual', 'correo')),
  notas text,
  registrado_por uuid references public.usuarios(id),
  registrado_en timestamptz not null default now()
);
create unique index if not exists facturas_proveedor_clave_uidx on public.facturas_proveedor (clave_acceso) where clave_acceso is not null;
create unique index if not exists facturas_proveedor_numero_uidx on public.facturas_proveedor (deuda_id, numero);
alter table public.facturas_proveedor enable row level security;
revoke all on public.facturas_proveedor from public, anon, authenticated;
grant select on public.facturas_proveedor to authenticated;
drop policy if exists facturas_proveedor_leer on public.facturas_proveedor;
create policy facturas_proveedor_leer on public.facturas_proveedor for select to authenticated using ((select public.es_superadmin()));

create or replace function public.registrar_factura_proveedor(p_deuda uuid, p_numero text, p_fecha date, p_total numeric,
  p_subtotal numeric default null, p_iva numeric default null, p_ruc text default null, p_razon_social text default null,
  p_clave_acceso text default null, p_origen text default 'manual', p_notas text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_usuario uuid; v_deuda record; v_id uuid; v_numero text := nullif(trim(p_numero), ''); v_clave text := nullif(regexp_replace(coalesce(p_clave_acceso, ''), '\D', '', 'g'), '');
begin
  if not public.es_superadmin() then raise exception 'Acceso restringido a la administración general'; end if;
  if v_numero is null then raise exception 'Falta el número de la factura.'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la factura.'; end if;
  if p_total is null or p_total <= 0 then raise exception 'El total de la factura debe ser mayor que cero.'; end if;
  if coalesce(p_origen, 'manual') not in ('xml', 'manual', 'correo') then raise exception 'Origen no válido.'; end if;
  select id into v_usuario from public.usuarios where auth_user_id = auth.uid() and activo limit 1;

  select * into v_deuda from public.deudas_negocio where id = p_deuda and estado <> 'anulada' for update;
  if v_deuda.id is null then raise exception 'La deuda del proveedor no existe.'; end if;
  if v_deuda.modalidad <> 'libre' then raise exception 'Las facturas solo se suman a deudas de abonos libres (proveedores).'; end if;
  if v_clave is not null and exists (select 1 from public.facturas_proveedor where clave_acceso = v_clave) then
    raise exception 'Esta factura ya está registrada (misma clave de acceso).';
  end if;
  if exists (select 1 from public.facturas_proveedor where deuda_id = p_deuda and numero = v_numero) then
    raise exception 'La factura % ya está registrada en esta deuda.', v_numero;
  end if;

  insert into public.facturas_proveedor (deuda_id, numero, fecha_emision, ruc_emisor, razon_social, subtotal, iva, total, clave_acceso, origen, notas, registrado_por)
  values (p_deuda, v_numero, p_fecha, nullif(trim(p_ruc), ''), nullif(trim(p_razon_social), ''), p_subtotal, p_iva, round(p_total, 2), v_clave,
          coalesce(p_origen, 'manual'), nullif(trim(p_notas), ''), v_usuario)
  returning id into v_id;

  update public.deudas_negocio
     set saldo = saldo + round(p_total, 2), monto_original = monto_original + round(p_total, 2),
         estado = 'pendiente', actualizado_en = now()
   where id = p_deuda;
  return v_id;
end;
$$;
revoke all on function public.registrar_factura_proveedor(uuid, text, date, numeric, numeric, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_factura_proveedor(uuid, text, date, numeric, numeric, numeric, text, text, text, text, text) to authenticated;
