"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Cake, CalendarClock, Coins, Eye, FolderOpen, MessageCircle, Power } from "lucide-react";
import type { MensajesDiaData } from "@/lib/mensajes-dia";
import { mensajeControl, mensajeCumpleanos, type ControlPendiente, type CumpleanosHoy } from "@/lib/mensajes-dia-textos";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { ColaCobrosHoy } from "@/app/cuentas-cobrar/cuentas-cobrar-board";
import { configurarMensajesAutomaticos, marcarMensajeDia } from "./actions";
import PlantillasPanel from "./plantillas-panel";
import { renderPlantilla } from "@/lib/plantillas-mensajes";

type Tab = "cobros" | "cumpleanos" | "controles" | "plantillas";
const fecha = (ymd: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${ymd.slice(0, 10)}T12:00:00-05:00`));

export default function MensajesBoard(props: MensajesDiaData) {
  const [tab, setTab] = useState<Tab>("cobros");
  if (props.status !== "ready" || !props.dia) return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">CONTACTO CON PACIENTES</p><h1>Mensajes del día</h1><p className="subtitle">{props.message ?? "No se pudo abrir esta sección."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/mensajes">Iniciar sesión</Link>}</header></div></main>;

  const { dia } = props;
  // El envío con un toque usa el mismo texto de la plantilla activa (si existe) que el envío automático.
  const optica = /focus/i.test(props.empresaNombre ?? "") ? "Focus Óptica" : "ShuVision Óptica";
  const activa = (tipo: string) => props.plantillas.find((p) => p.tipo === tipo && p.activa)?.texto;
  const primer = (n: string) => { const x = n.trim().split(/\s+/)[0] ?? ""; return x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : ""; };
  const textoCumple = (n: string) => { const t = activa("cumpleanos"); return t ? renderPlantilla(t, { nombre: primer(n), optica }) : mensajeCumpleanos(n, props.empresaId); };
  const textoControl = (n: string, meses: number) => { const t = activa(meses >= 10 ? "control_anual" : "control_periodico"); return t ? renderPlantilla(t, { nombre: primer(n), optica, meses: String(meses) }) : mensajeControl(n, meses, props.empresaId); };
  const cumplePend = dia.cumpleanos.filter((c) => !c.enviado_en && !c.enviado_auto).length;
  const controlPend = dia.controles.filter((c) => !c.enviado_en && !c.enviado_auto).length;

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">CONTACTO CON PACIENTES · {props.sucursalNombre}</p><h1>Mensajes del día</h1><p className="subtitle">Cobros, cumpleaños y controles anuales de hoy, con el mensaje listo para enviar por WhatsApp.</p></div></header>
    <section className="agenda-summary">
      <article><Coins size={21} /><strong>{props.colaHoy.length}</strong><span>cobros por contactar</span></article>
      <article><Cake size={21} /><strong>{cumplePend}</strong><span>cumpleaños por saludar</span></article>
      <article><CalendarClock size={21} /><strong>{controlPend}</strong><span>controles por avisar</span></article>
    </section>
    <AutomaticosPanel {...props} />
    <section className="glass agenda-board">
      <div className="tabs" role="tablist" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <button role="tab" type="button" className={tab === "cobros" ? "active" : ""} onClick={() => setTab("cobros")}>Cobros ({props.colaHoy.length})</button>
        <button role="tab" type="button" className={tab === "cumpleanos" ? "active" : ""} onClick={() => setTab("cumpleanos")}>Cumpleaños de hoy ({dia.cumpleanos.length})</button>
        <button role="tab" type="button" className={tab === "controles" ? "active" : ""} onClick={() => setTab("controles")}>Controles ({dia.controles.length})</button>
        {props.esSuperadmin && <button role="tab" type="button" className={tab === "plantillas" ? "active" : ""} onClick={() => setTab("plantillas")}>Plantillas</button>}
      </div>
      {tab === "plantillas" && props.esSuperadmin && props.empresaId && <PlantillasPanel plantillas={props.plantillas} empresaId={props.empresaId} empresaNombre={props.empresaNombre} />}
      {tab === "cobros" && <ColaCobrosHoy cola={props.colaHoy} sucursalId={props.sucursalId} sucursalNombre={props.sucursalNombre} error={props.colaHoyError} />}
      {tab === "cumpleanos" && <Lista
        titulo={`Cumpleaños de hoy · ${props.sucursalNombre}`}
        ayuda="Saludo con regalo: ajuste gratis y 15 % de descuento durante un mes."
        vacio="Hoy no cumple años ningún paciente de esta sucursal."
        items={dia.cumpleanos.map((c: CumpleanosHoy) => ({ id: c.paciente_id, nombre: c.nombre, telefono: c.telefono, enviadoEn: c.enviado_en, auto: c.enviado_auto, referencia: null, detalle: c.edad ? `Cumple ${c.edad} años` : "Cumple años hoy", badges: [], mensaje: textoCumple(c.nombres || c.nombre) }))}
        motivo="cumpleanos" {...props} />}
      {tab === "controles" && <Lista
        titulo={`Controles · ${props.sucursalNombre}`}
        ayuda="Controles programados (3, 6 o 12 meses) y, cada año, el aniversario de la última revisión (también las importadas de Optox) para mantener la relación con el paciente."
        vacio="No hay controles por avisar hoy en esta sucursal."
        items={dia.controles.map((c: ControlPendiente) => ({ id: c.paciente_id, nombre: c.nombre, telefono: c.telefono, enviadoEn: c.enviado_en, auto: c.enviado_auto, referencia: c.consulta_id, detalle: c.tipo === "aniversario" ? `Última revisión: ${fecha(c.ultima_revision)} · cumple ${c.anios} ${c.anios === 1 ? "año" : "años"} el ${fecha(c.vence)}` : `Última revisión: ${fecha(c.ultima_revision)} · control programado el ${fecha(c.vence)}`, badges: [c.tipo === "aniversario" ? "Control anual" : c.meses >= 10 ? "Control anual" : `Control de ${c.meses} meses`, ...(c.make_ya_envio ? ["Make ya le escribió"] : [])], mensaje: textoControl(c.nombres || c.nombre, c.meses) }))}
        motivo="control" {...props} />}
    </section>
  </div></main>;
}

type Item = { id: string; nombre: string; telefono: string | null; enviadoEn: string | null; auto: boolean; referencia: string | null; detalle: string; badges: string[]; mensaje: string };

function Lista({ titulo, ayuda, vacio, items, motivo, empresaId, sucursalId }: { titulo: string; ayuda: string; vacio: string; items: Item[]; motivo: "cumpleanos" | "control" } & MensajesDiaData) {
  const [enviados, setEnviados] = useState<string[]>([]);
  const [verMensaje, setVerMensaje] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const pendientes = items.filter((i) => !i.enviadoEn && !i.auto && !enviados.includes(i.id));
  const marcar = (item: Item, abrir: boolean) => {
    if (!empresaId || !sucursalId) return;
    if (abrir) {
      const url = enlaceWhatsapp(item.telefono, item.mensaje);
      if (!url) return;
      const ventana = window.open(url, "_blank");
      if (!ventana) { setAviso("Permite las ventanas emergentes para abrir WhatsApp."); return; }
      ventana.opener = null;
    }
    setEnviados((prev) => [...prev, item.id]);
    setAviso(`Enviado ✓ · ${item.nombre}`);
    void marcarMensajeDia({ pacienteId: item.id, empresaId, sucursalId, motivo, referenciaId: item.referencia }).catch((err) => {
      setEnviados((prev) => prev.filter((id) => id !== item.id));
      setAviso(err instanceof Error ? err.message : "No se pudo registrar el envío.");
    });
  };
  return <section className="cob-queue" aria-label={titulo}>
    <div className="cob-heading"><div><h2>{titulo}</h2><p><strong>{pendientes.length}</strong> mensajes pendientes · {items.length - pendientes.length} enviados</p></div>
      <button className="new-consultation" type="button" disabled={!pendientes.length} onClick={() => { const primero = pendientes[0]; if (primero) marcar(primero, !!enlaceWhatsapp(primero.telefono, "")); }}>Modo seguido · Siguiente</button></div>
    <p className="field-hint">{ayuda} Se envía desde el WhatsApp de esta sucursal y queda registrado en Comunicaciones del paciente.</p>
    {aviso && <p className="cob-feedback" role="status">{aviso}</p>}
    {items.length ? <div className="cob-list">{items.map((item) => {
      const hecho = !!item.enviadoEn || item.auto || enviados.includes(item.id);
      const tieneWhatsapp = !!enlaceWhatsapp(item.telefono, "");
      return <article className="cob-row" key={item.id} style={hecho ? { opacity: 0.6 } : undefined}>
        <div className="cob-row-main"><h3>{item.nombre}</h3>{item.badges.map((b) => <span key={b} className="cob-badge">{b}</span>)}{hecho && <span className="cob-badge">{item.auto ? "Enviado automáticamente" : "Enviado"}</span>}<p>{item.detalle}{item.telefono ? ` · ${item.telefono}` : ""}</p>
          {verMensaje === item.id && <p style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "rgba(255,255,255,.75)", padding: 12, borderRadius: 12 }}>{item.mensaje}</p>}</div>
        <div className="cob-row-action">
          <button className="text-action" type="button" onClick={() => setVerMensaje(verMensaje === item.id ? null : item.id)}><Eye size={14} /> {verMensaje === item.id ? "Ocultar" : "Ver mensaje"}</button>
          <Link className="text-action" href={`/pacientes?buscar=${encodeURIComponent(item.nombre.trim())}`}><FolderOpen size={14} /> Carpeta</Link>
          {!hecho && (tieneWhatsapp
            ? <button className="new-consultation" type="button" onClick={() => marcar(item, true)}><MessageCircle size={14} /> Enviar por WhatsApp</button>
            : <><span>Sin WhatsApp registrado</span><button className="outline-action" type="button" onClick={() => marcar(item, false)}>Marcar como avisado</button></>)}
        </div>
      </article>;
    })}</div> : <p className="cob-empty">{vacio}</p>}
  </section>;
}

function AutomaticosPanel({ config, esSuperadmin, empresaId, empresaNombre, whatsappConectado, numeros }: MensajesDiaData) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [cumple, setCumple] = useState(config?.cumpleanos ?? true);
  const [control, setControl] = useState(config?.control_anual ?? true);
  const [cobros, setCobros] = useState(config?.cobros ?? true);
  if (!config || !empresaId) return null;
  const numeroConectado = numeros.some((n) => n.conectado);
  const listo = whatsappConectado && numeroConectado;
  const guardar = (activo: boolean, c = cumple, k = control, b = cobros) => start(async () => {
    setError("");
    try { await configurarMensajesAutomaticos({ empresaId, activo, cumpleanos: c, control: k, cobros: b }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); }
  });
  return <section className="glass agenda-board" style={{ marginBottom: 16 }}>
    <div className="cob-heading"><div><h2><Bot size={18} style={{ verticalAlign: "-3px" }} /> Mensajes automáticos · {empresaNombre}</h2>
      <p>{config.activo ? <span className="state-pill aprobada">Activos (con costo en Meta)</span> : <span className="state-pill">Pausados · sin costo</span>} Cada día a las 11:00, cada sucursal envía desde su propio WhatsApp: cumpleaños, controles (hasta 30 por día) y los cobros de los pacientes con “Envío automático” activado en Cuentas por cobrar, según su frecuencia.</p></div>
      {esSuperadmin && <button className={config.activo ? "outline-action" : "new-consultation"} type="button" disabled={pending || (!config.activo && !listo)} onClick={() => { if (!config.activo && !window.confirm("Meta (WhatsApp) cobra cada mensaje automático enviado: alrededor de $0,01 los de cobro/control y $0,07 los de cumpleaños. El envío con un toque desde el celular es gratis. ¿Activar de todas formas?")) return; guardar(!config.activo); }}><Power size={14} /> {config.activo ? "Pausar mensajes automáticos" : "Activar mensajes automáticos"}</button>}
    </div>
    {esSuperadmin && <div className="collection-controls" style={{ marginTop: 8 }}>
      <label><input type="checkbox" checked={cumple} disabled={pending} onChange={(e) => { setCumple(e.target.checked); if (config.activo) guardar(true, e.target.checked, control, cobros); }} /> Cumpleaños</label>
      <label><input type="checkbox" checked={control} disabled={pending} onChange={(e) => { setControl(e.target.checked); if (config.activo) guardar(true, cumple, e.target.checked, cobros); }} /> Controles</label>
      <label><input type="checkbox" checked={cobros} disabled={pending} onChange={(e) => { setCobros(e.target.checked); if (config.activo) guardar(true, cumple, control, e.target.checked); }} /> Cobros con envío automático</label>
    </div>}
    {!whatsappConectado && <p className="notice">Para que se envíen solos falta conectar el WhatsApp oficial (token de Meta). Mientras tanto, envíalos con un toque desde las pestañas de abajo.</p>}
    <p className="field-hint">{numeros.map((n) => `${n.nombre}: ${n.conectado ? `conectado${n.numero ? ` (${n.numero})` : ""}` : "número pendiente de conectar"}`).join(" · ")}</p>
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
