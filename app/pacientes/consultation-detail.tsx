"use client";

import { Printer, X } from "lucide-react";
import type { Consultation, PatientRecord } from "@/lib/clinical";
import { complementaryExamsFrom } from "@/lib/clinical-format";
import type { SaleCompany } from "@/lib/ventas";
import { printDocumentById } from "@/lib/print-document";
import ClinicalReviewPrint from "./clinical-review-print";
import ClinicalPrescriptionPrint, { hasClinicalPrescription } from "./clinical-prescription-print";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const prettyKey = (key: string) => key.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
const sexoLabel: Record<string, string> = { femenino: "Femenino", masculino: "Masculino", otro: "Otro" };
const RX_COLUMNS = [{ key: "esfera", label: "ESF" }, { key: "cilindro", label: "CIL" }, { key: "eje", label: "EJE" }, { key: "add", label: "ADD" }, { key: "av_lejos", label: "AV LEJOS" }, { key: "av_cerca", label: "AV CERCA" }, { key: "dnp", label: "DNP" }];
const AUTO_COLUMNS = RX_COLUMNS.filter((column) => ["esfera", "cilindro", "eje", "add"].includes(column.key));
const QUERA_COLUMNS = [{ key: "k1", label: "K1" }, { key: "k2", label: "K2" }, { key: "eje", label: "EJE" }, { key: "astigmatismo", label: "ASTIG." }];

