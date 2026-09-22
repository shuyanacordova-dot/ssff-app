"use client";

import Link from "next/link";
import { CircleAlert, FlaskConical, MoreVertical, Plus, Package, ReceiptText, ShieldCheck, Wallet, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Garantia, Sale, SaleItem, SaleLabOrder, SaleProduct, VentasData } from "@/lib/ventas";
import { mensajeTicketVirtual } from "@/lib/mensajes";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import Cart from "./cart";
import LabOrderModal from "./lab-order-modal";
import { actualizarEntregaVenta, anularVenta, crearProducto, registrarAbono } from "./actions";
import { crearGarantia } from "./garantia-actions";
import { branchLetterhead } from "@/lib/sucursales";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const stateLabel: Record<Sale["estado"], string> = { borrador: "Borrador", completada: "Completada", anulada: "Anulada" };
const statePillClass: Record<Sale["estado"], string> = { borrador: "", completada: "aprobada", anulada: "devuelta" };
const categories = ["montura", "gafas_sol", "lente", "accesorio", "servicio", "tratamiento", "otro"];

export default function SalesBoard(props: VentasData) {
  const [notice, setNotice] = useState(props.message ?? "");
  const [showProduct, setShowProduct] = useState(false);
  const [anulling, setAnulling] = useState<Sale | null>(null);
  const [labOrderContext, setLabOrderContext] = useState<{ sale: Sale; orderId?: string; esGarantia?: boolean; ordenOriginalId?: string | null } | null>(null);
  const [reciboSale, setReciboSale] = useState<Sale | null>(null);
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [garantiaModal, setGarantiaModal] = useState<{ defaultVentaId?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const role = props.profile?.rol;
  const canCreateProduct = role === "superadmin" || role === "admin_sucursal";
  const canAnular = role === "superadmin";
  const productoById = new Map(props.products.map((product) => [product.id, product]));
  const lensItemsFor = (sale: Sale) => sale.venta_items.filter((item) => item.producto_id && productoById.get(item.producto_id)?.categoria === "lente");
  const labOrderItemsFor = (sale: Sale) => { const strict = lensItemsFor(sale); return strict.length ? strict : (sale.venta_items ?? []); };

  if (props.status !== "ready") return <main className="page agenda-page"><div className="container agenda-shell"><header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cobros</h1><p className="subtitle">{props.message ?? "No se pudo abrir ventas."}</p></div>{props.status === "needs_login" && <Link className="primary-link" href="/login?next=/ventas">Iniciar sesión</Link>}</header></div></main>;

  const collected = props.sales.filter((sale) => sale.estado !== "anulada").reduce((sum, sale) => sum + Number(sale.pagado), 0);
  const pendingTotal = props.sales.filter((sale) => sale.estado === "completada").reduce((sum, sale) => sum + Number(sale.saldo), 0);

  const createProduct = (form: HTMLFormElement) => startTransition(async () => { try { await crearProducto(new FormData(form)); setNotice("Producto guardado en el catálogo."); setShowProduct(false); form.reset(); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo crear el producto."); } });
  const abonar = (sale: Sale, data: FormData) => startTransition(async () => { data.set("venta_id", sale.id); try { await registrarAbono(data); setNotice("Abono registrado."); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar el abono."); } });
  const anular = (sale: Sale, motivo: string) => startTransition(async () => { const data = new FormData(); data.set("venta_id", sale.id); data.set("motivo", motivo); try { await anularVenta(data); setNotice("Venta anulada."); setAnulling(null); } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo anular la venta."); } });
  const patientNameFor = (sale: Sale) => { const p = props.patients.find((patient) => patient.id === sale.paciente_id); return p ? `${p.apellidos}, ${p.nombres}` : (sale.cliente_nombre || "Paciente"); };
  const crearGarantiaSubmit = (form: HTMLFormElement) => startTransition(async () => {
    try {
      const garantiaId = await crearGarantia(new FormData(form));
      const ventaId = new FormData(form).get("venta_id") as string;
      const tipo = new FormData(form).get("tipo") as string;
      setNotice("Garantía registrada.");
      setGarantiaModal(null);
      form.reset();
      if (tipo === "luna") {
        const sale = props.sales.find((s) => s.id === ventaId);
        if (sale) setLabOrderContext({ sale, esGarantia: true });
      }
      void garantiaId;
    } catch (err) { setNotice(err instanceof Error ? err.message : "No se pudo registrar la garantía."); }
  });

  return <main className="page agenda-page"><div className="container agenda-shell">
    <header className="agenda-header"><div><Link className="back-link" href="/">← SHUVISION OS</Link><p className="eyebrow">OPERACIÓN COMERCIAL</p><h1>Cobros</h1><p className="subtitle">SHUVISION y Focus conservan ventas y saldos separados.</p></div>{canCreateProduct && <button className="new-task" type="button" onClick={() => setShowProduct(true)}><Plus size={18} /> Nuevo producto</button>}</header>
    <section className="agenda-summary"><article><Package size={21} /><strong>{props.products.length}</strong><span>productos activos</span></article><article><Wallet size={21} /><strong>{money(collected)}</strong><span>cobros registrados</span></article><article><ReceiptText size={21} /><strong>{money(pendingTotal)}</strong><span>saldo pendiente</span></article></section>
    <div className="notice"><CircleAlert size={18} /><span>{notice || "Las ventas anuladas se conservan con el motivo registrado; no se eliminan."}</span></div>
    <Cart products={props.products} stock={props.stock} companies={props.companies} branches={props.branches} patients={props.patients} empresasConvenio={props.empresasConvenio} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} defaultBranch={props.profile?.sucursal_id ?? ""} onDone={setNotice} />
    <section className="glass agenda-board"><p className="section-label">VENTAS RECIENTES</p><h2>Historial y cobros</h2>{props.sales.length ? <div className="task-list">{props.sales.map((sale) => <SaleCard key={sale.id} sale={sale} companyName={props.companies.find((c) => c.id === sale.empresa_id)?.nombre ?? "Empresa"} branchName={props.branches.find((b) => b.id === sale.sucursal_id)?.nombre} patient={props.patients.find((p) => p.id === sale.paciente_id)} lensItems={lensItemsFor(sale)} hasLabOrderItems={labOrderItemsFor(sale).length > 0} labOrders={props.labOrders.filter((o) => o.venta_id === sale.id)} canAnular={canAnular} pending={pending} onAbono={abonar} onRequestAnular={setAnulling} onCreateLabOrder={() => setLabOrderContext({ sale })} onViewOrder={(orderId) => setLabOrderContext({ sale, orderId })} onRecibo={() => setReciboSale(sale)} onDetalle={() => setDetailSale(sale)} onGarantia={() => setGarantiaModal({ defaultVentaId: sale.id })} />)}</div> : <section className="empty-state"><h3>Aún no hay ventas</h3><p>Cuando registres una venta aparecerá en este historial.</p></section>}</section>

    <section className="glass agenda-board"><div className="tab-actions" style={{ justifyContent: "space-between", display: "flex" }}><div><p className="section-label">GARANTÍAS</p><h2>Reclamos de armazón o luna</h2></div><button className="new-task" type="button" onClick={() => setGarantiaModal({})}><ShieldCheck size={16} /> Nueva garantía</button></div>
      {props.garantias.length ? <div className="task-list">{props.garantias.map((garantia) => { const sale = props.sales.find((s) => s.id === garantia.venta_id); const orden = garantia.orden_laboratorio_id ? props.labOrders.find((o) => o.id === garantia.orden_laboratorio_id) : undefined; return <article className="task-card" key={garantia.id}><div className="task-status" /><div className="task-main"><div className="task-meta"><span>{garantia.tipo === "armazon" ? "Armazón" : "Luna"}</span><span>{new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(garantia.creado_en))}</span></div><h2>{sale ? patientNameFor(sale) : "Venta"}</h2><p>{garantia.motivo}</p>{garantia.notas && <p>{garantia.notas}</p>}</div><div className="task-actions"><span className={`state-pill ${garantia.estado === "resuelta" ? "aprobada" : garantia.estado === "rechazada" ? "devuelta" : ""}`}>{garantia.estado === "abierta" ? "Abierta" : garantia.estado === "resuelta" ? "Resuelta" : "Rechazada"}</span>{garantia.tipo === "luna" && sale && (orden ? <button onClick={() => setLabOrderContext({ sale, orderId: orden.id })}><FlaskConical size={14} /> Ver orden de garantía</button> : <button onClick={() => setLabOrderContext({ sale, esGarantia: true })}><FlaskConical size={14} /> Crear orden de laboratorio</button>)}</div></article>; })}</div> : <p className="field-hint" style={{ padding: "4px 2px" }}>No hay garantías registradas.</p>}
    </section>

    {showProduct && <ProductModal companies={props.companies} defaultCompany={props.profile?.empresa_id ?? props.companies[0]?.id ?? ""} onClose={() => setShowProduct(false)} onCreate={createProduct} pending={pending} />}
    {anulling && <AnularModal sale={anulling} pending={pending} onClose={() => setAnulling(null)} onConfirm={(motivo) => anular(anulling, motivo)} />}
    {labOrderContext && <LabOrderModal sale={labOrderContext.sale} lensItems={labOrderItemsFor(labOrderContext.sale)} productoById={productoById} existingOrderId={labOrderContext.orderId} esGarantia={labOrderContext.esGarantia} patientName={patientNameFor(labOrderContext.sale)} patientPhone={props.patients.find((p) => p.id === labOrderContext.sale.paciente_id)?.telefono} company={branchLetterhead(props.companies.find((c) => c.id === labOrderContext.sale.empresa_id), props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)) ?? undefined} branchName={props.branches.find((b) => b.id === labOrderContext.sale.sucursal_id)?.nombre} onClose={() => setLabOrderContext(null)} onCreated={(message) => setNotice(message)} />}
    {reciboSale && <ReciboModal sale={reciboSale} patient={props.patients.find((p) => p.id === reciboSale.paciente_id)} onClose={() => setReciboSale(null)} onSaved={(message) => setNotice(message)} />}
    {detailSale && <VentaDetailModal sale={detailSale} companyName={props.companies.find((c) => c.id === detailSale.empresa_id)?.nombre ?? "Empresa"} patient={props.patients.find((p) => p.id === detailSale.paciente_id)} onClose={() => setDetailSale(null)} />}
    {garantiaModal && <GarantiaModal sales={props.sales.filter((s) => s.estado === "completada")} defaultVentaId={garantiaModal.defaultVentaId} productoById={productoById} patients={props.patients} onClose={() => setGarantiaModal(null)} onCreate={crearGarantiaSubmit} pending={pending} />}
  </div></main>;
}

export function SaleCard({ sale, companyName, branchName, patient, lensItems, hasLabOrderItems, labOrders, canAnular, pending, onAbono, onRequestAnular, onCreateLabOrder, onViewOrder, onRecibo, onDetalle, onGarantia }: { sale: Sale; companyName: string; branchName?: string; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; lensItems: SaleItem[]; hasLabOrderItems: boolean; labOrders: SaleLabOrder[]; canAnular: boolean; pending: boolean; onAbono: (sale: Sale, data: FormData) => void; onRequestAnular: (sale: Sale) => void; onCreateLabOrder: () => void; onViewOrder: (orderId: string) => void; onRecibo: () => void; onDetalle: () => void; onGarantia: () => void }) {
  const [showAbono, setShowAbono] = useState(false); const [metodo, setMetodo] = useState("efectivo"); const [monto, setMonto] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => { if (!menuOpen) return; const onClick = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu(); }; document.addEventListener("mousedown", onClick); return () => document.removeEventListener("mousedown", onClick); }, [menuOpen]);
  const submitAbono = () => { const data = new FormData(); data.set("metodo", metodo); data.set("monto", monto); onAbono(sale, data); setShowAbono(false); setMonto(""); };
  const displayName = patient ? `${patient.apellidos}, ${patient.nombres}` : (sale.cliente_nombre || "Cliente sin nombre");
  const items = sale.venta_items ?? [];
  const resumenItems = items.slice(0, 2).map((item) => `${item.descripcion} ×${item.cantidad}`).join(", ");
  const resumen = items.length ? (items.length > 2 ? `${resumenItems} +${items.length - 2} más` : resumenItems) : "Sin líneas";
  const nombrePila = patient ? patient.nombres : (sale.cliente_nombre || "").split(" ")[0] || "";
  const waListo = patient && lensItems.length > 0 ? enlaceWhatsapp(patient.telefono, `Hola ${nombrePila}! Tu(s) luna(s)/lente(s) de tu compra en ${companyName} ya está(n) listo(s) para retirar. Te esperamos!`) : null;
  return <article className="task-card" style={{ cursor: "pointer" }} onClick={onDetalle}><div className="task-status"><span className={`status-dot ${statePillClass[sale.estado]}`} /></div><div className="task-main"><div className="task-meta"><span>{companyName}</span>{branchName && <span className="branch-meta">Sucursal {branchName}</span>}{patient && <span>Paciente</span>}<span>{new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(sale.creado_en))}</span></div><h2>{displayName}</h2><p>{resumen}{items.length > 0 && <span className="text-action" style={{ marginLeft: 8 }}>Ver detalle</span>}</p><p>Total: <strong>{money(sale.total)}</strong> · Pagado: {money(sale.pagado)} · Saldo: <strong>{money(sale.saldo)}</strong></p>{sale.estado === "anulada" && sale.motivo_anulacion && <p className="notice">Motivo de anulación: {sale.motivo_anulacion}</p>}
    {labOrders.length > 0 && <div className="lab-order-badges" onClick={(event) => event.stopPropagation()}>{labOrders.map((order) => <button key={order.id} type="button" className="check-badge ok" onClick={() => onViewOrder(order.id)}><FlaskConical size={13} /> {order.laboratorio} · {order.estado}{order.es_garantia ? " · garantía" : ""}</button>)}</div>}
    {showAbono && <div className="new-patient-form" style={{ marginTop: 10 }} onClick={(event) => event.stopPropagation()}><label>Método<select value={metodo} onChange={(event) => setMetodo(event.target.value)}>{["efectivo", "transferencia", "tarjeta", "credito", "otro"].map((m) => <option key={m} value={m}>{m}</option>)}</select></label><label>Monto<input type="number" min={0} step={0.01} max={sale.saldo} value={monto} onChange={(event) => setMonto(event.target.value)} /></label><button type="button" className="new-consultation" disabled={pending || !Number(monto) || Number(monto) > sale.saldo} onClick={submitAbono}>Confirmar abono</button></div>}
  </div><div className="task-actions" onClick={(event) => event.stopPropagation()}><span className={`state-pill ${statePillClass[sale.estado]}`}>{stateLabel[sale.estado]}</span>
    {sale.estado === "completada" && <div className="menu-wrap" ref={menuRef}>
      <button className="outline-action" type="button" onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={14} /> Más opciones</button>
      {menuOpen && <div className="menu-dropdown">
        <button type="button" onClick={() => { onRecibo(); closeMenu(); }}><MessageCircle size={14} /> Recibo virtual</button>
        {waListo && <a href={waListo} target="_blank" rel="noreferrer" onClick={closeMenu}><MessageCircle size={14} /> Avisar lente listo</a>}
        {patient && hasLabOrderItems && <button type="button" onClick={() => { onCreateLabOrder(); closeMenu(); }}><FlaskConical size={14} /> Crear orden de laboratorio</button>}
        <button type="button" onClick={() => { onGarantia(); closeMenu(); }}><ShieldCheck size={14} /> Garantía</button>
        {sale.saldo > 0 && <button type="button" onClick={() => { setShowAbono(true); closeMenu(); }}>Registrar abono</button>}
        {canAnular && <button type="button" className="danger" disabled={pending} onClick={() => { onRequestAnular(sale); closeMenu(); }}>Cancelar venta</button>}
      </div>}
    </div>}
  </div></article>;
}

export function VentaDetailModal({ sale, companyName, patient, onClose }: { sale: Sale; companyName: string; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; onClose: () => void }) {
  const displayName = patient ? `${patient.apellidos}, ${patient.nombres}` : (sale.cliente_nombre || "Cliente sin nombre");
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="venta-detalle-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
    <p className="section-label">DETALLE DE VENTA</p>
    <h2 id="venta-detalle-title">{displayName}</h2>
    <p className="field-hint">{companyName} · {new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(sale.creado_en))} · <span className={`state-pill ${statePillClass[sale.estado]}`}>{stateLabel[sale.estado]}</span></p>
    {sale.estado === "anulada" && sale.motivo_anulacion && <p className="notice">Motivo de anulación: {sale.motivo_anulacion}</p>}

    <p className="section-label" style={{ marginTop: 14 }}>ARTÍCULOS</p>
    {(sale.venta_items ?? []).length ? <div className="task-list">{(sale.venta_items ?? []).map((item) => <article className="task-card" key={item.id}><div className="task-status" /><div className="task-main"><h2 style={{ fontSize: 15 }}>{item.descripcion}</h2><p>Cantidad: {item.cantidad} · {money(item.precio_unitario)} c/u{item.descuento > 0 && ` · Descuento ${money(item.descuento)}`}</p></div><div className="task-actions"><strong>{money(item.total_linea)}</strong></div></article>)}</div> : <p className="field-hint">Sin líneas registradas.</p>}

    <div className="consultation-stats" style={{ marginTop: 12 }}>
      <span><strong>Subtotal</strong>{money(sale.subtotal)}</span>
      {sale.descuento > 0 && <span><strong>Descuento</strong>{money(sale.descuento)}</span>}
      <span><strong>Total</strong>{money(sale.total)}</span>
      <span><strong>Pagado</strong>{money(sale.pagado)}</span>
      <span><strong>Saldo</strong>{money(sale.saldo)}</span>
    </div>

    <p className="section-label" style={{ marginTop: 14 }}>PAGOS Y ABONOS</p>
    {(sale.pagos_venta ?? []).length ? <div className="task-list">{(sale.pagos_venta ?? []).map((pago) => <article className="task-card" key={pago.id}><div className="task-status" /><div className="task-main"><p style={{ margin: 0 }}>{new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(pago.creado_en))} · {pago.metodo}{pago.banco && ` · ${pago.banco}`}{pago.referencia && ` · Ref: ${pago.referencia}`}</p></div><div className="task-actions"><strong>{money(pago.monto)}</strong></div></article>)}</div> : <p className="field-hint">Todavía no se han registrado pagos.</p>}

    <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cerrar</button></div>
  </section></div>;
}

function ProductModal({ companies, defaultCompany, onClose, onCreate, pending }: { companies: VentasData["companies"]; defaultCompany: string; onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="new-product-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVO PRODUCTO O SERVICIO</p><h2 id="new-product-title">Agregar al catálogo</h2><form onSubmit={(event) => { event.preventDefault(); onCreate(event.currentTarget); }}><div className="new-patient-form"><label>Nombre<input name="nombre" required /></label><label>Categoría<select name="categoria" defaultValue="montura">{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Empresa<select name="empresa_id" defaultValue={defaultCompany}>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}</select></label><label>Código<input name="codigo" /></label><label>Precio de venta<input name="precio_venta" required type="number" min="0" step="0.01" /></label><label>Costo referencial<input name="costo_referencial" type="number" min="0" step="0.01" /></label></div><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar producto"}</button></div></form></section></div>;
}

export function GarantiaModal({ sales, defaultVentaId, productoById, patients, onClose, onCreate, pending }: { sales: Sale[]; defaultVentaId?: string; productoById: Map<string, SaleProduct>; patients: { id: string; nombres: string; apellidos: string; telefono?: string | null }[]; onClose: () => void; onCreate: (form: HTMLFormElement) => void; pending: boolean }) {
  const [ventaId, setVentaId] = useState(defaultVentaId && sales.some((s) => s.id === defaultVentaId) ? defaultVentaId : (sales[0]?.id ?? ""));
  const [itemId, setItemId] = useState("");
  const [tipo, setTipo] = useState<"" | "armazon" | "luna">("");
  const venta = sales.find((s) => s.id === ventaId);
  const items = venta?.venta_items ?? [];
  const item = items.find((i) => i.id === itemId);
  const selectItem = (id: string) => { setItemId(id); const found = items.find((i) => i.id === id); const categoria = found?.producto_id ? productoById.get(found.producto_id)?.categoria : undefined; setTipo(categoria === "montura" ? "armazon" : categoria === "lente" ? "luna" : ""); };
  const nombreVenta = (s: Sale) => { const p = patients.find((pt) => pt.id === s.paciente_id); return p ? `${p.apellidos}, ${p.nombres}` : (s.cliente_nombre || "Venta"); };
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="garantia-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">NUEVA GARANTÍA</p><h2 id="garantia-title">Reclamo de armazón o luna</h2><p>Registra la garantía sobre una venta ya realizada. Si es de luna, después de guardar se abre la orden de laboratorio de reemplazo.</p>
    <form onSubmit={(event) => { event.preventDefault(); onCreate(event.currentTarget); }}>
      <div className="new-patient-form">
        <label className="task-description">Venta<select name="venta_id" value={ventaId} onChange={(event) => { setVentaId(event.target.value); setItemId(""); setTipo(""); }}>{sales.map((s) => <option key={s.id} value={s.id}>{nombreVenta(s)} · {new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(s.creado_en))} · {money(s.total)}</option>)}</select></label>
        <label className="task-description">Artículo<select name="venta_item_id" value={itemId} onChange={(event) => selectItem(event.target.value)}><option value="">Selecciona el artículo</option>{items.map((i) => <option key={i.id} value={i.id}>{i.descripcion}</option>)}</select></label>
        <label className="task-description">Tipo de garantía<select name="tipo" value={tipo} onChange={(event) => setTipo(event.target.value as "" | "armazon" | "luna")}><option value="">Selecciona el tipo</option><option value="armazon">Armazón</option><option value="luna">Luna</option></select></label>
        {item && !tipo && <p className="field-hint">No se detectó el tipo automáticamente; selecciónalo arriba.</p>}
        <label className="task-description">Motivo<textarea name="motivo" placeholder="Ej.: El armazón se rompió por defecto de fábrica" required /></label>
        <label className="task-description">Observaciones (opcional)<textarea name="notas" placeholder="Detalles adicionales" /></label>
      </div>
      <div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="new-consultation" disabled={pending || !itemId || !tipo} type="submit">{pending ? "Guardando…" : "Registrar garantía"}</button></div>
    </form>
  </section></div>;
}

