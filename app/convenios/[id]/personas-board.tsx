"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, FolderPlus, MessageCircle, UserPlus, Users, X } from "lucide-react";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { formatRecordDate } from "@/lib/record-date";
import { actualizarEstadoPersona, agregarPersonaConvenio, guardarMensajeInvitacion, crearCarpetaDesdePersona } from "../personas-actions";

export type PersonaConvenio = {
  id: string; nombres: string; apellidos: string | null; cedula: string | null; telefono: string | null; email: string | null; cargo: string | null;
  sucursal_id: string | null; estado: string; paciente_id: string | null; notas: string | null; ultimo_contacto: string | null;
};
type Props = { status: "ready" | "needs_login" | "forbidden" | "error"; message?: string; personas: PersonaConvenio[]; branches: { id: string; nombre: string }[]; empresaNombre: string; mensaje: string | null; empresaConvenioId: string; opticaNombre: string };

const estadoLabel: Record<string, string> = { nuevo: "Nuevo", contactado: "Contactado", interesado: "Interesado", agendo: "Agendó", cliente: "Ya es cliente", no_interesado: "No interesado" };
const plantillaBase = (empresa: string, optica: string) => `Hola {nombre}, te saludamos de ${optica}. Como colaborador/a de ${empresa} tienes convenio con nosotros: examen visual y lentes con pago por descuento a rol. ¿Te gustaría agendar tu cita?`;

export default function PersonasBoard(props: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<string>("todos");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [mensaje, setMensaje] = useState(props.mensaje ?? plantillaBase(props.empresaNombre, props.opticaNombre));
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const crearCarpeta = (p: PersonaConvenio) => startTransition(async () => {
    try { const pacienteId = await crearCarpetaDesdePersona(p.id, props.empresaConvenioId); router.push(`/pacientes?paciente=${pacienteId}`); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo crear la carpeta."); }
  });
  const conteo = (e: string) => props.personas.filter((p) => e === "todos" || p.estado === e).length;
  const visibles = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return props.personas.filter((p) => (estado === "todos" || p.estado === estado) && words.every((w) => `${p.nombres} ${p.apellidos ?? ""} ${p.cedula ?? ""} ${p.cargo ?? ""}`.toLowerCase().includes(w)));
  }, [props.personas, estado, query]);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/convenios">← Convenios</Link><h1>Personas del convenio</h1><p className="subtitle">{props.message}</p></div></header></div></main>;

  const cambiarEstado = (p: PersonaConvenio, nuevo: string, contactado = false) => startTransition(async () => {
    try { await actualizarEstadoPersona(p.id, props.empresaConvenioId, nuevo, contactado); router.refresh(); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/convenios">← Convenios</Link><p className="eyebrow">CLIENTES POTENCIALES · CONVENIO</p><h1>{props.empresaNombre}</h1><p className="subtitle">Personas del convenio aunque todavía no sean pacientes. Si la cédula ya existe como paciente, se enlaza sola.</p></div>
      <button className="new-task" type="button" onClick={() => setAdding(true)}><UserPlus size={18} /> Agregar persona</button></header>
    {notice && <div className="notice"><span>{notice}</span></div>}
    <section className="glass agenda-board">
      <p className="section-label">MENSAJE DE INVITACIÓN</p>
      <p className="field-hint">Usa {"{nombre}"} donde va el nombre de la persona. Se guarda para este convenio.</p>
      <div className="new-patient-form"><label><textarea rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} /></label></div>
      <button className="outline-action" type="button" disabled={pending} onClick={() => startTransition(async () => { try { await guardarMensajeInvitacion(props.empresaConvenioId, mensaje); setNotice("Mensaje guardado."); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo guardar."); } })}>Guardar mensaje</button>
    </section>
    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs" style={{ flexWrap: "wrap" }}>{["todos", ...Object.keys(estadoLabel)].map((e) => <button key={e} type="button" className={estado === e ? "active" : ""} onClick={() => setEstado(e)}>{e === "todos" ? "Todos" : estadoLabel[e]} ({conteo(e)})</button>)}</div>
        <label className="new-patient-form" style={{ flex: 1, minWidth: 200 }}><input placeholder="Buscar por nombre, cédula o cargo" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
      {visibles.length ? <div className="task-list">{visibles.map((p) => {
        const nombre = `${p.nombres} ${p.apellidos ?? ""}`.trim();
        const wa = enlaceWhatsapp(p.telefono, mensaje.replaceAll("{nombre}", p.nombres.split(/\s+/)[0] ?? p.nombres));
        return <article className="task-card" key={p.id}><div className="task-status"><span className={`status-dot ${p.estado === "cliente" ? "aprobada" : p.estado === "no_interesado" ? "devuelta" : ""}`} /></div>
          <div className="task-main"><div className="task-meta">{p.cargo && <span>{p.cargo}</span>}{p.cedula && <span>{p.cedula}</span>}{p.telefono && <span>{p.telefono}</span>}{p.paciente_id && <span>Ya es paciente</span>}{p.ultimo_contacto && <span>Contactado {formatRecordDate(p.ultimo_contacto)}</span>}</div>
            <h2>{nombre}</h2>{p.notas && <p>{p.notas}</p>}</div>
          <div className="task-actions">
            {wa ? <a className="new-consultation" href={wa} target="_blank" rel="noreferrer" onClick={() => { if (p.estado === "nuevo") cambiarEstado(p, "contactado", true); }}><MessageCircle size={14} /> WhatsApp</a> : <span className="field-hint">Sin teléfono</span>}
            {p.paciente_id ? <Link className="outline-action" href={`/pacientes?paciente=${p.paciente_id}`}><FolderOpen size={14} /> Abrir carpeta</Link> : <button className="outline-action" type="button" disabled={pending} onClick={() => crearCarpeta(p)}><FolderPlus size={14} /> Crear carpeta</button>}
            <select value={p.estado} disabled={pending} onChange={(e) => cambiarEstado(p, e.target.value, e.target.value === "contactado")}>{Object.entries(estadoLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div></article>;
      })}</div> : <section className="empty-state"><Users size={27} /><h3>No hay personas en esta vista</h3><p>Agrégalas una por una o envía la lista en la plantilla de Excel para cargarla.</p></section>}
    </section>
    {adding && <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="persona-title">
      <button className="modal-close" onClick={() => setAdding(false)} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">{props.empresaNombre.toUpperCase()}</p><h2 id="persona-title">Agregar persona</h2>
      <form className="new-patient-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(async () => { try { await agregarPersonaConvenio(form); setAdding(false); router.refresh(); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo agregar."); setAdding(false); } }); }}>
        <input type="hidden" name="empresa_convenio_id" value={props.empresaConvenioId} />
        <label>Nombres<input name="nombres" required /></label><label>Apellidos<input name="apellidos" /></label>
        <label>Cédula<input name="cedula" inputMode="numeric" /></label><label>WhatsApp<input name="telefono" inputMode="tel" /></label>
        <label>Correo<input name="email" type="email" /></label><label>Cargo o área<input name="cargo" /></label>
        <label>Sucursal más cercana<select name="sucursal_id" defaultValue=""><option value="">Sin definir</option>{props.branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
        <label>Notas<textarea name="notas" rows={2} /></label>
        <div className="modal-actions"><button className="outline-action" type="button" onClick={() => setAdding(false)}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>Guardar</button></div>
      </form>
    </section></div>}
  </div></main>;
}
