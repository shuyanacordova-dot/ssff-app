-- Metas de octubre 2026 (Shuyana, 2026-09-28): se mantienen las de septiembre, salvo Shushufindi que sube $1.000.
insert into public.metas_ventas (empresa_id, sucursal_id, mes, monto_meta, created_by)
select m.empresa_id, m.sucursal_id, date '2026-10-01',
       m.monto_meta + case when m.sucursal_id = '3bd2a17c-b4e0-4137-a5f3-66475dbcb836' then 1000 else 0 end,
       '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'
from public.metas_ventas m
where m.mes = date '2026-09-01'
  and not exists (select 1 from public.metas_ventas x where x.sucursal_id = m.sucursal_id and x.mes = date '2026-10-01');

-- Emisores SRI confirmados con los certificados de RUC que entregó Shuyana (2026-09-28).
-- Sacha: CAJAS RODAS JASSYRA ELIZABETH, RUC 2100060470001, régimen GENERAL, no obligada a llevar contabilidad.
--   Certificado: 1 establecimiento abierto y 1 cerrado → confirmar en el SRI el código del abierto (puede no ser 001).
update public.emisores_sri set
  ruc_confirmado = true,
  razon_social = 'CAJAS RODAS JASSYRA ELIZABETH',
  regimen = 'general',
  obligado_contabilidad = false,
  contribuyente_especial = null,
  direccion_matriz = 'Av. de los Fundadores N3A-21 y Cristóbal Colón, barrio Central, La Joya de los Sachas, Orellana',
  direccion_establecimiento = 'Av. de los Fundadores N3A-21 y Cristóbal Colón, barrio Central, La Joya de los Sachas, Orellana',
  notas = 'Confirmado con certificado RUC (RCR1789767182690970, emitido 18-09-2026). 1 establecimiento abierto y 1 cerrado: confirmar código de establecimiento antes de facturar.',
  actualizado_en = now()
where sucursal_id = '1db17433-cc24-409f-92d2-794a01ce79d4' and ruc = '2100060470001';

-- Focus: BALSECA TIPAN ERICK ANDRES, RUC 1722305412001, RIMPE – NEGOCIO POPULAR, no obligado a llevar contabilidad.
--   Domicilio tributario en Quito (matriz); 2 establecimientos abiertos → el de Shushufindi probablemente no es 001: confirmar.
--   Negocio popular: confirmar con el contador si emite notas de venta o facturas electrónicas y con qué IVA.
update public.emisores_sri set
  ruc_confirmado = true,
  razon_social = 'BALSECA TIPAN ERICK ANDRES',
  regimen = 'rimpe_negocio_popular',
  obligado_contabilidad = false,
  contribuyente_especial = null,
  direccion_matriz = 'Av. Ilaló OE1-160 y 4 de Mayo, La Merced, Quito, Pichincha',
  notas = 'Confirmado con certificado RUC (RCR1785961049037896). 2 establecimientos abiertos: confirmar código y dirección del de Shushufindi. RIMPE negocio popular: confirmar con el contador tipo de comprobante (nota de venta / factura) e IVA.',
  actualizado_en = now()
where sucursal_id = 'e2775b83-2105-46a7-8c40-d8de6b3a63dd' and ruc = '1722305412001';
