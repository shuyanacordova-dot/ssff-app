"use client";
import { paymentMethodLabels } from "@/lib/payment-methods";
import { printDocumentById } from "@/lib/print-document";

import Link from "next/link";
import { AlertTriangle, CircleAlert, Copy, FileText, FlaskConical, MessageCircle, MoreVertical, PackageCheck, Printer, Repeat, Tag, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CategoriaDeuda, CuentasCobrarData, DeudaPaciente, EmpresaConvenio, LenteRezagado, CobroHoy } from "@/lib/cuentas-cobrar";
import { DIAS_APARTADO, DIAS_REZAGO, DIAS_URGENTE } from "@/lib/cuentas-cobrar-config";
import { laboratorioLabels } from "@/lib/laboratorio";
import { cambiarEstadoOrdenLaboratorio } from "@/app/ventas/lab-actions";
import { construirMensajeContacto, plantillasContacto, plantillaSugerida, type PlantillaContactoId } from "@/lib/mensajes";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { buscarTitularConvenio, crearAcuerdoPago, crearEmpresaConvenio, type AcuerdoPago, type PersonaTitular } from "@/app/ventas/convenio-actions";
import { cambiarCobroAutomatico, activarCobroInsistente, actualizarFrecuenciaCobro, clasificarDeuda, titularSugeridoConvenio, vincularConvenio, fijarFechaCobro, marcarApartado, marcarMensajeCobro, registrarCanje } from "./actions";
import Letterhead from "../print-letterhead";
import { TodasSucursalesToggle, useTodasSucursales } from "@/app/todas-sucursales-toggle";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
// En "Cobros de hoy": diaria todos los días, semanal los lunes, quincenal los 15 y 30, mensual el día 1.
const frecuenciaLabel: Record<string, string> = { diaria: "Diaria (todos los días)", semanal: "Semanal (lunes)", quincenal: "Quincenal (15 y 30)", mensual: "Mensual (día 1)" };
// Clasificación (Shuyana 2026-10-01): sin repetir la frecuencia de cobro, que se elige aparte.
const categorias: { id: CategoriaDeuda; label: string; ayuda: string }[] = [
  { id: "apartados", label: "Sistema de apartado", ayuda: `Productos separados con abono: se entregan solo cuando el paciente paga todo. Plazo de ${DIAS_APARTADO} días desde la venta; si vence, decide si extender o liberar (anular la venta devuelve el producto al stock).` },
  { id: "rezagados", label: "Lentes rezagados", ayuda: `Lentes listos que el paciente no retira: deudas que moviste aquí y órdenes de laboratorio listas o notificadas hace ${DIAS_REZAGO} días o más (tengan saldo o no).` },
  { id: "credito_optica", label: "Crédito óptica", ayuda: "Crédito directo de la óptica: el paciente abona según su frecuencia de cobro." },
  { id: "credito_kamina", label: "Crédito Kamina", ayuda: "Deudas con crédito Kamina." },
  { id: "convenio", label: "Convenios", ayuda: "Deudas con descuento a rol de pagos de una empresa de convenio; entran al informe mensual." },
  { id: "urgentes", label: "Cobro urgente", ayuda: `Deudas de más de 3 meses (${DIAS_URGENTE} días) o marcadas como urgentes, de la más antigua a la más reciente.` },
];
type Pestana = CategoriaDeuda | "todas" | "hoy";
const categoriaLabel = (id: CategoriaDeuda) => categorias.find((c) => c.id === id)?.label ?? id;
const hoyEcuador = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const apartadoInfo = (deuda: DeudaPaciente) => {
  const venta = deuda.ventas.find((v) => v.apartado);
  if (!venta) return null;
  const vencido = !!venta.apartado_hasta && venta.apartado_hasta < hoyEcuador();
  return { venta, vencido, texto: venta.apartado_hasta ? `${vencido ? "Apartado vencido el" : "Apartado hasta"} ${formatDate(`${venta.apartado_hasta}T12:00:00-05:00`)}` : "Apartado" };
};
const ordenar = (categoria: Pestana, deudas: DeudaPaciente[]) => [...deudas].sort((a, b) =>
  categoria === "credito_optica" || categoria === "credito_kamina" ? a.dias_mas_antigua - b.dias_mas_antigua
  : categoria === "convenio" ? (a.convenio?.empresa ?? "").localeCompare(b.convenio?.empresa ?? "") || a.apellidos.localeCompare(b.apellidos)
  : b.dias_mas_antigua - a.dias_mas_antigua);

