"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Ban, X } from "lucide-react";
import { marcarNoContactar } from "@/app/mensajes/actions";

const motivos = ["Problema con la óptica", "Pidió que no lo contactemos", "Número equivocado o ya no corresponde", "Conflicto o reclamo", "Otra circunstancia"];

// Botón "No contactar": deja al paciente fuera de todos los mensajes (cobros, cumpleaños, controles, seguimiento, CRM).
export default function BotonNoContactar({ pacienteId, nombre, onDone, className = "text-action", etiqueta = "No contactar" }: { pacienteId: string; nombre: string; onDone?: () => void; className?: string; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState(motivos[0]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const confirmar = async () => {
    setGuardando(true); setError("");
    try { await marcarNoContactar(pacienteId, true, [motivo, nota.trim()].filter(Boolean).join(" · ")); setAbierto(false); setNota(""); onDone?.(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo marcar."); }
    finally { setGuardando(false); }
  };
  return <>
    <button className={className} type="button" onClick={() => setAbierto(true)}><Ban size={14} /> {etiqueta}</button>
    {abierto && createPortal(<div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="no-contactar-title">
      <button className="modal-close" type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">NO CONTACTAR</p><h2 id="no-contactar-title">{nombre}</h2>
      <p>Dejará de aparecer en cobros, cumpleaños, controles, seguimiento y CRM. Su ficha, su historia y su deuda se conservan. Solo administración puede volver a permitir el contacto.</p>
      <div className="new-patient-form" style={{ gridTemplateColumns: "1fr" }}>
        <label>Motivo<select value={motivo} onChange={(event) => setMotivo(event.target.value)}>{motivos.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label>Nota (opcional)<textarea rows={2} maxLength={300} value={nota} onChange={(event) => setNota(event.target.value)} /></label>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={() => setAbierto(false)}>Cancelar</button><button className="new-consultation" type="button" disabled={guardando} onClick={() => void confirmar()}>{guardando ? "Guardando…" : "Marcar como no contactar"}</button></div>
    </section></div>, document.body)}
  </>;
}