function calcularEdad(fechaISO: string | null) {
  if (!fechaISO) return null;
  const nacimiento = new Date(`${fechaISO}T12:00:00`);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  if (hoy.getMonth() < nacimiento.getMonth() || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
}

function FieldGrid({ data }: { data: Record<string, string> | null | undefined }) {
  const entries = Object.entries(data ?? {}).filter(([key, value]) => key !== "complementarios" && String(value ?? "").trim());
  if (!entries.length) return <p className="field-hint">Sin datos registrados.</p>;
  return <div className="consultation-stats">{entries.map(([key, value]) => <span key={key}><strong>{prettyKey(key)}</strong>{String(value)}</span>)}</div>;
}

function EyeTable({ data, columns }: { data: Record<string, string> | null | undefined; columns: { key: string; label: string }[] }) {
  const visible = columns.filter((column) => String(data?.[`od_${column.key}`] ?? "").trim() || String(data?.[`oi_${column.key}`] ?? "").trim());
  if (!visible.length) return <p className="field-hint">Sin datos registrados.</p>;
  return <table className="rx-table"><thead><tr><th />{visible.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>
    <tr><th>OD</th>{visible.map((column) => <td key={column.key}>{data?.[`od_${column.key}`] || "—"}</td>)}</tr>
    <tr><th>OI</th>{visible.map((column) => <td key={column.key}>{data?.[`oi_${column.key}`] || "—"}</td>)}</tr>
  </tbody></table>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="consultation-screen-section"><p className="section-label">{title}</p>{children}</section>;
}

export default function ConsultationDetailModal({ consultation, patient, company, branchName, onClose }: { consultation: Consultation; patient: PatientRecord; company?: SaleCompany; branchName?: string; onClose: () => void }) {
  const receta = consultation.receta;
  const edad = calcularEdad(patient.fecha_nacimiento);
  const complementaryExams = complementaryExamsFrom(consultation);
  const hasPrescription = hasClinicalPrescription(consultation);
  return <div className="modal-backdrop"><section className="new-patient-modal clinical-review-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title">
    <button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>

    <div className="consultation-screen no-print">
      <p className="section-label">REVISIÓN CLÍNICA</p>
      <h2 id="consultation-detail-title">{patient.nombres} {patient.apellidos}</h2>
      <p className="field-hint">{formatDate(consultation.fecha_consulta)} · {branchName || "Sucursal no especificada"}</p>
      <p className="consultation-professional"><strong>Examen realizado por:</strong> {consultation.optometrista_nombre || "Profesional no identificado"}</p>

      <Section title="DATOS DEL PACIENTE"><div className="consultation-stats"><span><strong>Género</strong>{patient.sexo ? sexoLabel[patient.sexo] ?? patient.sexo : "—"}</span><span><strong>Nacimiento</strong>{patient.fecha_nacimiento ? formatDate(patient.fecha_nacimiento) : "—"}</span><span><strong>Edad</strong>{edad === null ? "—" : `${edad} años`}</span><span><strong>Cédula</strong>{patient.cedula || "—"}</span><span><strong>Celular</strong>{patient.telefono || "—"}</span><span><strong>Ocupación</strong>{patient.ocupacion || "—"}</span></div></Section>
      <Section title="MOTIVO Y ANTECEDENTES"><p>{consultation.motivo_consulta || "Sin motivo registrado."}</p><FieldGrid data={consultation.antecedentes} /></Section>
      <Section title="AGUDEZA VISUAL"><FieldGrid data={consultation.agudeza_visual} /></Section>
      <Section title="LENSOMETRÍA · RX ANTERIOR"><EyeTable data={consultation.lensometria} columns={RX_COLUMNS} /></Section>
      <Section title="QUERATOMETRÍA"><EyeTable data={consultation.queratometria} columns={QUERA_COLUMNS} /></Section>
      <Section title="AUTORREFRACTOR"><EyeTable data={consultation.autorefractor} columns={AUTO_COLUMNS} /></Section>
      <Section title="RX FINAL"><EyeTable data={consultation.refraccion} columns={RX_COLUMNS} /></Section>
      <Section title="VISIÓN BINOCULAR"><FieldGrid data={consultation.examen_binocular} /></Section>
      <Section title="EXÁMENES COMPLEMENTARIOS">{complementaryExams.length ? <div className="consultation-stats">{complementaryExams.map((exam, index) => <span key={`${exam.name}-${index}`}><strong>{exam.name || "Examen"}</strong>{exam.result || "Sin resultado"}</span>)}</div> : <p className="field-hint">Sin exámenes complementarios registrados.</p>}</Section>
      <Section title="BIOMICROSCOPÍA"><FieldGrid data={consultation.biomicroscopia} /></Section>
      <Section title="DIAGNÓSTICO"><p>{consultation.impresion_diagnostica || "Sin diagnóstico registrado."}</p></Section>
      <Section title="RECETA E INDICACIONES"><div className="consultation-stats"><span><strong>Lágrimas</strong>{receta?.lagrimas_artificiales ? [...(receta.lagrimas_productos ?? []), receta.lagrimas_otro, receta.lagrimas_frecuencia].filter(Boolean).join(" · ") || "Sí" : "No"}</span><span><strong>Vitaminas</strong>{receta?.vitaminas ? [...(receta.vitaminas_productos ?? []), receta.vitaminas_otro, receta.vitaminas_frecuencia].filter(Boolean).join(" · ") || "Sí" : "No"}</span><span><strong>Terapia visual</strong>{receta?.terapia_visual ? receta.terapia_instrucciones || "Sí" : "No"}</span></div>{consultation.plan_manejo && <p>{consultation.plan_manejo}</p>}{consultation.observaciones && <p>{consultation.observaciones}</p>}</Section>
    </div>

    <div id="clinical-review-print" className="print-area print-a4 print-only"><ClinicalReviewPrint consultation={consultation} patient={patient} company={company} branchName={branchName} /></div>
    <div id="clinical-prescription-print" className="print-area print-a4 print-only"><ClinicalPrescriptionPrint consultation={consultation} patient={patient} company={company} branchName={branchName} /></div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button>{hasPrescription && <button className="outline-action" type="button" onClick={() => printDocumentById("clinical-prescription-print")}><Printer size={16} /> Imprimir receta</button>}<button className="new-consultation" type="button" onClick={() => printDocumentById("clinical-review-print")}><Printer size={16} /> Imprimir revisión</button></div>
  </section></div>;
}
