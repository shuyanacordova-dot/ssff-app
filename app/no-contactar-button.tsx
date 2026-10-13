"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { marcarNoContactar } from "@/app/mensajes/actions";

// Botón "No contactar": deja al paciente fuera de todos los mensajes (cobros, cumpleaños, controles, seguimiento, CRM).
export default function BotonNoContactar({ pacienteId, nombre, onDone, className = "text-action" }: { pacienteId: string; nombre: string; onDone?: () => void; className?: string }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const marcar = async () => {
    if (!window.confirm(`¿Marcar a ${nombre} como NO CONTACTAR?\n\nDejará de aparecer en cobros, cumpleaños, controles, seguimiento y CRM. Su ficha y su historia se conservan. Solo administración puede volver a permitir el contacto.`)) return;
    const motivo = window.prompt("Motivo (opcional):") ?? "";
    setGuardando(true); setError("");
    try { await marcarNoContactar(pacienteId, true, motivo); onDone?.(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo marcar."); }
    finally { setGuardando(false); }
  };
  return <><button className={className} type="button" disabled={guardando} onClick={() => void marcar()}><Ban size={14} /> No contactar</button>{error && <span className="field-hint" role="alert">{error}</span>}</>;
}
