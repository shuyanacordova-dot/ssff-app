-- Pedido por Shuyana 2026-09-25: controles escritos en las historias clínicas ("control en 3 meses", "control cada 6 meses", "1 año").
-- Última revisión de cada paciente; fecha = fecha de la revisión + plazo. Resultado: 250 revisiones con proximo_control,
-- 29 citas futuras creadas como 'programada' (sin confirmar) a las 10:00; las vencidas quedan para el CRM ("Control vencido").
create or replace view app_private.plan_controles as
with t as (
  select c.id, c.paciente_id, c.fecha_consulta, c.sucursal_atencion_id, c.empresa_atencion_id, c.optometrista_id,
    lower(concat_ws(' | ', c.plan_manejo, c.observaciones, c.impresion_diagnostica, c.receta::text)) txt,
    row_number() over (partition by c.paciente_id order by c.fecha_consulta desc) pos
  from public.consultas_optometricas c),
m as (
  select t.*, substring(txt from '(?:control|cita)[^|]{0,30}?(\d+|un|una|uno|dos|tres|cuatro|seis|doce)\s*(?:mes|meses|año|años|ano|anos)') n_txt,
    substring(txt from '(?:control|cita)[^|]{0,30}?(?:\d+|un|una|uno|dos|tres|cuatro|seis|doce)\s*(mes|meses|año|años|ano|anos)') unidad,
    substring(txt from '((?:control|cita)[^|]{0,30}?(?:\d+|un|una|uno|dos|tres|cuatro|seis|doce)\s*(?:mes|meses|año|años|ano|anos))') frase
  from t where pos = 1),
n as (
  select m.*, (case n_txt when 'un' then 1 when 'una' then 1 when 'uno' then 1 when 'dos' then 2 when 'tres' then 3 when 'cuatro' then 4 when 'seis' then 6 when 'doce' then 12 else nullif(n_txt,'')::int end)
     * (case when unidad like 'a%' then 12 else 1 end) meses
  from m where n_txt is not null)
select n.*, ((n.fecha_consulta at time zone 'America/Guayaquil')::date + make_interval(months => n.meses))::date fecha_control
from n where n.meses between 1 and 36;

select set_config('request.jwt.claims', json_build_object('sub', 'b5e6cfbf-3829-4904-b4e5-e8274e4e9960', 'role', 'authenticated')::text, true);

update public.consultas_optometricas c set proximo_control = p.fecha_control
from app_private.plan_controles p
where p.id = c.id and c.proximo_control is null;

insert into public.citas_agenda (paciente_id, empresa_atencion_id, sucursal_atencion_id, responsable_id, inicio, duracion_minutos, tipo, motivo, notas_agenda, estado, created_by)
select p.paciente_id, p.empresa_atencion_id, p.sucursal_atencion_id, p.optometrista_id,
  (p.fecha_control::text || ' 10:00:00-05:00')::timestamptz, 30, 'control',
  'Control recomendado',
  'Agendado automáticamente desde la historia del ' || to_char((p.fecha_consulta at time zone 'America/Guayaquil')::date, 'DD/MM/YYYY') || ': "' || trim(p.frase) || '". Confirmar con el paciente.',
  'programada', '535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6'
from app_private.plan_controles p
where p.fecha_control >= (now() at time zone 'America/Guayaquil')::date
  and p.empresa_atencion_id is not null
  and not exists (select 1 from public.citas_agenda a where a.paciente_id = p.paciente_id and a.inicio >= now() and a.estado in ('programada','confirmada'));

drop view app_private.plan_controles;
