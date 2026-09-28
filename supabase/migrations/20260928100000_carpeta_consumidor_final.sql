-- Carpeta "CONSUMIDOR FINAL" para ventas rápidas sin datos del cliente (pedido de Shuyana 2026-09-28).
-- Una sola carpeta, identificación del SRI para consumidor final (9999999999999), vinculada a Shuvisión y a Focus.
select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

insert into public.pacientes_clinicos (nombres, apellidos, cedula, empresa_origen_id, created_by, metadata)
select 'CONSUMIDOR FINAL', '', '9999999999999', '51820b6b-9fc1-495c-b2ea-ab50547e2ce3', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6', '{"consumidor_final": true}'::jsonb
where not exists (select 1 from public.pacientes_clinicos where cedula = '9999999999999');

insert into public.paciente_empresas (paciente_id, empresa_id, primera_sucursal_id, created_by)
select p.id, e.empresa_id, e.sucursal_id, '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'
from public.pacientes_clinicos p
cross join (values ('51820b6b-9fc1-495c-b2ea-ab50547e2ce3'::uuid, '3bd2a17c-b4e0-4137-a5f3-66475dbcb836'::uuid),
                   ('be1dc246-219a-40a2-9e92-707e5845d295'::uuid, 'e2775b83-2105-46a7-8c40-d8de6b3a63dd'::uuid)) as e(empresa_id, sucursal_id)
where p.cedula = '9999999999999'
  and not exists (select 1 from public.paciente_empresas pe where pe.paciente_id = p.id and pe.empresa_id = e.empresa_id);
