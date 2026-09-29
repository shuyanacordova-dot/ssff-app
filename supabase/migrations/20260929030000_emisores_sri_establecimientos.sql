-- Datos SRI confirmados por Shuyana (2026-09-29): certificado RUC de Shushufindi (RCR1790702110834778) y
-- códigos de establecimiento: Sacha y Focus facturan desde el establecimiento 002.
update public.emisores_sri set
  ruc_confirmado = true,
  razon_social = 'CORDOVA CAJAS ELISA SHUYANA',
  regimen = 'general',
  obligado_contabilidad = false,
  contribuyente_especial = null,
  direccion_matriz = 'Av. Napo y Siona, barrio Central, Shushufindi, Sucumbíos (junto a la Liga Cantonal)',
  direccion_establecimiento = 'Av. Napo y Siona, barrio Central, Shushufindi, Sucumbíos (junto a la Liga Cantonal)',
  codigo_establecimiento = '001',
  notas = 'Confirmado con certificado RUC (RCR1790702110834778). 1 establecimiento abierto (001).',
  actualizado_en = now()
where sucursal_id = '3bd2a17c-b4e0-4137-a5f3-66475dbcb836' and ruc = '1804006391001';

update public.emisores_sri set
  codigo_establecimiento = '002',
  notas = 'Confirmado con certificado RUC (RCR1789767182690970). Establecimiento 002 (confirmado por Shuyana 29-09).',
  actualizado_en = now()
where sucursal_id = '1db17433-cc24-409f-92d2-794a01ce79d4' and ruc = '2100060470001';

update public.emisores_sri set
  codigo_establecimiento = '002',
  notas = 'Confirmado con certificado RUC (RCR1785961049037896). Establecimiento 002 en Shushufindi (confirmado por Shuyana 29-09); falta su dirección exacta. RIMPE negocio popular: confirmar con el contador tipo de comprobante e IVA.',
  actualizado_en = now()
where sucursal_id = 'e2775b83-2105-46a7-8c40-d8de6b3a63dd' and ruc = '1722305412001';
