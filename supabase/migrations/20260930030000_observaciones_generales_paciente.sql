-- Observaciones generales del paciente (Shuyana 2026-09-30): nota fija de la carpeta (ej. "RX EN USO (1 AÑO)"),
-- distinta de las observaciones de cada revisión. Se traen las 35 que había en Optox (por cédula).
alter table public.pacientes_clinicos add column if not exists observaciones text;

update public.pacientes_clinicos p set observaciones = x.obs
from (values
  ('0401301437', 'RX EN USO (8 MESES)'),
  ('1725561086', 'RX EN USO (1 AÑO)'),
  ('1714423124', 'RX EN USO (2 AÑOS)'),
  ('1729075471', 'RX EN USO (3 MESES)'),
  ('1751065804', 'RX EN USO (4MESES)'),
  ('2100948740', 'ESTUDIANTE'),
  ('1757015209', 'RX EN USO (6 MESES), LECTURA'),
  ('1713640025', 'RX EN USO MONOFOCAL (2 AÑOS)'),
  ('2100063896', 'REDACCIÓN PERIODÍSTICA'),
  ('1700554205', 'Lente Intraocular OD (1año)'),
  ('1720635620', 'RX EN USO (3 MESES)'),
  ('1715687214', 'RX EN USO(3 AÑOS)'),
  ('1723509707', 'RX EN USO (8 MESES)'),
  ('2150275986', 'estudiante'),
  ('1723812283', 'RX EN USO (2 AÑOS)'),
  ('1714151733', 'NO TIENE CIRUGIAS OCULARES. SI USA LAGRIMAS ARTIFICIALES'),
  ('1723556815', 'RX EN USO (6 MESES)'),
  ('1724254147', 'RX EN USO (1 MES)'),
  ('1726982638', 'RX EN USO (6 MESES)'),
  ('1752480002', 'RX EN USO(4MESES)'),
  ('1727184135', 'RX EN USO (4 MESES)'),
  ('1725417214', 'RX EN USO (2 AÑOS)'),
  ('2100309125', 'PTE FINCA.'),
  ('2150094742', 'CI: 2150094742'),
  ('1728798776', 'RX EN USO(1 AÑO)'),
  ('1727065557', 'RX EN USO (4 MESES)'),
  ('0800637647', 'PX ES HIPERTENSA HACE 4 DIAS SE TOMA LA PRESION Y ESTABA EN 131'),
  ('1705260014', 'RX EN USO (2 AÑOS), LECTURA'),
  ('1716388051', 'RX EN USO (2 AÑOS)'),
  ('1715819007', 'RX EN USO (8 MESES)'),
  ('1712117348', 'RX EN USO (2 AÑOS), OCUPACIONAL'),
  ('1705667820', 'RX EN USO (3 AÑOS)'),
  ('1752443034', 'RX EN USO (5 MESES)'),
  ('1714197330', 'RX EN USO (3AÑOS)'),
  ('1314592476', 'CREDITO AUTORIZADO POR JASSY')
) x(cedula, obs)
where p.cedula = x.cedula and (p.observaciones is null or p.observaciones = '');
