"use client";

import Link from "next/link";
import { AlertTriangle, CircleAlert, Copy, FileText, MessageCircle, MoreVertical, Printer, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CuentasCobrarData, DeudaPaciente, EmpresaConvenio } from "@/lib/cuentas-cobrar";
import { construirMensajeContacto, plantillasContacto, type PlantillaContactoId } from "@/lib/mensajes";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { crearAcuerdoPago, crearEmpresaConvenio, type AcuerdoPago } from "@/app/ventas/convenio-actions";
import { activarCobroInsistente, actualizarFrecuenciaCobro } from "./actions";
import Letterhead from "../print-letterhead";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const frecuenciaLabel: Record<string, string> = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };

export default function CuentasCobrarBoard(props: CuentasCobrarData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, startTransition] = useTransition();
  const [convenioDeuda, setConvenioDeuda] = useState<DeudaPaciente | null>(null);

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cuentas por cobrar</h1><p className="subtitle">{props.message ?? "No se pudo abrir cuentas por cobrar."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/cuentas-cobrar">Iniciar sesión</Link>}</header></div></main>;

  const totalDeuda = props.deudas.reduce((sum, d) => sum + d.saldo_total, 0);

  const cambiarFrecuencia = (pacienteId: string, frecuencia: string) => startTransition(async () => {
    try { await actualizarFrecuenciaCobro(pacienteId, frecuencia); setNotice("Frecuencia de cobro actualizada."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar la frecuencia."); }
  });
  const cambiarCobroInsistente = (pacienteId: string, activo: boolean) => startTransition(async () => {
    try { await activarCobroInsistente(pacienteId, activo); setNotice(activo ? "Cobro insistente marcado. La automatización con Make sigue pendiente; todavía no se enviaron mensajes." : "Cobro insistente desactivado."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar el cobro insistente."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cuentas por cobrar</h1><p className="subtitle">Pacientes con saldo pendiente, listos para contactar por WhatsApp.</p></div></header>
    <section className="agenda-summary"><article><Wallet size={21} /><strong>{money(totalDeuda)}</strong><span>saldo total pendiente</span></article><article><CircleAlert size={21} /><strong>{props.deudas.length}</strong><span>pacientes con deuda</span></article></section>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "El saldo se calcula solo desde las ventas completadas; los abonos lo actualizan automáticamente."}</span></div>
    <div className="make-status"><AlertTriangle size={18} /><span><strong>Automatización diaria con Make:</strong> {props.makeConfigured ? "el enlace técnico está configurado, pero el envío de datos permanece pausado hasta tu autorización final." : "pendiente de conectar. Los mensajes manuales por WhatsApp ya se pueden usar y revisar."}</span></div>

    <section className="glass agenda-board">
      <p className="section-label">PACIENTES CON SALDO PENDIENTE</p><h2>Cuentas por cobrar</h2>
      {props.deudas.length ? <div className="task-list">{props.deudas.map((deuda) => <DeudaCard key={deuda.paciente_id} deuda={deuda} pending={pending} onFrecuencia={(f) => cambiarFrecuencia(deuda.paciente_id, f)} onCobroInsistente={(activo) => cambiarCobroInsistente(deuda.paciente_id, activo)} onConvenio={() => setConvenioDeuda(deuda)} />)}</div> : <section className="empty-state"><Wallet size={27} /><h3>No hay saldos pendientes</h3><p>Cuando una venta quede con saldo aparecerá aquí.</p></section>}
    </section>
    {convenioDeuda && <ConvenioModal deuda={convenioDeuda} empresasConvenio={props.empresasConvenio} onClose={() => setConvenioDeuda(null)} onNotice={setNotice} />}
  </div></main>;
}

function DeudaCard({ deuda, pending, onFrecuencia, onCobroInsistente, onConvenio }: { deuda: DeudaPaciente; pending: boolean; onFrecuencia: (frecuencia: string) => void; onCobroInsistente: (activo: boolean) => void; onConvenio: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [plantilla, setPlantilla] = useState<PlantillaContactoId>(deuda.frecuencia_cobro === "mensual" ? "cobro_mensual" : "cobro_insistente");
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nombre = `${deuda.nombres} ${deuda.apellidos}`;
  const token = deuda.ventas[0]?.recibo_token;
  const ticketUrl = origin && token ? `${origin}/recibo/${token}` : null;
  const mensaje = construirMensajeContacto(plantilla, { nombre: deuda.nombres, empresa: deuda.empresa_nombre, saldo: deuda.saldo_total, ticketUrl });
  const wa = enlaceWhatsapp(deuda.telefono, mensaje);
  const closeMenu = () => setMenuOpen(false);
  const copiarMensaje = async () => {
    try { await navigator.clipboard.writeText(mensaje); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (!menuOpen) return; const onClick = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu(); }; document.addEventListener("mousedown", onClick); return () => document.removeEventListener("mousedown", onClick); }, [menuOpen]);

  return <article className="task-card"><div className="task-status" /><div className="task-main">
    <div className="task-meta"><span>{deuda.empresa_nombre}</span><span>{deuda.telefono || "Sin WhatsApp registrado"}</span>{deuda.cobro_insistente && <span className="urgente"><AlertTriangle size={11} /> Cobro insistente</span>}</div>
    <h2>{nombre}</h2>
    <p>Deuda: <strong>{money(deuda.saldo_total)}</strong> · {deuda.ventas.length} venta(s) pendiente(s): {deuda.ventas.map((v) => `${formatDate(v.creado_en)} (${money(v.saldo)})`).join(", ")}</p>
    <div className="collection-controls">
      <label>Mensaje a enviar<select value={plantilla} onChange={(event) => setPlantilla(event.target.value as PlantillaContactoId)}>{plantillasContacto.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label>Frecuencia de cobro<select defaultValue={deuda.frecuencia_cobro ?? ""} disabled={pending} onChange={(event) => onFrecuencia(event.target.value)}><option value="">Sin definir</option>{Object.entries(frecuenciaLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="message-preview"><span>Vista previa</span><p>{mensaje}</p><button className="outline-action" type="button" onClick={copiarMensaje}><Copy size={13} /> {copied ? "Copiado" : "Copiar mensaje"}</button></div>
  </div><div className="task-actions">
    {wa ? <a className="new-consultation" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Enviar mensaje elegido</a> : <span style={{ color: "#a24150", fontSize: 12, fontWeight: 700 }}>Sin WhatsApp registrado</span>}
    <div className="menu-wrap" ref={menuRef}>
      <button className="outline-action" type="button" onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={14} /> Más opciones</button>
      {menuOpen && <div className="menu-dropdown">
        <button type="button" onClick={() => { onConvenio(); closeMenu(); }}><FileText size={14} /> Convenio de pago</button>
        <button type="button" className={deuda.cobro_insistente ? "danger" : ""} onClick={() => { onCobroInsistente(!deuda.cobro_insistente); closeMenu(); }}><AlertTriangle size={14} /> {deuda.cobro_insistente ? "Quitar cobro insistente" : "Activar cobro insistente"}</button>
      </div>}
    </div>
  </div></article>;
}

function ConvenioModal({ deuda, empresasConvenio, onClose, onNotice }: { deuda: DeudaPaciente; empresasConvenio: EmpresaConvenio[]; onClose: () => void; onNotice: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [ventaId, setVentaId] = useState(deuda.ventas[0]?.id ?? "");
  const [empresaConvenioId, setEmpresaConvenioId] = useState(empresasConvenio[0]?.id ?? "");
  const [nuevaEmpresa, setNuevaEmpresa] = useState("");
  const [cuotas, setCuotas] = useState(3);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<AcuerdoPago | null>(null);
  const ventaSeleccionada = deuda.ventas.find((v) => v.id === ventaId);

  const crearEmpresa = () => start(async () => {
    setError("");
    try { const id = await crearEmpresaConvenio(nuevaEmpresa); setEmpresaConvenioId(id); setNuevaEmpresa(""); onNotice("Empresa de convenio creada."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la empresa."); }
  });
  const generar = () => start(async () => {
    setError("");
    if (!ventaId || !empresaConvenioId) { setError("Elige la venta y la empresa de convenio."); return; }
    try { const acuerdo = await crearAcuerdoPago(ventaId, empresaConvenioId, cuotas); setResultado(acuerdo); onNotice("Acuerdo de pago generado."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo generar el acuerdo de pago."); }
  });

  if (resultado) return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className="print-area print-a4">
      <Letterhead company={{ nombre: resultado.empresa_nombre ?? "LUMOS", direccion: resultado.empresa_direccion, telefono: resultado.empresa_telefono, email: resultado.empresa_email, logo_url: resultado.empresa_logo_url }} subtitle={resultado.sucursal_nombre ?? undefined} />
      <p className="print-center" style={{ fontWeight: 800, fontSize: 17, margin: "6px 0 14px" }}>Solicitud de Financiamiento</p>

      <div className="consultation-stats">
        <span><strong>Paciente</strong>{resultado.paciente_nombre}</span>
        {resultado.paciente_cedula && <span><strong>Cédula</strong>{resultado.paciente_cedula}</span>}
        {resultado.paciente_telefono && <span><strong>Celular</strong>{resultado.paciente_telefono}</span>}
        {resultado.paciente_ocupacion && <span><strong>Ocupación</strong>{resultado.paciente_ocupacion}</span>}
        <span><strong>Empresa convenio</strong>{resultado.empresa_convenio_nombre}</span>
        {resultado.atendio_nombre && <span><strong>Atendió</strong>{resultado.atendio_nombre}</span>}
        {resultado.folio != null && <span><strong>Folio de la venta</strong>#{resultado.folio}</span>}
      </div>

      <p className="section-label" style={{ marginTop: 14 }}>DETALLE DEL PRESUPUESTO</p>
      {resultado.items.map((item, index) => <p key={index} style={{ margin: "4px 0", fontSize: 13 }}>{item.descripcion} (${item.precio_unitario.toFixed(2)} x{item.cantidad}) <strong style={{ float: "right" }}>{money(item.total_linea)}</strong></p>)}
      <div className="consultation-stats" style={{ marginTop: 8 }}>
        <span><strong>Total</strong>{money(resultado.total)}</span>
        <span><strong>A cuenta</strong>{money(resultado.pagado)}</span>
        <span><strong>Saldo a financiar</strong>{money(resultado.saldo)}</span>
        <span><strong>Cuota</strong>{money(resultado.monto_cuota)} x {resultado.cuotas}</span>
        <span><strong>Primera cuota</strong>{formatDate(resultado.fecha_primera_cuota)}</span>
      </div>

      {resultado.abonos.length > 0 && <><p className="section-label" style={{ marginTop: 14 }}>DETALLE DE ABONOS</p>{resultado.abonos.map((abono, index) => <p key={index} style={{ margin: "4px 0", fontSize: 13 }}>{formatDate(abono.fecha)} · {abono.metodo} <strong style={{ float: "right" }}>{money(abono.monto)}</strong></p>)}</>}

      <p className="section-label" style={{ marginTop: 14 }}>TÉRMINOS Y CONDICIONES</p>
      <p style={{ whiteSpace: "pre-line", lineHeight: 1.6, fontSize: 13 }}>{resultado.texto}</p>

      <div className="print-center" style={{ marginTop: 46 }}>
        <div style={{ borderTop: "1px solid #34455c", width: 260, margin: "0 auto" }} />
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>Nombre y firma del solicitante</p>
      </div>
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="new-consultation" type="button" onClick={() => window.print()}><Printer size={15} /> Imprimir</button></div>
  </section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="convenio-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">CONVENIO DE PAGO</p>
    <h2 id="convenio-title">{deuda.nombres} {deuda.apellidos}</h2>
    <p>Genera un acuerdo de pago por descuento a rol de pagos a través de una empresa convenio.</p>
    <div className="new-patient-form">
      <label className="task-description">Venta<select value={ventaId} onChange={(event) => setVentaId(event.target.value)}>{deuda.ventas.map((v) => <option key={v.id} value={v.id}>{formatDate(v.creado_en)} · Saldo {money(v.saldo)}</option>)}</select></label>
      <label className="task-description">Empresa convenio{empresasConvenio.length ? <select value={empresaConvenioId} onChange={(event) => setEmpresaConvenioId(event.target.value)}>{empresasConvenio.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select> : <span className="field-hint">Todavía no hay empresas de convenio registradas.</span>}</label>
      <label className="task-description">Nueva empresa de convenio (opcional)<span style={{ display: "flex", gap: 6 }}><input value={nuevaEmpresa} onChange={(event) => setNuevaEmpresa(event.target.value)} placeholder="Ej.: Municipio de Shushufindi" style={{ flex: 1 }} /><button type="button" className="outline-action" disabled={pending || !nuevaEmpresa.trim()} onClick={crearEmpresa}>Agregar</button></span></label>
      <label>Número de cuotas<input type="number" min={1} value={cuotas} onChange={(event) => setCuotas(Number(event.target.value) || 1)} /></label>
      {ventaSeleccionada && cuotas > 0 && <p className="field-hint">Cuota estimada: {money(ventaSeleccionada.saldo / cuotas)} c/u</p>}
    </div>
    {error && <p className="notice">{error}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !ventaId || !empresaConvenioId} type="button" onClick={generar}>{pending ? "Generando…" : "Generar acuerdo"}</button></div>
  </section></div>;
}
