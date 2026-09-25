"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, FolderOpen, MessageCircle, NotebookPen, Users, X } from "lucide-react";
import { motivoLabels, type CrmData, type CrmItem, type CrmMotivo } from "@/lib/crm-labels";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { formatRecordDate } from "@/lib/record-date";
import { registrarContactoCrm } from "./actions";

const motivos: CrmMotivo[] = ["examen_sin_compra", "lentes_listos", "control", "postventa", "cumpleanos", "inactivo"];

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0]?.toLowerCase().replace(/^./, (c) => c.toUpperCase()) ?? "";

function mensaje(item: CrmItem, empresa: string) {
  const n = primerNombre(item.nombre);
  switch (item.motivo) {
    case "control": return `Hola ${n}, te saludamos de ${empresa}. Ya te corresponde tu control visual. ¿Te agendamos una cita esta semana?`;
    case "examen_sin_compra": return `Hola ${n}, te saludamos de ${empresa}. Gracias por realizar tu examen visual con nosotros. ¿Pudiste elegir tus lentes? Te ayudamos con opciones y facilidades de pago.`;
    case "lentes_listos": return `Hola ${n}, te saludamos de ${empresa}. Tus lentes ya están listos para retirar. ¡Te esperamos!`;
    case "postventa": return `Hola ${n}, te saludamos de ${empresa}. ¿Cómo te has adaptado a tus nuevos lentes? Si sientes alguna molestia, con gusto te ayudamos.`;
    case "cumpleanos": return `¡Feliz cumpleaños, ${n}! De parte de todo el equipo de ${empresa} te deseamos un excelente día.`;
    case "inactivo": return `Hola ${n}, te saludamos de ${empresa}. Hace tiempo no revisamos tu visión. ¿Te gustaría agendar un control?`;
  }
}

function detalle(item: CrmItem) {
  const fecha = item.fecha_referencia ? formatRecordDate(item.fecha_referencia) : "";
  switch (item.motivo) {
    case "control": return `${item.detalle}${fecha ? ` · ${fecha}` : ""}`;
    case "examen_sin_compra": return `Examen del ${fecha} sin compra`;
    case "lentes_listos": return `Lentes listos desde el ${fecha}`;
    case "postventa": return `Lentes entregados el ${fecha}`;
    case "cumpleanos": return `Cumple el ${fecha}`;
    case "inactivo": return `Última visita o compra: ${fecha}`;
  }
}

export default function CrmBoard(props: CrmData) {
  const [tab, setTab] = useState<CrmMotivo>("examen_sin_compra");
  const [registrando, setRegistrando] = useState<CrmItem | null>(null);
  const [notice, setNotice] = useState("");
  const counts = useMemo(() => Object.fromEntries(motivos.map((m) => [m, props.items.filter((i) => i.motivo === m).length])) as Record<CrmMotivo, number>, [props.items]);
  const visibles = props.items.filter((i) => i.motivo === tab);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">RELACIÓN CON PACIENTES</p><h1>CRM</h1><p className="subtitle">{props.message ?? "No se pudo abrir el CRM."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/crm">Iniciar sesión</Link>}</header></div></main>;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">RELACIÓN CON PACIENTES · {props.empresaNombre}</p><h1>A quién contactar hoy</h1><p className="subtitle">Abre el WhatsApp con el mensaje listo, envíalo tú y registra el contacto. Nada se envía solo.</p></div></header>
    <section className="agenda-summary"><article><Users size={21} /><strong>{props.items.length}</strong><span>pacientes por contactar</span></article><article><CalendarHeart size={21} /><strong>{counts.cumpleanos}</strong><span>cumpleaños esta semana</span></article></section>
    {notice && <div className="notice"><span>{notice}</span></div>}
    <section className="glass agenda-board">
      <div className="agenda-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="tabs" role="tablist">{motivos.map((m) => <button key={m} role="tab" type="button" className={tab === m ? "active" : ""} onClick={() => setTab(m)}>{motivoLabels[m]} ({counts[m]})</button>)}</div>
        {props.branches.length > 1 && <div className="tabs">{[{ id: "todas", nombre: "Todas" }, ...props.branches].map((b) => <Link key={b.id} className={props.sucursalId === b.id ? "active" : ""} href={`/crm?sucursal=${b.id}`}>{b.nombre}</Link>)}</div>}
      </div>
      {visibles.length ? <div className="task-list">{visibles.map((item) => {
        const wa = enlaceWhatsapp(item.telefono, mensaje(item, props.empresaNombre ?? ""));
        return <article className="task-card" key={`${item.motivo}-${item.paciente_id}-${item.referencia_id ?? ""}`}>
          <div className="task-status"><span className="status-dot" /></div>
          <div className="task-main"><div className="task-meta"><span>{motivoLabels[item.motivo]}</span>{item.telefono && <span>{item.telefono}</span>}{item.ultimo_contacto && <span>Último contacto {formatRecordDate(item.ultimo_contacto)}</span>}</div>
            <h2>{item.nombre}</h2><p>{detalle(item)}</p></div>
          <div className="task-actions">
            {wa ? <a className="outline-action" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a> : <span className="field-hint">Sin teléfono</span>}
            <button className="outline-action" type="button" onClick={() => setRegistrando(item)}><NotebookPen size={14} /> Registrar contacto</button>
            <Link className="text-action" href={`/pacientes?buscar=${encodeURIComponent(item.nombre.trim())}`}><FolderOpen size={14} /> Abrir carpeta</Link>
          </div>
        </article>;
      })}</div> : <section className="empty-state"><Users size={27} /><h3>Nada pendiente en esta lista</h3><p>Cuando haya pacientes para contactar aparecerán aquí.</p></section>}
    </section>
    {registrando && <RegistrarModal item={registrando} empresaId={props.empresaId ?? ""} onClose={(msg) => { setRegistrando(null); if (msg) setNotice(msg); }} />}
  </div></main>;
}

function RegistrarModal({ item, empresaId, onClose }: { item: CrmItem; empresaId: string; onClose: (message?: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="crm-registro-title">
    <button className="modal-close" onClick={() => onClose()} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">{motivoLabels[item.motivo].toUpperCase()}</p><h2 id="crm-registro-title">{item.nombre}</h2><p>{detalle(item)}</p>
    <form className="new-patient-form" onSubmit={(event) => {
      event.preventDefault(); setError("");
      const form = new FormData(event.currentTarget);
      startTransition(async () => {
        try { await registrarContactoCrm(form); router.refresh(); onClose("Contacto registrado."); }
        catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el contacto."); }
      });
    }}>
      <input type="hidden" name="paciente_id" value={item.paciente_id} /><input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="sucursal_id" value={item.sucursal_id ?? ""} /><input type="hidden" name="motivo" value={item.motivo} />
      <input type="hidden" name="referencia_id" value={item.referencia_id ?? ""} />
      <label>Canal<select name="canal" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="llamada">Llamada</option><option value="presencial">Presencial</option></select></label>
      <label>Resultado<select name="resultado" defaultValue="enviado"><option value="enviado">Mensaje enviado</option><option value="respondio">Respondió</option><option value="agendo">Agendó cita</option><option value="compro">Compró</option><option value="no_contesta">No contesta</option><option value="no_interesado">No está interesado</option></select></label>
      <label>Volver a contactar el (opcional)<input name="proximo_seguimiento" type="date" /></label>
      <label>Nota<textarea name="nota" rows={3} maxLength={2000} /></label>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="modal-actions"><button className="outline-action" type="button" onClick={() => onClose()}>Cancelar</button><button className="new-consultation" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar contacto"}</button></div>
    </form>
  </section></div>;
}
