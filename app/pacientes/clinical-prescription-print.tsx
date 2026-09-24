import { formatRecordDate } from "@/lib/record-date";
import type { Consultation, PatientRecord } from "@/lib/clinical";
import type { SaleCompany } from "@/lib/ventas";

type Props = { consultation: Consultation; patient: PatientRecord; company?: SaleCompany; branchName?: string };
const dateLabel = formatRecordDate;

export function hasClinicalPrescription(consultation: Consultation) {
  const receta = consultation.receta;
  return Boolean(receta?.lagrimas_artificiales || receta?.vitaminas || receta?.terapia_visual || consultation.plan_manejo?.trim());
}

export default function ClinicalPrescriptionPrint({ consultation, patient, company, branchName }: Props) {
  const receta = consultation.receta;
  const tears = [...(receta?.lagrimas_productos ?? []), receta?.lagrimas_otro].filter(Boolean).join(", ");
  const vitamins = [...(receta?.vitaminas_productos ?? []), receta?.vitaminas_otro].filter(Boolean).join(", ");
  return <article className="clinical-prescription-print" aria-label="Receta optométrica">
    <header className="clinical-print-letterhead"><div className="clinical-print-logo">{company?.logo_url ? <img src={company.logo_url} alt={company.nombre} /> : null}</div><div><h1>{company?.nombre?.toUpperCase() || "SHUVISIÓN"}</h1>{branchName && <p>{branchName}</p>}{company?.telefono && <p>Tel: {company.telefono}</p>}</div></header>
    <h2 className="clinical-print-title">Receta</h2>
    <div className="clinical-print-patient-row"><strong>Paciente: {patient.nombres} {patient.apellidos}</strong><span>{dateLabel(consultation.fecha_consulta)}</span></div>
    <section className="prescription-items">
      {receta?.lagrimas_artificiales && <article><h3>Lágrimas artificiales</h3><p>{tears || "Producto indicado"}</p>{receta.lagrimas_frecuencia && <strong>Indicación: {receta.lagrimas_frecuencia}</strong>}</article>}
      {receta?.vitaminas && <article><h3>Vitaminas</h3><p>{vitamins || "Producto indicado"}</p>{receta.vitaminas_frecuencia && <strong>Indicación: {receta.vitaminas_frecuencia}</strong>}</article>}
      {receta?.terapia_visual && <article><h3>Terapia visual</h3><p>{receta.terapia_instrucciones || "Terapia indicada"}</p></article>}
      {consultation.plan_manejo && <article><h3>Indicaciones adicionales</h3><p>{consultation.plan_manejo}</p></article>}
    </section>
    <footer className="clinical-print-signature"><div><span /><strong>{consultation.optometrista_nombre || "Profesional no identificado"}</strong><small>Optometrista</small></div></footer>
  </article>;
}