export default function CuentasCobrarBoard(props: CuentasCobrarData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, startTransition] = useTransition();
  const [convenioDeuda, setConvenioDeuda] = useState<DeudaPaciente | null>(null);
  const [vincularDeuda, setVincularDeuda] = useState<DeudaPaciente | null>(null);
  const [canjeDeuda, setCanjeDeuda] = useState<DeudaPaciente | null>(null);
  const [apartadoDeuda, setApartadoDeuda] = useState<DeudaPaciente | null>(null);
  const esSuperadmin = props.profile?.rol === "superadmin";
  const [mensajesLocales, setMensajesLocales] = useState<Record<string, { fecha: string; por: string }>>({});
  const [tab, setTab] = useState<Pestana>(props.convenioFiltro ? "todas" : props.colaHoy.length ? "hoy" : "urgentes");
  const [todas, setTodas] = useTodasSucursales();

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cuentas por cobrar</h1><p className="subtitle">{props.message ?? "No se pudo abrir cuentas por cobrar."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/cuentas-cobrar">Iniciar sesión</Link>}</header></div></main>;

  // Sin "Todas las sucursales" se ven solo las ventas de la sucursal donde se trabaja (la elegida en el menú).
  const activa = props.sucursalActivaId;
  const soloActiva = !todas && !!activa;
  const deudas: DeudaPaciente[] = soloActiva ? props.deudas.flatMap((d) => {
    const ventas = d.ventas.filter((v) => v.sucursal_id === activa);
    return ventas.length ? [{ ...d, ventas, saldo_total: ventas.reduce((sum, v) => sum + v.saldo, 0), sucursales: props.sucursalActivaNombre ? [props.sucursalActivaNombre] : d.sucursales }] : [];
  }) : props.deudas;
  const totalDeuda = deudas.reduce((sum, d) => sum + d.saldo_total, 0);
  const visibles = ordenar(tab, tab === "todas" ? deudas : deudas.filter((d) => d.categoria === tab));

  const cambiarFrecuencia = (pacienteId: string, frecuencia: string) => startTransition(async () => {
    try { await actualizarFrecuenciaCobro(pacienteId, frecuencia); setNotice("Frecuencia de cobro actualizada."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar la frecuencia."); }
  });
  const cambiarClasificacion = (deuda: DeudaPaciente, categoria: string) => {
    const esApartado = !!apartadoInfo(deuda);
    // Convenios: se pide la empresa y el trabajador para que la deuda entre al informe mensual del convenio.
    if (categoria === "convenio") { setVincularDeuda(deuda); return; }
    if (categoria === "apartados") {
      if (esApartado) return;
      if (deuda.ventas.length > 1) { setApartadoDeuda(deuda); return; }
      startTransition(async () => {
        try { await marcarApartado(deuda.ventas[0].id, true); setNotice(`${deuda.nombres} ${deuda.apellidos}: venta marcada como apartado (${DIAS_APARTADO} días).`); }
        catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo marcar el apartado."); }
      });
      return;
    }
    startTransition(async () => {
      try {
        if (esApartado) for (const venta of deuda.ventas.filter((v) => v.apartado)) await marcarApartado(venta.id, false);
        await clasificarDeuda(deuda.paciente_id, categoria);
        setNotice(categoria ? `Deuda movida a "${categoriaLabel(categoria as CategoriaDeuda)}".` : "La deuda vuelve a clasificarse automáticamente.");
      } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo cambiar la clasificación."); }
    });
  };
  const quitarApartado = (deuda: DeudaPaciente) => startTransition(async () => {
    try { for (const venta of deuda.ventas.filter((v) => v.apartado)) await marcarApartado(venta.id, false); setNotice(`${deuda.nombres} ${deuda.apellidos} ya no está como apartado.`); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo quitar el apartado."); }
  });
  const entregarLente = (lente: LenteRezagado) => startTransition(async () => {
    try { await cambiarEstadoOrdenLaboratorio(lente.orden_id, "entregado"); setNotice(`Lentes de ${lente.paciente_nombre} marcados como entregados.`); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo marcar como entregado."); }
  });
  const rezagadosLab = props.rezagados.filter((r) => r.dias_listo >= DIAS_REZAGO && (!soloActiva || r.sucursal_id === activa));
  const cambiarCobroInsistente = (pacienteId: string, activo: boolean) => startTransition(async () => {
    try { await activarCobroInsistente(pacienteId, activo); setNotice(activo ? "Cobro insistente activado: aparecerá cada día en la cola de esta sucursal." : "Cobro insistente desactivado."); }
    catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo actualizar el cobro insistente."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← LUMOS</Link><p className="eyebrow">OPERACIÓN COMERCIAL{props.empresaNombre ? ` · ${props.empresaNombre}` : ""}</p><h1>Cuentas por cobrar</h1></div>{activa && <TodasSucursalesToggle todas={todas} onChange={setTodas} sucursalNombre={props.sucursalActivaNombre} />}</header>
    {props.convenioFiltro && <div className="notice"><strong>{props.convenioFiltro.nombre}</strong><Link className="outline-action" href={`/convenios/${props.convenioFiltro.id}/informe`}>Generar informe mensual</Link><Link href="/convenios">Ver empresas</Link><Link href="/cuentas-cobrar">Quitar filtro</Link></div>}
    <section className="agenda-summary"><article><Wallet size={21} /><strong>{money(totalDeuda)}</strong><span>saldo total pendiente</span></article><article><CircleAlert size={21} /><strong>{deudas.length}</strong><span>pacientes con deuda</span></article></section>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "El saldo se calcula solo desde las ventas completadas; los abonos lo actualizan automáticamente."}</span></div>


    <section className="glass agenda-board">
      <div className="tabs" role="tablist" style={{ flexWrap: "wrap", marginBottom: 10 }}><button role="tab" type="button" className={tab === "hoy" ? "active" : ""} onClick={() => setTab("hoy")}>Cobros de hoy ({props.colaHoy.length})</button><button role="tab" type="button" className={tab === "todas" ? "active" : ""} onClick={() => setTab("todas")}>Todas ({deudas.length} · {money(totalDeuda)})</button>{categorias.map((c) => { const lista = deudas.filter((d) => d.categoria === c.id); const extra = c.id === "rezagados" ? rezagadosLab.length : 0; return <button key={c.id} role="tab" type="button" className={tab === c.id ? "active" : ""} onClick={() => setTab(c.id)}>{c.label} ({lista.length + extra} · {money(lista.reduce((sum, d) => sum + d.saldo_total, 0))})</button>; })}</div>
      {tab === "hoy" ? <ColaCobrosHoy cola={props.colaHoy} sucursalId={props.sucursalActivaId} sucursalNombre={props.sucursalActivaNombre} error={props.colaHoyError} /> : <>
      <p className="field-hint">{tab === "todas" ? "Todas las deudas, de la más antigua a la más reciente. Usa \"Clasificación\" en cada tarjeta para moverla a otra pestaña." : categorias.find((c) => c.id === tab)?.ayuda}</p>
      {tab === "rezagados" && rezagadosLab.length > 0 && <div className="task-list" style={{ marginBottom: 12 }}>{rezagadosLab.map((lente) => <RezagadoCard key={lente.orden_id} lente={lente} pending={pending} onEntregado={() => entregarLente(lente)} />)}</div>}
      {tab === "rezagados" && !visibles.length && !rezagadosLab.length ? <section className="empty-state"><FlaskConical size={27} /><h3>No hay lentes rezagados</h3><p>{`Mueve aquí una deuda con "Clasificación", o espera a que una orden lleve ${DIAS_REZAGO} días lista sin retirarse.`}</p></section> : visibles.length ? <div className="task-list">{visibles.map((deuda) => <DeudaCard key={deuda.paciente_id} deuda={{ ...deuda, ultimo_mensaje: mensajesLocales[deuda.paciente_id]?.fecha ?? deuda.ultimo_mensaje, ultimo_mensaje_por: mensajesLocales[deuda.paciente_id]?.por ?? deuda.ultimo_mensaje_por }} sucursalActivaId={props.sucursalActivaId} usuarioNombre={props.profile?.nombre ?? "Equipo"} onMensaje={() => setMensajesLocales((prev) => ({ ...prev, [deuda.paciente_id]: { fecha: new Date().toISOString(), por: props.profile?.nombre ?? "Equipo" } }))} pending={pending} onCanje={esSuperadmin ? () => setCanjeDeuda(deuda) : undefined} mostrarCategoria={tab === "todas"} onClasificar={(c) => cambiarClasificacion(deuda, c)} onFrecuencia={(f) => cambiarFrecuencia(deuda.paciente_id, f)} onCobroInsistente={(activo) => cambiarCobroInsistente(deuda.paciente_id, activo)} onConvenio={() => setConvenioDeuda(deuda)} onApartado={() => apartadoInfo(deuda) ? quitarApartado(deuda) : setApartadoDeuda(deuda)} />)}</div> : <section className="empty-state"><Wallet size={27} /><h3>No hay saldos en esta pestaña</h3><p>Cuando una venta quede con saldo aparecerá en la pestaña que le corresponda.</p></section>}
      </>}
    </section>
    {apartadoDeuda && <ApartadoModal deuda={apartadoDeuda} onClose={() => setApartadoDeuda(null)} onNotice={setNotice} />}
    {canjeDeuda && <CanjeModal deuda={canjeDeuda} onClose={() => setCanjeDeuda(null)} onNotice={setNotice} />}
    {vincularDeuda && <VincularConvenioModal deuda={vincularDeuda} empresasConvenio={props.empresasConvenio} onClose={() => setVincularDeuda(null)} onNotice={setNotice} />}
    {convenioDeuda && <ConvenioModal deuda={convenioDeuda} empresasConvenio={props.empresasConvenio} onClose={() => setConvenioDeuda(null)} onNotice={setNotice} />}
  </div></main>;
}


export function ColaCobrosHoy({ cola, sucursalId, sucursalNombre, error }: { cola: CobroHoy[]; sucursalId?: string; sucursalNombre?: string; error?: string }) {
  const [ocultos, setOcultos] = useState<string[]>([]);
  const [enviado, setEnviado] = useState("");
  const [procesando, setProcesando] = useState("");
  const pendientes = cola.filter((row) => !ocultos.includes(row.paciente_id));
  const total = pendientes.reduce((sum, row) => sum + Number(row.saldo), 0);
  const enviar = (row: CobroHoy, abrirWhatsapp: boolean) => {
    if (!sucursalId || procesando) return;
    if (abrirWhatsapp) {
      const plantilla = plantillaSugerida({ insistente: row.cobro_insistente, apartado: row.apartado, frecuencia: row.frecuencia, dias: row.dias_deuda });
      const mensaje = construirMensajeContacto(plantilla, { nombre: row.nombres, empresa: row.empresa_nombre, saldo: Number(row.saldo), apartadoHasta: row.apartado_hasta, frecuencia: row.frecuencia, sucursal: sucursalNombre });
      const url = enlaceWhatsapp(row.telefono, mensaje);
      if (!url) return;
      const ventana = window.open(url, "_blank");
      if (!ventana) { setEnviado("Permite las ventanas emergentes para abrir WhatsApp."); return; }
      ventana.opener = null;
    }
    setProcesando(row.paciente_id);
    setOcultos((prev) => [...prev, row.paciente_id]);
    setEnviado(`Enviado ✓ · ${row.nombres} ${row.apellidos}`);

    void marcarMensajeCobro(row.paciente_id, sucursalId).catch((err) => {
      setOcultos((prev) => prev.filter((id) => id !== row.paciente_id));
      setEnviado(err instanceof Error ? err.message : "No se pudo registrar el aviso.");
    }).finally(() => setProcesando(""));
    window.setTimeout(() => setEnviado((prev) => prev.startsWith("Enviado ✓") ? "" : prev), 2200);
  };
  useEffect(() => { if (ocultos.length > 0 && !procesando) document.querySelector<HTMLButtonElement>(".cob-next-button")?.focus(); }, [procesando, ocultos]);
  return <section className="cob-queue" aria-label="Cobros de hoy">
    <div className="cob-heading"><div><h2>Cobros de hoy · {sucursalNombre ?? "Sucursal activa"}</h2><p><strong>{pendientes.length}</strong> mensajes pendientes · <strong>{money(total)}</strong> de saldo</p></div><button className="new-consultation" type="button" disabled={!pendientes.length || !sucursalId || !!procesando} onClick={() => { const primero = pendientes[0]; if (primero) enviar(primero, !!enlaceWhatsapp(primero.telefono, "")); }}>Modo seguido · Empezar</button></div>
    <p className="field-hint">Usa el WhatsApp de esta sucursal; el sistema registra los contactos de hoy.</p>
    {error && <p className="notice" role="alert">{error}</p>}
    {enviado && <p className="cob-feedback" role="status">{enviado}</p>}
    {pendientes.length ? <div className="cob-list">{pendientes.map((row, index) => {
      const tieneWhatsapp = !!enlaceWhatsapp(row.telefono, "");
      const fecha = row.ultimo_mensaje ? new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "2-digit" }).format(new Date(row.ultimo_mensaje)) : null;
      return <article className="cob-row" key={row.paciente_id}><div className="cob-row-main"><h3>{row.nombres} {row.apellidos}</h3><span className={row.cobro_insistente ? "cob-badge cob-badge-urgent" : "cob-badge"}>{row.motivo}</span><span className="cob-badge">{row.apartado && !row.cobro_insistente ? "Apartado" : plantillaSugerida({ insistente: row.cobro_insistente, apartado: row.apartado, frecuencia: row.frecuencia, dias: row.dias_deuda }) === "cobro_insistente" ? "Firme" : "Recordatorio"}</span><p>Último mensaje: {fecha ?? "Nunca"}</p></div><div className="cob-row-action"><strong>{money(Number(row.saldo))}</strong>{tieneWhatsapp ? <button className={`new-consultation${index === 0 ? " cob-next-button" : ""}`} type="button" disabled={!!procesando || !sucursalId} onClick={() => enviar(row, true)}><MessageCircle size={14} /> Enviar por WhatsApp</button> : <><span>Sin WhatsApp registrado</span><button className={`outline-action${index === 0 ? " cob-next-button" : ""}`} type="button" disabled={!!procesando || !sucursalId} onClick={() => enviar(row, false)}>Marcar como avisado</button></>}</div></article>;
    })}</div> : <p className="cob-empty">No quedan mensajes de cobro para esta sucursal hoy.</p>}
  </section>;
}

function DeudaCard({ deuda, sucursalActivaId, usuarioNombre, onMensaje, pending, onCanje, onApartado, mostrarCategoria, onClasificar, onFrecuencia, onCobroInsistente, onConvenio }: { deuda: DeudaPaciente; sucursalActivaId?: string; usuarioNombre: string; onMensaje: () => void; pending: boolean; onCanje?: () => void; onApartado: () => void; mostrarCategoria: boolean; onClasificar: (categoria: string) => void; onFrecuencia: (frecuencia: string) => void; onCobroInsistente: (activo: boolean) => void; onConvenio: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [plantilla, setPlantilla] = useState<PlantillaContactoId>(() => plantillaSugerida({ rezagado: deuda.categoria === "rezagados", insistente: deuda.cobro_insistente, apartado: deuda.categoria === "apartados", frecuencia: deuda.frecuencia_cobro as "diaria" | "semanal" | "quincenal" | "mensual" | null, dias: deuda.dias_mas_antigua }));
  const [verFecha, setVerFecha] = useState(false);
  const [fechaCobro, setFechaCobro] = useState(deuda.fecha_cobro_acordada ?? "");
  const [fechaError, setFechaError] = useState("");
  const [fechaPending, startFecha] = useTransition();
  const [copied, setCopied] = useState(false);
  const [verMensaje, setVerMensaje] = useState(false);
  const [auto, setAuto] = useState(deuda.cobro_automatico);
  const [autoPending, startAuto] = useTransition();
  const [autoError, setAutoError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const nombre = `${deuda.nombres} ${deuda.apellidos}`;
  const apartado = apartadoInfo(deuda);
  const token = deuda.ventas[0]?.recibo_token;
  const ticketUrl = origin && token ? `${origin}/recibo/${token}` : null;
  const fechaCompra = deuda.ventas[0]?.creado_en ?? null;
  const mensaje = construirMensajeContacto(plantilla, { nombre: deuda.nombres, empresa: deuda.empresa_nombre, saldo: deuda.saldo_total, ticketUrl, fechaCompra, apartadoHasta: apartado?.venta.apartado_hasta, frecuencia: deuda.frecuencia_cobro as "diaria" | "semanal" | "quincenal" | "mensual" | null, sucursal: deuda.sucursales[0] });
  const registrar = () => { const sucursal = [...deuda.ventas].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0]?.sucursal_id ?? sucursalActivaId; if (!sucursal) return; onMensaje(); void marcarMensajeCobro(deuda.paciente_id, sucursal).catch(() => {}); };
  const guardarFecha = (fecha: string | null) => startFecha(async () => { try { await fijarFechaCobro(deuda.paciente_id, fecha); setFechaCobro(fecha ?? ""); setVerFecha(false); } catch (err) { setFechaError(err instanceof Error ? err.message : "No se pudo guardar la fecha."); } });
  const wa = enlaceWhatsapp(deuda.telefono, mensaje);
  const closeMenu = () => setMenuOpen(false);
  const copiarMensaje = async () => {
    try { await navigator.clipboard.writeText(mensaje); registrar(); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (!menuOpen) return; const onClick = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu(); }; document.addEventListener("mousedown", onClick); return () => document.removeEventListener("mousedown", onClick); }, [menuOpen]);

  return <article className="task-card"><div className="task-status" /><div className="task-main">
    <div className="task-meta"><span className="branch-meta" style={{ fontSize: 13 }}>{deuda.sucursales.join(" · ")}</span><span className={deuda.dias_mas_antigua > DIAS_URGENTE ? "urgente" : ""}>{deuda.dias_mas_antigua === 0 ? "Hoy" : deuda.dias_mas_antigua === 1 ? "Ayer" : `${deuda.dias_mas_antigua} días`}</span>{mostrarCategoria && <span>{categoriaLabel(deuda.categoria)}{deuda.categoria_manual ? " (manual)" : ""}</span>}{deuda.convenio && <span>Convenio {deuda.convenio.empresa} · {deuda.convenio.cuotas} cuotas de {money(deuda.convenio.monto_cuota)}{deuda.convenio.titular && deuda.convenio.titular.toLowerCase() !== `${deuda.nombres} ${deuda.apellidos}`.trim().toLowerCase() ? ` · Descuento a: ${deuda.convenio.titular}` : ""}</span>}{apartado && <span className={apartado.vencido ? "urgente" : ""}><Tag size={11} /> {apartado.texto}</span>}{deuda.cobro_insistente && <span className="urgente"><AlertTriangle size={11} /> Cobro insistente</span>}{fechaCobro && <span className="state-pill">Cobrar el {new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" }).format(new Date(`${fechaCobro}T12:00:00-05:00`))}</span>}</div>
    <h2>{nombre}</h2>
    <p>Saldo pendiente: <strong>{money(deuda.saldo_total)}</strong></p><p>{deuda.ultimo_mensaje ? <>Último mensaje: {formatDate(deuda.ultimo_mensaje)}{deuda.ultimo_mensaje_por ? ` · ${deuda.ultimo_mensaje_por}` : ""}{new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deuda.ultimo_mensaje)) === hoyEcuador() && <span className="state-pill aprobada" style={{ marginLeft: 8 }}>Contactado hoy</span>}</> : "Sin contactar"}</p>
    <div className="collection-controls">
      <label>Clasificación<select value={apartado ? "apartados" : deuda.categoria_manual ?? ""} disabled={pending} onChange={(event) => onClasificar(event.target.value)}><option value="">{deuda.categoria_auto === "apartados" ? "Automática" : `Automática (${categoriaLabel(deuda.categoria_auto)})`}</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>Frecuencia de cobro<select defaultValue={deuda.frecuencia_cobro ?? ""} disabled={pending} onChange={(event) => onFrecuencia(event.target.value)}><option value="">Sin definir</option>{Object.entries(frecuenciaLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Envío automático<button type="button" className={auto ? "new-consultation" : "outline-action"} disabled={autoPending || !deuda.telefono} title={deuda.telefono ? "El sistema envía el recordatorio por WhatsApp según la frecuencia de cobro" : "Sin WhatsApp registrado"} onClick={() => { const nuevo = !auto; setAutoError(""); startAuto(async () => { try { await cambiarCobroAutomatico(deuda.paciente_id, nuevo); setAuto(nuevo); } catch (err) { setAutoError(err instanceof Error ? err.message : "No se pudo cambiar."); } }); }}><Repeat size={14} /> {auto ? "Activado" : "Desactivado"}</button></label>
    </div>
    {autoError && <p className="notice" role="alert">{autoError}</p>}
    {auto && <p className="field-hint">Envío automático: el sistema le escribe por WhatsApp según su frecuencia de cobro ({deuda.cobro_insistente ? "todos los días" : deuda.frecuencia_cobro ? frecuenciaLabel[deuda.frecuencia_cobro as keyof typeof frecuenciaLabel] ?? deuda.frecuencia_cobro : "cada 15 días"}).</p>}
    {verFecha && <div className="modal-backdrop" onClick={() => setVerFecha(false)}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setVerFecha(false)} aria-label="Cerrar"><X size={19} /></button><h2>Fecha de cobro</h2><label>Fecha acordada<input type="date" value={fechaCobro} onChange={(event) => setFechaCobro(event.target.value)} /></label><p className="field-hint">Ese día el paciente aparece en Cobros de hoy; antes de esa fecha no se le escribe.</p>{fechaError && <p className="notice">{fechaError}</p>}<div className="modal-actions"><button className="outline-action" disabled={fechaPending} onClick={() => guardarFecha(null)}>Quitar fecha</button><button className="new-consultation" disabled={fechaPending || !fechaCobro} onClick={() => guardarFecha(fechaCobro)}>Guardar</button></div></section></div>}
    {verMensaje && <div className="modal-backdrop" onClick={() => setVerMensaje(false)}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={() => setVerMensaje(false)} aria-label="Cerrar"><X size={19} /></button>
      <p className="section-label">MENSAJE GUARDADO</p><h2>{nombre}</h2>
      <label className="task-description">Plantilla<select value={plantilla} onChange={(event) => setPlantilla(event.target.value as PlantillaContactoId)}>{plantillasContacto.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <div className="message-preview"><span>Mensaje</span><p>{mensaje}</p></div>
      <div className="modal-actions"><button className="outline-action" type="button" onClick={copiarMensaje}><Copy size={13} /> {copied ? "Copiado" : "Copiar"}</button>{wa && <a className="new-consultation" href={wa} target="_blank" rel="noreferrer" onClick={registrar}><MessageCircle size={14} /> Enviar por WhatsApp</a>}</div>
    </section></div>}
  </div><div className="task-actions">
    {wa ? <button className="new-consultation" type="button" onClick={() => setVerMensaje(true)}><MessageCircle size={14} /> Ver mensaje</button> : <span style={{ color: "#a24150", fontSize: 12, fontWeight: 700 }}>Sin WhatsApp registrado</span>}
    <Link className="outline-action" href={`/pacientes?paciente=${deuda.paciente_id}${deuda.ventas.length === 1 ? `&venta=${deuda.ventas[0].id}` : "&tab=ventas"}`}><Wallet size={14} /> Añadir pago</Link>
    {onCanje && <button className="outline-action" type="button" onClick={onCanje} title="Solo Superadministradora: baja el saldo sin contar como abono ni venta"><Repeat size={14} /> Canje</button>}
    <div className="menu-wrap" ref={menuRef}>
      <button className="outline-action" type="button" onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={14} /> Más opciones</button>
      {menuOpen && <div className="menu-dropdown">
        <button type="button" onClick={() => { onApartado(); closeMenu(); }}><Tag size={14} /> {apartado ? "Quitar apartado" : "Marcar como apartado"}</button>
        <button type="button" onClick={() => { setVerFecha(true); closeMenu(); }}>Fecha de cobro</button>
        <button type="button" onClick={() => { onConvenio(); closeMenu(); }}><FileText size={14} /> Convenio de pago</button>
        <button type="button" className={deuda.cobro_insistente ? "danger" : ""} onClick={() => { onCobroInsistente(!deuda.cobro_insistente); closeMenu(); }}><AlertTriangle size={14} /> {deuda.cobro_insistente ? "Quitar cobro insistente" : "Activar cobro insistente"}</button>
      </div>}
    </div>
  </div></article>;
}

function ApartadoModal({ deuda, onClose, onNotice }: { deuda: DeudaPaciente; onClose: () => void; onNotice: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [ventaId, setVentaId] = useState(deuda.ventas[deuda.ventas.length - 1]?.id ?? "");
  const [error, setError] = useState("");
  const guardar = () => start(async () => {
    setError("");
    try { await marcarApartado(ventaId, true); onNotice(`${deuda.nombres} ${deuda.apellidos}: venta marcada como apartado (${DIAS_APARTADO} días).`); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo marcar el apartado."); }
  });
  return <div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">SISTEMA DE APARTADO</p><h2>{deuda.nombres} {deuda.apellidos}</h2>
    <p>El producto queda separado y <strong>se entrega solo cuando el paciente paga todo</strong>. El plazo es de {DIAS_APARTADO} días desde la fecha de la venta.</p>
    {deuda.ventas.length > 1 && <div className="new-patient-form"><label style={{ gridColumn: "1 / -1" }}>Venta que se aparta<select value={ventaId} onChange={(event) => setVentaId(event.target.value)}>{deuda.ventas.map((v) => <option key={v.id} value={v.id}>{v.folio ? `Folio ${v.folio} · ` : ""}{formatDate(v.creado_en)} · saldo {money(v.saldo)}</option>)}</select></label></div>}
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="button" disabled={!ventaId || pending} onClick={guardar}>{pending ? "Guardando…" : "Marcar como apartado"}</button></div>
  </section></div>;
}

function RezagadoCard({ lente, pending, onEntregado }: { lente: LenteRezagado; pending: boolean; onEntregado: () => void }) {
  const mensaje = construirMensajeContacto("lentes_rezagados", { nombre: lente.paciente_nombre.split(" ")[0] ?? lente.paciente_nombre, empresa: lente.sucursal_nombre, saldo: lente.saldo, ticketUrl: null, fechaCompra: null });
  const wa = enlaceWhatsapp(lente.telefono, mensaje);
  return <article className="task-card"><div className="task-status" /><div className="task-main">
    <div className="task-meta"><span className="branch-meta" style={{ fontSize: 13 }}>{lente.sucursal_nombre}</span><span className="urgente">Listo hace {lente.dias_listo} días</span><span>{(laboratorioLabels as Record<string, string>)[lente.laboratorio] ?? lente.laboratorio}</span></div>
    <h2>{lente.paciente_nombre}</h2>
    <p>{lente.saldo > 0 ? <>Saldo pendiente: <strong>{money(lente.saldo)}</strong></> : "Sin saldo pendiente"}</p>
  </div><div className="task-actions">
    {wa ? <a className="new-consultation" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Avisar por WhatsApp</a> : <span style={{ color: "#a24150", fontSize: 12, fontWeight: 700 }}>Sin WhatsApp registrado</span>}
    {lente.paciente_id && <Link className="outline-action" href={`/pacientes?paciente=${lente.paciente_id}`}>Ver carpeta</Link>}
    <button className="outline-action" type="button" disabled={pending} onClick={onEntregado}><PackageCheck size={14} /> Marcar entregado</button>
  </div></article>;
}

function CanjeModal({ deuda, onClose, onNotice }: { deuda: DeudaPaciente; onClose: () => void; onNotice: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [ventaId, setVentaId] = useState(deuda.ventas[0]?.id ?? "");
  const venta = deuda.ventas.find((v) => v.id === ventaId);
  const [monto, setMonto] = useState(venta ? venta.saldo.toFixed(2) : "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const valor = Number(monto.replace(",", "."));
  const valido = !!venta && Number.isFinite(valor) && valor > 0 && valor <= venta.saldo + 0.001 && motivo.trim().length >= 3;
  const guardar = () => start(async () => {
    setError("");
    try { await registrarCanje(ventaId, monto, motivo); onNotice(`Canje de ${money(valor)} registrado para ${deuda.nombres} ${deuda.apellidos}. No cuenta como abono ni venta.`); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el canje."); }
  });
  return <div className="modal-backdrop" onClick={onClose}><section className="new-patient-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">CANJE · SOLO SUPERADMINISTRADORA</p><h2>{deuda.nombres} {deuda.apellidos}</h2>
    <p>El canje baja el saldo de la deuda, pero <strong>no se suma a abonos, caja, ingresos ni ventas</strong>. Queda registrado con tu nombre, la fecha y el motivo.</p>
    <div className="new-patient-form">
      {deuda.ventas.length > 1 && <label>Venta<select value={ventaId} onChange={(event) => { setVentaId(event.target.value); const v = deuda.ventas.find((x) => x.id === event.target.value); setMonto(v ? v.saldo.toFixed(2) : ""); }}>{deuda.ventas.map((v) => <option key={v.id} value={v.id}>{v.folio ? `Folio ${v.folio} · ` : ""}{formatDate(v.creado_en)} · saldo {money(v.saldo)}</option>)}</select></label>}
      <label>Monto del canje{venta ? ` (saldo ${money(venta.saldo)})` : ""}<input type="text" inputMode="decimal" autoComplete="off" value={monto} onChange={(event) => setMonto(event.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} /></label>
      <label className="task-description" style={{ gridColumn: "1 / -1" }}>Motivo<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej.: canje por servicio, ajuste de cuenta con Optox" /></label>
    </div>
    {venta && Number.isFinite(valor) && valor > venta.saldo + 0.001 && <p className="notice">El canje no puede superar el saldo de esta venta.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="button" disabled={!valido || pending} onClick={guardar}>{pending ? "Guardando…" : "Registrar canje"}</button></div>
  </section></div>;
}

function VincularConvenioModal({ deuda, empresasConvenio, onClose, onNotice }: { deuda: DeudaPaciente; empresasConvenio: EmpresaConvenio[]; onClose: () => void; onNotice: (message: string) => void }) {
  const [empresaId, setEmpresaId] = useState("");
  const [titular, setTitular] = useState<PersonaTitular | null>(null);
  const [paciente, setPaciente] = useState<PersonaTitular | null>(null);
  const [buscar, setBuscar] = useState<string | null>(null);
  const [encontrados, setEncontrados] = useState<PersonaTitular[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => { void titularSugeridoConvenio(deuda.paciente_id).then((r) => { setPaciente(r.paciente); setTitular(r.titular); }).catch(() => setError("No se pudo cargar al paciente.")); }, [deuda.paciente_id]);
  useEffect(() => {
    if (buscar === null || buscar.trim().length < 2) { setEncontrados([]); return; }
    let vigente = true;
    const timer = window.setTimeout(() => { void buscarTitularConvenio(buscar).then((rows) => { if (vigente) setEncontrados(rows); }).catch(() => { if (vigente) setEncontrados([]); }); }, 300);
    return () => { vigente = false; window.clearTimeout(timer); };
  }, [buscar]);
  const guardar = () => start(async () => {
    try {
      await vincularConvenio(deuda.paciente_id, empresaId, titular?.id ?? null);
      const empresa = empresasConvenio.find((e) => e.id === empresaId)?.nombre ?? "el convenio";
      onNotice(`${deuda.nombres} ${deuda.apellidos} quedó en ${empresa}${titular && paciente && titular.id !== paciente.id ? `, con descuento a ${titular.nombre}` : ""}. Ya aparece en el informe mensual.`);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo vincular al convenio."); }
  });
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="vincular-convenio-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">CONVENIOS</p><h2 id="vincular-convenio-title">Pasar a convenio</h2>
    <p className="field-hint">{deuda.nombres} {deuda.apellidos} · saldo {money(deuda.saldo_total)}. Al guardar, la deuda entra al informe mensual del convenio con la cuota automática de la empresa.</p>
    <div className="new-patient-form"><label className="task-description">Empresa del convenio<select value={empresaId} onChange={(event) => setEmpresaId(event.target.value)} required><option value="">Selecciona la empresa del convenio</option>{empresasConvenio.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label></div>
    <div className="titular-rol"><span className="section-label">TRABAJADOR TITULAR (A QUIEN DESCUENTAN)</span>{titular ? <p><strong>{titular.nombre}</strong>{titular.cedula ? ` · C.I. ${titular.cedula}` : ""}{paciente && titular.id !== paciente.id && <><br /><small>Beneficiario (paciente): {paciente.nombre}</small></>}</p> : <p className="field-hint">Cargando…</p>}
      {buscar === null ? <button type="button" className="text-action" onClick={() => setBuscar("")}>Cambiar titular</button> : <div className="titular-rol-buscar"><input autoFocus value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Nombre o cédula del trabajador" />{encontrados.map((p) => <button type="button" key={p.id} onClick={() => { setTitular(p); setBuscar(null); }}>{p.nombre}{p.cedula ? ` · ${p.cedula}` : ""}</button>)}{paciente && <button type="button" className="text-action" onClick={() => { setTitular(paciente); setBuscar(null); }}>Es el mismo paciente</button>}</div>}
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" type="button" disabled={pending || !empresaId || !titular} onClick={guardar}>{pending ? "Guardando…" : "Pasar a convenio"}</button></div>
  </section></div>;
}

function ConvenioModal({ deuda, empresasConvenio, onClose, onNotice }: { deuda: DeudaPaciente; empresasConvenio: EmpresaConvenio[]; onClose: () => void; onNotice: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [ventaId, setVentaId] = useState(deuda.ventas[0]?.id ?? "");
  // Sin empresa preseleccionada: antes se elegía sola la primera (Municipio) y una deuda directa quedó como convenio.
  const [empresaConvenioId, setEmpresaConvenioId] = useState("");
  const [nuevaEmpresa, setNuevaEmpresa] = useState("");
  const [cuotas, setCuotas] = useState(6);
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
    <div id="collection-agreement-print" className="print-area print-a4">
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

      {resultado.abonos.length > 0 && <><p className="section-label" style={{ marginTop: 14 }}>DETALLE DE ABONOS</p>{resultado.abonos.map((abono, index) => <p key={index} style={{ margin: "4px 0", fontSize: 13 }}>{formatDate(abono.fecha)} · {paymentMethodLabels[abono.metodo] ?? abono.metodo} <strong style={{ float: "right" }}>{money(abono.monto)}</strong></p>)}</>}

      <p className="section-label" style={{ marginTop: 14 }}>TÉRMINOS Y CONDICIONES</p>
      <p style={{ whiteSpace: "pre-line", lineHeight: 1.6, fontSize: 13 }}>{resultado.texto}</p>

      <div className="print-center" style={{ marginTop: 46 }}>
        <div style={{ borderTop: "1px solid #34455c", width: 260, margin: "0 auto" }} />
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>Nombre y firma del solicitante</p>
      </div>
    </div>
    <div className="modal-actions no-print"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button><button className="new-consultation" type="button" onClick={() => printDocumentById("collection-agreement-print")}><Printer size={15} /> Imprimir</button></div>
  </section></div>;

  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="convenio-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">CONVENIO DE PAGO</p>
    <h2 id="convenio-title">{deuda.nombres} {deuda.apellidos}</h2>
    <p>Genera un acuerdo de pago por descuento a rol de pagos a través de una empresa convenio.</p>
    <div className="new-patient-form">
      <label className="task-description">Venta<select value={ventaId} onChange={(event) => setVentaId(event.target.value)}>{deuda.ventas.map((v) => <option key={v.id} value={v.id}>{formatDate(v.creado_en)} · Saldo {money(v.saldo)}</option>)}</select></label>
      <label className="task-description">Empresa convenio{empresasConvenio.length ? <select value={empresaConvenioId} onChange={(event) => { setEmpresaConvenioId(event.target.value); const conv = empresasConvenio.find((c) => c.id === event.target.value); if (conv?.cuotas_predeterminadas) setCuotas(conv.cuotas_predeterminadas); }}><option value="">Selecciona la empresa del convenio</option>{empresasConvenio.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select> : <span className="field-hint">Todavía no hay empresas de convenio registradas.</span>}</label>
      <label className="task-description">Nueva empresa de convenio (opcional)<span style={{ display: "flex", gap: 6 }}><input value={nuevaEmpresa} onChange={(event) => setNuevaEmpresa(event.target.value)} placeholder="Ej.: Municipio de Shushufindi" style={{ flex: 1 }} /><button type="button" className="outline-action" disabled={pending || !nuevaEmpresa.trim()} onClick={crearEmpresa}>Agregar</button></span></label>
      <label>Número de cuotas<input type="number" min={1} value={cuotas} onChange={(event) => setCuotas(Number(event.target.value) || 1)} /></label>
      {ventaSeleccionada && cuotas > 0 && <p className="field-hint">Cuota estimada: {money(ventaSeleccionada.saldo / cuotas)} c/u</p>}
    </div>
    {error && <p className="notice">{error}</p>}
    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !ventaId || !empresaConvenioId} type="button" onClick={generar}>{pending ? "Generando…" : "Generar acuerdo"}</button></div>
  </section></div>;
}
