"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, Send } from "lucide-react";
import { ejemploValores, marcadorLabel, renderPlantilla, tiposPlantilla, validarPlantilla, type PlantillaMensaje, type TipoPlantilla } from "@/lib/plantillas-mensajes";
import { activarPlantilla, actualizarPlantillasDesdeMeta, crearPlantilla } from "./plantillas-actions";

const estadoLabel: Record<string, string> = { APPROVED: "Aprobada", PENDING: "En revisión de Meta", REJECTED: "Rechazada", PAUSED: "Pausada por Meta", DISABLED: "Desactivada", BORRADOR: "Borrador" };

export default function PlantillasPanel({ plantillas, empresaId, empresaNombre }: { plantillas: PlantillaMensaje[]; empresaId: string; empresaNombre?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState("");
  const correr = (fn: () => Promise<void>, ok: string) => start(async () => { setAviso(""); try { await fn(); setAviso(ok); router.refresh(); } catch (err) { setAviso(err instanceof Error ? err.message : "No se pudo completar."); } });
  const optica = /focus/i.test(empresaNombre ?? "") ? "Focus Óptica" : "ShuVision Óptica";
  return <section className="cob-queue" aria-label="Plantillas de WhatsApp">
    <div className="cob-heading"><div><h2>Plantillas de WhatsApp · {empresaNombre}</h2><p>Escribe tus propios mensajes. Meta debe aprobar cada versión (minutos a 1 día); mientras tanto se sigue usando la activa.</p></div>
      <button className="outline-action" type="button" disabled={pending} onClick={() => correr(actualizarPlantillasDesdeMeta, "Estados actualizados desde Meta.")}><RefreshCw size={14} /> Actualizar estados</button></div>
    <p className="field-hint">Meta cobra cada mensaje automático que se envía (las de cobro y control suelen ser “Utilidad”, más baratas; cumpleaños y promociones son “Marketing”). Crear o editar plantillas no cuesta. El envío con un toque desde el celular es gratis.</p>
    {aviso && <p className="cob-feedback" role="status">{aviso}</p>}
    {tiposPlantilla.map((t) => <TipoCard key={t.tipo} tipo={t.tipo} nombre={t.nombre} marcadores={t.marcadores} categoriaDefecto={t.categoria} versiones={plantillas.filter((p) => p.tipo === t.tipo)} optica={optica} pending={pending}
      onCrear={(texto, categoria) => correr(() => crearPlantilla({ empresaId, tipo: t.tipo, texto, categoria }), "Enviada a Meta para aprobación. Toca “Actualizar estados” más tarde.")}
      onActivar={(id) => correr(() => activarPlantilla(id), "Listo: desde ahora se usa esta plantilla.")} />)}
  </section>;
}

function TipoCard({ tipo, nombre, marcadores, categoriaDefecto, versiones, optica, pending, onCrear, onActivar }: { tipo: TipoPlantilla; nombre: string; marcadores: string[]; categoriaDefecto: "MARKETING" | "UTILITY"; versiones: PlantillaMensaje[]; optica: string; pending: boolean; onCrear: (texto: string, categoria: "MARKETING" | "UTILITY") => void; onActivar: (id: string) => void }) {
  const activa = versiones.find((v) => v.activa);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(activa?.texto ?? "");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY">(activa?.categoria ?? categoriaDefecto);
  const error = editando ? validarPlantilla(texto, tipo) : null;
  const insertar = (m: string) => setTexto((prev) => `${prev}{{${m}}}`);
  return <article className="glass agenda-board" style={{ padding: 16 }}>
    <div className="cob-heading"><div><h3 style={{ margin: 0 }}>{nombre}</h3><p>{activa ? <>En uso: <strong>{activa.nombre_meta}</strong> · {estadoLabel[activa.estado] ?? activa.estado}</> : "Sin plantilla aprobada todavía"}</p></div>
      {!editando && <button className="outline-action" type="button" onClick={() => { setTexto(activa?.texto ?? ""); setEditando(true); }}>Escribir nueva versión</button>}</div>
    {activa && !editando && <p style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "rgba(255,255,255,.75)", padding: 12, borderRadius: 12 }}>{renderPlantilla(activa.texto, { ...ejemploValores, optica })}</p>}
    {editando && <div className="new-patient-form">
      <label className="task-description">Mensaje<textarea rows={9} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      <p className="field-hint">Toca para insertar datos del paciente: {marcadores.map((m) => <button key={m} type="button" className="text-action" onClick={() => insertar(m)}>{`{{${m}}}`} · {marcadorLabel[m]}</button>)}</p>
      <label>Tipo para Meta<select value={categoria} onChange={(e) => setCategoria(e.target.value as "MARKETING" | "UTILITY")}><option value="UTILITY">Utilidad (recordatorios, cobros)</option><option value="MARKETING">Marketing (cumpleaños, promociones)</option></select></label>
      <p className="field-hint">Vista previa:</p>
      <p style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "rgba(255,255,255,.75)", padding: 12, borderRadius: 12 }}>{renderPlantilla(texto, { ...ejemploValores, optica })}</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={() => setEditando(false)}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !!error} onClick={() => { onCrear(texto, categoria); setEditando(false); }}><Send size={14} /> Enviar a Meta para aprobación</button></div>
    </div>}
    {versiones.filter((v) => !v.activa).length > 0 && <details><summary className="field-hint">Otras versiones ({versiones.filter((v) => !v.activa).length})</summary>
      {versiones.filter((v) => !v.activa).map((v) => <div key={v.id} className="cob-row" style={{ marginTop: 8 }}><div className="cob-row-main"><h3 style={{ fontSize: 14 }}>{v.nombre_meta}</h3><span className="cob-badge">{estadoLabel[v.estado] ?? v.estado}</span>{v.motivo_rechazo && <p>Motivo: {v.motivo_rechazo}</p>}<p style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{v.texto}</p></div>
        <div className="cob-row-action">{v.estado === "APPROVED" && <button className="new-consultation" type="button" disabled={pending} onClick={() => onActivar(v.id)}><CheckCircle2 size={14} /> Usar esta</button>}</div></div>)}
    </details>}
  </article>;
}
