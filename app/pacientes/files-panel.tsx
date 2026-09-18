"use client";
import { FileText, Image as ImageIcon, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { subirArchivoClinico } from "./actions";
import type { ClinicalPhoto, Consultation } from "@/lib/clinical";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(path);

export default function FilesPanel({ pacienteId, photos, consultations, onNotice }: { pacienteId: string; photos: ClinicalPhoto[]; consultations: Consultation[]; onNotice: (message: string) => void }) {
  const [pending, start] = useTransition(); const formRef = useRef<HTMLFormElement>(null);
  const submit = (form: HTMLFormElement) => start(async () => {
    const data = new FormData(form); data.set("paciente_id", pacienteId);
    try { await subirArchivoClinico(data); onNotice("Archivo guardado en la ficha clínica."); formRef.current?.reset(); }
    catch (err) { onNotice(err instanceof Error ? err.message : "No se pudo subir el archivo."); }
  });
  return <section className="clinical-content history-list">
    <article className="glass clinical-card" style={{ minHeight: "auto" }}><p className="section-label">SUBIR FOTO O DOCUMENTO</p><form ref={formRef} onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}><div className="new-patient-form"><label>Tipo<select name="tipo" defaultValue="foto"><option value="foto">Foto clínica</option><option value="documento">Documento</option></select></label><label>Descripción<input name="descripcion" placeholder="Ej.: Biomicroscopía OD, lámpara de hendidura" /></label><label>Consulta relacionada<select name="consulta_id" defaultValue=""><option value="">Sin vincular a una consulta</option>{consultations.map((consultation) => <option key={consultation.id} value={consultation.id}>{formatDate(consultation.fecha_consulta)} · {consultation.motivo_consulta || "Consulta"}</option>)}</select></label><label className="task-description">Archivo<input name="archivo" type="file" required accept="image/*,application/pdf" /></label></div><div className="modal-actions" style={{ marginTop: 12 }}><button className="new-consultation" disabled={pending} type="submit"><Upload size={16} /> {pending ? "Subiendo…" : "Subir archivo"}</button></div></form></article>
    {photos.length ? <div className="task-list">{photos.map((photo) => <article className="task-card" key={photo.id}><div className="task-status" /><div className="task-main">{isImagePath(photo.storage_path) && photo.url ? <img src={photo.url} alt={photo.descripcion || "Foto clínica"} style={{ width: "100%", maxWidth: 240, borderRadius: 12, marginBottom: 8 }} /> : <div className="task-meta"><FileText size={16} /><span>Documento</span></div>}<h2>{photo.descripcion || (photo.tipo === "documento" ? "Documento sin descripción" : "Foto sin descripción")}</h2><p>{formatDate(photo.creado_en)}</p></div><div className="task-actions">{photo.url && <a className="outline-action" href={photo.url} target="_blank" rel="noreferrer">{isImagePath(photo.storage_path) ? <ImageIcon size={15} /> : <FileText size={15} />} Ver</a>}</div></article>)}</div> : <section className="glass empty-state"><ImageIcon size={27} /><h3>Sin fotos ni documentos</h3><p>Las fotos clínicas y documentos del paciente aparecerán aquí.</p></section>}
  </section>;
}
