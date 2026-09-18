"use client";
import { Printer, X } from "lucide-react";
import type { Consultation, PatientRecord } from "@/lib/clinical";
import type { SaleCompany } from "@/lib/ventas";
import Letterhead from "../print-letterhead";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const prettyKey = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const sexoLabel: Record<string, string> = { femenino: "Femenino", masculino: "Masculino", otro: "Otro" };
const calcularEdad = (fechaISO: string | null): number | null => {
  if (!fechaISO) return null;
  const nacimiento = new Date(`${fechaISO}T12:00:00`); const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const aunNoCumple = hoy.getMonth() < nacimiento.getMonth() || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (aunNoCumple) edad -= 1;
  return edad;
};

function FieldGrid({ data }: { data: Record<string, string> | null | undefined }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value && String(value).trim() !== "");
  if (!entries.length) return <p className="field-hint">Sin datos registrados.</p>;
  return <div className="consultation-stats">{entries.map(([key, value]) => <span key={key}><strong>{prettyKey(key)}</strong>{String(value)}</span>)}</div>;
}

const RX_COLUMNS = [{ key: "esfera", label: "ESF" }, { key: "cilindro", label: "CIL" }, { key: "eje", label: "EJE" }, { key: "add", label: "ADD" }, { key: "av_lejos", label: "AV LEJOS" }, { key: "av_cerca", label: "AV CERCA" }, { key: "dnp", label: "DNP" }];
const AUTO_COLUMNS = RX_COLUMNS.filter((c) => ["esfera", "cilindro", "eje", "add"].includes(c.key));
const QUERA_COLUMNS = [{ key: "k1", label: "K1" }, { key: "k2", label: "K2" }, { key: "eje", label: "EJE" }, { key: "astigmatismo", label: "ASTIG." }];

function EyeTable({ data, columns }: { data: Record<string, string> | null | undefined; columns: { key: string; label: string }[] }) {
  const visibleColumns = columns.filter((column) => (data?.[`od_${column.key}`] ?? "") !== "" || (data?.[`oi_${column.key}`] ?? "") !== "");
  if (!visibleColumns.length) return <p className="field-hint">Sin datos registrados.</p>;
  return <table className="rx-table"><thead><tr><th></th>{visibleColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>
      <tr><th>OD</th>{visibleColumns.map((column) => <td key={column.key}>{data?.[`od_${column.key}`] || "—"}</td>)}</tr>
      <tr><th>OI</th>{visibleColumns.map((column) => <td key={column.key}>{data?.[`oi_${column.key}`] || "—"}</td>)}</tr>
    </tbody>
  </table>;
}

export default function ConsultationDetailModal({ consultation, patient, company, onClose }: { consultation: Consultation; patient: PatientRecord; company?: SaleCompany; onClose: () => void }) {
  const receta = consultation.receta;
  const patientName = `${patient.nombres} ${patient.apellidos}`;
  const edad = calcularEdad(patient.fecha_nacimiento);
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className="print-area print-a4">
      <Letterhead company={company} />
      <p className="section-label">REVISIÓN</p>
      <h2 id="consultation-detail-title">{patientName}</h2>
      <p className="field-hint">{formatDate(consultation.fecha_consulta)} · {consultation.motivo_consulta || "Sin motivo registrado"}</p>

      <p className="section-label" style={{ marginTop: 14 }}>DATOS DEL PACIENTE</p>
      <div className="consultation-stats">
        <span><strong>Género</strong>{patient.sexo ? (sexoLabel[patient.sexo] ?? patient.sexo) : "—"}</span>
        <span><strong>Fecha de nacimiento</strong>{patient.fecha_nacimiento ? formatDate(patient.fecha_nacimiento) : "—"}</span>
        <span><strong>Edad</strong>{edad !== null ? `${edad} años` : "—"}</span>
        <span><strong>Cédula</strong>{patient.cedula || "—"}</span>
        <span><strong>Celular</strong>{patient.telefono || "—"}</span>
        <span><strong>Email</strong>{patient.email || "—"}</span>
        <span><strong>Dirección</strong>{patient.direccion || "—"}</span>
        <span><strong>Ocupación</strong>{patient.ocupacion || "—"}</span>
      </div>

      <p className="section-label" style={{ marginTop: 14 }}>ANTECEDENTES</p>
      <FieldGrid data={consultation.antecedentes} />

      <p className="section-label" style={{ marginTop: 14 }}>AGUDEZA VISUAL SIN CORRECCIÓN</p>
      <FieldGrid data={consultation.agudeza_visual} />

      <p className="section-label" style={{ marginTop: 14 }}>LENSOMETRÍA (RX ANTIGUA)</p>
      <EyeTable data={consultation.lensometria} columns={RX_COLUMNS} />

      <p className="section-label" style={{ marginTop: 14 }}>QUERATOMETRÍA</p>
      <EyeTable data={consultation.queratometria} columns={QUERA_COLUMNS} />

      <p className="section-label" style={{ marginTop: 14 }}>AUTORREFRACTOR</p>
      <EyeTable data={consultation.autorefractor} columns={AUTO_COLUMNS} />

      <p className="section-label" style={{ marginTop: 14 }}>RX FINAL</p>
      <EyeTable data={consultation.refraccion} columns={RX_COLUMNS} />

      <p className="section-label" style={{ marginTop: 14 }}>VISIÓN BINOCULAR</p>
      <FieldGrid data={consultation.examen_binocular} />

      <p className="section-label" style={{ marginTop: 14 }}>BIOMICROSCOPÍA</p>
      <FieldGrid data={consultation.biomicroscopia} />

      <p className="section-label" style={{ marginTop: 14 }}>DIAGNÓSTICO</p>
      <p>{consultation.impresion_diagnostica || "Sin diagnóstico registrado"}</p>

      <p className="section-label" style={{ marginTop: 14 }}>RECETA</p>
      <div className="consultation-stats">
        <span><strong>Lágrimas artificiales</strong>{receta?.lagrimas_artificiales ? [...(receta.lagrimas_productos ?? []), receta.lagrimas_otro].filter(Boolean).join(", ") || "Sí" : "No"}</span>
        {receta?.lagrimas_artificiales && receta.lagrimas_frecuencia && <span><strong>Frecuencia</strong>{receta.lagrimas_frecuencia}</span>}
        <span><strong>Vitaminas</strong>{receta?.vitaminas ? [...(receta.vitaminas_productos ?? []), receta.vitaminas_otro].filter(Boolean).join(", ") || "Sí" : "No"}</span>
        {receta?.vitaminas && receta.vitaminas_frecuencia && <span><strong>Frecuencia</strong>{receta.vitaminas_frecuencia}</span>}
        <span><strong>Terapia visual</strong>{receta?.terapia_visual ? (receta.terapia_instrucciones || "Sí") : "No"}</span>
      </div>

      <p className="section-label" style={{ marginTop: 14 }}>PLAN E INDICACIONES</p>
      <p>{consultation.plan_manejo || "Sin indicaciones adicionales"}</p>

      {consultation.observaciones && <><p className="section-label" style={{ marginTop: 14 }}>OBSERVACIONES</p><p>{consultation.observaciones}</p></>}

      <div className="print-center" style={{ marginTop: 46 }}>
        <div style={{ borderTop: "1px solid #34455c", width: 260, margin: "0 auto" }} />
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>Firma del profesional</p>
      </div>
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="new-consultation" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir revisión</button></div>
  </section></div>;
}
