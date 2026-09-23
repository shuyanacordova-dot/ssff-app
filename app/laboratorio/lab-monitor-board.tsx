"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Clock3, FlaskConical, MessageCircle, PackageCheck, Printer, Search, ShieldAlert, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { LabMonitorData, LabMonitorOrder } from "@/lib/monitor-laboratorio";
import { estadoOrdenLabels, laboratorioLabels, tipoLenteLabels, type EstadoOrdenLaboratorio } from "@/lib/laboratorio";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import LabOrderPrint from "@/app/lab-order-print";
import { cambiarEstadoOrdenLaboratorio } from "@/app/ventas/lab-actions";
import { printCurrentDocument } from "@/lib/print-document";

const statusOptions = Object.entries(estadoOrdenLabels) as [EstadoOrdenLaboratorio, string][];
const flowStatuses: EstadoOrdenLaboratorio[] = ["pendiente", "enviado", "recibido", "notificado", "entregado"];
const closedStatuses = new Set<EstadoOrdenLaboratorio>(["entregado", "rechazado"]);
const readyStatuses = new Set<EstadoOrdenLaboratorio>(["recibido"]);
const date = (value: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
const shortId = (order: LabMonitorOrder) => order.venta_folio ? `Venta #${order.venta_folio}` : `Orden ${order.id.slice(0, 8).toUpperCase()}`;
const overdue = (order: LabMonitorOrder) => !!order.fecha_entrega_estimada && new Date(`${order.fecha_entrega_estimada}T23:59:59`) < new Date() && !closedStatuses.has(order.estado);
const nextStatus = (status: EstadoOrdenLaboratorio) => { const index = flowStatuses.indexOf(status); return index >= 0 && index < flowStatuses.length - 1 ? flowStatuses[index + 1] : null; };

export default function LabMonitorBoard(props: LabMonitorData) {
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState(props.branches.length > 1 ? "all" : (props.activeBranchId ?? "all"));
  const [status, setStatus] = useState("active");
  const [lab, setLab] = useState("all");
  const [selected, setSelected] = useState<LabMonitorOrder | null>(null);
  const [notice, setNotice] = useState(props.message ?? "");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => props.orders.filter((order) => {
    const haystack = `${order.paciente_nombre} ${order.empresa_nombre} ${order.sucursal_nombre} ${order.laboratorio} ${order.venta_folio ?? ""} ${order.id}`.toLowerCase();
    const statusMatch = status === "all" || (status === "active" ? !closedStatuses.has(order.estado) : order.estado === status);
    return haystack.includes(query.trim().toLowerCase()) && (branchId === "all" || order.sucursal_id === branchId) && (lab === "all" || order.laboratorio === lab) && statusMatch;
  }), [props.orders, query, branchId, status, lab]);

  const pendingCount = props.orders.filter((order) => !closedStatuses.has(order.estado)).length;
  const readyCount = props.orders.filter((order) => readyStatuses.has(order.estado)).length;
  const overdueCount = props.orders.filter(overdue).length;
  const labs = [...new Set(props.orders.map((order) => order.laboratorio))];

  const updateStatus = (order: LabMonitorOrder, next: EstadoOrdenLaboratorio) => startTransition(async () => {
    try {
      await cambiarEstadoOrdenLaboratorio(order.id, next);
      order.estado = next;
      setSelected((current) => current?.id === order.id ? { ...current, estado: next } : current);
      setNotice(`${order.paciente_nombre}: ${estadoOrdenLabels[next]}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar la orden.");
    }
  });

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/"><ArrowLeft size={15} /> LUMOS</Link><p className="eyebrow">OPERACIÓN</p><h1>Laboratorio</h1><p className="subtitle">{props.message ?? "No se pudo abrir el monitor."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/laboratorio">Iniciar sesión</Link>}</header></div></main>;

  return <main className="page agenda-page lab-monitor-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/"><ArrowLeft size={15} /> LUMOS</Link><p className="eyebrow">CONTROL CENTRAL</p><h1>Órdenes de laboratorio</h1><p className="subtitle">Seguimiento por paciente, laboratorio y sucursal hasta la entrega.</p></div><Link className="new-task" href="/ventas"><FlaskConical size={17} /> Crear desde una venta</Link></header>

    <section className="lab-summary">
      <article><Clock3 size={21} /><strong>{pendingCount}</strong><span>órdenes activas</span></article>
      <article><PackageCheck size={21} /><strong>{readyCount}</strong><span>listas para entregar</span></article>
      <article className={overdueCount ? "warning" : ""}><ShieldAlert size={21} /><strong>{overdueCount}</strong><span>entregas vencidas</span></article>
      <article><CheckCircle2 size={21} /><strong>{props.orders.filter((order) => order.estado === "entregado").length}</strong><span>entregadas</span></article>
    </section>

    {notice && <div className="notice"><FlaskConical size={17} /><span>{notice}</span></div>}

    <section className="glass lab-monitor-panel">
      <div className="lab-toolbar">
        <label className="patient-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Paciente, venta u orden" /></label>
        {props.branches.length > 1 && <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">Todas las sucursales</option>{props.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></label>}
        <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activas</option><option value="all">Todos</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Laboratorio<select value={lab} onChange={(event) => setLab(event.target.value)}><option value="all">Todos</option>{labs.map((value) => <option key={value} value={value}>{laboratorioLabels[value] ?? value}</option>)}</select></label>
      </div>

      {labs.length > 0 && <div className="lab-provider-strip" aria-label="Resumen por laboratorio"><button type="button" className={lab === "all" ? "active" : ""} onClick={() => setLab("all")}><strong>{pendingCount}</strong><span>Todos activos</span></button>{labs.map((value) => { const count = props.orders.filter((order) => order.laboratorio === value && !closedStatuses.has(order.estado)).length; return <button type="button" key={value} className={lab === value ? "active" : ""} onClick={() => setLab(value)}><strong>{count}</strong><span>{laboratorioLabels[value] ?? value}</span></button>; })}</div>}

      <div className="lab-result-heading"><div><p className="section-label">SEGUIMIENTO</p><h2>{filtered.length} {filtered.length === 1 ? "orden visible" : "órdenes visibles"}</h2></div><small>Los cambios de estado se guardan inmediatamente.</small></div>
      {filtered.length ? <div className="lab-order-grid">{filtered.map((order) => <OrderCard key={order.id} order={order} pending={pending} onOpen={() => setSelected(order)} onStatus={(next) => updateStatus(order, next)} />)}</div> : <section className="empty-state"><FlaskConical size={28} /><h3>No hay órdenes con estos filtros</h3><p>Cambia la sucursal, el estado o el texto de búsqueda.</p></section>}
    </section>
    {selected && <OrderDetail order={selected} pending={pending} onClose={() => setSelected(null)} onStatus={(next) => updateStatus(selected, next)} />}
  </div></main>;
}

function OrderCard({ order, pending, onOpen, onStatus }: { order: LabMonitorOrder; pending: boolean; onOpen: () => void; onStatus: (next: EstadoOrdenLaboratorio) => void }) {
  const whatsapp = enlaceWhatsapp(order.paciente_telefono, `Hola ${order.paciente_nombre.trim().split(/\s+/)[0] || ""}. Tu pedido de ${order.empresa_nombre} - ${order.sucursal_nombre} está listo para retirar. Te esperamos.`);
  const next = nextStatus(order.estado);
  return <article className={`lab-order-card ${overdue(order) ? "is-overdue" : ""}`}>
    <button className="lab-card-main" type="button" onClick={onOpen}>
      <div className="lab-card-top"><span className={`lab-status status-${order.estado}`}>{estadoOrdenLabels[order.estado]}</span>{order.es_garantia && <span className="lab-warranty">Garantía</span>}</div>
      <h3>{order.paciente_nombre}</h3>
      <p>{order.empresa_nombre} · <strong>{order.sucursal_nombre}</strong></p>
      <div className="lab-card-meta"><span><FlaskConical size={13} /> {laboratorioLabels[order.laboratorio] ?? order.laboratorio}</span><span>{tipoLenteLabels[order.tipo_lente] ?? order.tipo_lente}</span><span>{shortId(order)}</span></div>
      <div className="lab-dates"><span>Creada {date(order.creado_en)}</span>{order.fecha_entrega_estimada && <span className={overdue(order) ? "overdue-text" : ""}><CalendarClock size={13} /> Entrega {date(order.fecha_entrega_estimada)}</span>}</div>
    </button>
    <div className="lab-card-actions">
      <label>Actualizar<select value={order.estado} disabled={pending} onChange={(event) => onStatus(event.target.value as EstadoOrdenLaboratorio)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {next && <button className="lab-next-action" type="button" disabled={pending} onClick={() => onStatus(next)}><span>Siguiente</span><ArrowRight size={15} /><strong>{estadoOrdenLabels[next]}</strong></button>}
      {readyStatuses.has(order.estado) && whatsapp && <a className="whatsapp-action" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Avisar</a>}
    </div>
  </article>;
}

function OrderDetail({ order, pending, onClose, onStatus }: { order: LabMonitorOrder; pending: boolean; onClose: () => void; onStatus: (next: EstadoOrdenLaboratorio) => void }) {
  return <div className="modal-backdrop"><section className="new-patient-modal lab-monitor-modal" role="dialog" aria-modal="true" aria-labelledby="lab-order-title"><button className="modal-close no-print" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <div className="print-area print-a4">
      <LabOrderPrint orderId={order.id} createdAt={order.creado_en} branchName={order.sucursal_nombre} patientName={order.paciente_nombre} patientPhone={order.paciente_telefono} productDescription={order.producto_descripcion} rx={order.rx} medidas={order.medidas} reviewerName={order.reviso_nombre} useLabel={order.uso_calculado === "lejos_y_cerca" ? "Todas" : order.uso_calculado === "cerca" ? "Cerca" : "Lejos"} notes={[`Laboratorio: ${laboratorioLabels[order.laboratorio] ?? order.laboratorio}`, `Tipo de lente: ${tipoLenteLabels[order.tipo_lente] ?? order.tipo_lente}`, order.notas].filter(Boolean).join(". ")} deliveryDate={order.fecha_entrega_estimada} saleFolio={order.venta_folio} company={order.membrete} warranty={order.es_garantia} />
    </div>
    <div className="no-print">
      <div className="lab-print-title"><div><p className="section-label">ORDEN DE TRABAJO</p><h2 id="lab-order-title">{order.paciente_nombre}</h2><p>{shortId(order)} · {date(order.creado_en)}</p></div><span className={`lab-status status-${order.estado}`}>{estadoOrdenLabels[order.estado]}</span></div>
      <ul className="lab-checklist" aria-label="Progreso de la orden">{flowStatuses.map((state, index) => { const currentIndex = flowStatuses.indexOf(order.estado); const complete = currentIndex >= index && order.estado !== "rechazado"; const isCurrent = order.estado === state; return <li key={state} className={`${complete ? "complete" : ""} ${isCurrent ? "current" : ""}`}><button type="button" disabled={pending} onClick={() => onStatus(state)}><span className="lab-checklist-mark">{complete ? <CheckCircle2 size={15} /> : <span className="lab-checklist-dot" />}</span><span>{estadoOrdenLabels[state]}</span></button></li>; })}</ul>
      {order.estado === "rechazado" && <div className="lab-rejected-note"><ShieldAlert size={16} /><span>Esta orden está rechazada{order.motivo_rechazo ? `: ${order.motivo_rechazo}` : "."}</span></div>}
      <div className="lab-detail-grid"><span><strong>Laboratorio</strong>{laboratorioLabels[order.laboratorio] ?? order.laboratorio}</span><span><strong>Tipo de lente</strong>{tipoLenteLabels[order.tipo_lente] ?? order.tipo_lente}</span><span><strong>Sucursal</strong>{order.sucursal_nombre}</span><span><strong>Entrega estimada</strong>{order.fecha_entrega_estimada ? date(order.fecha_entrega_estimada) : "Sin fecha"}</span></div>
      <div className="lab-detail-grid lab-measures"><span><strong>Vertical</strong>{order.medidas?.vertical || "—"}</span><span><strong>Horizontal mayor</strong>{order.medidas?.horizontal_mayor || "—"}</span><span><strong>Puente</strong>{order.medidas?.puente || "—"}</span><span><strong>Altura</strong>{order.medidas?.altura || "—"}</span><span><strong>DNP</strong>{order.medidas?.dnp || "—"}</span></div>
      {order.notas && <div className="lab-notes"><strong>Indicaciones</strong><p>{order.notas}</p></div>}
    </div>
    <div className="modal-actions no-print"><label className="lab-modal-status">Estado<select value={order.estado} disabled={pending} onChange={(event) => onStatus(event.target.value as EstadoOrdenLaboratorio)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="outline-action" type="button" onClick={printCurrentDocument}><Printer size={15} /> Imprimir</button><button className="new-consultation" type="button" onClick={onClose}>Cerrar</button></div>
  </section></div>;
}
