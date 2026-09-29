-- Facturación electrónica, paso 1 (2026-09-29): guardar la firma electrónica (.p12) de cada emisor de forma segura.
-- Regla: la firma y su clave NUNCA pasan por el chat ni por el código. Shuyana las sube en la pantalla
-- /facturacion/configuracion (solo superadmin). El archivo va a un bucket privado sin reglas de acceso para usuarios
-- (solo el servidor con la llave de servicio lo lee) y la clave se guarda cifrada en Supabase Vault.
-- Las dos funciones están en public para que el servidor las llame, pero solo la llave de servicio puede ejecutarlas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas-sri', 'firmas-sri', false, 204800, array['application/x-pkcs12', 'application/octet-stream'])
on conflict (id) do nothing;
-- Sin políticas en storage.objects para este bucket: ningún usuario (ni anónimo ni autenticado) puede leerlo ni listarlo.

alter table public.emisores_sri add column if not exists firma_ruta text;
alter table public.emisores_sri add column if not exists firma_titular text;
alter table public.emisores_sri add column if not exists firma_clave_secret_id uuid;
alter table public.emisores_sri add column if not exists firma_cargada_en timestamptz;

-- Guarda (o reemplaza) la clave de la firma en Vault y marca la firma como cargada.
-- La llama el servidor después de validar el .p12 con su clave; solo la llave de servicio puede ejecutarla.
create or replace function public.sri_guardar_firma(p_emisor uuid, p_ruta text, p_clave text, p_titular text, p_vence date)
returns void language plpgsql security definer set search_path to 'public', 'app_private', 'vault'
as $$
declare v_secret uuid;
begin
  if coalesce(p_clave, '') = '' then raise exception 'Falta la clave de la firma.'; end if;
  select firma_clave_secret_id into v_secret from public.emisores_sri where id = p_emisor for update;
  if not found then raise exception 'Emisor no encontrado.'; end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_clave, 'firma_sri_' || p_emisor::text, 'Clave de la firma electrónica del emisor ' || p_emisor::text);
  else
    perform vault.update_secret(v_secret, p_clave);
  end if;
  update public.emisores_sri set firma_ruta = p_ruta, firma_clave_secret_id = v_secret, firma_titular = p_titular,
         firma_vence = p_vence, firma_cargada = true, firma_cargada_en = now(), actualizado_en = now()
   where id = p_emisor;
end;
$$;

-- Devuelve la clave descifrada: solo para el servidor al momento de firmar un comprobante.
create or replace function public.sri_clave_firma(p_emisor uuid)
returns text language sql stable security definer set search_path to 'public', 'vault'
as $$
  select s.decrypted_secret from public.emisores_sri e join vault.decrypted_secrets s on s.id = e.firma_clave_secret_id where e.id = p_emisor;
$$;

revoke all on function public.sri_guardar_firma(uuid, text, text, text, date) from public, anon, authenticated;
revoke all on function public.sri_clave_firma(uuid) from public, anon, authenticated;
grant execute on function public.sri_guardar_firma(uuid, text, text, text, date) to service_role;
grant execute on function public.sri_clave_firma(uuid) to service_role;
