"use client";
import { Printer, X } from "lucide-react";
import type { Consultation } from "@/lib/clinical";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const prettyKey = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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

export default function ConsultationDetailModal({ consultation, patientName, onClose }: { consultation: Consultation; patientName: string; onClose: () => void }) {
  const receta = consultation.receta;
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal lab-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-detail-title"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className="print-area">
      <p className="section-label">REVISIÓN CLÍNICA</p>
      <h2 id="consultation-detail-title">{patientName}</h2>
      <p className="field-hint">{formatDate(consultation.fecha_consulta)} · {consultation.motivo_consulta || "Sin motivo registrado"}</p>

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
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="new-consultation" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir revisión</button></div>
  </section></div>;
}
