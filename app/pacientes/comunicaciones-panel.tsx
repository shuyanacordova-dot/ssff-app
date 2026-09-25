"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { MessageCircle, NotebookPen } from "lucide-react";
import { obtenerHistorialCrm, registrarContactoCrm, type ContactoCrm } from "@/app/crm/actions";
import { formatRecordDate } from "@/lib/record-date";
import { enlaceWhatsapp } from "@/lib/whatsapp";

const motivoLabel: Record<string, string> = { control: "Control", examen_sin_compra: "Examen sin compra", lentes_listos: "Lentes listos", postventa: "Postventa", cumpleanos: "Cumpleaños", inactivo: "Inactivo", otro: "Otro" };
const canalLabel: Record<string, string> = { whatsapp: "WhatsApp", llamada: "Llamada", presencial: "Presencial" };
const resultadoLabel: Record<string, string> = { enviado: "Mensaje enviado", respondio: "Respondió", agendo: "Agendó cita", compro: "Compró", no_contesta: "No contesta", no_interesado: "No está interesado" };

export default function ComunicacionesPanel({ pacienteId, empresaId, sucursalId, telefono }: { pacienteId: string; empresaId: string; sucursalId: string | null; telefono: string | null }) {
  const [contactos, setContactos] = useState<ContactoCrm[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const cargar = useCallback(() => { obtenerHistorialCrm(pacienteId).then(setContactos).catch(() => setContactos([])); }, [pacienteId]);
  useEffect(() => { setContactos(null); cargar(); }, [cargar]);
  const wa = enlaceWhatsapp(telefono, "");

  return <section className="clinical-content history-list">
    <div className="tab-actions">
      <button className="new-consultation" type="button" onClick={() => setFormOpen((v) => !v)}><NotebookPen size={17} /> Registrar contacto</button>
      {wa && <a className="outline-action" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Abrir WhatsApp</a>}
    </div>
    {formOpen && <form className="new-patient-form glass" style={{ padding: 14, marginBottom: 12 }} onSubmit={(event) => {
      event.preventDefault(); setError("");
      const form = new FormData(event.currentTarget);
      startTransition(async () => {
        try { await registrarContactoCrm(form); setFormOpen(false); cargar(); }
        catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el contacto."); }
      });
    }}>
      <input type="hidden" name="paciente_id" value={pacienteId} /><input type="hidden" name="empresa_id" value={empresaId} /><input type="hidden" name="sucursal_id" value={sucursalId ?? ""} />
      <label>Motivo<select name="motivo" defaultValue="otro">{Object.entries(motivoLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Canal<select name="canal" defaultValue="whatsapp">{Object.entries(canalLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Resultado<select name="resultado" defaultValue="enviado">{Object.entries(resultadoLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Volver a contactar el (opcional)<input name="proximo_seguimiento" type="date" /></label>
      <label>Nota<textarea name="nota" rows={2} maxLength={2000} /></label>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar contacto"}</button></div>
    </form>}
    {contactos === null ? <p className="field-hint">Cargando comunicaciones…</p>
      : contactos.length ? <div className="task-list">{contactos.map((c) => <article className="task-card" key={c.id}><div className="task-status"><span className="status-dot" /></div><div className="task-main">
          <div className="task-meta"><span>{formatRecordDate(c.creado_en)}</span><span>{motivoLabel[c.motivo] ?? c.motivo}</span><span>{canalLabel[c.canal] ?? c.canal}</span>{c.autor && <span>{c.autor}</span>}</div>
          <h2>{resultadoLabel[c.resultado] ?? c.resultado}</h2>
          {c.nota && <p>{c.nota}</p>}
          {c.proximo_seguimiento && <p className="field-hint">Volver a contactar: {formatRecordDate(c.proximo_seguimiento)}</p>}
        </div></article>)}</div>
      : <p className="field-hint">Todavía no hay contactos registrados con este paciente. También puedes registrarlos desde el CRM general.</p>}
  </section>;
}