export function AnularModal({ sale, pending, onClose, onConfirm }: { sale: Sale; pending: boolean; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return <div className="modal-backdrop"><section className="new-patient-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="anular-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">ANULAR VENTA</p><h2 id="anular-title">{sale.cliente_nombre || "Venta"} · {money(sale.total)}</h2><p>La venta anulada se conserva en el historial con el motivo registrado; no se puede modificar después.</p><label className="task-description">Motivo de la anulación<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ej.: Producto entregado por error, se anula y se re-emite" /></label><div className="modal-actions"><button className="outline-action" type="button" onClick={onClose}>Cancelar</button><button className="cancel-appointment" disabled={pending || motivo.trim().length < 5} onClick={() => onConfirm(motivo.trim())}>{pending ? "Anulando…" : "Confirmar anulación"}</button></div></section></div>;
}

export function ReciboModal({ sale, patient, onClose, onSaved }: { sale: Sale; patient?: { id: string; nombres: string; apellidos: string; telefono?: string | null }; onClose: () => void; onSaved: (message: string) => void }) {
  const [fecha, setFecha] = useState(sale.fecha_entrega_estimada ?? "");
  const [token, setToken] = useState(sale.recibo_token);
  const [origin, setOrigin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const link = `${origin}/recibo/${token}`;
  const nombre = patient ? patient.nombres : (sale.cliente_nombre || "Cliente");
  const mensaje = mensajeTicketVirtual({ nombre, ticketUrl: link });
  const wa = enlaceWhatsapp(patient?.telefono, mensaje);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const guardar = async () => {
    setSaving(true); setError("");
    try { const result = await actualizarEntregaVenta(sale.id, fecha); setToken(result.recibo_token); onSaved("Fecha de entrega guardada en el recibo."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar el recibo."); }
    setSaving(false);
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(link); onSaved("Enlace del recibo copiado."); } catch { setError("No se pudo copiar el enlace."); } };
  const copiarMensaje = async () => { try { await navigator.clipboard.writeText(mensaje); onSaved("Mensaje del ticket copiado."); } catch { setError("No se pudo copiar el mensaje."); } };

  return <div className="modal-backdrop"><section className="new-patient-modal" role="dialog" aria-modal="true" aria-labelledby="recibo-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button><p className="section-label">RECIBO VIRTUAL</p><h2 id="recibo-title">{nombre}</h2><p>Este enlace siempre muestra el estado más reciente de la venta: total, abonos y saldo. No necesitas volver a generarlo después de cada abono, se actualiza solo cada vez que alguien lo abre.</p>
    <div className="new-patient-form"><label>Fecha tentativa de entrega (opcional)<input type="date" value={fecha ?? ""} onChange={(event) => setFecha(event.target.value)} /></label></div>
    <div className="glass clinical-card" style={{ minHeight: "auto", padding: 12, margin: "12px 0", wordBreak: "break-all" }}><p className="section-label">ENLACE DEL RECIBO</p><p style={{ margin: 0 }}>{link}</p></div>
    <div className="virtual-ticket-message"><p className="section-label">MENSAJE PARA EL PACIENTE</p><p>{mensaje}</p></div>
    {error && <p className="notice">{error}</p>}
    <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="outline-action" type="button" onClick={copiar}>Copiar enlace</button><button className="outline-action" type="button" onClick={copiarMensaje}>Copiar mensaje</button><button className="outline-action" type="button" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar fecha de entrega"}</button></div>
      {wa ? <a className="new-consultation" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Enviar por WhatsApp</a> : <span style={{ color: "#a24150", fontSize: 13, fontWeight: 700 }}>Este paciente no tiene WhatsApp registrado.</span>}
    </div>
  </section></div>;
}
